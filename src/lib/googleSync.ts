/**
 * Google sync client (CRM P1b — v1).
 *
 * v1 reuses the EXISTING single-account OAuth (lib/google-auth.ts — the same
 * GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN Elara's Gmail/Calendar tools use) to
 * sync the one connected account (admin@crimsonforge.pro). No new Google setup.
 *
 * `clientFor(account)` is a seam: the later "expansion" (domain-wide delegation
 * to also sync matt@/shane@) swaps in a per-mailbox JWT client here, leaving the
 * filter/engine/panel unchanged.
 *
 * Read-only — we ingest, never send or modify. Full bodies are NOT stored; they
 * are fetched on demand via fetchThreadFull().
 */
import { google } from 'googleapis'
import { createOAuthClient, isGoogleConfigured } from './google-auth.js'

export interface SyncAccount { email: string; method?: string }

export function isSyncConfigured(): boolean {
  return isGoogleConfigured()
}

export function workspaceDomain(): string {
  return (process.env.GOOGLE_WORKSPACE_DOMAIN || 'crimsonforge.pro').toLowerCase()
}

/**
 * Gmail + Calendar clients for an account. v1: the shared OAuth account
 * (the `account` arg is the seam for per-mailbox delegation later).
 */
export function clientFor(_account?: SyncAccount) {
  const auth = createOAuthClient()
  return {
    gmail: google.gmail({ version: 'v1', auth }),
    calendar: google.calendar({ version: 'v3', auth }),
  }
}

export interface Party { name: string; email: string }

export function domainOf(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net', 'zoho.com', 'pm.me',
])
export function isFreeMail(domain: string): boolean { return FREE_MAIL.has(domain) }
export function isExternal(email: string, ourDomain: string): boolean {
  const d = domainOf(email)
  return !!d && d !== ourDomain
}

// Automated/bulk sender local-parts (P1b junk filter #3).
const AUTOMATED_RE = /^(no-?reply|do-?not-?reply|mailer-daemon|bounce[s]?|notifications?|postmaster|donotreply|automated|alerts?)@/i
export function isAutomatedAddress(email: string): boolean { return AUTOMATED_RE.test(email) }

// Gmail category labels that mean "not Primary" → skip (junk filter #2).
const SKIP_CATEGORIES = new Set(['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'])

export function parseAddresses(value: string | null | undefined): Party[] {
  if (!value) return []
  return value.split(',').map((part) => {
    const m = part.match(/<([^>]+)>/)
    const email = (m ? m[1] : part).trim().toLowerCase()
    const name = (m ? part.slice(0, part.indexOf('<')) : '').trim().replace(/^"|"$/g, '')
    return { name, email }
  }).filter((a) => a.email.includes('@'))
}

