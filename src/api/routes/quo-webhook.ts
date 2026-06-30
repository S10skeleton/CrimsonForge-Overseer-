/**
 * Quo (OpenPhone) webhook — PUBLIC endpoint, Svix-signed (P2). Mounted with a
 * raw body parser BEFORE express.json so the signature can be verified over the
 * exact bytes. Verifies `QUO_WEBHOOK_SECRET`, then ingests messages/calls into
 * the CRM. Never 500s — acks fast, processes best-effort.
 */
import { Router } from 'express'
import crypto from 'node:crypto'
import { ingestMessage, ingestCall, attachTranscript } from '../../lib/quoIngest.js'

const router = Router()

function verifySvix(secret: string, headers: Record<string, unknown>, raw: Buffer): boolean {
  const id = headers['webhook-id'] as string | undefined
  const ts = headers['webhook-timestamp'] as string | undefined
  const sigHeader = headers['webhook-signature'] as string | undefined
  if (!id || !ts || !sigHeader) return false
  let secretBytes: Buffer
  try { secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64') } catch { return false }
  const signed = `${id}.${ts}.${raw.toString('utf8')}`
  const expected = crypto.createHmac('sha256', secretBytes).update(signed).digest('base64')
  const provided = sigHeader.split(' ').map((s) => (s.includes(',') ? s.split(',')[1] : s))
  return provided.some((s) => {
    try { return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)) } catch { return false }
  })
}

function transcriptText(obj: any): string {
  if (typeof obj?.transcript === 'string') return obj.transcript
  const dialogue = obj?.dialogue ?? obj?.segments
  if (Array.isArray(dialogue)) return dialogue.map((d: any) => `${d.identifier ?? d.speaker ?? ''}: ${d.content ?? d.text ?? ''}`.trim()).join('\n')
  return ''
}

async function handleEvent(evt: any): Promise<void> {
  const type: string = evt?.type ?? ''
  const obj = evt?.data?.object ?? evt?.data ?? {}
  if (type.startsWith('message.')) {
    await ingestMessage(obj)
  } else if (type === 'call.completed') {
    await ingestCall(obj)
  } else if (type === 'call.transcript.completed') {
    const callId = obj.callId ?? obj.id
    if (callId) await attachTranscript(callId, transcriptText(obj))
  }
  // other events (delivered/recording/summary/contact.*) ignored in v1
}

router.post('/', (req, res) => {
  const secret = process.env.QUO_WEBHOOK_SECRET
  const raw = req.body
  if (!secret || !Buffer.isBuffer(raw) || !verifySvix(secret, req.headers as Record<string, unknown>, raw)) {
    res.status(401).json({ error: 'invalid signature' })
    return
  }
  // Ack immediately; process out of band so a slow ingest never times out Quo.
  res.sendStatus(200)
  ;(async () => {
    try {
      await handleEvent(JSON.parse(raw.toString('utf8')))
    } catch (err) {
      console.error('[quo webhook] processing failed:', err instanceof Error ? err.message : err)
    }
  })()
})

export default router
