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
  isSyncConfigured, isDelegationConfigured, workspaceDomain, clientFor,
  fetchThreads, fetchEvents, isExternal, domainOf, isFreeMail, isEspDomain, isJunkSender,
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
  const e = email.toLowerCase()
  if (blocklist.has(e)) return true               // exact address pattern
  const domain = domainOf(e)
  for (const p of blocklist) {
    if (p.includes('@')) continue                 // address patterns are exact-only
    if (domain === p || domain.endsWith('.' + p)) return true // domain + subdomains (FIX 3)
  }
  return false
}

// ── Dedup helpers (CRM-FIX2) ────────────────────────────────────────────────
// Normalize a website/domain for comparison: lowercase, strip scheme + www + path.
function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return ''
  return String(raw).toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
}
// Loose first-name match between an email local-part and a contact's name, so a
// synced "chris@…" attaches to a manual name-only "Christopher …" instead of
// spawning a dupe. Conservative: prefix match on the leading token, ≥3 chars.
function nameMatchesLocalPart(name: string | null | undefined, email: string): boolean {
  const lp = (email.split('@')[0] || '').toLowerCase().split(/[._-]/)[0].replace(/[^a-z]/g, '')
  if (lp.length < 3 || !name) return false
  return name.toLowerCase().split(/[^a-z]+/).filter(Boolean)
    .some((t) => t === lp || t.startsWith(lp) || lp.startsWith(t))
}

// ── Upserts ───────────────────────────────────────────────────────────────
async function upsertCompanyByDomain(domain: string): Promise<string | null> {
  if (!domain || isFreeMail(domain) || isEspDomain(domain)) return null // never company-ify ESP/bulk (FIX 3)
  const d = normalizeDomain(domain)

  // 1. Existing company whose website normalizes to this domain, or name == domain.
  const { data: companies } = await overseerDb.from('crm_companies').select('id, website, name')
  const byWebsite = (companies ?? []).find(
    (c: { id: string; website: string | null; name: string | null }) =>
      normalizeDomain(c.website) === d || (c.name ?? '').toLowerCase() === d,
  )
  if (byWebsite) { console.log(`[crm-sync] company match (website/name) ${d} → ${byWebsite.id}`); return byWebsite.id }

  // 2. A company that already "owns" this domain via any contact's email — link,
  //    don't create a second company for the same domain.
  const { data: owners } = await overseerDb.from('crm_contacts').select('company_id, email').ilike('email', `%@${d}`)
  const owner = (owners ?? []).find(
    (ct: { company_id: string | null; email: string | null }) => ct.company_id && normalizeDomain(domainOf((ct.email ?? '').toLowerCase())) === d,
  )
  if (owner?.company_id) { console.log(`[crm-sync] company match (contact-owned) ${d} → ${owner.company_id}`); return owner.company_id }

  // 3. Create a fresh company for a genuinely new domain.
  const { data, error } = await overseerDb.from('crm_companies').insert({
    name: d, type: 'prospect', website: d, notes: 'Auto-created from email sync',
  }).select('id').single()
  if (error) { console.error('[crm-sync] company upsert failed:', d, error.message); return null }
  console.log(`[crm-sync] company created ${d} → ${data.id}`)
  return data.id
}

