/**
 * Cap table (Carta-lite, Core) — equity holders + SAFEs/notes. Investors are
 * CRM companies (type='investor'); SAFEs link by crm_company_id. Reads
 * requireAdmin; ALL writes/deletes requireOwner (equity is sensitive); audited.
 *
 * No conversion modeling here — SAFE terms are stored, not converted.
 * TODO: priced-round conversion modeling (model a round → as-converted %).
 */

import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import { audit } from '../../lib/audit.js'

const router = Router()

interface Security { id: string; holder_name: string; holder_type: string; security_class: string; crm_company_id: string | null; shares: number | null; pct: number | null; issued: boolean; notes: string | null }
interface Safe { id: string; investor_name: string; crm_company_id: string | null; instrument_type: string; amount: number; valuation_cap: number | null; discount_pct: number | null; mfn: boolean; pro_rata: boolean; date_signed: string | null; status: string; notes: string | null }

// ─── Securities ──────────────────────────────────────────────────────────────
router.get('/securities', async (_req, res) => {
  const { data, error } = await overseerDb.from('cap_table_securities').select('*').order('issued', { ascending: false })
  if (error) { res.status(500).json({ error: 'Could not load securities' }); return }
  res.json({ data: data ?? [] })
})

router.post('/securities', async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.holder_name) { res.status(400).json({ error: 'holder_name required' }); return }
  const { data, error } = await overseerDb.from('cap_table_securities').insert({
    holder_name: b.holder_name, holder_type: b.holder_type ?? 'investor', security_class: b.security_class ?? 'common',
    crm_company_id: b.crm_company_id ?? null, shares: b.shares ?? null, pct: b.pct ?? null,
    issued: b.issued ?? true, notes: b.notes ?? null,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create security' }); return }
  audit(req, { action: 'captable.security_create', targetType: 'cap_security', targetId: data.id, meta: { holder: b.holder_name } })
  res.status(201).json({ data })
})

router.patch('/securities/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['holder_name', 'holder_type', 'security_class', 'crm_company_id', 'shares', 'pct', 'issued', 'notes']) if (b[k] !== undefined) row[k] = b[k]
  const { data, error } = await overseerDb.from('cap_table_securities').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update security' }); return }
  audit(req, { action: 'captable.security_update', targetType: 'cap_security', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/securities/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('cap_table_securities').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete security' }); return }
  audit(req, { action: 'captable.security_delete', targetType: 'cap_security', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── SAFEs / notes ───────────────────────────────────────────────────────────
router.get('/safes', async (req, res) => {
  let q = overseerDb.from('cap_table_safes').select('*').order('created_at', { ascending: false })
  if (typeof req.query.status === 'string') q = q.eq('status', req.query.status)
  const { data, error } = await q
  if (error) { res.status(500).json({ error: 'Could not load SAFEs' }); return }
  res.json({ data: data ?? [] })
})

router.post('/safes', async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.investor_name || b.amount === undefined) { res.status(400).json({ error: 'investor_name and amount required' }); return }
  const { data, error } = await overseerDb.from('cap_table_safes').insert({
    investor_name: b.investor_name, crm_company_id: b.crm_company_id ?? null, instrument_type: b.instrument_type ?? 'safe',
    amount: b.amount, valuation_cap: b.valuation_cap ?? null, discount_pct: b.discount_pct ?? null,
    mfn: b.mfn ?? false, pro_rata: b.pro_rata ?? false, date_signed: b.date_signed ?? null,
    status: b.status ?? 'outstanding', notes: b.notes ?? null,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create SAFE' }); return }
  audit(req, { action: 'captable.safe_create', targetType: 'cap_safe', targetId: data.id, meta: { investor: b.investor_name, amount: b.amount } })
  res.status(201).json({ data })
})

router.patch('/safes/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['investor_name', 'crm_company_id', 'instrument_type', 'amount', 'valuation_cap', 'discount_pct', 'mfn', 'pro_rata', 'date_signed', 'status', 'notes']) if (b[k] !== undefined) row[k] = b[k]
  const { data, error } = await overseerDb.from('cap_table_safes').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update SAFE' }); return }
  audit(req, { action: 'captable.safe_update', targetType: 'cap_safe', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/safes/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('cap_table_safes').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete SAFE' }); return }
  audit(req, { action: 'captable.safe_delete', targetType: 'cap_safe', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Summary (issued-basis ownership + outstanding SAFEs, kept separate) ──────
router.get('/summary', async (_req, res) => {
  const [secRes, safeRes] = await Promise.all([
    overseerDb.from('cap_table_securities').select('*'),
    overseerDb.from('cap_table_safes').select('*'),
  ])
  const securities = (secRes.data ?? []) as Security[]
  const safes = (safeRes.data ?? []) as Safe[]

  const issued = securities.filter(s => s.issued)
  const totalIssuedShares = issued.reduce((sum, s) => sum + (Number(s.shares) || 0), 0)
  const holders = securities.map(s => ({
    ...s,
    computedPct: s.issued && totalIssuedShares > 0 ? Math.round(((Number(s.shares) || 0) / totalIssuedShares) * 1000) / 10 : null,
  }))
  const optionPoolReserved = securities.filter(s => s.security_class === 'option').reduce((sum, s) => sum + (Number(s.shares) || 0), 0)
  const fullyDilutedShares = securities.reduce((sum, s) => sum + (Number(s.shares) || 0), 0)

  const outstanding = safes.filter(s => s.status === 'outstanding')
  const outstandingSafes = {
    count: outstanding.length,
    total: outstanding.reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
    list: outstanding,
  }

  res.json({ data: { totalIssuedShares, holders, optionPoolReserved, fullyDilutedShares, outstandingSafes } })
})

// ─── Investors (CRM companies joined to their SAFEs) ─────────────────────────
router.get('/investors', async (_req, res) => {
  const [coRes, safeRes] = await Promise.all([
    overseerDb.from('crm_companies').select('id, name, type, owner').eq('type', 'investor'),
    overseerDb.from('cap_table_safes').select('*'),
  ])
  const companies = (coRes.data ?? []) as Array<{ id: string; name: string; type: string; owner: string | null }>
  const safes = (safeRes.data ?? []) as Safe[]

  const data = companies.map(c => {
    const theirs = safes.filter(s => s.crm_company_id === c.id)
    return {
      ...c,
      safes: theirs,
      outstandingTotal: theirs.filter(s => s.status === 'outstanding').reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
    }
  })
  res.json({ data })
})

export default router
