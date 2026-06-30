/**
 * CRM read tools for Elara (ELARA-1). Read-only over the Overseer DB; cap rows
 * and truncate snippets to stay in token budget. Auto-run (no approval).
 */
import type { ToolResult, AgentTool } from '../types/index.js'
import { overseerDb } from '../lib/overseerDb.js'

function ok<T>(tool: string, data: T): ToolResult<T> {
  return { tool, success: true, timestamp: new Date().toISOString(), data }
}
function fail(tool: string, error: string): ToolResult {
  return { tool, success: false, timestamp: new Date().toISOString(), data: null, error }
}
const trunc = (s: string | null | undefined, n = 160) => (s ? (s.length > n ? s.slice(0, n) + '…' : s) : '')

async function timelineFor(col: 'company_id' | 'contact_id', id: string, limit = 15) {
  const { data } = await overseerDb.from('crm_activities')
    .select('type, subject, body, created_by, created_at').eq(col, id).order('created_at', { ascending: false }).limit(limit)
  return (data ?? []).map((a) => ({ type: a.type, subject: a.subject, snippet: trunc(a.body, 120), source: a.created_by, at: a.created_at }))
}

// ── crm_search ───────────────────────────────────────────────────────────────
export const crmSearchTool: AgentTool = {
  name: 'crm_search',
  description: 'Search the CRM for companies, contacts, or deals by name/email/company. Returns top matches with ids + key fields. Use this first to find a record id.',
  input_schema: { type: 'object', properties: { query: { type: 'string', description: 'name, email, or company to match' }, object: { type: 'string', description: "'company' | 'contact' | 'deal' | 'all' (default all)" } }, required: ['query'] },
  execute: async (input) => {
    const q = String(input.query ?? '').trim()
    const which = String(input.object ?? 'all')
    if (!q) return fail('crm_search', 'query required')
    try {
      const out: Record<string, unknown> = {}
      if (which === 'all' || which === 'company') {
        const { data } = await overseerDb.from('crm_companies').select('id, name, type, status, website').or(`name.ilike.%${q}%,website.ilike.%${q}%`).limit(8)
        out.companies = data ?? []
      }
      if (which === 'all' || which === 'contact') {
        const { data } = await overseerDb.from('crm_contacts').select('id, name, email, phone, company_id, title').or(`name.ilike.%${q}%,email.ilike.%${q}%`).limit(8)
        out.contacts = data ?? []
      }
      if (which === 'all' || which === 'deal') {
        const { data } = await overseerDb.from('crm_deals').select('id, name, stage, status, amount, company_id').ilike('name', `%${q}%`).limit(8)
        out.deals = data ?? []
      }
      return ok('crm_search', out)
    } catch (err) { return fail('crm_search', err instanceof Error ? err.message : 'search failed') }
  },
}

// ── crm_get_company / contact / deal ─────────────────────────────────────────
export const crmGetCompanyTool: AgentTool = {
  name: 'crm_get_company',
  description: 'Get a CRM company by id: full record incl. custom fields + its recent activity timeline (emails/calls/meetings/notes).',
  input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  execute: async (input) => {
    const id = String(input.id ?? '')
    try {
      const { data: company } = await overseerDb.from('crm_companies').select('*').eq('id', id).maybeSingle()
      if (!company) return fail('crm_get_company', 'company not found')
      const [{ data: contacts }, { data: deals }] = await Promise.all([
        overseerDb.from('crm_contacts').select('id, name, email, phone, title, is_primary, sms_opt_in').eq('company_id', id),
        overseerDb.from('crm_deals').select('id, name, stage, status, amount, expected_close').eq('company_id', id),
      ])
      return ok('crm_get_company', { company, contacts: contacts ?? [], deals: deals ?? [], timeline: await timelineFor('company_id', id) })
    } catch (err) { return fail('crm_get_company', err instanceof Error ? err.message : 'failed') }
  },
}

export const crmGetContactTool: AgentTool = {
  name: 'crm_get_contact',
  description: 'Get a CRM contact by id: full record incl. phone, sms_opt_in, custom fields + recent timeline.',
  input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  execute: async (input) => {
    const id = String(input.id ?? '')
    try {
      const { data: contact } = await overseerDb.from('crm_contacts').select('*').eq('id', id).maybeSingle()
      if (!contact) return fail('crm_get_contact', 'contact not found')
      return ok('crm_get_contact', { contact, timeline: await timelineFor('contact_id', id) })
    } catch (err) { return fail('crm_get_contact', err instanceof Error ? err.message : 'failed') }
  },
}

