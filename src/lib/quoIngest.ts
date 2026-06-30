/**
 * Quo → CRM ingestion (P2). Match a phone number to a crm_contact (create if
 * unknown — a real call/text is a real contact), and log a crm_activities row
 * (type 'sms'|'call'), deduped via quo_seen. Shared by the webhook + backfill.
 * Fail-safe: callers wrap these; one bad event never blocks the rest.
 */
import { overseerDb } from './overseerDb.js'
import { normalizePhone, type QuoMessage, type QuoCall } from './quo.js'

export interface MatchedContact { contactId: string | null; companyId: string | null }

/** Find a contact by phone (last-10 match); create a bare contact if unknown. */
export async function findOrCreateContactByPhone(phone: string, name?: string): Promise<MatchedContact> {
  const norm = normalizePhone(phone)
  if (norm.length < 10) return { contactId: null, companyId: null } // short code / likely spam → skip
  const tail = norm.slice(-7)
  const { data: candidates } = await overseerDb.from('crm_contacts').select('id, company_id, phone').ilike('phone', `%${tail}%`)
  const match = (candidates ?? []).find((c) => normalizePhone(c.phone) === norm)
  if (match) return { contactId: match.id, companyId: match.company_id }
  const { data, error } = await overseerDb.from('crm_contacts')
    .insert({ company_id: null, name: name || phone, phone, is_primary: false }).select('id, company_id').single()
  if (error) { console.error('[quo] contact create failed:', phone, error.message); return { contactId: null, companyId: null } }
  return { contactId: data.id, companyId: data.company_id }
}

async function alreadySeen(externalId: string): Promise<string | null | false> {
  const { data } = await overseerDb.from('quo_seen').select('activity_id').eq('external_id', externalId).maybeSingle()
  return data ? (data.activity_id ?? null) : false
}

async function logActivity(externalId: string, row: { type: 'sms' | 'call'; subject: string; body: string; contact_id: string | null; company_id: string | null; created_by: string }): Promise<void> {
  const { data: act, error } = await overseerDb.from('crm_activities')
    .insert({ company_id: row.company_id, contact_id: row.contact_id, type: row.type, subject: row.subject, body: row.body, created_by: row.created_by })
    .select('id').single()
  if (error) { console.error('[quo] activity insert failed:', externalId, error.message); return }
  await overseerDb.from('quo_seen').insert({ external_id: externalId, activity_id: act?.id ?? null })
}

/** The participant on the other end (not our inbox). */
function externalParty(direction: string, from: string, to: string | string[]): string {
  const toArr = Array.isArray(to) ? to : [to]
  return direction === 'incoming' ? from : (toArr[0] ?? from)
}

export async function ingestMessage(msg: QuoMessage): Promise<void> {
  if (await alreadySeen(msg.id) !== false) return
  const other = externalParty(msg.direction, msg.from, msg.to)
  const { contactId, companyId } = await findOrCreateContactByPhone(other)
  if (!contactId) return
  const text = msg.text ?? msg.body ?? ''
  await logActivity(msg.id, {
    type: 'sms',
    subject: `${msg.direction === 'incoming' ? 'Text from' : 'Text to'} ${other}`,
    body: text,
    contact_id: contactId, company_id: companyId, created_by: 'Quo',
  })
}

export async function ingestCall(call: QuoCall): Promise<void> {
  if (await alreadySeen(call.id) !== false) return
  const other = externalParty(call.direction, call.from, call.to)
  const { contactId, companyId } = await findOrCreateContactByPhone(other)
  if (!contactId) return
  const dur = call.duration ? ` · ${Math.round(call.duration / 60)}m` : ''
  await logActivity(call.id, {
    type: 'call',
    subject: `${call.direction === 'incoming' ? 'Call from' : 'Call to'} ${other}${dur}`,
    body: call.status ? `Status: ${call.status}` : '',
    contact_id: contactId, company_id: companyId, created_by: 'Quo',
  })
}

/** Attach a transcript to the already-logged call activity (or log it now). */
export async function attachTranscript(callId: string, transcript: string): Promise<void> {
  const seen = await alreadySeen(callId)
  if (seen) {
    await overseerDb.from('crm_activities').update({ body: transcript }).eq('id', seen)
    return
  }
  // Transcript arrived before the call event — log a minimal call activity with it.
  await logActivity(callId, { type: 'call', subject: 'Call', body: transcript, contact_id: null, company_id: null, created_by: 'Quo' })
}

/**
 * Consent gate. Replies to an existing inbound conversation are always allowed;
 * marketing/bulk requires sms_opt_in. (Bulk isn't built yet — this exists so we
 * never accidentally text a non-opted contact in a marketing context.)
 */
export function canText(contact: { sms_opt_in?: boolean } | null, purpose: 'reply' | 'marketing'): boolean {
  if (purpose === 'reply') return true
  return !!contact?.sms_opt_in
}
