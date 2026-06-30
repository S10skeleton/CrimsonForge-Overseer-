/**
 * Elara Controls config API. Gated by the 'elara' area at the router mount
 * (GET=view, writes=manage; owner bypasses); every mutation is audited.
 * Schedule/custom-job writes call reloadSchedules(); every write calls
 * invalidateConfigCache() so the running process picks up changes immediately.
 *
 * Reads return raw DB rows (the management view); the scheduler/notifier read
 * the same tables through lib/elaraConfig with env/constant fallback.
 */

import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import { invalidateConfigCache } from '../../lib/elaraConfig.js'
import { reloadSchedules, runMorningBriefing } from '../../scheduler.js'
import { audit } from '../../lib/audit.js'

const router = Router()

async function safe<T>(p: PromiseLike<{ data: T | null; error: unknown }>, fallback: T): Promise<T> {
  try {
    const { data } = await p
    return (data ?? fallback) as T
  } catch {
    return fallback
  }
}

// ─── GET /api/elara/config — everything in one payload ───────────────────────
router.get('/', async (_req, res) => {
  const [schedules, briefing, alertRules, destinations, routes, recipients, quietHours, customJobs] = await Promise.all([
    safe(overseerDb.from('elara_schedules').select('*').eq('is_custom', false).order('job_key'), []),
    safe(overseerDb.from('elara_briefing_config').select('*').eq('id', 1).maybeSingle(), null),
    safe(overseerDb.from('elara_alert_rules').select('*').order('rule_key'), []),
    safe(overseerDb.from('elara_notify_destinations').select('*').order('label'), []),
    safe(overseerDb.from('elara_notify_routes').select('*'), []),
    safe(overseerDb.from('elara_recipients').select('*').order('kind'), []),
    safe(overseerDb.from('elara_quiet_hours').select('*').eq('id', 1).maybeSingle(), null),
    safe(overseerDb.from('elara_custom_jobs').select('*').order('created_at'), []),
  ])
  res.json({ data: { schedules, briefing, alertRules, destinations, routes, recipients, quietHours, customJobs } })
})

