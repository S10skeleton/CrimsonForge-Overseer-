/**
 * CRM — companies, contacts, deals, activities, and lead conversion.
 * Owned by the Overseer DB (overseerDb); links to ForgePilot by stored ids.
 * Access is enforced at the router mount (server.ts) by per-area guards —
 * crm.leads / crm.pipeline / crm.companies, GET=view + writes=manage (owner
 * bypasses). All mutations audited.
 * Envelope: { data } / { data, meta } with keyset pagination (created_at).
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AuthRequest } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import { audit } from '../../lib/audit.js'
import { stagesFor, defaultStage, isPipeline } from '../../lib/crmPipelines.js'
import { isWorkspaceSyncConfigured, workspaceDomain } from '../../lib/googleSync.js'

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
router.get('/companies', async (req, res) => {
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

router.get('/companies/:id', async (req, res) => {
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

router.post('/companies', async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.name) { res.status(400).json({ error: 'name required' }); return }
  let custom: Record<string, unknown> = {}
  if (b.custom && typeof b.custom === 'object') {
    const c = await buildCustom('company', 'crm_companies', null, b.custom as Record<string, unknown>)
    if ('error' in c) { res.status(400).json({ error: c.error }); return }
    custom = c.value
  }
  const { data, error } = await overseerDb.from('crm_companies').insert({
    name: b.name, type: b.type ?? 'prospect', status: b.status ?? 'active',
    website: b.website ?? null, fp_shop_id: b.fp_shop_id ?? null, fp_customer_id: b.fp_customer_id ?? null,
    source_lead_id: b.source_lead_id ?? null, owner: b.owner ?? req.panelUser?.username ?? null,
    notes: b.notes ?? null, tags: b.tags ?? [], custom,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create company' }); return }
  audit(req, { action: 'crm.company_create', targetType: 'crm_company', targetId: data.id, meta: { name: data.name, type: data.type } })
  res.status(201).json({ data })
})

router.patch('/companies/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const allowed = ['name', 'type', 'status', 'website', 'fp_shop_id', 'fp_customer_id', 'owner', 'notes', 'tags']
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (b[k] !== undefined) row[k] = b[k]
  if (b.custom && typeof b.custom === 'object') {
    const c = await buildCustom('company', 'crm_companies', id, b.custom as Record<string, unknown>)
    if ('error' in c) { res.status(400).json({ error: c.error }); return }
    row.custom = c.value
  }
  const { data, error } = await overseerDb.from('crm_companies').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update company' }); return }
  audit(req, { action: 'crm.company_update', targetType: 'crm_company', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/companies/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('crm_companies').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete company' }); return }
  audit(req, { action: 'crm.company_delete', targetType: 'crm_company', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Contacts ────────────────────────────────────────────────────────────────
router.post('/contacts', async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.company_id || !b.name) { res.status(400).json({ error: 'company_id and name required' }); return }
  let custom: Record<string, unknown> = {}
  if (b.custom && typeof b.custom === 'object') {
    const c = await buildCustom('contact', 'crm_contacts', null, b.custom as Record<string, unknown>)
    if ('error' in c) { res.status(400).json({ error: c.error }); return }
    custom = c.value
  }
  const { data, error } = await overseerDb.from('crm_contacts').insert({
    company_id: b.company_id, name: b.name, title: b.title ?? null, email: b.email ?? null,
    phone: b.phone ?? null, is_primary: b.is_primary ?? false, notes: b.notes ?? null, custom,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create contact' }); return }
  audit(req, { action: 'crm.contact_create', targetType: 'crm_contact', targetId: data.id, meta: { company_id: b.company_id, name: b.name } })
  res.status(201).json({ data })
})

router.patch('/contacts/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const allowed = ['name', 'title', 'email', 'phone', 'is_primary', 'notes']
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (b[k] !== undefined) row[k] = b[k]
  if (b.custom && typeof b.custom === 'object') {
    const c = await buildCustom('contact', 'crm_contacts', id, b.custom as Record<string, unknown>)
    if ('error' in c) { res.status(400).json({ error: c.error }); return }
    row.custom = c.value
  }
  const { data, error } = await overseerDb.from('crm_contacts').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update contact' }); return }
  audit(req, { action: 'crm.contact_update', targetType: 'crm_contact', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/contacts/:id', async (req: AuthRequest, res) => {
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

router.get('/deals', async (req, res) => {
  let q = overseerDb.from('crm_deals').select('*').order('updated_at', { ascending: false })
  if (typeof req.query.pipeline === 'string') q = q.eq('pipeline', req.query.pipeline)
  if (typeof req.query.status === 'string') q = q.eq('status', req.query.status)
  const { data, error } = await q
  if (error) { res.status(500).json({ error: 'Could not load deals' }); return }
  res.json({ data: await attachCompanyNames(data ?? []) })
})

router.get('/deals/pipeline/:pipeline', async (req, res) => {
  const pipeline = String(req.params.pipeline)
  if (!isPipeline(pipeline)) { res.status(400).json({ error: 'Unknown pipeline' }); return }
  const { data, error } = await overseerDb.from('crm_deals').select('*').eq('pipeline', pipeline).order('updated_at', { ascending: false })
  if (error) { res.status(500).json({ error: 'Could not load pipeline' }); return }
  const deals = await attachCompanyNames(data ?? [])
  const stages = stagesFor(pipeline).map(stage => ({ stage, deals: deals.filter(d => d.stage === stage) }))
  res.json({ data: { pipeline, stages } })
})

router.post('/deals', async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  if (!b.company_id || !b.name) { res.status(400).json({ error: 'company_id and name required' }); return }
  const pipeline = typeof b.pipeline === 'string' && isPipeline(b.pipeline) ? b.pipeline : 'fundraising'
  const stage = typeof b.stage === 'string' && b.stage ? b.stage : defaultStage(pipeline)
  let custom: Record<string, unknown> = {}
  if (b.custom && typeof b.custom === 'object') {
    const c = await buildCustom('deal', 'crm_deals', null, b.custom as Record<string, unknown>)
    if ('error' in c) { res.status(400).json({ error: c.error }); return }
    custom = c.value
  }
  const { data, error } = await overseerDb.from('crm_deals').insert({
    company_id: b.company_id, name: b.name, pipeline, stage,
    amount: b.amount ?? null, currency: b.currency ?? 'USD', probability: b.probability ?? null,
    status: b.status ?? 'open', expected_close: b.expected_close ?? null,
    owner: b.owner ?? req.panelUser?.username ?? null, notes: b.notes ?? null, custom,
  }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create deal' }); return }
  audit(req, { action: 'crm.deal_create', targetType: 'crm_deal', targetId: data.id, meta: { name: b.name, pipeline, stage } })
  res.status(201).json({ data })
})

router.patch('/deals/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const allowed = ['name', 'pipeline', 'stage', 'amount', 'currency', 'probability', 'status', 'expected_close', 'owner', 'notes']
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (b[k] !== undefined) row[k] = b[k]
  if (b.custom && typeof b.custom === 'object') {
    const c = await buildCustom('deal', 'crm_deals', id, b.custom as Record<string, unknown>)
    if ('error' in c) { res.status(400).json({ error: c.error }); return }
    row.custom = c.value
  }
  const { data, error } = await overseerDb.from('crm_deals').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update deal' }); return }
  audit(req, { action: 'crm.deal_update', targetType: 'crm_deal', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/deals/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('crm_deals').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete deal' }); return }
  audit(req, { action: 'crm.deal_delete', targetType: 'crm_deal', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Activities ──────────────────────────────────────────────────────────────
router.get('/activities', async (req, res) => {
  let q = overseerDb.from('crm_activities').select('*').order('created_at', { ascending: false }).limit(parseLimit(req.query.limit))
  if (typeof req.query.company_id === 'string') q = q.eq('company_id', req.query.company_id)
  if (typeof req.query.contact_id === 'string') q = q.eq('contact_id', req.query.contact_id)
  if (typeof req.query.deal_id === 'string') q = q.eq('deal_id', req.query.deal_id)
  const { data, error } = await q
  if (error) { res.status(500).json({ error: 'Could not load activities' }); return }
  res.json({ data: data ?? [] })
})

router.post('/activities', async (req: AuthRequest, res) => {
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

router.patch('/activities/:id', async (req: AuthRequest, res) => {
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

router.delete('/activities/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('crm_activities').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete activity' }); return }
  audit(req, { action: 'crm.activity_delete', targetType: 'crm_activity', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Custom field definitions (Attio-style attributes) ───────────────────────
// One row per user-defined attribute on a company/contact/deal. Definitions are
// owner/admin-managed (writes gated as crm.companies@manage by the mount guard);
// values live in each record's `custom` jsonb. Rollout-safe: if crm_field_defs
// isn't migrated yet, GET returns [] instead of erroring the CRM.
const FIELD_OBJECTS = ['company', 'contact', 'deal']
const FIELD_TYPES = ['text', 'number', 'date', 'select', 'multi_select', 'phone', 'email', 'url', 'boolean', 'currency']
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/

router.get('/fields', async (req, res) => {
  let q = overseerDb.from('crm_field_defs').select('*').order('position', { ascending: true }).order('created_at', { ascending: true })
  if (typeof req.query.object === 'string') q = q.eq('object', req.query.object)
  if (req.query.all !== '1') q = q.eq('archived', false)
  const { data, error } = await q
  if (error) { res.json({ data: [] }); return } // table not migrated yet — degrade gracefully
  res.json({ data: data ?? [] })
})

router.post('/fields', async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  const object = String(b.object ?? '')
  const key = String(b.key ?? '').trim()
  const label = String(b.label ?? '').trim()
  const type = String(b.type ?? 'text')
  if (!FIELD_OBJECTS.includes(object)) { res.status(400).json({ error: 'object must be company, contact, or deal' }); return }
  if (!SNAKE_CASE.test(key)) { res.status(400).json({ error: 'key must be snake_case (a–z, 0–9, _)' }); return }
  if (!label) { res.status(400).json({ error: 'label required' }); return }
  if (!FIELD_TYPES.includes(type)) { res.status(400).json({ error: 'invalid field type' }); return }
  const options = Array.isArray(b.options) ? b.options : null
  const { data, error } = await overseerDb.from('crm_field_defs').insert({
    object, key, label, type, options, position: typeof b.position === 'number' ? b.position : 0,
  }).select('*').single()
  if (error) {
    if (error.code === '23505') { res.status(409).json({ error: 'A field with that key already exists for this object' }); return }
    res.status(500).json({ error: 'Could not create field' }); return
  }
  audit(req, { action: 'crm.field_create', targetType: 'crm_field_def', targetId: data.id, meta: { object, key, type } })
  res.status(201).json({ data })
})

router.patch('/fields/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const b = req.body as Record<string, unknown>
  const allowed = ['label', 'options', 'position', 'archived']
  const row: Record<string, unknown> = {}
  for (const k of allowed) if (b[k] !== undefined) row[k] = b[k]
  if (Object.keys(row).length === 0) { res.status(400).json({ error: 'nothing to update' }); return }
  const { data, error } = await overseerDb.from('crm_field_defs').update(row).eq('id', id).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update field' }); return }
  audit(req, { action: 'crm.field_update', targetType: 'crm_field_def', targetId: id, meta: row })
  res.json({ data })
})

router.delete('/fields/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('crm_field_defs').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete field' }); return }
  audit(req, { action: 'crm.field_delete', targetType: 'crm_field_def', targetId: id })
  res.json({ data: { ok: true } })
})

// Validate + merge a `custom` patch into a record's existing jsonb bag, without
// clobbering keys the caller didn't send. Light type checks against the defs.
async function buildCustom(
  object: 'company' | 'contact' | 'deal',
  table: 'crm_companies' | 'crm_contacts' | 'crm_deals',
  id: string | null,
  incoming: Record<string, unknown>,
): Promise<{ value: Record<string, unknown> } | { error: string }> {
  const { data: defs } = await overseerDb.from('crm_field_defs').select('key, type').eq('object', object).eq('archived', false)
  const typeByKey = new Map((defs ?? []).map((d: { key: string; type: string }) => [d.key, d.type]))
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === '') continue
    const t = typeByKey.get(k)
    if ((t === 'number' || t === 'currency') && typeof v !== 'number' && Number.isNaN(Number(v))) {
      return { error: `Field "${k}" must be a number` }
    }
  }
  let base: Record<string, unknown> = {}
  if (id) {
    const { data } = await overseerDb.from(table).select('custom').eq('id', id).maybeSingle()
    base = (data?.custom as Record<string, unknown>) ?? {}
  }
  return { value: { ...base, ...incoming } }
}

// ─── Email/calendar sync mailboxes (P1b) ─────────────────────────────────────
// Which @workspace mailboxes the sync engine ingests. Reads = crm.companies@view,
// writes = @manage (owner/admin), via the mount guard. Rollout-safe + audited.
router.get('/sync/mailboxes', async (_req, res) => {
  const { data, error } = await overseerDb.from('crm_sync_mailboxes').select('*').order('created_at', { ascending: true })
  res.json({ data: error ? [] : (data ?? []), configured: isWorkspaceSyncConfigured(), domain: workspaceDomain() || null })
})

router.post('/sync/mailboxes', async (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: 'valid email required' }); return }
  const dom = workspaceDomain()
  if (dom && email.split('@')[1] !== dom) { res.status(400).json({ error: `mailbox must be a @${dom} address` }); return }
  const { data, error } = await overseerDb.from('crm_sync_mailboxes')
    .insert({ email, label: b.label ?? null, enabled: b.enabled ?? true }).select('*').single()
  if (error) {
    if (error.code === '23505') { res.status(409).json({ error: 'Mailbox already added' }); return }
    res.status(500).json({ error: 'Could not add mailbox' }); return
  }
  audit(req, { action: 'crm.mailbox_add', targetType: 'crm_sync_mailbox', targetId: email, meta: { label: b.label ?? null } })
  res.status(201).json({ data })
})

router.patch('/sync/mailboxes/:email', async (req: AuthRequest, res) => {
  const email = decodeURIComponent(String(req.params.email)).toLowerCase()
  const b = req.body as Record<string, unknown>
  const row: Record<string, unknown> = {}
  if (b.enabled !== undefined) row.enabled = b.enabled
  if (b.label !== undefined) row.label = b.label
  if (Object.keys(row).length === 0) { res.status(400).json({ error: 'nothing to update' }); return }
  const { data, error } = await overseerDb.from('crm_sync_mailboxes').update(row).eq('email', email).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not update mailbox' }); return }
  audit(req, { action: 'crm.mailbox_update', targetType: 'crm_sync_mailbox', targetId: email, meta: row })
  res.json({ data })
})

router.delete('/sync/mailboxes/:email', async (req: AuthRequest, res) => {
  const email = decodeURIComponent(String(req.params.email)).toLowerCase()
  const { error } = await overseerDb.from('crm_sync_mailboxes').delete().eq('email', email)
  if (error) { res.status(500).json({ error: 'Could not remove mailbox' }); return }
  audit(req, { action: 'crm.mailbox_delete', targetType: 'crm_sync_mailbox', targetId: email })
  res.json({ data: { ok: true } })
})

// ─── Lead conversion ─────────────────────────────────────────────────────────
router.post('/leads/:id/convert', async (req: AuthRequest, res) => {
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
  if (cErr || !company) {
    // Concurrent convert: the unique index on source_lead_id rejected the dupe
    // (Postgres 23505). Treat as already-converted and return the winner.
    if (cErr && (cErr.code === '23505' || /duplicate|unique/i.test(cErr.message))) {
      const { data: winner } = await overseerDb.from('crm_companies').select('*').eq('source_lead_id', leadId).maybeSingle()
      if (winner) { res.json({ data: { company: winner, alreadyConverted: true } }); return }
    }
    res.status(500).json({ error: 'Could not create company' })
    return
  }

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
