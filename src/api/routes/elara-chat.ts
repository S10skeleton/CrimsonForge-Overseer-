/**
 * Ask-Elara endpoints (ELARA-1). Owner/admin only.
 *  - POST /api/elara/chat   — runs the agent in PROPOSE-MODE; returns Elara's
 *    reply + any risky actions she staged this turn (proposals). Audited.
 *  - POST /api/elara/action — the ONLY mutation path: re-runs the approved
 *    proposal's tool with propose-mode OFF (so it executes for real), server-
 *    side validated by the tool itself, audited as elara.action.<kind>.
 */
import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth.js'
import { audit } from '../../lib/audit.js'
import { runAgent } from '../../agent/index.js'
import { runWithPropose } from '../../agent/propose.js'
import { allAgentTools } from '../../tools/index.js'

const router = Router()

const PANEL_NOTE = `─── PANEL CHAT (Ask-Elara) ───
You are talking to Clutch or Matt inside the Overseer panel (not Slack). You have CRM read tools + ops tools that run automatically (reads, drafts, internal notes). You also have ACTION tools — sends (SMS/email), CRM create/update/delete, calendar and GitHub writes — that DO NOT execute here: calling one returns a PROPOSAL the user must approve. Read and think freely, then propose any risky action clearly and concisely, ONE at a time, and wait for approval. NEVER claim you sent or changed something you only proposed — say "I've staged X — approve it to run." Keep your voice.`

router.post('/chat', requireAdmin, async (req: AuthRequest, res) => {
  const b = req.body as { message?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }>; pageContext?: { area?: string; recordId?: string; recordType?: string } }
  const message = String(b.message ?? '').trim()
  if (!message) { res.status(400).json({ error: 'message required' }); return }

  let extra = PANEL_NOTE
  if (b.pageContext?.recordId) extra += `\n\nThe user is currently viewing ${b.pageContext.recordType ?? 'a record'} ${b.pageContext.recordId} (area: ${b.pageContext.area ?? '—'}). "this account/deal/contact" refers to it.`

  try {
    const history = (b.history ?? []).slice(-12)
    const { result: reply, proposals } = await runWithPropose(() => runAgent(message, undefined, history, extra))
    audit(req, { action: 'elara.chat', targetType: 'elara', targetId: 'chat', meta: { len: message.length, proposals: proposals.length } })
    res.json({ reply, proposals })
  } catch (err) {
    console.error('[elara-chat] failed:', err)
    res.json({ reply: 'Something went wrong handling that — try again.', proposals: [] })
  }
})

router.post('/action', requireAdmin, async (req: AuthRequest, res) => {
  const b = req.body as { kind?: string; payload?: Record<string, unknown> }
  const kind = String(b.kind ?? '')
  const payload = b.payload ?? {}
  const tool = allAgentTools.find((t) => t.name === kind)
  if (!tool) { res.status(400).json({ error: 'unknown action' }); return }
  try {
    // Outside runWithPropose → propose-mode is OFF → the tool executes for real.
    // The tool self-validates (consent/blocklist for sends; ids for CRM ops).
    const result = await tool.execute(payload)
    const okFlag = (result as { success?: boolean }).success !== false
    audit(req, { action: `elara.action.${kind}`, targetType: 'elara_action', targetId: String(payload.id ?? payload.to ?? kind), meta: payload })
    res.json({ ok: okFlag, result })
  } catch (err) {
    console.error('[elara-chat] action failed:', kind, err)
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'action failed' })
  }
})

export default router
