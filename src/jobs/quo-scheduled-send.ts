/**
 * Scheduled-send job (P2) — fires due quo_scheduled_messages via Quo. BUILT BUT
 * GATED OFF: it does nothing unless QUO_SCHEDULED_ENABLED === 'true', so nothing
 * auto-sends until opt-in/A2P compliance is in place. Fail-safe per message.
 */
import { overseerDb } from '../lib/overseerDb.js'
import { isQuoConfigured, sendMessage, listPhoneNumbers } from '../lib/quo.js'
import { ingestMessage } from '../lib/quoIngest.js'

export async function runQuoScheduledSend(): Promise<void> {
  if (process.env.QUO_SCHEDULED_ENABLED !== 'true') return // hard off switch — no sends
  if (!isQuoConfigured()) { console.log('[quo-send] Quo not configured — skipping'); return }

  const nowIso = new Date().toISOString()
  const { data, error } = await overseerDb.from('quo_scheduled_messages')
    .select('*').eq('status', 'scheduled').lte('send_at', nowIso)
  if (error) { console.log('[quo-send] table unavailable — skipping:', error.message); return }
  const due = data ?? []
  if (due.length === 0) return

  // Default sender = the first Quo number.
  let from: string | null = null
  try { from = (await listPhoneNumbers())[0]?.number ?? null } catch { /* handled below */ }
  if (!from) { console.error('[quo-send] no Quo number available — leaving messages scheduled'); return }

  for (const m of due) {
    try {
      const sent = await sendMessage({ from, to: m.to_number, content: m.body })
      await overseerDb.from('quo_scheduled_messages').update({ status: 'sent', sent_message_id: sent.id }).eq('id', m.id)
      try { await ingestMessage({ id: sent.id, from, to: [m.to_number], direction: 'outgoing', text: m.body, createdAt: sent.createdAt ?? nowIso }) } catch { /* log best-effort */ }
      console.log(`[quo-send] sent scheduled message ${m.id}`)
    } catch (err) {
      await overseerDb.from('quo_scheduled_messages').update({ status: 'failed' }).eq('id', m.id)
      console.error(`[quo-send] scheduled message ${m.id} failed:`, err instanceof Error ? err.message : err)
    }
  }
}
