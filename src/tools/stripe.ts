/**
 * Stripe read-only tool
 * Reports MRR, active subscribers, recent payments, and churn.
 * Zero write access — never touches charges or customers.
 */

import Stripe from 'stripe'
import type { ToolResult, AgentTool } from '../types/index.js'

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

// ─── Types ────────────────────────────────────────────────────────────────

interface StripeMetrics {
  activeSubscriptions: number
  mrr: number
  newThisMonth: number
  cancelledThisMonth: number
  recentPayments: Array<{
    amount: number
    currency: string
    status: string
    date: string
    customer: string
  }>
}

// ─── Core logic ────────────────────────────────────────────────────────────

async function getStripeMetrics(): Promise<ToolResult<StripeMetrics>> {
  const timestamp = new Date().toISOString()
  const stripe = getStripe()

  if (!stripe) {
    return {
      tool: 'stripe_metrics',
      success: false,
      timestamp,
      data: { activeSubscriptions: 0, mrr: 0, newThisMonth: 0, cancelledThisMonth: 0, recentPayments: [] },
      error: 'STRIPE_SECRET_KEY not configured.',
    }
  }

  try {
    const subscriptions = await stripe.subscriptions.list({ status: 'active', limit: 100 })
    const activeSubscriptions = subscriptions.data.length

    const mrr = subscriptions.data.reduce((sum, sub) => {
      const item = sub.items.data[0]
      if (!item) return sum
      const amount = item.price.unit_amount || 0
      const interval = item.price.recurring?.interval
      const monthly = interval === 'year' ? amount / 12 : amount
      return sum + monthly / 100
    }, 0)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const newThisMonth = subscriptions.data.filter(
      (s) => new Date(s.created * 1000) >= startOfMonth
    ).length

    const cancelled = await stripe.subscriptions.list({
      status: 'canceled',
      created: { gte: Math.floor(startOfMonth.getTime() / 1000) },
      limit: 100,
    })
    const cancelledThisMonth = cancelled.data.length

    const charges = await stripe.charges.list({ limit: 5 })
    const recentPayments = charges.data.map((charge) => ({
      amount: charge.amount / 100,
      currency: charge.currency.toUpperCase(),
      status: charge.status,
      date: new Date(charge.created * 1000).toLocaleDateString(),
      customer: charge.billing_details?.name || charge.customer?.toString() || 'Unknown',
    }))

    return {
      tool: 'stripe_metrics',
      success: true,
      timestamp,
      data: { activeSubscriptions, mrr, newThisMonth, cancelledThisMonth, recentPayments },
    }
  } catch (err) {
    return {
      tool: 'stripe_metrics',
      success: false,
      timestamp,
      data: { activeSubscriptions: 0, mrr: 0, newThisMonth: 0, cancelledThisMonth: 0, recentPayments: [] },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AgentTool definition ─────────────────────────────────────────────────

export const stripeMetricsTool: AgentTool = {
  name: 'stripe_metrics',
  description: 'Get CrimsonForgePro subscription metrics from Stripe: active subscribers, MRR, new signups this month, cancellations, and recent payments. Use in morning briefing and when asked about revenue.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => getStripeMetrics(),
}
