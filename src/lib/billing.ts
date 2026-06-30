/**
 * ForgePilot revenue from Stripe — extracted so the /api/fp/billing route, the
 * MRR snapshot job, and the financials endpoints all share one implementation
 * (no duplicated Stripe plumbing).
 */

import Stripe from 'stripe'

const FP_PRODUCT_IDS = new Set([
  'prod_UKSIWeqYK7y4TK', // ForgePilot Solo
  'prod_UKSIUMHG5eSsTs', // ForgePilot Shop
  'prod_UKSI8NgY3miSMh', // ForgePilot Additional Seat
])
const FP_SOLO = 'prod_UKSIWeqYK7y4TK'
const FP_SHOP = 'prod_UKSIUMHG5eSsTs'

export function isFPSub(sub: Stripe.Subscription): boolean {
  return sub.items.data.some(
    (item) => item.price.product && FP_PRODUCT_IDS.has(item.price.product as string),
  )
}

export interface FPBilling {
  activeSubscriptions: number
  mrr: number
  newThisMonth: number
  cancelledThisMonth: number
  paymentFailures: Array<{ customerId: string; customerEmail: string; amount: number; currency: string; failureMessage: string; failedAt: string }>
  hasPaymentFailures: boolean
  planBreakdown: { solo: number; shop: number }
}

const EMPTY: FPBilling = {
  activeSubscriptions: 0, mrr: 0, newThisMonth: 0, cancelledThisMonth: 0,
  paymentFailures: [], hasPaymentFailures: false, planBreakdown: { solo: 0, shop: 0 },
}

/** Compute billing over the subscriptions matching `include` (shared by FP + CFP). */
async function computeBilling(include: (sub: Stripe.Subscription) => boolean): Promise<FPBilling> {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return EMPTY

  const stripe = new Stripe(stripeKey)

  const allActive = await stripe.subscriptions.list({ status: 'active', limit: 100 })
  const active = allActive.data.filter(include)

  const mrr = active.reduce((sum, sub) => {
    const item = sub.items.data[0]
    if (!item) return sum
    const amount = item.price.unit_amount || 0
    const interval = item.price.recurring?.interval
    return sum + (interval === 'year' ? amount / 12 : amount) / 100
  }, 0)

  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

  const newThisMonth = active.filter((s) => new Date(s.created * 1000) >= startOfMonth).length

  const cancelled = await stripe.subscriptions.list({
    status: 'canceled', created: { gte: Math.floor(startOfMonth.getTime() / 1000) }, limit: 100,
  })
  const cancelledThisMonth = cancelled.data.filter(include).length

  const planBreakdown = { solo: 0, shop: 0 }
  for (const sub of active) {
    for (const item of sub.items.data) {
      const pid = item.price.product as string
      if (pid === FP_SOLO) planBreakdown.solo++
      if (pid === FP_SHOP) planBreakdown.shop++
    }
  }

  const openInvoices = await stripe.invoices.list({ status: 'open', limit: 20, expand: ['data.customer'] })
  const paymentFailures: FPBilling['paymentFailures'] = []
  for (const inv of openInvoices.data) {
    const subId = (inv as unknown as { subscription?: string | null }).subscription
    if (!subId) continue
    try {
      const sub = await stripe.subscriptions.retrieve(subId)
      if (!include(sub)) continue
    } catch { continue }
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
    activeSubscriptions: active.length,
    mrr: Math.round(mrr * 100) / 100,
    newThisMonth, cancelledThisMonth,
    paymentFailures, hasPaymentFailures: paymentFailures.length > 0,
    planBreakdown,
  }
}

export async function getForgePilotBilling(): Promise<FPBilling> {
  return computeBilling(isFPSub)
}

// CrimsonForge Pro = the shared Stripe account's NON-ForgePilot subscriptions.
// $0/0 today (all paid subs are FP's); real CFP revenue once CFP has its own.
// TODO: define CFP_PRODUCT_IDS and filter positively once CFP billing exists.
export async function getCfpBilling(): Promise<FPBilling> {
  return computeBilling((sub) => !isFPSub(sub))
}