function headerVal(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

export interface SyncThread {
  threadId: string
  subject: string
  snippet: string
  at: string                 // ISO (latest message)
  participants: Party[]      // From + To + Cc, de-duped
  sentByAccount: boolean     // the account sent ≥1 message in the thread
  skipCategory: boolean      // any message is Promotions/Social/Updates/Forums
  automated: boolean         // automated sender or bulk/list headers present
}

/**
 * Recent Gmail threads since `afterUnixSec`, with the metadata the junk filter
 * needs (labels, sender, list/bulk headers). `accountEmail` lets us detect
 * outbound participation even when the SENT label isn't on a metadata fetch.
 */
export async function fetchThreads(
  gmail: ReturnType<typeof clientFor>['gmail'], accountEmail: string, afterUnixSec: number, cap = 50,
): Promise<SyncThread[]> {
  const list = await gmail.users.threads.list({ userId: 'me', q: `after:${afterUnixSec} -in:chats`, maxResults: cap })
  const refs = list.data.threads ?? []
  const out: SyncThread[] = []
  for (const ref of refs) {
    if (!ref.id) continue
    try {
      const t = await gmail.users.threads.get({
        userId: 'me', id: ref.id, format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'List-Unsubscribe', 'Precedence'],
      })
      const msgs = t.data.messages ?? []
      if (msgs.length === 0) continue
      const parties: Party[] = []
      let subject = ''
      let latestMs = 0
      let sentByAccount = false
      let skipCategory = false
      let automated = false
      for (const m of msgs) {
        const headers = m.payload?.headers ?? []
        if (!subject) subject = headerVal(headers, 'Subject')
        const from = parseAddresses(headerVal(headers, 'From'))[0]
        for (const h of ['From', 'To', 'Cc']) parties.push(...parseAddresses(headerVal(headers, h)))
        const labels = m.labelIds ?? []
        if (labels.includes('SENT') || from?.email === accountEmail.toLowerCase()) sentByAccount = true
        if (labels.some((l) => SKIP_CATEGORIES.has(l))) skipCategory = true
        if (from && isAutomatedAddress(from.email)) automated = true
        if (headerVal(headers, 'List-Unsubscribe') || /bulk|list/i.test(headerVal(headers, 'Precedence'))) automated = true
        const ms = Number(m.internalDate ?? 0)
        if (ms > latestMs) latestMs = ms
      }
      const byEmail = new Map(parties.map((p) => [p.email, p]))
      out.push({
        threadId: ref.id,
        subject: subject || '(no subject)',
        snippet: msgs[msgs.length - 1]?.snippet ?? ref.snippet ?? '',
        at: new Date(latestMs || Date.now()).toISOString(),
        participants: [...byEmail.values()],
        sentByAccount, skipCategory, automated,
      })
    } catch (err) {
      console.error('[googleSync] thread fetch failed:', ref.id, err instanceof Error ? err.message : err)
    }
  }
  return out
}

export interface SyncEvent {
  eventId: string
  title: string
  at: string
  location: string
  attendees: Party[]
  selfInvolved: boolean       // organizer, or accepted/tentative attendee
}

/** Calendar events updated since `updatedMinIso` on the primary calendar. */
export async function fetchEvents(
  calendar: ReturnType<typeof clientFor>['calendar'], updatedMinIso: string, timeMinIso: string, cap = 250,
): Promise<SyncEvent[]> {
  const list = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    updatedMin: updatedMinIso, timeMin: timeMinIso,
    singleEvents: true, orderBy: 'updated', maxResults: cap,
  })
  const items = list.data.items ?? []
  const out: SyncEvent[] = []
  for (const e of items) {
    if (!e.id) continue
    const attendees = (e.attendees ?? [])
      .filter((a) => a.email && !a.resource)
      .map((a) => ({ name: a.displayName ?? '', email: a.email!.toLowerCase() }))
    const selfAttendee = (e.attendees ?? []).find((a) => a.self)
    const selfInvolved = !!e.organizer?.self || (!!selfAttendee && (selfAttendee.responseStatus === 'accepted' || selfAttendee.responseStatus === 'tentative'))
    out.push({
      eventId: e.id,
      title: e.summary || '(no title)',
      at: e.start?.dateTime || e.start?.date || new Date().toISOString(),
      location: e.location ?? '',
      attendees,
      selfInvolved,
    })
  }
  return out
}

// ── On-demand full thread (Step 5 — fetched live, never stored) ─────────────
export interface FullMessage { id: string; from: string; to: string; date: string; subject: string; body: string }

function decodeB64(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function extractPlain(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeB64(payload.body.data)
  for (const part of payload.parts ?? []) {
    const txt = extractPlain(part)
    if (txt) return txt
  }
  // Fall back to stripped HTML if no plaintext part.
  if (payload.mimeType === 'text/html' && payload.body?.data) return decodeB64(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return ''
}

export async function fetchThreadFull(gmail: ReturnType<typeof clientFor>['gmail'], threadId: string): Promise<{ subject: string; messages: FullMessage[] }> {
  const t = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
  const msgs = t.data.messages ?? []
  const messages: FullMessage[] = msgs.map((m) => {
    const headers = m.payload?.headers ?? []
    return {
      id: m.id ?? '',
      from: headerVal(headers, 'From'),
      to: headerVal(headers, 'To'),
      date: headerVal(headers, 'Date'),
      subject: headerVal(headers, 'Subject'),
      body: extractPlain(m.payload) || m.snippet || '',
    }
  })
  return { subject: messages[0]?.subject || '(no subject)', messages }
}
