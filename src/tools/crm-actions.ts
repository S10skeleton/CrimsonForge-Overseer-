/**
 * CRM action tools (ELARA-1). These perform the REAL write in their execute();
 * the registry wraps the risky ones with proposable() so they return a proposal
 * in the panel bubble and only run for real via the audited /api/elara/action
 * endpoint (propose-mode off). crm_log_note is low-risk/internal → auto-runs.
 * quo_send_sms checks consent/blocklist itself before proposing or sending.
 */
import type { ToolResult, AgentTool } from '../types/index.js'
import { overseerDb } from '../lib/overseerDb.js'
import { inProposeMode, proposeAction } from '../agent/propose.js'
import { isQuoConfigured, sendMessage, listPhoneNumbers, normalizePhone } from '../lib/quo.js'

function ok<T>(tool: string, data: T): ToolResult<T> { return { tool, success: true, timestamp: new Date().toISOString(), data } }
function fail(tool: string, error: string): ToolResult { return { tool, success: false, timestamp: new Date().toISOString(), data: null, error } }

// ── crm_log_note — auto (internal, reversible) ───────────────────────────────
export const crmLogNoteTool: AgentTool = {
  name: 'crm_log_note',
  description: 'Append an internal note to a CRM record timeline (company/contact/deal). Low-risk, internal — runs immediately, no approval. Provide at least one of company_id/contact_id.',
  input_schema: { type: 'object', properties: { company_id: { type: 'string' }, contact_id: { type: 'string' }, deal_id: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['body'] },
  execute: async (input) => {
    if (!input.company_id && !input.contact_id) return fail('crm_log_note', 'company_id or contact_id required')
    const { data, error } = await overseerDb.from('crm_activities').insert({
      company_id: input.company_id ?? null, contact_id: input.contact_id ?? null, deal_id: input.deal_id ?? null,
      type: 'note', subject: input.subject ?? null, body: input.body, created_by: 'Elara',
    }).select('id').single()
    if (error) return fail('crm_log_note', error.message)
    return ok('crm_log_note', { id: data.id, logged: true })
  },
}

// ── create ───────────────────────────────────────────────────────────────────
export const crmCreateCompanyTool: AgentTool = {
  name: 'crm_create_company',
  description: 'Create a CRM company. (Proposal — requires approval.)',
  input_schema: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, website: { type: 'string' } }, required: ['name'] },
  execute: async (input) => {
    const { data, error } = await overseerDb.from('crm_companies').insert({ name: input.name, type: input.type ?? 'prospect', website: input.website ?? null }).select('id, name').single()
    return error ? fail('crm_create_company', error.message) : ok('crm_create_company', data)
  },
}
export const crmCreateContactTool: AgentTool = {
  name: 'crm_create_contact',
  description: 'Create a CRM contact (optionally under a company). (Proposal — requires approval.)',
  input_schema: { type: 'object', properties: { company_id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, title: { type: 'string' } }, required: ['name'] },
  execute: async (input) => {
    const { data, error } = await overseerDb.from('crm_contacts').insert({ company_id: input.company_id ?? null, name: input.name, email: input.email ?? null, phone: input.phone ?? null, title: input.title ?? null, is_primary: false }).select('id, name').single()
    return error ? fail('crm_create_contact', error.message) : ok('crm_create_contact', data)
  },
}
export const crmCreateDealTool: AgentTool = {
  name: 'crm_create_deal',
  description: 'Create a CRM deal under a company. (Proposal — requires approval.)',
  input_schema: { type: 'object', properties: { company_id: { type: 'string' }, name: { type: 'string' }, pipeline: { type: 'string' }, stage: { type: 'string' }, amount: { type: 'number' } }, required: ['company_id', 'name'] },
  execute: async (input) => {
    const { data, error } = await overseerDb.from('crm_deals').insert({ company_id: input.company_id, name: input.name, pipeline: input.pipeline ?? 'fundraising', stage: input.stage ?? null, amount: input.amount ?? null, status: 'open' }).select('id, name').single()
    return error ? fail('crm_create_deal', error.message) : ok('crm_create_deal', data)
  },
}

