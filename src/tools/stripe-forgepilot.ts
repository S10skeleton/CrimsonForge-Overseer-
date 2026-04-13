/**
 * ForgePilot Stripe monitoring tool
 * Same Stripe account as CFP — filters to FP products only.
 * Read-only — zero writes.
 */

import Stripe from 'stripe'
import type { ToolResult, ForgePilotStripeData, StripePaymentFailure, AgentTool } from '../types/index.js'

// ForgePilot product IDs (production, confirmed)
const FP_PRODUCT_IDS = new Set([
  'prod_UKSIWeqYK7y4TK', // ForgePilot Solo
  'prod_UKSIUMHG5eSsTs', // ForgePilot Shop
  'prod_UKSI8NgY3miSMh', // ForgePilot Additional Seat
])

let _stripe: Stripe | null = null
function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  return _stripe
}

function isFPSubscription(sub: Stripe.Subscription): boolean {
  return sub.items.data.some(
    (item) => item.price.product && FP_PRODUCT_IDS.has(item.price.product as string)
  )
}

export async function runForgePilotStripeCheck(): Promise<ToolResult<ForgePilotStripeData>> {
  const timestamp = new Date().toISOString()

  const empty: ForgePilotStripeData = {
    activeSubscriptions: 0,
    mrr: 0,
    newThisMonth: 0,
    cancelledThisMonth: 0,
    paymentFailures: [],
    hasPaymentFailures: false,
    planBreakdown: { solo: 0, shop: 0 },
  }

  const stripe = getStripe()
  if (!stripe) {
    return { tool: 'fp_stripe', success: false, timestamp, data: empty, error: 'STRIPE_SECRET_KEY not configured.' }
  }

  try {
    // ── Active subscriptions — fetch all, filter to FP ───────────────────
    const allActive = await stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items.data.price.product'] })
    const fpActive = allActive.data.filter(isFPSubscription)

    const activeSubscriptions = fpActive.length

    const mrr = fpActive.reduce((sum, sub) => {
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

    const newThisMonth = fpActive.filter(
      (s) => new Date(s.created * 1000) >= startOfMonth
    ).length

    const planBreakdown = { solo: 0, shop: 0 }
    for (const sub of fpActive) {
      for (const item of sub.items.data) {
        const productId = item.price.product as string
        if (productId === 'prod_UKSIWeqYK7y4TK') planBreakdown.solo++
        if (productId === 'prod_UKSIUMHG5eSsTs') planBreakdown.shop++
      }
    }

    // ── Cancelled this month ─────────────────────────────────────────────
    const cancelled = await stripe.subscriptions.list({
      status: 'canceled',
      created: { gte: Math.floor(startOfMonth.getTime() / 1000) },
      limit: 100,
      expand: ['data.items.data.price.product'],
    })
    const cancelledThisMonth = cancelled.data.filter(isFPSubscription).length

    // ── Payment failures ─────────────────────────────────────────────────
    const failedInvoices = await stripe.invoices.list({
      status: 'open',
      limit: 20,
      expand: ['data.customer'],
    })

    const paymentFailures: StripePaymentFailure[] = []
    for (const inv of failedInvoices.data) {
      const subId = (inv as any).subscription as string | null
      if (!subId) continue
      // Only include FP subscriptions
      try {
        const sub = await stripe.subscriptions.retrieve(subId, {
          expand: ['items.data.price.product'],
        })
        if (!isFPSubscription(sub)) continue
      } catch {
        continue
      }
      const customer = inv.customer as Stripe.Customer
      paymentFailures.push({
        customerId: typeof inv.customer === 'string' ? inv.customer : customer?.id ?? '',
        customerEmail: customer?.email ?? 'unknown',
        amount: inv.amount_due / 100,
        currency: inv.currency,
        failureMessage: inv.last_finalization_error?.message ?? 'Payment failed',
        failedAt: new Date(inv.created * 1000).toISOString(),
      })
    }

    return {
      tool: 'fp_stripe',
      success: true,
      timestamp,
      data: {
        activeSubscriptions,
        mrr,
        newThisMonth,
        cancelledThisMonth,
        paymentFailures,
        hasPaymentFailures: paymentFailures.length > 0,
        planBreakdown,
      },
    }
  } catch (err) {
    return {
      tool: 'fp_stripe',
      success: false,
      timestamp,
      data: empty,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const forgePilotStripeTool: AgentTool = {
  name: 'check_forgepilot_billing',
  description:
    'Returns ForgePilot subscription metrics: active subs, MRR, new/cancelled this month, plan breakdown (solo vs shop), and any payment failures.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runForgePilotStripeCheck(),
}
