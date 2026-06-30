/**
 * Quo (= OpenPhone) REST client — calls, texts, transcripts, send (CRM P2).
 * Read-mostly; the only write is sending an SMS. Auth via QUO_API_KEY.
 * Tolerates 402 (insufficient prepaid credits) so reads/UI degrade gracefully.
 *
 * Docs: https://www.openphone.com/docs/api-reference
 */
const BASE = 'https://api.openphone.com/v1'

export function isQuoConfigured(): boolean {
  return !!process.env.QUO_API_KEY
}

export class QuoError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status; this.name = 'QuoError' }
}

async function quoFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  if (!isQuoConfigured()) throw new QuoError(0, 'Quo not configured (QUO_API_KEY)')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      // OpenPhone takes the API key directly in Authorization (no "Bearer").
      Authorization: process.env.QUO_API_KEY as string,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 402) throw new QuoError(402, 'Quo: insufficient prepaid credits')
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new QuoError(res.status, `Quo ${res.status}: ${body.slice(0, 200)}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export interface QuoList<T> { data: T[]; totalItems?: number; nextPageToken?: string | null }

// ── Phone numbers / inboxes ─────────────────────────────────────────────────
export interface QuoPhoneNumber { id: string; number: string; name?: string; formattedNumber?: string }
export async function listPhoneNumbers(): Promise<QuoPhoneNumber[]> {
  const r = await quoFetch<QuoList<QuoPhoneNumber>>('/phone-numbers')
  return r.data ?? []
}

// ── Conversations (enumerate an inbox without `participants`) ────────────────
// Quo's /v1/messages + /v1/calls REQUIRE a `participants` param — there's no
// "list everything on this number" mode. /v1/conversations is the way to list a
// number's threads, then fetch messages/calls per participant.
export interface QuoConversation { id: string; participants: string[]; lastActivityAt?: string; name?: string; phoneNumberId?: string }
export async function listConversations(opts: { phoneNumbers: string; maxResults?: number; pageToken?: string }): Promise<QuoList<QuoConversation>> {
  return quoFetch<QuoList<QuoConversation>>(`/conversations${qs({
    phoneNumbers: opts.phoneNumbers,           // plural param (singular is deprecated)
    maxResults: opts.maxResults ?? 100,        // required
    pageToken: opts.pageToken,
  })}`)
}

// ── Messages (texts) ────────────────────────────────────────────────────────
export interface QuoMessage {
  id: string; from: string; to: string[]; direction: 'incoming' | 'outgoing'
  text?: string; body?: string; status?: string; createdAt: string; phoneNumberId?: string
}
export async function listMessages(opts: { phoneNumberId: string; participants?: string[]; maxResults?: number; pageToken?: string }): Promise<QuoList<QuoMessage>> {
  return quoFetch<QuoList<QuoMessage>>(`/messages${qs({
    phoneNumberId: opts.phoneNumberId,
    participants: opts.participants?.join(','),
    maxResults: opts.maxResults ?? 50,
    pageToken: opts.pageToken,
  })}`)
}

// ── Calls ───────────────────────────────────────────────────────────────────
export interface QuoCall {
  id: string; from: string; to: string; direction: 'incoming' | 'outgoing'
  status?: string; duration?: number; createdAt: string; phoneNumberId?: string; participants?: string[]
}
export async function listCalls(opts: { phoneNumberId: string; participants?: string[]; maxResults?: number; pageToken?: string }): Promise<QuoList<QuoCall>> {
  return quoFetch<QuoList<QuoCall>>(`/calls${qs({
    phoneNumberId: opts.phoneNumberId,
    participants: opts.participants?.join(','),
    maxResults: opts.maxResults ?? 50,
    pageToken: opts.pageToken,
  })}`)
}

/** Transcript / summary / recording require a Business/Scale plan → may 402/404. */
export async function getCallTranscript(callId: string): Promise<any> { return quoFetch(`/call-transcripts/${callId}`) }
export async function getCallSummary(callId: string): Promise<any> { return quoFetch(`/call-summaries/${callId}`) }
export async function getCallRecordings(callId: string): Promise<any> { return quoFetch(`/call-recordings/${callId}`) }

// ── Contacts ────────────────────────────────────────────────────────────────
export async function listContacts(pageToken?: string): Promise<QuoList<any>> {
  return quoFetch<QuoList<any>>(`/contacts${qs({ maxResults: 50, pageToken })}`)
}

// ── Send SMS (the only write) ───────────────────────────────────────────────
export async function sendMessage(opts: { from: string; to: string; content: string }): Promise<QuoMessage> {
  return quoFetch<QuoMessage>('/messages', {
    method: 'POST',
    body: JSON.stringify({ from: opts.from, to: [opts.to], content: opts.content }),
  })
}

// ── Phone normalization (match Quo numbers ↔ crm_contacts.phone) ─────────────
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits // compare on the last 10 digits
}