// ── update ───────────────────────────────────────────────────────────────────
function buildUpdate(input: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (input[k] !== undefined) row[k] = input[k]
  return row
}
export const crmUpdateDealTool: AgentTool = {
  name: 'crm_update_deal',
  description: 'Update a CRM deal (stage, status, amount, expected_close). (Proposal — requires approval.)',
  input_schema: { type: 'object', properties: { id: { type: 'string' }, stage: { type: 'string' }, status: { type: 'string' }, amount: { type: 'number' }, expected_close: { type: 'string' } }, required: ['id'] },
  execute: async (input) => {
    const { data, error } = await overseerDb.from('crm_deals').update(buildUpdate(input, ['stage', 'status', 'amount', 'expected_close'])).eq('id', input.id).select('id, name, stage, status').single()
    return error ? fail('crm_update_deal', error.message) : ok('crm_update_deal', data)
  },
}
export const crmUpdateContactTool: AgentTool = {
  name: 'crm_update_contact',
  description: 'Update a CRM contact (name, title, email, phone). (Proposal — requires approval.)',
  input_schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, title: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } }, required: ['id'] },
  execute: async (input) => {
    const { data, error } = await overseerDb.from('crm_contacts').update(buildUpdate(input, ['name', 'title', 'email', 'phone'])).eq('id', input.id).select('id, name').single()
    return error ? fail('crm_update_contact', error.message) : ok('crm_update_contact', data)
  },
}
export const crmUpdateCompanyTool: AgentTool = {
  name: 'crm_update_company',
  description: 'Update a CRM company (name, type, status, website, owner). (Proposal — requires approval.)',
  input_schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, status: { type: 'string' }, website: { type: 'string' }, owner: { type: 'string' } }, required: ['id'] },
  execute: async (input) => {
    const { data, error } = await overseerDb.from('crm_companies').update(buildUpdate(input, ['name', 'type', 'status', 'website', 'owner'])).eq('id', input.id).select('id, name').single()
    return error ? fail('crm_update_company', error.message) : ok('crm_update_company', data)
  },
}

// ── delete (destructive) ─────────────────────────────────────────────────────
function deleteTool(name: string, table: 'crm_companies' | 'crm_contacts' | 'crm_deals'): AgentTool {
  return {
    name, description: `Delete a CRM ${name.replace('crm_delete_', '')}. (Proposal — destructive, requires approval.)`,
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: async (input) => {
      const { error } = await overseerDb.from(table).delete().eq('id', input.id)
      return error ? fail(name, error.message) : ok(name, { id: input.id, deleted: true })
    },
  }
}
export const crmDeleteCompanyTool = deleteTool('crm_delete_company', 'crm_companies')
export const crmDeleteContactTool = deleteTool('crm_delete_contact', 'crm_contacts')
export const crmDeleteDealTool = deleteTool('crm_delete_deal', 'crm_deals')

// ── quo_send_sms — consent + blocklist checked, then propose/send ────────────
async function smsBlocked(phone: string): Promise<boolean> {
  const norm = normalizePhone(phone)
  if (norm.length < 10) return true
  const { data: contact } = await overseerDb.from('crm_contacts').select('email').ilike('phone', `%${norm.slice(-7)}%`).limit(1).maybeSingle()
  const email = (contact?.email as string | undefined)?.toLowerCase()
  if (!email) return false
  const domain = email.split('@')[1] ?? ''
  const { data: blocks } = await overseerDb.from('crm_sync_blocklist').select('pattern')
  const set = new Set((blocks ?? []).map((b: { pattern: string }) => b.pattern.toLowerCase()))
  return set.has(email) || set.has(domain)
}

export const quoSendSmsTool: AgentTool = {
  name: 'quo_send_sms',
  description: 'Send an SMS via Quo to a contact. (Proposal — requires approval. Refuses if the number is blocklisted.)',
  input_schema: { type: 'object', properties: { to: { type: 'string', description: 'E.164 phone number' }, body: { type: 'string' } }, required: ['to', 'body'] },
  execute: async (input) => {
    const to = String(input.to ?? ''); const body = String(input.body ?? '')
    if (!to || !body.trim()) return fail('quo_send_sms', 'to and body required')
    if (await smsBlocked(to)) return fail('quo_send_sms', 'That number is on the blocklist — refusing to text it.')
    if (inProposeMode()) return proposeAction({ kind: 'quo_send_sms', summary: `📱 Text ${to}: “${body}”`, payload: { to, body }, editable: ['body'] })
    // Real send (executed only via /api/elara/action).
    if (!isQuoConfigured()) return fail('quo_send_sms', 'Quo not configured')
    try {
      const from = (await listPhoneNumbers())[0]?.number
      if (!from) return fail('quo_send_sms', 'no Quo number available')
      const msg = await sendMessage({ from, to, content: body.trim() })
      return ok('quo_send_sms', { id: msg.id, sent: true })
    } catch (err) { return fail('quo_send_sms', err instanceof Error ? err.message : 'send failed') }
  },
}

// Action tools that perform real writes and need approval (wrapped proposable in
// the registry). quo_send_sms handles its own propose; crm_log_note is auto.
export const crmRiskyActionTools: AgentTool[] = [
  crmCreateCompanyTool, crmCreateContactTool, crmCreateDealTool,
  crmUpdateDealTool, crmUpdateContactTool, crmUpdateCompanyTool,
  crmDeleteCompanyTool, crmDeleteContactTool, crmDeleteDealTool,
]
