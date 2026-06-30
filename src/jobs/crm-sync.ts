/**
 * CRM email/calendar sync engine (P1b v1). For each enabled account, pull recent
 * Gmail threads + Calendar events, apply the junk filter, auto-create contacts
 * (+ companies by domain) for external parties, and log one activity per
 * thread/event — deduped via crm_sync_seen. Full bodies are never stored.
 *
 * Junk filter (CORE — a messy inbox must not flood the CRM). A thread/event is
 * ingested only if ALL hold:
 *   1. The account participated outbound (sent ≥1 message / organizer-or-accepted).
 *   2. Gmail Primary category only (skip Promotions/Social/Updates/Forums).
 *   3. Not automated/bulk (no-reply, mailer-daemon, List-Unsubscribe, etc.).
 *   4. No participant matches crm_sync_blocklist (MOTOR etc.).
 *   5. At least one EXTERNAL human participant.
 */
import { overseerDb } from '../lib/overseerDb.js'
import {
  isSyncConfigured, workspaceDomain, clientFor,
  fetchThreads, fetchEvents, isExternal, domainOf, isFreeMail,
  type Party,
} from '../lib/googleSync.js'

interface Account { email: string; method: string; enabled: boolean; last_sync: string | null }

const FIRST_RUN_DAYS = 90

// ── Blocklist ───────────────────────────────────────────────────────────────
async function loadBlocklist(): Promise<Set<string>> {
  const { data } = await overseerDb.from('crm_sync_blocklist').select('pattern')
  return new Set((data ?? []).map((r: { pattern: string }) => r.pattern.toLowerCase()))
}
function isBlocked(email: string, blocklist: Set<string>): boolean {
  return blocklist.has(email.toLowerCase()) || blocklist.has(domainOf(email))
}

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
    if (companyId && !existing.company_id) await overseerDb.from('crm_contacts').update({ company_id: companyId }).eq('id', existing.id)
    return existing.id
  }
  const { data, error } = await overseerDb.from('crm_contacts').insert({
    company_id: companyId, name: party.name || email, email, is_primary: false,
  }).select('id').single()
  if (error) { console.error('[crm-sync] contact upsert failed:', email, error.message); return null }
  return data.id
}

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

async function resolveParties(parties: Party[], ourDomain: string, blocklist: Set<string>): Promise<{ contactId: string | null; companyId: string | null }> {
  const external = parties.filter((p) => isExternal(p.email, ourDomain) && !isBlocked(p.email, blocklist))
  let contactId: string | null = null
  let companyId: string | null = null
  for (const p of external) {
    const cId = await upsertCompanyByDomain(domainOf(p.email))
    const contact = await upsertContact(p, cId)
    if (!contactId) { contactId = contact; companyId = cId }
  }
  return { contactId, companyId }
}

// ── Per-account sync ────────────────────────────────────────────────────────
async function syncAccount(acct: Account, ourDomain: string, blocklist: Set<string>): Promise<void> {
  const { gmail, calendar } = clientFor({ email: acct.email, method: acct.method })
  const sinceMs = acct.last_sync ? new Date(acct.last_sync).getTime() : Date.now() - FIRST_RUN_DAYS * 86400000
  const afterUnix = Math.floor(sinceMs / 1000)

  // Gmail
  const threads = await fetchThreads(gmail, acct.email, afterUnix)
  for (const t of threads) {
    // Junk filter — all must pass.
    if (!t.sentByAccount) continue                       // 1. outbound participation
    if (t.skipCategory) continue                         // 2. Primary only
    if (t.automated) continue                            // 3. not automated/bulk
    const external = t.participants.filter((p) => isExternal(p.email, ourDomain))
    if (external.length === 0) continue                  // 5. external human present
    if (external.every((p) => isBlocked(p.email, blocklist))) continue // 4. blocklist
    const { contactId, companyId } = await resolveParties(t.participants, ourDomain, blocklist)
    if (!contactId) continue
    await logOnce('gmail', t.threadId, { type: 'email', subject: t.subject, body: t.snippet, contact_id: contactId, company_id: companyId, via: 'Gmail' })
  }

  // Calendar
  const sinceIso = new Date(sinceMs).toISOString()
  const events = await fetchEvents(calendar, sinceIso, sinceIso)
  for (const e of events) {
    if (!e.selfInvolved) continue                        // organizer or accepted
    const external = e.attendees.filter((p) => isExternal(p.email, ourDomain))
    if (external.length === 0) continue
    if (external.every((p) => isBlocked(p.email, blocklist))) continue
    const { contactId, companyId } = await resolveParties(e.attendees, ourDomain, blocklist)
    if (!contactId) continue
    const body = [e.location && `@ ${e.location}`, new Date(e.at).toLocaleString('en-US')].filter(Boolean).join(' · ')
    await logOnce('calendar', e.eventId, { type: 'meeting', subject: e.title, body, contact_id: contactId, company_id: companyId, via: 'Calendar' })
  }

  await overseerDb.from('crm_sync_accounts').update({ last_sync: new Date().toISOString() }).eq('email', acct.email)
}

// ── Entry point (scheduled as crm_email_sync) ───────────────────────────────
export async function runCrmSync(): Promise<void> {
  if (!isSyncConfigured()) {
    console.log('[crm-sync] Google OAuth not configured — skipping')
    return
  }
  const ourDomain = workspaceDomain()

  const { data, error } = await overseerDb.from('crm_sync_accounts').select('email, method, enabled, last_sync').eq('enabled', true)
  if (error) { console.log('[crm-sync] accounts table unavailable — skipping:', error.message); return }
  const accounts = (data ?? []) as Account[]
  if (accounts.length === 0) { console.log('[crm-sync] no enabled accounts'); return }

  const blocklist = await loadBlocklist()

  for (const acct of accounts) {
    try {
      await syncAccount(acct, ourDomain, blocklist)
      console.log(`[crm-sync] synced ${acct.email}`)
    } catch (err) {
      // One account failing must never block the others or the scheduler.
      console.error(`[crm-sync] account ${acct.email} failed:`, err instanceof Error ? err.message : err)
    }
  }
}
