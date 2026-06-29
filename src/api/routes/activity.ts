/**
 * Read endpoints for the panel Activity tab.
 *   GET /api/activity        — overseer_events (business activity stream)
 *   GET /api/activity/audit  — overseer_audit (privileged-action log)
 * Both requireAdmin, keyset-paginated newest-first. Never expose secrets
 * (audit meta never contains them — enforced at the audit() call sites).
 */

import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'

const router = Router()

function parseLimit(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(Math.floor(n), 200)
}

// ─── GET /api/activity?limit&cursor&type ─────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  const limit = parseLimit(req.query.limit)
  const cursor = req.query.cursor ? Number(req.query.cursor) : null
  const type = typeof req.query.type === 'string' ? req.query.type : null

  let q = overseerDb
    .from('overseer_events')
    .select('id, type, title, body, severity, channel, meta, created_at')
    .order('id', { ascending: false })
    .limit(limit)

  if (type) q = q.eq('type', type)
  if (cursor !== null && Number.isFinite(cursor)) q = q.lt('id', cursor)

  const { data, error } = await q
  if (error) {
    res.status(500).json({ error: 'Could not load activity' })
    return
  }

  const rows = data ?? []
  const next_cursor = rows.length === limit ? rows[rows.length - 1].id : null
  res.json({ data: rows, meta: { next_cursor } })
})

// ─── GET /api/activity/audit?limit&cursor&action&actor ───────────────────────
router.get('/audit', requireAdmin, async (req, res) => {
  const limit = parseLimit(req.query.limit)
  const cursor = req.query.cursor ? Number(req.query.cursor) : null
  const action = typeof req.query.action === 'string' ? req.query.action : null
  const actor = typeof req.query.actor === 'string' ? req.query.actor : null

  let q = overseerDb
    .from('overseer_audit')
    .select('id, actor_admin_id, actor_username, action, target_type, target_id, meta, ip, created_at')
    .order('id', { ascending: false })
    .limit(limit)

  if (action) q = q.eq('action', action)
  if (actor) q = q.eq('actor_username', actor)
  if (cursor !== null && Number.isFinite(cursor)) q = q.lt('id', cursor)

  const { data, error } = await q
  if (error) {
    res.status(500).json({ error: 'Could not load audit log' })
    return
  }

  const rows = data ?? []
  const next_cursor = rows.length === limit ? rows[rows.length - 1].id : null
  res.json({ data: rows, meta: { next_cursor } })
})

export default router
