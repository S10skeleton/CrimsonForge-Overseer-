/**
 * Audit trail — who did what, when, to whom (privileged actions).
 * audit() is fire-and-forget and NEVER throws into the request that triggered it.
 * Security-relevant actions (AUDITED_EVENTS) also surface on the activity feed.
 */

import type { AuthRequest } from '../api/middleware/auth.js'
import { overseerDb } from './overseerDb.js'
import { emitEvent } from './events.js'
import type { EventSeverity } from './events.js'

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.password_reset_requested',
  'auth.password_reset',
  'auth.change_password',
  'admin.create',
  'admin.role_change',
  'admin.suspend',
  'admin.reactivate',
  'admin.password_reset',
  'elara.schedule_update',
  'elara.briefing_update',
  'elara.briefing_preview',
  'elara.briefing_send_now',
  'elara.alert_update',
  'elara.routing_update',
  'elara.destination_create',
  'elara.destination_update',
  'elara.destination_delete',
  'elara.recipients_update',
  'elara.quiet_hours_update',
  'elara.custom_job_create',
  'elara.custom_job_update',
  'elara.custom_job_delete',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {})

/**
 * Actions that also emit an activity event (live audit feed in #cf-activity).
 * Single exported array — extend as new privileged actions are added.
 */
export const AUDITED_EVENTS: string[] = [
  'auth.password_reset',
  'admin.create',
  'admin.role_change',
  'admin.suspend',
  'admin.reactivate',
  'admin.password_reset',
  // future: 'api_key.minted', 'fp_user.suspended'
]

interface AuditInput {
  action: AuditAction
  targetType?: string
  targetId?: string
  meta?: Record<string, unknown>
}

function mv(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key]
  return v == null ? '' : String(v)
}

function eventTitle(input: AuditInput, actor: string): string {
  const name = mv(input.meta, 'username') || input.targetId || 'account'
  switch (input.action) {
    case 'admin.create':         return `New admin created: ${name}`
    case 'admin.role_change':    return `Role changed to ${mv(input.meta, 'role')}: ${name}`
    case 'admin.suspend':        return `Admin suspended: ${name}`
    case 'admin.reactivate':     return `Admin reactivated: ${name}`
    case 'admin.password_reset': return `Password reset issued for ${name}`
    case 'auth.password_reset':  return `Password reset completed: ${name}`
    default:                     return `${input.action} by ${actor}`
  }
}

function eventSeverity(action: AuditAction): EventSeverity {
  if (action === 'admin.suspend') return 'warning'
  return 'info'
}

function clientIp(req: AuthRequest): string | null {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress ?? null
}

/** Fire-and-forget. Records an audit row; emits an event for the allowlist. */
export function audit(req: AuthRequest, input: AuditInput): void {
  void (async () => {
    const actor = req.panelUser
    const ip = clientIp(req)

    try {
      await overseerDb.from('overseer_audit').insert({
        actor_admin_id: actor?.id ?? null,
        actor_username: actor?.username ?? null,
        action: input.action,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        meta: input.meta ?? {},
        ip,
      })
    } catch (err) {
      console.error('[audit]', input.action, err)
    }

    if (AUDITED_EVENTS.includes(input.action)) {
      try {
        await emitEvent({
          type: input.action,
          title: eventTitle(input, actor?.username ?? 'system'),
          severity: eventSeverity(input.action),
          meta: input.meta,
        })
      } catch (err) {
        console.error('[audit->event]', input.action, err)
      }
    }
  })()
}
