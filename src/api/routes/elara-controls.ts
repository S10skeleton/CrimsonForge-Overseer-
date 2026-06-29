/**
 * Elara Controls — endpoints the panel uses to read/edit the scheduler +
 * notifier config. Reads: requireAuth. Mutations + run actions: requireAdmin.
 * All config reads degrade to env/constant defaults (see lib/elaraConfig).
 */

import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { getBriefingConfig, saveBriefingConfig } from '../../lib/elaraConfig.js'
import type { BriefingConfigPatch } from '../../lib/elaraConfig.js'
import { runMorningBriefing, rescheduleMorningBriefing } from '../../scheduler.js'
import { audit } from '../../lib/audit.js'

const router = Router()

// ─── Morning briefing config ─────────────────────────────────────────────────

router.get('/briefing-config', requireAuth, async (_req, res) => {
  res.json(await getBriefingConfig())
})

router.put('/briefing-config', requireAdmin, async (req: AuthRequest, res) => {
  const body = req.body as BriefingConfigPatch
  const patch: BriefingConfigPatch = {}
  if (body.timeHour !== undefined) {
    const h = Number(body.timeHour)
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      res.status(400).json({ error: 'timeHour must be 0–23' })
      return
    }
    patch.timeHour = h
  }
  if (body.timezone !== undefined) patch.timezone = body.timezone
  if (body.aiSummaryEnabled !== undefined) patch.aiSummaryEnabled = body.aiSummaryEnabled
  if (body.sections !== undefined) patch.sections = body.sections

  const config = await saveBriefingConfig(patch)
  // Apply any time/timezone change to the live cron immediately.
  try { await rescheduleMorningBriefing() } catch (err) { console.error('[elara-controls] reschedule failed:', err) }
  audit(req, { action: 'elara.briefing_config_update', targetType: 'briefing_config', meta: { ...patch } })
  res.json(config)
})

// ─── Send / preview ──────────────────────────────────────────────────────────

router.post('/briefing/preview', requireAdmin, async (_req, res) => {
  const text = await runMorningBriefing({ preview: true })
  res.json({ text })
})

router.post('/briefing/send-now', requireAdmin, async (req: AuthRequest, res) => {
  // Fire-and-forget the real briefing so the request returns promptly.
  runMorningBriefing().catch((err) => console.error('[elara-controls] send-now failed:', err))
  audit(req, { action: 'elara.briefing_send_now', targetType: 'briefing_config' })
  res.json({ ok: true })
})

export default router
