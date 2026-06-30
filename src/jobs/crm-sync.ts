/**
 * CRM email/calendar sync engine (P1b). For each enabled mailbox, impersonate
 * it via the Workspace service account, pull recent Gmail threads + Calendar
 * events, auto-create contacts (+ companies by domain) for external parties,
 * and log one activity per thread/event — deduped via crm_sync_seen.
 *
 * Conservative by design: only threads/events involving an EXTERNAL party are
 * logged; internal-only correspondence is skipped; free-mail domains create a
 * contact but no company; first run is capped (90 days). Fail-safe per mailbox.
 */
import { overseerDb } from '../lib/overseerDb.js'
import {
  isWorkspaceSyncConfigured, workspaceDomain, clientFor,
  fetchThreads, fetchEvents, isExternal, domainOf, isFreeMail,
  type Party,
} from '../lib/googleSync.js'

interface Mailbox { email: string; label: string | null; enabled: boolean; last_sync: string | null }

const FIRST_RUN_DAYS = 90

// ── Upserts ───────────────────────────────────────────────────────────────
async function upsertCompanyByDomain(domain: string): Promise<string | null> {
  if (!domain || isFreeMail(domain)) return null
  const { data: existing } = await overseerDb
    .from('crm_companies').select('id').or(`website.eq.${domain},name.eq.${domain}`).limit(1).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await overseerDb.from('crm_companies').insert({
    name: domain, type: 'prospect', website: domain, notes: 'Auto-created from email sync',
  }).select('id').single()
  if (error) { console.error('[crm-sync] company upsert failed:', domain, error.message); return null }
  return data.id
}

async function upsertContact(party: Party, companyId: string | null): Promise<string | null> {
  const email = party.email
  const { data: existing } = await overseerDb.from('crm_contacts').select('id, company_id').eq('email', email).limit(1).maybeSingle()
  if (existing) {
    // Backfill a company link if we now know one and the contact had none.
    if (companyId && !existing.company_id) await overseerDb.from('crm_contacts').update({ company_id: companyId }).eq('id', existing.id)
    return existing.id
  }
  const { data, error } = await overseerDb.from('crm_contacts').insert({
    company_id: companyId, name: party.name || email, email, is_primary: false,
  }).select('id').single()
  if (error) { console.error('[crm-sync] contact upsert failed:', email, error.message); return null }
  return data.id
}

/** Log one activity, guarded so a thread/event is only logged once. */
async function logOnce(
  source: 'gmail' | 'calendar', externalId: string,
  activity: { type: 'email' | 'meeting'; subject: string; body: string; contact_id: string | null; company_id: string | null; via: string },
): Promise<void> {
  const { data: seen } = await overseerDb.from('crm_sync_seen').select('external_id').eq('source', source).eq('external_id', externalId).maybeSingle()
  if (seen) return
  const { data: act, error } = await overseerDb.from('crm_activities').insert({
    company_id: activity.company_id, contact_id: activity.contact_id,
    type: activity.type, subject: activity.subject, body: activity.body, created_by: activity.via,
  }).select('id').single()
  if (error) { console.error('[crm-sync] activity insert failed:', externalId, error.message); return }
  await overseerDb.from('crm_sync_seen').insert({ source, external_id: externalId, activity_id: act?.id ?? null })
}

/** Resolve external parties → (primary contact, company) for linking an activity. */
async function resolveParties(parties: Party[], ourDomain: string): Promise<{ contactId: string | null; companyId: string | null }> {
  const external = parties.filter((p) => isExternal(p.email, ourDomain))
  let primaryContact: string | null = null
  let primaryCompany: string | null = null
  for (const p of external) {
    const companyId = await upsertCompanyByDomain(domainOf(p.email))
    const contactId = await upsertContact(p, companyId)
    if (!primaryContact) { primaryContact = contactId; primaryCompany = companyId }
  }
  return { contactId: primaryContact, companyId: primaryCompany }
}

// ── Per-mailbox sync ────────────────────────────────────────────────────────
async function syncMailbox(mb: Mailbox, ourDomain: string): Promise<void> {
  const { gmail, calendar } = clientFor(mb.email)
  const sinceMs = mb.last_sync ? new Date(mb.last_sync).getTime() : Date.now() - FIRST_RUN_DAYS * 86400000
  const afterUnix = Math.floor(sinceMs / 1000)

  // Gmail threads
  const threads = await fetchThreads(gmail, afterUnix)
  for (const t of threads) {
    if (!t.participants.some((p) => isExternal(p.email, ourDomain))) continue // internal-only → skip
    const { contactId, companyId } = await resolveParties(t.participants, ourDomain)
    if (!contactId) continue
    await logOnce('gmail', t.threadId, {
      type: 'email', subject: t.subject, body: t.snippet,
      contact_id: contactId, company_id: companyId, via: 'Gmail',
    })
  }

  // Calendar events
  const sinceIso = new Date(sinceMs).toISOString()
  const events = await fetchEvents(calendar, sinceIso, sinceIso)
  for (const e of events) {
    if (!e.attendees.some((p) => isExternal(p.email, ourDomain))) continue
    const { contactId, companyId } = await resolveParties(e.attendees, ourDomain)
    if (!contactId) continue
    const body = [e.location && `@ ${e.location}`, new Date(e.at).toLocaleString('en-US')].filter(Boolean).join(' · ')
    await logOnce('calendar', e.eventId, {
      type: 'meeting', subject: e.title, body,
      contact_id: contactId, company_id: companyId, via: 'Calendar',
    })
  }

  await overseerDb.from('crm_sync_mailboxes').update({ last_sync: new Date().toISOString() }).eq('email', mb.email)
}

// ── Entry point (scheduled as crm_email_sync) ───────────────────────────────
export async function runCrmSync(): Promise<void> {
  if (!isWorkspaceSyncConfigured()) {
    console.log('[crm-sync] Workspace sync not configured (GOOGLE_SA_* / domain) — skipping')
    return
  }
  const ourDomain = workspaceDomain()

  const { data, error } = await overseerDb.from('crm_sync_mailboxes').select('email, label, enabled, last_sync').eq('enabled', true)
  if (error) { console.log('[crm-sync] mailboxes table unavailable — skipping:', error.message); return }
  const mailboxes = (data ?? []) as Mailbox[]
  if (mailboxes.length === 0) { console.log('[crm-sync] no enabled mailboxes'); return }

  for (const mb of mailboxes) {
    try {
      await syncMailbox(mb, ourDomain)
      console.log(`[crm-sync] synced ${mb.email}`)
    } catch (err) {
      // One mailbox failing must never block the others.
      console.error(`[crm-sync] mailbox ${mb.email} failed:`, err instanceof Error ? err.message : err)
    }
  }
}
