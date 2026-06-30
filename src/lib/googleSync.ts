/**
 * Google Workspace domain-wide delegation client (CRM P1b).
 *
 * A service account with domain-wide delegation can impersonate any
 * @crimsonforge.pro user and read their mail/calendar (read-only). This is
 * SEPARATE from the single-user GOOGLE_REFRESH_TOKEN OAuth client used by
 * Elara's existing Google tools (lib/google-auth.ts) — leave that untouched.
 *
 * Env: GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY, GOOGLE_WORKSPACE_DOMAIN.
 * Read-only scopes only — we ingest, never send or modify.
 */
import { google } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
]

// Free / consumer mail domains → create a contact but never a company.
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net', 'zoho.com', 'pm.me',
])

export function isWorkspaceSyncConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_CLIENT_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY && process.env.GOOGLE_WORKSPACE_DOMAIN)
}

export function workspaceDomain(): string {
  return (process.env.GOOGLE_WORKSPACE_DOMAIN || '').toLowerCase()
}

/** Gmail + Calendar clients that impersonate `mailbox` via the SA. */
export function clientFor(mailbox: string) {
  const key = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SA_CLIENT_EMAIL,
    key,
    scopes: SCOPES,
    subject: mailbox,
  })
  return {
    gmail: google.gmail({ version: 'v1', auth }),
    calendar: google.calendar({ version: 'v3', auth }),
  }
}

export interface Party { name: string; email: string }

export function domainOf(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}
export function isFreeMail(domain: string): boolean {
  return FREE_MAIL.has(domain)
}
export function isExternal(email: string, ourDomain: string): boolean {
  const d = domainOf(email)
  return !!d && d !== ourDomain
}

/** Parse an RFC5322 address-list header ("Name" <a@b.com>, c@d.com). */
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
  at: string                 // ISO
  participants: Party[]      // From + To + Cc across all messages
}

/** Recent Gmail threads for the impersonated mailbox, since `afterUnixSec`. */
export async function fetchThreads(gmail: ReturnType<typeof clientFor>['gmail'], afterUnixSec: number, cap = 50): Promise<SyncThread[]> {
  const list = await gmail.users.threads.list({ userId: 'me', q: `after:${afterUnixSec}`, maxResults: cap })
  const refs = list.data.threads ?? []
  const out: SyncThread[] = []
  for (const ref of refs) {
    if (!ref.id) continue
    try {
      const t = await gmail.users.threads.get({
        userId: 'me', id: ref.id, format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
      })
      const msgs = t.data.messages ?? []
      if (msgs.length === 0) continue
      const parties: Party[] = []
      let subject = ''
      let latestMs = 0
      for (const m of msgs) {
        const headers = m.payload?.headers ?? []
        if (!subject) subject = headerVal(headers, 'Subject')
        for (const h of ['From', 'To', 'Cc']) parties.push(...parseAddresses(headerVal(headers, h)))
        const ms = Number(m.internalDate ?? 0)
        if (ms > latestMs) latestMs = ms
      }
      // De-dup participants by email.
      const byEmail = new Map(parties.map((p) => [p.email, p]))
      out.push({
        threadId: ref.id,
        subject: subject || '(no subject)',
        snippet: t.data.messages?.[msgs.length - 1]?.snippet ?? ref.snippet ?? '',
        at: new Date(latestMs || Date.now()).toISOString(),
        participants: [...byEmail.values()],
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
  at: string                 // ISO start
  location: string
  attendees: Party[]
}

/** Calendar events updated since `updatedMinIso` (primary calendar). */
export async function fetchEvents(calendar: ReturnType<typeof clientFor>['calendar'], updatedMinIso: string, timeMinIso: string, cap = 250): Promise<SyncEvent[]> {
  const list = await calendar.events.list({
    calendarId: 'primary',
    updatedMin: updatedMinIso,
    timeMin: timeMinIso,
    singleEvents: true,
    orderBy: 'updated',
    maxResults: cap,
  })
  const items = list.data.items ?? []
  const out: SyncEvent[] = []
  for (const e of items) {
    if (!e.id) continue
    const attendees = (e.attendees ?? [])
      .filter((a) => a.email && !a.resource)
      .map((a) => ({ name: a.displayName ?? '', email: a.email!.toLowerCase() }))
    out.push({
      eventId: e.id,
      title: e.summary || '(no title)',
      at: e.start?.dateTime || e.start?.date || new Date().toISOString(),
      location: e.location ?? '',
      attendees,
    })
  }
  return out
}
