/**
 * CRM — companies, contacts, deals, activities, and lead conversion.
 * Owned by the Overseer DB (overseerDb); links to ForgePilot by stored ids.
 * Reads/writes: requireAdmin. Deletes: requireOwner. All mutations audited.
 * Envelope: { data } / { data, meta } with keyset pagination (created_at).
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AuthRequest } from '../middleware/auth.js'
import { requireAdmin, requireOwner } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import { audit } from '../../lib/audit.js'
import { stagesFor, defaultStage, isPipeline } from '../../lib/crmPipelines.js'

const router = Router()

// CFP service client — only used by the convert handler to read/flip leads.
function getCFPSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function parseLimit(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(Math.floor(n), 200)
}

function nextCursor<T extends { created_at: string }>(rows: T[], limit: number): string | null {
  return rows.length === limit ? rows[rows.length - 1].created_at : null
}

// ─── Companies ───────────────────────────────────────────────────────────────
router.get('/companies', requireAdmin, async (req, res) => {
  const limit = parseLimit(req.query.limit)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null
  let q = overseerDb.from('crm_companies').select('*').order('created_at', { ascending: false }).limit(limit)
  if (typeof req.query.type === 'string') q = q.eq('type', req.query.type)
  if (typeof req.query.tag === 'string') q = q.contains('tags', [req.query.tag])
  if (typeof req.query.q === 'string' && req.query.q.trim()) q = q.ilike('name', `%${req.query.q.trim()}%`)
  if (cursor) q = q.lt('created_at', cursor)

  const { data, error } = await q
  if (error) { res.status(500).json({ error: 'Could not load companies' }); return }
  const rows = data ?? []
  res.json({ data: rows, meta: { next_cursor: nextCursor(rows, limit) } })
})

router.get('/companies/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id)
  const [company, contacts, deals, activities] = await Promise.all([
    overseerDb.from('crm_companies').select('*').eq('id', id).maybeSingle(),
    overseerDb.from('crm_contacts').select('*').eq('company_id', id).order('is_primary', { ascending: false }),
    overseerDb.from('crm_deals').select('*').eq('company_id', id).order('created_at', { ascending: false }),
    overseerDb.from('crm_activities').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(50),
  ])
  if (!company.data) { res.status(404).json({ error: 'Company not found' }); return }
  res.json({ data: { company: company.data, contacts: contacts.data ?? [], deals: deals.data ?? [], activities: activities.data ?? [] } })
})

router.post('/companies', requireAdmin, async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.name) { res.status(400).json({ error: 'name required' }); return }
  const { data, error } = await overseerDb.from('crm_companies').insert({
    name: b.name, type: b.type ?? 'prospect', status: b.status ?? 'active',
    website: b.website ?? null, fp_shop_id: b.fp_shop_id ?? null, fp_customer_id: b.fp_customer_id ?? null,
    source_lead_id: b.source_lead_id ?? null, owner: b.owner ?? req.panelUser?.username ?? null,
    notes: b.notes ?? null, tags: b.tags ?? [],
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create company' }); return }
  audit(req, { action: 'crm.company_create', targetType: 'crm_company', targetId: data.id, meta: { name: data.name, type: data.type } })
  res.status(201).json({ data })
})

router.patch('/companies/:id', requireAdmin, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const allowed = ['name', 'type', 'status', 'website', 'fp_shop_id', 'fp_customer_id', 'owner', 'notes', 'tags']
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (b[k] !== undefined) row[k] = b[k]
  const { data, error } = await overseerDb.from('crm_companies').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update company' }); return }
  audit(req, { action: 'crm.company_update', targetType: 'crm_company', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/companies/:id', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('crm_companies').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete company' }); return }
  audit(req, { action: 'crm.company_delete', targetType: 'crm_company', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Contacts ────────────────────────────────────────────────────────────────
router.post('/contacts', requireAdmin, async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.company_id || !b.name) { res.status(400).json({ error: 'company_id and name required' }); return }
  const { data, error } = await overseerDb.from('crm_contacts').insert({
    company_id: b.company_id, name: b.name, title: b.title ?? null, email: b.email ?? null,
    phone: b.phone ?? null, is_primary: b.is_primary ?? false, notes: b.notes ?? null,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create contact' }); return }
  audit(req, { action: 'crm.contact_create', targetType: 'crm_contact', targetId: data.id, meta: { company_id: b.company_id, name: b.name } })
  res.status(201).json({ data })
})

router.patch('/contacts/:id', requireAdmin, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const allowed = ['name', 'title', 'email', 'phone', 'is_primary', 'notes']
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (b[k] !== undefined) row[k] = b[k]
  const { data, error } = await overseerDb.from('crm_contacts').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update contact' }); return }
  audit(req, { action: 'crm.contact_update', targetType: 'crm_contact', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/contacts/:id', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('crm_contacts').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete contact' }); return }
  audit(req, { action: 'crm.contact_delete', targetType: 'crm_contact', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Deals ───────────────────────────────────────────────────────────────────
async function attachCompanyNames<T extends { company_id: string | null }>(deals: T[]): Promise<Array<T & { company_name: string | null }>> {
  const ids = [...new Set(deals.map(d => d.company_id).filter(Boolean))] as string[]
  if (ids.length === 0) return deals.map(d => ({ ...d, company_name: null }))
  const { data } = await overseerDb.from('crm_companies').select('id, name').in('id', ids)
  const nameById = new Map((data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
  return deals.map(d => ({ ...d, company_name: d.company_id ? nameById.get(d.company_id) ?? null : null }))
}

router.get('/deals', requireAdmin, async (req, res) => {
  let q = overseerDb.from('crm_deals').select('*').order('updated_at', { ascending: false })
  if (typeof req.query.pipeline === 'string') q = q.eq('pipeline', req.query.pipeline)
  if (typeof req.query.status === 'string') q = q.eq('status', req.query.status)
  const { data, error } = await q
  if (error) { res.status(500).json({ error: 'Could not load deals' }); return }
  res.json({ data: await attachCompanyNames(data ?? []) })
})

router.get('/deals/pipeline/:pipeline', requireAdmin, async (req, res) => {
  const pipeline = String(req.params.pipeline)
  if (!isPipeline(pipeline)) { res.status(400).json({ error: 'Unknown pipeline' }); return }
  const { data, error } = await overseerDb.from('crm_deals').select('*').eq('pipeline', pipeline).order('updated_at', { ascending: false })
  if (error) { res.status(500).json({ error: 'Could not load pipeline' }); return }
  const deals = await attachCompanyNames(data ?? [])
  const stages = stagesFor(pipeline).map(stage => ({ stage, deals: deals.filter(d => d.stage === stage) }))
  res.json({ data: { pipeline, stages } })
})

router.post('/deals', requireAdmin, async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.company_id || !b.name) { res.status(400).json({ error: 'company_id and name required' }); return }
  const pipeline = typeof b.pipeline === 'string' && isPipeline(b.pipeline) ? b.pipeline : 'fundraising'
  const stage = typeof b.stage === 'string' && b.stage ? b.stage : defaultStage(pipeline)
  const { data, error } = await overseerDb.from('crm_deals').insert({
    company_id: b.company_id, name: b.name, pipeline, stage,
    amount: b.amount ?? null, currency: b.currency ?? 'USD', probability: b.probability ?? null,
    status: b.status ?? 'open', expected_close: b.expected_close ?? null,
    owner: b.owner ?? req.panelUser?.username ?? null, notes: b.notes ?? null,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create deal' }); return }
  audit(req, { action: 'crm.deal_create', targetType: 'crm_deal', targetId: data.id, meta: { name: b.name, pipeline, stage } })
  res.status(201).json({ data })
})

router.patch('/deals/:id', requireAdmin, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const allowed = ['name', 'pipeline', 'stage', 'amount', 'currency', 'probability', 'status', 'expected_close', 'owner', 'notes']
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (b[k] !== undefined) row[k] = b[k]
  const { data, error } = await overseerDb.from('crm_deals').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update deal' }); return }
  audit(req, { action: 'crm.deal_update', targetType: 'crm_deal', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/deals/:id', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('crm_deals').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete deal' }); return }
  audit(req, { action: 'crm.deal_delete', targetType: 'crm_deal', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Activities ──────────────────────────────────────────────────────────────
router.get('/activities', requireAdmin, async (req, res) => {
  let q = overseerDb.from('crm_activities').select('*').order('created_at', { ascending: false }).limit(parseLimit(req.query.limit))
  if (typeof req.query.company_id === 'string') q = q.eq('company_id', req.query.company_id)
  if (typeof req.query.contact_id === 'string') q = q.eq('contact_id', req.query.contact_id)
  if (typeof req.query.deal_id === 'string') q = q.eq('deal_id', req.query.deal_id)
  const { data, error } = await q
  if (error) { res.status(500).json({ error: 'Could not load activities' }); return }
  res.json({ data: data ?? [] })
})

router.post('/activities', requireAdmin, async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.company_id) { res.status(400).json({ error: 'company_id required' }); return }
  const { data, error } = await overseerDb.from('crm_activities').insert({
    company_id: b.company_id, contact_id: b.contact_id ?? null, deal_id: b.deal_id ?? null,
    type: b.type ?? 'note', subject: b.subject ?? null, body: b.body ?? null,
    due_at: b.due_at ?? null, done: b.done ?? false, created_by: req.panelUser?.username ?? null,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create activity' }); return }
  audit(req, { action: 'crm.activity_create', targetType: 'crm_activity', targetId: data.id, meta: { company_id: b.company_id, type: b.type ?? 'note' } })
  res.status(201).json({ data })
})

router.patch('/activities/:id', requireAdmin, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const allowed = ['type', 'subject', 'body', 'due_at', 'done', 'contact_id', 'deal_id']
  const row: Record<string, unknown> = {}
  for (const k of allowed) if (b[k] !== undefined) row[k] = b[k]
  const { data, error } = await overseerDb.from('crm_activities').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update activity' }); return }
  audit(req, { action: 'crm.activity_update', targetType: 'crm_activity', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/activities/:id', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('crm_activities').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete activity' }); return }
  audit(req, { action: 'crm.activity_delete', targetType: 'crm_activity', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Lead conversion ─────────────────────────────────────────────────────────
router.post('/leads/:id/convert', requireAdmin, async (req: AuthRequest, res) => {
  const leadId = String(req.params.id)
  const b = req.body as { type?: string; pipeline?: string; dealName?: string; amount?: number }

  // Idempotent: a company already converted from this lead → return it.
  const { data: existing } = await overseerDb.from('crm_companies').select('*').eq('source_lead_id', leadId).maybeSingle()
  if (existing) { res.json({ data: { company: existing, alreadyConverted: true } }); return }

  // Read the lead from the CFP DB.
  const cfp = getCFPSupabase()
  const { data: lead, error: leadErr } = await cfp.from('contact_requests').select('*').eq('id', leadId).maybeSingle()
  if (leadErr || !lead) { res.status(404).json({ error: 'Lead not found' }); return }

  const companyName = lead.shop_name || lead.contact_name || 'Imported lead'
  const { data: company, error: cErr } = await overseerDb.from('crm_companies').insert({
    name: companyName, type: b.type ?? 'prospect', source_lead_id: leadId,
    owner: req.panelUser?.username ?? null, notes: lead.message ?? null,
  }).select('*').single()
  if (cErr || !company) { res.status(500).json({ error: 'Could not create company' }); return }

  let contact = null
  if (lead.contact_name || lead.email || lead.phone) {
    const { data: c } = await overseerDb.from('crm_contacts').insert({
      company_id: company.id, name: lead.contact_name || companyName,
      email: lead.email ?? null, phone: lead.phone ?? null, is_primary: true,
    }).select('*').single()
    contact = c
  }

  let deal = null
  if (b.pipeline && isPipeline(b.pipeline)) {
    const { data: d } = await overseerDb.from('crm_deals').insert({
      company_id: company.id, name: b.dealName || `${companyName} deal`,
      pipeline: b.pipeline, stage: defaultStage(b.pipeline), amount: b.amount ?? null,
      owner: req.panelUser?.username ?? null,
    }).select('*').single()
    deal = d
  }

  // Flip the lead's status to converted (fail-safe — don't fail the convert on this).
  try {
    await cfp.from('contact_requests').update({ status: 'converted' }).eq('id', leadId)
  } catch (err) {
    console.error('[crm] lead status flip failed:', err)
  }

  audit(req, { action: 'crm.lead_convert', targetType: 'crm_company', targetId: company.id, meta: { leadId, name: companyName } })
  res.status(201).json({ data: { company, contact, deal } })
})

export default router