export const crmGetDealTool: AgentTool = {
  name: 'crm_get_deal',
  description: 'Get a CRM deal by id: stage/status/value/expected_close + custom fields + linked company + recent timeline.',
  input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  execute: async (input) => {
    const id = String(input.id ?? '')
    try {
      const { data: deal } = await overseerDb.from('crm_deals').select('*').eq('id', id).maybeSingle()
      if (!deal) return fail('crm_get_deal', 'deal not found')
      const { data: company } = deal.company_id ? await overseerDb.from('crm_companies').select('id, name, type').eq('id', deal.company_id).maybeSingle() : { data: null }
      return ok('crm_get_deal', { deal, company, timeline: await timelineFor('company_id', deal.company_id ?? '') })
    } catch (err) { return fail('crm_get_deal', err instanceof Error ? err.message : 'failed') }
  },
}

// ── crm_pipeline ─────────────────────────────────────────────────────────────
export const crmPipelineTool: AgentTool = {
  name: 'crm_pipeline',
  description: 'List open deals needing attention. Filter by status, stale_days (no update in N days), or closing_within_days (expected_close ≤ N days).',
  input_schema: { type: 'object', properties: { status: { type: 'string' }, stale_days: { type: 'number' }, closing_within_days: { type: 'number' } }, required: [] },
  execute: async (input) => {
    try {
      let q = overseerDb.from('crm_deals').select('id, name, company_id, stage, status, amount, expected_close, updated_at').order('updated_at', { ascending: true }).limit(50)
      q = input.status ? q.eq('status', String(input.status)) : q.eq('status', 'open')
      const { data } = await q
      let deals = data ?? []
      const now = Date.now()
      if (typeof input.stale_days === 'number') deals = deals.filter((d) => (now - new Date(d.updated_at).getTime()) / 86400000 >= (input.stale_days as number))
      if (typeof input.closing_within_days === 'number') deals = deals.filter((d) => d.expected_close && (new Date(d.expected_close).getTime() - now) / 86400000 <= (input.closing_within_days as number))
      const ids = [...new Set(deals.map((d) => d.company_id).filter(Boolean))] as string[]
      const names = new Map<string, string>()
      if (ids.length) { const { data: cos } = await overseerDb.from('crm_companies').select('id, name').in('id', ids); for (const c of cos ?? []) names.set(c.id, c.name) }
      return ok('crm_pipeline', { deals: deals.slice(0, 25).map((d) => ({ ...d, company: d.company_id ? names.get(d.company_id) ?? null : null })) })
    } catch (err) { return fail('crm_pipeline', err instanceof Error ? err.message : 'failed') }
  },
}

// ── crm_recent_activity ──────────────────────────────────────────────────────
export const crmRecentActivityTool: AgentTool = {
  name: 'crm_recent_activity',
  description: 'Recent CRM activity across all records (emails, calls, meetings, notes). Filter by since_days, type, limit.',
  input_schema: { type: 'object', properties: { since_days: { type: 'number' }, type: { type: 'string' }, limit: { type: 'number' } }, required: [] },
  execute: async (input) => {
    try {
      const limit = Math.min(40, Number(input.limit) || 20)
      let q = overseerDb.from('crm_activities').select('type, subject, body, contact_id, company_id, created_by, created_at').order('created_at', { ascending: false }).limit(limit)
      if (input.type) q = q.eq('type', String(input.type))
      if (typeof input.since_days === 'number') q = q.gte('created_at', new Date(Date.now() - (input.since_days as number) * 86400000).toISOString())
      const { data } = await q
      return ok('crm_recent_activity', { activities: (data ?? []).map((a) => ({ type: a.type, subject: a.subject, snippet: trunc(a.body, 120), source: a.created_by, at: a.created_at })) })
    } catch (err) { return fail('crm_recent_activity', err instanceof Error ? err.message : 'failed') }
  },
}

export const crmReadTools: AgentTool[] = [
  crmSearchTool, crmGetCompanyTool, crmGetContactTool, crmGetDealTool, crmPipelineTool, crmRecentActivityTool,
]