// ─── Morning briefing config ─────────────────────────────────────────────────
router.put('/briefing', async (req: AuthRequest, res) => {
  const { sections, ai_summary, timezone } = req.body as { sections?: Record<string, boolean>; ai_summary?: boolean; timezone?: string | null }
  const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() }
  if (sections !== undefined) row.sections = sections
  if (ai_summary !== undefined) row.ai_summary = ai_summary
  if (timezone !== undefined) row.timezone = timezone

  const { error } = await overseerDb.from('elara_briefing_config').upsert(row, { onConflict: 'id' })
  if (error) { res.status(500).json({ error: 'Could not save briefing config' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.briefing_update', targetType: 'briefing_config', meta: { sections, ai_summary, timezone } })
  res.json({ data: { ok: true } })
})

// ─── Schedules ───────────────────────────────────────────────────────────────
router.put('/schedules/:job_key', async (req: AuthRequest, res) => {
  const job_key = String(req.params.job_key)
  const { cron, timezone, enabled, label } = req.body as { cron?: string; timezone?: string | null; enabled?: boolean; label?: string }
  const row: Record<string, unknown> = { job_key, updated_at: new Date().toISOString() }
  if (cron !== undefined) row.cron = cron
  if (timezone !== undefined) row.timezone = timezone
  if (enabled !== undefined) row.enabled = enabled
  if (label !== undefined) row.label = label

  const { error } = await overseerDb.from('elara_schedules').upsert(row, { onConflict: 'job_key' })
  if (error) { res.status(500).json({ error: 'Could not save schedule' }); return }
  invalidateConfigCache()
  await reloadSchedules()
  audit(req, { action: 'elara.schedule_update', targetType: 'schedule', targetId: job_key, meta: { cron, timezone, enabled } })
  res.json({ data: { ok: true } })
})

// ─── Alert rules ─────────────────────────────────────────────────────────────
router.put('/alerts/:rule_key', async (req: AuthRequest, res) => {
  const rule_key = String(req.params.rule_key)
  const { enabled, severity, sms_enabled, threshold, destination_id, label } = req.body as {
    enabled?: boolean; severity?: string; sms_enabled?: boolean; threshold?: Record<string, number> | null; destination_id?: string | null; label?: string
  }
  const row: Record<string, unknown> = { rule_key, updated_at: new Date().toISOString() }
  if (enabled !== undefined) row.enabled = enabled
  if (severity !== undefined) row.severity = severity
  if (sms_enabled !== undefined) row.sms_enabled = sms_enabled
  if (threshold !== undefined) row.threshold = threshold
  if (destination_id !== undefined) row.destination_id = destination_id
  if (label !== undefined) row.label = label

  const { error } = await overseerDb.from('elara_alert_rules').upsert(row, { onConflict: 'rule_key' })
  if (error) { res.status(500).json({ error: 'Could not save alert rule' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.alert_update', targetType: 'alert_rule', targetId: rule_key, meta: { enabled, severity, sms_enabled } })
  res.json({ data: { ok: true } })
})

// ─── Routes (bulk upsert) ────────────────────────────────────────────────────
router.put('/routes', async (req: AuthRequest, res) => {
  const { routes } = req.body as { routes?: Array<{ notification_type: string; destination_id: string | null }> }
  if (!Array.isArray(routes)) { res.status(400).json({ error: 'routes array required' }); return }
  const rows = routes.map(r => ({ notification_type: r.notification_type, destination_id: r.destination_id }))
  const { error } = await overseerDb.from('elara_notify_routes').upsert(rows, { onConflict: 'notification_type' })
  if (error) { res.status(500).json({ error: 'Could not save routes' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.routing_update', targetType: 'routes', meta: { count: rows.length } })
  res.json({ data: { ok: true } })
})

// ─── Destinations ────────────────────────────────────────────────────────────
router.post('/destinations', async (req: AuthRequest, res) => {
  const { kind, label, target, enabled } = req.body as { kind?: string; label?: string; target?: string; enabled?: boolean }
  if (!kind || !label || !target) { res.status(400).json({ error: 'kind, label, target required' }); return }
  const { data, error } = await overseerDb.from('elara_notify_destinations')
    .insert({ kind, label, target, enabled: enabled ?? true }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create destination' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.destination_create', targetType: 'destination', targetId: data.id, meta: { kind, label } })
  res.status(201).json({ data })
})

router.put('/destinations/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { kind, label, target, enabled } = req.body as { kind?: string; label?: string; target?: string; enabled?: boolean }
  const row: Record<string, unknown> = {}
  if (kind !== undefined) row.kind = kind
  if (label !== undefined) row.label = label
  if (target !== undefined) row.target = target
  if (enabled !== undefined) row.enabled = enabled
  const { error } = await overseerDb.from('elara_notify_destinations').update(row).eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not update destination' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.destination_update', targetType: 'destination', targetId: id, meta: row })
  res.json({ data: { ok: true } })
})

router.delete('/destinations/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('elara_notify_destinations').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete destination' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.destination_delete', targetType: 'destination', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Recipients ──────────────────────────────────────────────────────────────
router.post('/recipients', async (req: AuthRequest, res) => {
  const { kind, value, label, enabled } = req.body as { kind?: string; value?: string; label?: string; enabled?: boolean }
  if (!kind || !value) { res.status(400).json({ error: 'kind, value required' }); return }
  const { data, error } = await overseerDb.from('elara_recipients')
    .insert({ kind, value, label: label ?? null, enabled: enabled ?? true }).select('*').single()
  if (error) { res.status(500).json({ error: 'Could not add recipient' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.recipients_update', targetType: 'recipient', targetId: data.id, meta: { kind } })
  res.status(201).json({ data })
})

router.put('/recipients/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { value, label, enabled } = req.body as { value?: string; label?: string; enabled?: boolean }
  const row: Record<string, unknown> = {}
  if (value !== undefined) row.value = value
  if (label !== undefined) row.label = label
  if (enabled !== undefined) row.enabled = enabled
  const { error } = await overseerDb.from('elara_recipients').update(row).eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not update recipient' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.recipients_update', targetType: 'recipient', targetId: id })
  res.json({ data: { ok: true } })
})

router.delete('/recipients/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('elara_recipients').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete recipient' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.recipients_update', targetType: 'recipient', targetId: id, meta: { deleted: true } })
  res.json({ data: { ok: true } })
})

// ─── Quiet hours ─────────────────────────────────────────────────────────────
router.put('/quiet-hours', async (req: AuthRequest, res) => {
  const { enabled, start_local, end_local, timezone, exempt_severities } = req.body as {
    enabled?: boolean; start_local?: string; end_local?: string; timezone?: string | null; exempt_severities?: string[]
  }
  const row: Record<string, unknown> = { id: 1 }
  if (enabled !== undefined) row.enabled = enabled
  if (start_local !== undefined) row.start_local = start_local
  if (end_local !== undefined) row.end_local = end_local
  if (timezone !== undefined) row.timezone = timezone
  if (exempt_severities !== undefined) row.exempt_severities = exempt_severities
  const { error } = await overseerDb.from('elara_quiet_hours').upsert(row, { onConflict: 'id' })
  if (error) { res.status(500).json({ error: 'Could not save quiet hours' }); return }
  invalidateConfigCache()
  audit(req, { action: 'elara.quiet_hours_update', targetType: 'quiet_hours', meta: { enabled } })
  res.json({ data: { ok: true } })
})

// ─── Custom jobs ─────────────────────────────────────────────────────────────
router.post('/custom-jobs', async (req: AuthRequest, res) => {
  const { name, cron, timezone, action_type, payload, enabled } = req.body as {
    name?: string; cron?: string; timezone?: string | null; action_type?: string; payload?: Record<string, unknown>; enabled?: boolean
  }
  if (!name || !cron || !action_type) { res.status(400).json({ error: 'name, cron, action_type required' }); return }
  const { data, error } = await overseerDb.from('elara_custom_jobs')
    .insert({ name, cron, timezone: timezone ?? null, action_type, payload: payload ?? {}, enabled: enabled ?? true, created_by: req.panelUser?.username ?? null })
    .select('*').single()
  if (error) { res.status(500).json({ error: 'Could not create custom job' }); return }
  invalidateConfigCache()
  await reloadSchedules()
  audit(req, { action: 'elara.custom_job_create', targetType: 'custom_job', targetId: data.id, meta: { name, cron } })
  res.status(201).json({ data })
})

router.put('/custom-jobs/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { name, cron, timezone, action_type, payload, enabled } = req.body as {
    name?: string; cron?: string; timezone?: string | null; action_type?: string; payload?: Record<string, unknown>; enabled?: boolean
  }
  const row: Record<string, unknown> = {}
  if (name !== undefined) row.name = name
  if (cron !== undefined) row.cron = cron
  if (timezone !== undefined) row.timezone = timezone
  if (action_type !== undefined) row.action_type = action_type
  if (payload !== undefined) row.payload = payload
  if (enabled !== undefined) row.enabled = enabled
  const { error } = await overseerDb.from('elara_custom_jobs').update(row).eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not update custom job' }); return }
  invalidateConfigCache()
  await reloadSchedules()
  audit(req, { action: 'elara.custom_job_update', targetType: 'custom_job', targetId: id, meta: row })
  res.json({ data: { ok: true } })
})

router.delete('/custom-jobs/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('elara_custom_jobs').delete().eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not delete custom job' }); return }
  invalidateConfigCache()
  await reloadSchedules()
  audit(req, { action: 'elara.custom_job_delete', targetType: 'custom_job', targetId: id })
  res.json({ data: { ok: true } })
})

// ─── Briefing actions ────────────────────────────────────────────────────────
router.post('/briefing/preview', async (req: AuthRequest, res) => {
  const text = await runMorningBriefing({ preview: true })
  audit(req, { action: 'elara.briefing_preview', targetType: 'briefing_config' })
  res.json({ data: { text } })
})

router.post('/briefing/send-now', async (req: AuthRequest, res) => {
  runMorningBriefing().catch((err) => console.error('[elara-config] send-now failed:', err))
  audit(req, { action: 'elara.briefing_send_now', targetType: 'briefing_config' })
  res.json({ data: { ok: true } })
})

export default router
