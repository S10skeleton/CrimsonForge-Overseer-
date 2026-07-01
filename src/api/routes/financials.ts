/**
 * Financials — revenue (live, reusing the billing lib), MRR history (snapshots),
 * manual burn/expense/income entries, runway, and raise progress (from CRM
 * fundraising deals). Access enforced at the router mount by per-area guards
 * (financials.revenue/runway/raise; GET=view, writes=manage; owner bypasses).
 * Audited.
 */

import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import { getForgePilotBilling } from '../../lib/billing.js'
import { audit } from '../../lib/audit.js'

const router = Router()
const RAISE_TARGET = 750_000

// ─── Revenue (live) ──────────────────────────────────────────────────────────
router.get('/revenue', async (_req, res) => {
  const fp = await getForgePilotBilling()
  const failedPaymentsAmount = fp.paymentFailures.reduce((s, f) => s + f.amount, 0)
  res.json({
    data: {
      mrr: fp.mrr,
      arr: Math.round(fp.mrr * 12 * 100) / 100,
      activeSubs: fp.activeSubscriptions,
      newThisMonth: fp.newThisMonth,
      churnedThisMonth: fp.cancelledThisMonth,
      failedPaymentsCount: fp.paymentFailures.length,
      failedPaymentsAmount,
      planBreakdown: fp.planBreakdown,
      // CFP revenue isn't separately wired yet — combined == ForgePilot for now.
      byProduct: { forgepilot: { mrr: fp.mrr, activeSubs: fp.activeSubscriptions } },
    },
  })
})

// ─── MRR history (snapshots) ─────────────────────────────────────────────────
router.get('/mrr-history', async (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 60)
  const product = typeof req.query.product === 'string' ? req.query.product : 'all'
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  const { data, error } = await overseerDb
    .from('financial_mrr_snapshots')
    .select('snapshot_date, mrr, arr, active_subs, new_subs, churned_subs')
    .eq('product', product)
    .gte('snapshot_date', since.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true })
  if (error) { res.status(500).json({ error: 'Could not load MRR history' }); return }
  res.json({ data: data ?? [] })
})

// ─── Manual entries (burn / income / cash) ───────────────────────────────────
router.get('/entries', async (req, res) => {
  let q = overseerDb.from('financial_entries').select('*').order('month', { ascending: false })
  if (typeof req.query.type === 'string') q = q.eq('type', req.query.type)
  if (typeof req.query.from === 'string') q = q.gte('month', req.query.from)
  if (typeof req.query.to === 'string') q = q.lte('month', req.query.to)
  const { data, error } = await q
  if (error) { res.status(500).json({ error: 'Could not load entries' }); return }
  res.json({ data: data ?? [] })
})

router.post('/entries', async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.month || !b.type || b.amount === undefined) { res.status(400).json({ error: 'month, type, amount required' }); return }
  const { data, error } = await overseerDb.from('financial_entries').insert({
    month: b.month, type: b.type, category: b.category ?? null, label: b.label ?? null,
    amount: b.amount, notes: b.notes ?? null, created_by: req.panelUser?.username ?? null,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create entry' }); return }
  audit(req, { action: 'financial.entry_create', targetType: 'financial_entry', targetId: data.id, meta: { type: b.type, amount: b.amount } })
  res.status(201).json({ data })
})

router.patch('/entries/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const row: Record<string, unknown> = {}
  for (const k of ['month', 'type', 'category', 'label', 'amount', 'notes']) if (b[k] !== undefined) row[k] = b[k]
  const { data, error } = await overseerDb.from('financial_entries').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update entry' }); return }
  audit(req, { action: 'financial.entry_update', targetType: 'financial_entry', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/entries/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('financial_entries').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete entry' }); return }
  audit(req, { action: 'financial.entry_delete', targetType: 'financial_entry', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Runway ──────────────────────────────────────────────────────────────────
router.get('/runway', async (_req, res) => {
  const { data } = await overseerDb.from('financial_entries').select('month, type, amount').order('month', { ascending: false })
  const entries = (data ?? []) as Array<{ month: string; type: string; amount: number }>

  const cashRow = entries.find(e => e.type === 'cash_balance')
  const cashOnHand = cashRow ? Number(cashRow.amount) : null

  // Trailing average net monthly burn over the last 6 distinct months.
  const N = 6
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - N)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const recent = entries.filter(e => e.month >= cutoffStr && e.type !== 'cash_balance')
  const monthsSet = new Set(recent.map(e => e.month))
  const expenses = recent.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0)
  const income = recent.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0)
  const monthCount = monthsSet.size || 0
  const avgMonthlyBurn = monthCount > 0 ? Math.round(((expenses - income) / monthCount) * 100) / 100 : null

  let runwayMonths: number | null = null
  if (cashOnHand != null && avgMonthlyBurn != null && avgMonthlyBurn > 0) {
    runwayMonths = Math.round((cashOnHand / avgMonthlyBurn) * 10) / 10
  }

  res.json({ data: { cashOnHand, avgMonthlyBurn, runwayMonths } })
})

// ─── Raise progress (from CRM fundraising deals) ─────────────────────────────
router.get('/raise', async (_req, res) => {
  const { data } = await overseerDb
    .from('crm_deals')
    .select('id, name, company_id, stage, amount, status')
    .eq('pipeline', 'fundraising')
    .order('updated_at', { ascending: false })
  const deals = (data ?? []) as Array<{ id: string; name: string; company_id: string; stage: string; amount: number | null; status: string }>

  // Honest split: committed = SIGNED (closed-won) only; pipeline = still open
  // (diligence, etc.). Lost is excluded from both. An open deal must never read
  // as committed money — that's misleading on our own dashboard and externally.
  const live = deals.filter(d => d.status !== 'lost')
  const committed = deals.filter(d => d.status === 'won')
    .reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const pipeline = deals.filter(d => d.status === 'open')
    .reduce((s, d) => s + (Number(d.amount) || 0), 0)

  // Funnel still shows every live (non-lost) stage.
  const byStageMap = new Map<string, { stage: string; count: number; amount: number }>()
  for (const d of live) {
    const cur = byStageMap.get(d.stage) ?? { stage: d.stage, count: 0, amount: 0 }
    cur.count += 1; cur.amount += Number(d.amount) || 0
    byStageMap.set(d.stage, cur)
  }

  res.json({ data: { target: RAISE_TARGET, committed, pipeline, byStage: [...byStageMap.values()], deals } })
})

export default router