async function upsertContact(party: Party, companyId: string | null): Promise<string | null> {
  const email = party.email

  // 1. Exact email match — the canonical dedup.
  const { data: existing } = await overseerDb.from('crm_contacts').select('id, company_id').eq('email', email).limit(1).maybeSingle()
  if (existing) {
    if (companyId && !existing.company_id) await overseerDb.from('crm_contacts').update({ company_id: companyId }).eq('id', existing.id)
    console.log(`[crm-sync] contact match (email) ${email} → ${existing.id}`)
    return existing.id
  }

  // 2. No email match: if the company already has a name-only contact whose name
  //    plausibly matches this local-part, attach the email to THAT contact.
  if (companyId) {
    const { data: nameOnly } = await overseerDb
      .from('crm_contacts').select('id, name, email').eq('company_id', companyId).is('email', null)
    const cand = (nameOnly ?? []).find((c: { id: string; name: string | null }) => nameMatchesLocalPart(c.name, email))
    if (cand) {
      await overseerDb.from('crm_contacts').update({ email }).eq('id', cand.id)
      console.log(`[crm-sync] contact match (name↔local-part) ${email} → ${cand.id}`)
      return cand.id
    }
  }

  // 3. Create.
  const { data, error } = await overseerDb.from('crm_contacts').insert({
    company_id: companyId, name: party.name || email, email, is_primary: false,
  }).select('id').single()
  if (error) { console.error('[crm-sync] contact upsert failed:', email, error.message); return null }
  console.log(`[crm-sync] contact created ${email} → ${data.id}`)
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
  const external = parties.filter((p) => isExternal(p.email, ourDomain) && !isBlocked(p.email, blocklist) && !isJunkSender(p.email))
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
// Gmail and Calendar run in INDEPENDENT try/catch (CRM-FIX3): one failing — e.g.
// calendar.readonly not authorized on the delegation, or a GOOGLE_CALENDAR_ID
// typo — must not abort the other or skip the last_sync write. We ALWAYS advance
// last_sync when the account was reached (even on partial success) so we stop
// re-scanning 90 days every run (a driver of duplicates).
async function syncAccount(acct: Account, ourDomain: string, blocklist: Set<string>): Promise<void> {
  const { gmail, calendar } = clientFor({ email: acct.email, method: acct.method })
  const sinceMs = acct.last_sync ? new Date(acct.last_sync).getTime() : Date.now() - FIRST_RUN_DAYS * 86400000
  const afterUnix = Math.floor(sinceMs / 1000)
  const errors: string[] = []

  // Gmail — isolated.
  try {
    const threads = await fetchThreads(gmail, acct.email, afterUnix)
    for (const t of threads) {
      // Junk filter — all must pass.
      if (!t.sentByAccount) continue                       // 1. outbound participation
      if (t.skipCategory) continue                         // 2. Primary only
      if (t.automated) continue                            // 3. not automated/bulk
      const external = t.participants.filter((p) => isExternal(p.email, ourDomain) && !isJunkSender(p.email))
      if (external.length === 0) continue                  // 5. external human present
      if (external.every((p) => isBlocked(p.email, blocklist))) continue // 4. blocklist
      const { contactId, companyId } = await resolveParties(t.participants, ourDomain, blocklist)
      if (!contactId) continue
      await logOnce('gmail', t.threadId, { type: 'email', subject: t.subject, body: t.snippet, contact_id: contactId, company_id: companyId, via: 'Gmail' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`Gmail: ${msg}`)
    console.error(`[crm-sync] ${acct.email} Gmail step failed:`, msg)
  }

  // Calendar — isolated (calendar.readonly may be unauthorized on delegation).
  try {
    const sinceIso = new Date(sinceMs).toISOString()
    const events = await fetchEvents(calendar, sinceIso, sinceIso)
    for (const e of events) {
      if (!e.selfInvolved) continue                        // organizer or accepted
      const external = e.attendees.filter((p) => isExternal(p.email, ourDomain) && !isJunkSender(p.email))
      if (external.length === 0) continue
      if (external.every((p) => isBlocked(p.email, blocklist))) continue
      const { contactId, companyId } = await resolveParties(e.attendees, ourDomain, blocklist)
      if (!contactId) continue
      const body = [e.location && `@ ${e.location}`, new Date(e.at).toLocaleString('en-US')].filter(Boolean).join(' · ')
      await logOnce('calendar', e.eventId, { type: 'meeting', subject: e.title, body, contact_id: contactId, company_id: companyId, via: 'Calendar' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`Calendar: ${msg}`)
    console.error(`[crm-sync] ${acct.email} Calendar step failed:`, msg)
  }

  // ALWAYS advance last_sync (even Gmail-only). Check the error (was unchecked).
  const { error: upErr } = await overseerDb.from('crm_sync_accounts')
    .update({ last_sync: new Date().toISOString() }).eq('email', acct.email)
  if (upErr) console.error(`[crm-sync] ${acct.email} last_sync update failed:`, upErr.message)

  // Best-effort: record the last error (or clear it) for the Inboxes ⚠️. Separate
  // + result ignored so a not-yet-migrated last_error column can never block the
  // last_sync write above.
  await overseerDb.from('crm_sync_accounts')
    .update({ last_error: errors.length ? errors.join(' · ') : null }).eq('email', acct.email)
    .then(() => {}, () => {})
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
  let accounts = (data ?? []) as Account[]
  if (accounts.length === 0) { console.log('[crm-sync] no enabled accounts'); return }

  // Delegation accounts (matt@/shane@) need the service-account creds; without
  // them, skip those mailboxes with one clear warning — admin@ (oauth) still runs.
  if (accounts.some((a) => a.method === 'delegation') && !isDelegationConfigured()) {
    const skipped = accounts.filter((a) => a.method === 'delegation').map((a) => a.email).join(', ')
    console.warn(`[crm-sync] delegation accounts configured but GOOGLE_SA_* not set — skipping ${skipped}`)
    accounts = accounts.filter((a) => a.method !== 'delegation')
  }

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
