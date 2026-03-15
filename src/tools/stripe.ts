/**
 * Stripe monitoring tool
 * Reports MRR, subscribers, webhook health, and payment failures.
 * Zero write access — never touches charges or customers.
 */

import Stripe from 'stripe'
import type { ToolResult, StripeData, AgentTool } from '../types/index.js'

let _stripe: Stripe | null = null

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  return _stripe
}

// ─── Core metrics ─────────────────────────────────────────────────────────

async function getStripeMetrics(): Promise<ToolResult<StripeData>> {
  const timestamp = new Date().toISOString()
  const stripe = getStripe()

  const empty: StripeData = {
    activeSubscriptions: 0,
    mrr: 0,
    newThisMonth: 0,
    cancelledThisMonth: 0,
    webhookHealth: null,
    paymentFailures: [],
    hasWebhookIssues: false,
    hasPaymentFailures: false,
  }

  if (!stripe) {
    return { tool: 'stripe_metrics', success: false, timestamp, data: empty, error: 'STRIPE_SECRET_KEY not configured.' }
  }

  try {
    // ── Subscriptions ────────────────────────────────────────────────────
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

    // ── Webhook health ───────────────────────────────────────────────────
    let webhookHealth: StripeData['webhookHealth'] = null
    let hasWebhookIssues = false

    try {
      const endpoints = await stripe.webhookEndpoints.list({ limit: 10 })
      const cfpEndpoint = endpoints.data.find(
        (e) => e.url.includes('railway.app') || e.url.includes('crimsonforge')
      )

      if (cfpEndpoint) {
        const isDisabled = cfpEndpoint.status === 'disabled'
        hasWebhookIssues = isDisabled
        webhookHealth = {
          url: cfpEndpoint.url,
          status: isDisabled ? 'degraded' : 'healthy',
          enabledEvents: cfpEndpoint.enabled_events.length,
        }
        console.log(`[stripe] Webhook: ${webhookHealth.status} — ${cfpEndpoint.url}`)
      } else {
        console.log('[stripe] No CFP webhook endpoint found')
        hasWebhookIssues = true
        webhookHealth = { url: 'not configured', status: 'unknown', enabledEvents: 0 }
      }
    } catch (err) {
      console.log('[stripe] Webhook check failed:', err instanceof Error ? err.message : 'Unknown')
    }

    // ── Payment failures (last 24h) ──────────────────────────────────────
    const paymentFailures: StripeData['paymentFailures'] = []
    let hasPaymentFailures = false

    try {
      const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
      const failed = await stripe.paymentIntents.list({
        limit: 20,
        created: { gte: since },
      })

      const failures = failed.data.filter((pi) => pi.status === 'requires_payment_method')

      for (const pi of failures) {
        let customerEmail = 'Unknown'
        try {
          if (pi.customer) {
            const customer = await stripe.customers.retrieve(pi.customer as string)
            if (!('deleted' in customer)) customerEmail = customer.email || 'Unknown'
          }
        } catch { /* skip */ }

        paymentFailures.push({
          customerId: pi.customer?.toString() || 'Unknown',
          customerEmail,
          amount: pi.amount / 100,
          currency: pi.currency.toUpperCase(),
          failureMessage: pi.last_payment_error?.message || 'Payment declined',
          failedAt: new Date(pi.created * 1000).toISOString(),
        })
      }

      hasPaymentFailures = paymentFailures.length > 0
      if (hasPaymentFailures) {
        console.log(`[stripe] ⚠️ ${paymentFailures.length} payment failure(s) in last 24h`)
      }
    } catch (err) {
      console.log('[stripe] Payment failure check failed:', err instanceof Error ? err.message : 'Unknown')
    }

    return {
      tool: 'stripe_metrics',
      success: true,
      timestamp,
      data: {
        activeSubscriptions,
        mrr,
        newThisMonth,
        cancelledThisMonth,
        webhookHealth,
        paymentFailures,
        hasWebhookIssues,
        hasPaymentFailures,
      },
    }
  } catch (err) {
    return {
      tool: 'stripe_metrics',
      success: false,
      timestamp,
      data: empty,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── New subscriber detection (for 15-min real-time alerts) ───────────────

export async function checkForNewSubscribers(): Promise<{
  newSubscribers: Array<{ email: string; plan: string; amount: number }>
}> {
  const stripe = getStripe()
  if (!stripe) return { newSubscribers: [] }

  try {
    const since = Math.floor((Date.now() - 15 * 60 * 1000) / 1000)
    const recent = await stripe.subscriptions.list({
      created: { gte: since },
      limit: 10,
      status: 'active',
    })

    const newSubscribers = []
    for (const sub of recent.data) {
      let email = 'Unknown'
      try {
        if (sub.customer) {
          const customer = await stripe.customers.retrieve(sub.customer as string)
          if (!('deleted' in customer)) email = customer.email || 'Unknown'
        }
      } catch { /* skip */ }

      const item = sub.items.data[0]
      const amount = item ? (item.price.unit_amount || 0) / 100 : 0
      const plan = item?.price.nickname || `$${amount}/mo`
      newSubscribers.push({ email, plan, amount })
    }

    return { newSubscribers }
  } catch {
    return { newSubscribers: [] }
  }
}

// ─── Scheduler monitor export ─────────────────────────────────────────────

export async function runStripeCheck(): Promise<ToolResult<StripeData>> {
  return getStripeMetrics()
}

// ─── AgentTool definition ─────────────────────────────────────────────────

export const stripeMetricsTool: AgentTool = {
  name: 'stripe_metrics',
  description:
    'Get CrimsonForgePro subscription metrics from Stripe: active subscribers, MRR, ' +
    'new signups this month, cancellations, webhook endpoint health, and payment failures. ' +
    'Use in morning briefing and when asked about revenue or billing.',
  input_schema: { type: 'object', properties: {}, required: [] },
  execute: async () => getStripeMetrics(),
}
