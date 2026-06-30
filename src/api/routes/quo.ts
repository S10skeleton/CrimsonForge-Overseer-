/**
 * Quo (OpenPhone) Phone hub routes (P2). Mounted at /api/quo behind
 * area('crm.phone') — GET = view, POST/DELETE = manage. Sending an SMS is a real
 * outbound action: manage + audited. Scheduled sending is built but gated off by
 * QUO_SCHEDULED_ENABLED. Rollout-safe: degrades when Quo or the tables aren't set.
 */
import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import { audit } from '../../lib/audit.js'
import {
  isQuoConfigured, QuoError,
  listPhoneNumbers, listMessages, listCalls, sendMessage,
  getCallTranscript, getCallSummary, getCallRecordings,
} from '../../lib/quo.js'
import { ingestMessage, ingestCall } from '../../lib/quoIngest.js'

const router = Router()

function quoErr(res: any, err: unknown): void {
  if (err instanceof QuoError) {
    if (err.status === 402) { res.status(402).json({ error: 'Quo: prepaid credits required' }); return }
    if (err.status === 404) { res.status(404).json({ error: 'Not available (plan may not include this)' }); return }
    res.status(502).json({ error: err.message }); return
  }
  res.status(500).json({ error: 'Quo request failed' })
}

router.get('/config', (_req, res) => {
  res.json({ configured: isQuoConfigured(), scheduledEnabled: process.env.QUO_SCHEDULED_ENABLED === 'true' })
})

// Inboxes = our Quo numbers, with optional DB labels.
router.get('/inboxes', async (_req, res) => {
  if (!isQuoConfigured()) { res.json({ data: [], configured: false }); return }
  try {
    const numbers = await listPhoneNumbers()
    const { data: labels } = await overseerDb.from('quo_inboxes').select('id, label, enabled')
    const labelById = new Map((labels ?? []).map((l: any) => [l.id, l]))
    res.json({ data: numbers.map((n) => ({ ...n, label: labelById.get(n.id)?.label ?? n.name ?? n.number, enabled: labelById.get(n.id)?.enabled ?? true })), configured: true })
  } catch (err) { quoErr(res, err) }
})

// Conversations — recent messages on an inbox, grouped into threads by the
// external participant. Newest thread first.
router.get('/conversations', async (req, res) => {
  const phoneNumberId = String(req.query.phoneNumberId ?? '')
  if (!phoneNumberId) { res.status(400).json({ error: 'phoneNumberId required' }); return }
  try {
    const r = await listMessages({ phoneNumberId, maxResults: 100 })
    const threads = new Map<string, { participant: string; lastText: string; lastAt: string; direction: string; count: number }>()
    for (const m of r.data ?? []) {
      const other = m.direction === 'incoming' ? m.from : (m.to?.[0] ?? m.from)
      const cur = threads.get(other)
      if (!cur || m.createdAt > cur.lastAt) {
        threads.set(other, { participant: other, lastText: m.text ?? m.body ?? '', lastAt: m.createdAt, direction: m.direction, count: (cur?.count ?? 0) + 1 })
      } else if (cur) { cur.count++ }
    }
    res.json({ data: [...threads.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)) })
  } catch (err) { quoErr(res, err) }
})

