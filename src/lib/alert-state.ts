/**
 * Uptime alert state tracker and evaluator.
 *
 * Replaces level-triggered alerting (fires every check while bad) with
 * edge-triggered alerting (fires on transitions and meaningful escalations).
 *
 * State is in-memory only — on Railway redeploys the Map resets, which means
 * the first post-deploy check will re-alert if the issue is still active.
 * That's intentional: it confirms the issue persisted across the deploy.
 */

import type { Alert } from '../types/index.js'

export type EndpointStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

interface EndpointState {
  status: EndpointStatus
  responseMs: number | null
  firstSeenAt: number   // when current status began
  lastAlertedAt: number // last time we fired any alert for this key
}

const stateByKey = new Map<string, EndpointState>()

// ── Tunables (env-overridable) ──────────────────────────────────────────────

const SIGNIFICANT_SLOWDOWN_MS =
  Number(process.env.UPTIME_SLOWDOWN_RE_ALERT_MS || '10000')

const REALERT_DEGRADED_MS =
  Number(process.env.UPTIME_REALERT_DEGRADED_HOURS || '6') * 3_600_000

const REALERT_DOWN_MS =
  Number(process.env.UPTIME_REALERT_DOWN_HOURS || '2') * 3_600_000

// ── Public API ──────────────────────────────────────────────────────────────

export interface EvaluateInput {
  /** Unique key per monitored thing — usually the URL, or e.g. 'railway:deployment' */
  key: string
  status: EndpointStatus
  responseMs?: number | null
  /** Human-readable name for the alert body, e.g. 'API', 'Railway deployment' */
  label: string
  /** Value to set on Alert.tool */
  toolName: string
  /** Optional action URL passed through to the alert */
  actionUrl?: string
}

/**
 * Decide whether to fire an alert based on transition from previous state.
 *
 * Returns a fully-built Alert object when the caller should call sendAlert,
 * or null when the change is not significant enough to notify.
 *
 * Always updates internal state — call this on every check for every endpoint,
 * including healthy ones, so recovery transitions are detected.
 */
export function evaluateEndpointAlert(input: EvaluateInput): Alert | null {
  const now = Date.now()
  const { key, status, label, toolName, actionUrl } = input
  const responseMs = input.responseMs ?? null
  const prev = stateByKey.get(key)

  // Unknown status — never alert, never update state (we don't know what to record)
  if (status === 'unknown') {
    return null
  }

  // First observation of this key
  if (!prev) {
    if (status === 'healthy') {
      stateByKey.set(key, { status, responseMs, firstSeenAt: now, lastAlertedAt: 0 })
      return null
    }
    // Bad on first observation — alert immediately
    stateByKey.set(key, { status, responseMs, firstSeenAt: now, lastAlertedAt: now })
    return buildAlert({ status, label, responseMs, toolName, actionUrl, reason: 'detected' })
  }

  // Recovery: was bad, now healthy
  if (status === 'healthy' && prev.status !== 'healthy') {
    const minutes = Math.round((now - prev.firstSeenAt) / 60_000)
    stateByKey.set(key, { status, responseMs, firstSeenAt: now, lastAlertedAt: now })
    return {
      severity: 'info',
      tool: toolName,
      message: `✅ RECOVERED — ${label} is back to healthy`,
      details: `Was ${prev.status} for ${formatDuration(minutes)}`,
      ...(actionUrl ? { actionUrl } : {}),
    }
  }

  // Still healthy — silent
  if (status === 'healthy') {
    stateByKey.set(key, { status, responseMs, firstSeenAt: prev.firstSeenAt, lastAlertedAt: prev.lastAlertedAt })
    return null
  }

  // Escalation: degraded -> down
  if (prev.status === 'degraded' && status === 'down') {
    stateByKey.set(key, { status, responseMs, firstSeenAt: now, lastAlertedAt: now })
    return {
      severity: 'critical',
      tool: toolName,
      message: `🚨 ESCALATED — ${label}: degraded → DOWN`,
      details: prev.responseMs != null ? `Was responding slowly (${prev.responseMs}ms), now unreachable` : 'Now unreachable',
      ...(actionUrl ? { actionUrl } : {}),
    }
  }

  // Partial recovery: down -> degraded
  if (prev.status === 'down' && status === 'degraded') {
    const minutes = Math.round((now - prev.firstSeenAt) / 60_000)
    stateByKey.set(key, { status, responseMs, firstSeenAt: now, lastAlertedAt: now })
    return {
      severity: 'warning',
      tool: toolName,
      message: `🟡 PARTIAL RECOVERY — ${label}: down → degraded`,
      details: `Was down for ${formatDuration(minutes)}. ${responseMs != null ? `Now responding in ${responseMs}ms.` : 'Now responding but slowly.'}`,
      ...(actionUrl ? { actionUrl } : {}),
    }
  }

  // Same status (degraded->degraded or down->down)
  // ── Check 1: significant slowdown (degraded only) ──
  if (
    status === 'degraded' &&
    prev.status === 'degraded' &&
    prev.responseMs != null &&
    responseMs != null &&
    responseMs >= prev.responseMs + SIGNIFICANT_SLOWDOWN_MS
  ) {
    stateByKey.set(key, { status, responseMs, firstSeenAt: prev.firstSeenAt, lastAlertedAt: now })
    return {
      severity: 'warning',
      tool: toolName,
      message: `⚠️ GETTING WORSE — ${label} is slowing down`,
      details: `Response time ${prev.responseMs}ms → ${responseMs}ms`,
      ...(actionUrl ? { actionUrl } : {}),
    }
  }

  // ── Check 2: safety re-alert if issue has been ongoing ──
  const reAlertInterval = status === 'down' ? REALERT_DOWN_MS : REALERT_DEGRADED_MS
  if (now - prev.lastAlertedAt >= reAlertInterval) {
    const minutes = Math.round((now - prev.firstSeenAt) / 60_000)
    stateByKey.set(key, { status, responseMs, firstSeenAt: prev.firstSeenAt, lastAlertedAt: now })
    return {
      severity: status === 'down' ? 'critical' : 'warning',
      tool: toolName,
      message: status === 'down'
        ? `🚨 STILL DOWN — ${label}`
        : `⚠️ STILL DEGRADED — ${label}`,
      details: `Ongoing for ${formatDuration(minutes)}${responseMs != null ? ` · ${responseMs}ms` : ''}`,
      ...(actionUrl ? { actionUrl } : {}),
    }
  }

  // No meaningful change — update responseMs but don't alert
  stateByKey.set(key, { status, responseMs, firstSeenAt: prev.firstSeenAt, lastAlertedAt: prev.lastAlertedAt })
  return null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildAlert(args: {
  status: EndpointStatus
  label: string
  responseMs: number | null
  toolName: string
  actionUrl?: string
  reason: string
}): Alert {
  const { status, label, responseMs, toolName, actionUrl } = args

  if (status === 'down') {
    return {
      severity: 'critical',
      tool: toolName,
      message: `🚨 ${label} is DOWN`,
      details: 'Endpoint unreachable',
      ...(actionUrl ? { actionUrl } : {}),
    }
  }

  // degraded
  return {
    severity: 'warning',
    tool: toolName,
    message: `⚠️ ${label} is degraded`,
    details: responseMs != null ? `Slow response (${responseMs}ms)` : 'Non-OK status',
    ...(actionUrl ? { actionUrl } : {}),
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

// ── Debug / introspection ───────────────────────────────────────────────────

/** Read-only snapshot of all tracked endpoint states. For debug only. */
export function peekAlertState(): Record<string, EndpointState> {
  return Object.fromEntries(stateByKey.entries())
}