// A single thread's messages (live from Quo).
router.get('/thread', async (req, res) => {
  const phoneNumberId = String(req.query.phoneNumberId ?? '')
  const participant = String(req.query.participant ?? '')
  if (!phoneNumberId || !participant) { res.status(400).json({ error: 'phoneNumberId and participant required' }); return }
  try {
    const r = await listMessages({ phoneNumberId, participants: [participant], maxResults: 100 })
    const msgs = (r.data ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    res.json({ data: msgs })
  } catch (err) { quoErr(res, err) }
})

// Calls log.
router.get('/calls', async (req, res) => {
  const phoneNumberId = String(req.query.phoneNumberId ?? '')
  if (!phoneNumberId) { res.status(400).json({ error: 'phoneNumberId required' }); return }
  try {
    const r = await listCalls({ phoneNumberId, maxResults: 100 })
    res.json({ data: (r.data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) })
  } catch (err) { quoErr(res, err) }
})

router.get('/calls/:id/transcript', async (req, res) => {
  try { res.json({ data: await getCallTranscript(String(req.params.id)) }) } catch (err) { quoErr(res, err) }
})
router.get('/calls/:id/summary', async (req, res) => {
  try { res.json({ data: await getCallSummary(String(req.params.id)) }) } catch (err) { quoErr(res, err) }
})
router.get('/calls/:id/recording', async (req, res) => {
  try { res.json({ data: await getCallRecordings(String(req.params.id)) }) } catch (err) { quoErr(res, err) }
})

// Send a text (manage + audited). Replies are always allowed; this is the
// reply/one-off path. Logs the sent message so the delivered webhook dedupes.
router.post('/send', async (req: AuthRequest, res) => {
  const b = req.body as { from?: string; to?: string; content?: string }
  if (!b.from || !b.to || !b.content?.trim()) { res.status(400).json({ error: 'from, to, content required' }); return }
  try {
    const msg = await sendMessage({ from: b.from, to: b.to, content: b.content.trim() })
    try {
      await ingestMessage({ id: msg.id, from: b.from, to: [b.to], direction: 'outgoing', text: b.content.trim(), createdAt: msg.createdAt ?? new Date().toISOString() })
    } catch (err) { console.error('[quo] post-send log failed:', err) }
    audit(req, { action: 'quo.message_sent', targetType: 'crm_contact', targetId: b.to, meta: { from: b.from } })
    res.json({ data: msg })
  } catch (err) { quoErr(res, err) }
})

// One-time backfill (manage) — last ~90 days of messages + calls per inbox.
router.post('/backfill', async (req: AuthRequest, res) => {
  if (!isQuoConfigured()) { res.status(400).json({ error: 'Quo not configured' }); return }
  try {
    const numbers = await listPhoneNumbers()
    let messages = 0, calls = 0
    for (const n of numbers) {
      try {
        const m = await listMessages({ phoneNumberId: n.id, maxResults: 100 })
        for (const msg of m.data ?? []) { try { await ingestMessage(msg); messages++ } catch { /* skip */ } }
        const c = await listCalls({ phoneNumberId: n.id, maxResults: 100 })
        for (const call of c.data ?? []) { try { await ingestCall(call); calls++ } catch { /* skip */ } }
      } catch (err) { console.error('[quo] backfill inbox failed:', n.id, err) }
    }
    audit(req, { action: 'quo.backfill', targetType: 'quo', targetId: 'all', meta: { messages, calls } })
    res.json({ data: { messages, calls } })
  } catch (err) { quoErr(res, err) }
})

// ── Scheduled messages (built; sending gated by QUO_SCHEDULED_ENABLED) ───────
router.get('/scheduled', async (_req, res) => {
  const { data, error } = await overseerDb.from('quo_scheduled_messages').select('*').order('send_at', { ascending: true })
  res.json({ data: error ? [] : (data ?? []), enabled: process.env.QUO_SCHEDULED_ENABLED === 'true' })
})

router.post('/scheduled', async (req: AuthRequest, res) => {
  const b = req.body as { to_number?: string; body?: string; send_at?: string }
  if (!b.to_number || !b.body?.trim() || !b.send_at) { res.status(400).json({ error: 'to_number, body, send_at required' }); return }
  const { data, error } = await overseerDb.from('quo_scheduled_messages')
    .insert({ to_number: b.to_number, body: b.body.trim(), send_at: b.send_at, created_by: req.panelUser?.username ?? null }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not schedule message' }); return }
  audit(req, { action: 'quo.scheduled_create', targetType: 'quo_scheduled_message', targetId: data.id, meta: { to: b.to_number, send_at: b.send_at } })
  res.status(201).json({ data })
})

router.delete('/scheduled/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('quo_scheduled_messages').update({ status: 'cancelled' }).eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not cancel message' }); return }
  audit(req, { action: 'quo.scheduled_cancel', targetType: 'quo_scheduled_message', targetId: id })
  res.json({ data: { ok: true } })
})

export default router
