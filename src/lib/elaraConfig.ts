/**
 * Elara Controls — DB-backed runtime config for the scheduler + notifier.
 *
 * Per OVERSEER-STEP4. ADDITIVE + SAFE: every getter is cached (60s) and falls
 * back to today's env/constant defaults if the DB read fails or a row is
 * missing — a config-table outage must never stop a briefing or drop an alert.
 * Tables live in the ELARA DB and are created/seeded by the PM (never here).
 */

import { overseerDb } from './overseerDb.js'

const TTL_MS = 60_000
const cache = new Map<string, { value: unknown; at: number }>()

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T
  const value = await loader()
  cache.set(key, { value, at: Date.now() })
  return value
}

/** Drop all cached config — call after any config mutation. */
export function invalidateConfigCache(): void {
  cache.clear()
}

// ─── Schedules ───────────────────────────────────────────────────────────────

export interface Schedule {
  job_key: string
  label: string
  cron: string
  timezone: string | null
  enabled: boolean
  is_custom: boolean
}

function defaultSchedules(): Schedule[] {
  const briefingHour = Number(process.env.MORNING_BRIEFING_HOUR || '8')
  const insightsHour = Number(process.env.FP_INSIGHTS_HOUR || '5')
  return [
    { job_key: 'morning_briefing',   label: 'Morning briefing',          cron: `0 ${briefingHour} * * *`, timezone: null, enabled: true, is_custom: false },
    { job_key: 'fp_insights',        label: 'ForgePilot insights',       cron: `0 ${insightsHour} * * *`, timezone: null, enabled: true, is_custom: false },
    { job_key: 'health_check',       label: 'Health check',              cron: '*/15 * * * *',           timezone: null, enabled: true, is_custom: false },
    { job_key: 'summarize',          label: 'Conversation summarization', cron: '* * * * *',             timezone: null, enabled: true, is_custom: false },
    { job_key: 'mrr_snapshot',       label: 'MRR snapshot',              cron: '55 23 * * *',            timezone: null, enabled: true, is_custom: false },
    { job_key: 'crm_email_sync',     label: 'CRM email + calendar sync', cron: '*/20 * * * *',           timezone: null, enabled: true, is_custom: false },
    { job_key: 'dmarc_digest',       label: 'DMARC email-security digest', cron: '30 7 * * *',           timezone: null, enabled: true, is_custom: false },
    { job_key: 'quo_scheduled_send', label: 'Quo scheduled texts (gated)', cron: '*/5 * * * *',          timezone: null, enabled: true, is_custom: false },
    { job_key: 'team_kickoff',       label: 'Team rhythm — kickoff',     cron: '0 8 * * *',              timezone: null, enabled: true,  is_custom: false },
    { job_key: 'team_midday',        label: 'Team rhythm — midday',      cron: '30 12 * * *',            timezone: null, enabled: false, is_custom: false },
    { job_key: 'team_eod',           label: 'Team rhythm — EOD wrap',    cron: '30 17 * * *',            timezone: null, enabled: true,  is_custom: false },
  ]
}

export async function getSchedules(): Promise<Schedule[]> {
  return cached('schedules', async () => {
    try {
      const { data } = await overseerDb
        .from('elara_schedules')
        .select('job_key, label, cron, timezone, enabled, is_custom')
        .eq('is_custom', false)
      if (data && data.length) return data as Schedule[]
    } catch (err) {
      console.error('[elaraConfig] schedules read failed — using defaults:', err)
    }
    return defaultSchedules()
  })
}

// ─── Custom jobs ─────────────────────────────────────────────────────────────

export interface CustomJob {
  id: string
  name: string
  cron: string
  timezone: string | null
  action_type: 'slack_message' | 'agent_prompt'
  payload: Record<string, unknown>
  enabled: boolean
}

export async function getCustomJobs(): Promise<CustomJob[]> {
  return cached('custom_jobs', async () => {
    try {
      const { data } = await overseerDb
        .from('elara_custom_jobs')
        .select('id, name, cron, timezone, action_type, payload, enabled')
        .eq('enabled', true)
      if (data) return data as CustomJob[]
    } catch (err) {
      console.error('[elaraConfig] custom jobs read failed:', err)
    }
    return []
  })
}

// ─── Morning briefing config ─────────────────────────────────────────────────

export const BRIEFING_SECTIONS = [
  'system_health', 'sentry', 'stripe_revenue', 'payment_failures',
  'new_signups', 'feedback', 'gmail', 'calendar', 'forgepilot',
] as const
export type BriefingSection = (typeof BRIEFING_SECTIONS)[number]

export interface BriefingConfig {
  sections: Record<BriefingSection, boolean>
  aiSummary: boolean
  timezone: string | null
}

function allSectionsOn(): Record<BriefingSection, boolean> {
  return Object.fromEntries(BRIEFING_SECTIONS.map((s) => [s, true])) as Record<BriefingSection, boolean>
}

function defaultBriefingConfig(): BriefingConfig {
  return { sections: allSectionsOn(), aiSummary: true, timezone: null }
}

export async function getBriefingConfig(): Promise<BriefingConfig> {
  return cached('briefing', async () => {
    const base = defaultBriefingConfig()
    try {
      const { data } = await overseerDb
        .from('elara_briefing_config')
        .select('sections, ai_summary, timezone')
        .eq('id', 1)
        .maybeSingle()
      if (data) {
        return {
          sections: { ...base.sections, ...((data.sections as Partial<Record<BriefingSection, boolean>>) ?? {}) },
          aiSummary: data.ai_summary ?? base.aiSummary,
          timezone: data.timezone ?? base.timezone,
        }
      }
    } catch (err) {
      console.error('[elaraConfig] briefing read failed — using defaults:', err)
    }
    return base
  })
}

// ─── Alert rules ─────────────────────────────────────────────────────────────

export interface AlertRule {
  rule_key: string
  label: string
  enabled: boolean
  severity: 'info' | 'warning' | 'critical'
  sms_enabled: boolean
  threshold: Record<string, number> | null
  destination_id: string | null
}

const DEFAULT_ALERT_RULES: Record<string, AlertRule> = {
  service_down:      { rule_key: 'service_down',      label: 'Service down',       enabled: true, severity: 'critical', sms_enabled: true,  threshold: null,          destination_id: null },
  payment_failure:   { rule_key: 'payment_failure',   label: 'Payment failure',    enabled: true, severity: 'warning',  sms_enabled: false, threshold: null,          destination_id: null },
  sms_failure:       { rule_key: 'sms_failure',       label: 'SMS failure rate',   enabled: true, severity: 'warning',  sms_enabled: false, threshold: { rate: 0.05 }, destination_id: null },
  email_bounce:      { rule_key: 'email_bounce',      label: 'Email bounce rate',  enabled: true, severity: 'warning',  sms_enabled: false, threshold: { rate: 0.03 }, destination_id: null },
  new_subscriber:    { rule_key: 'new_subscriber',    label: 'New subscriber',     enabled: true, severity: 'info',     sms_enabled: false, threshold: null,          destination_id: null },
  new_shop:          { rule_key: 'new_shop',          label: 'New shop',           enabled: true, severity: 'info',     sms_enabled: false, threshold: null,          destination_id: null },
  forgepulse_signup: { rule_key: 'forgepulse_signup', label: 'ForgePulse signup',  enabled: true, severity: 'info',     sms_enabled: false, threshold: null,          destination_id: null },
  sentry_new:        { rule_key: 'sentry_new',        label: 'New Sentry issues',  enabled: true, severity: 'warning',  sms_enabled: false, threshold: null,          destination_id: null },
}

async function getAlertRules(): Promise<Record<string, AlertRule>> {
  return cached('alert_rules', async () => {
    try {
      const { data } = await overseerDb
        .from('elara_alert_rules')
        .select('rule_key, label, enabled, severity, sms_enabled, threshold, destination_id')
      if (data && data.length) {
        const map: Record<string, AlertRule> = { ...DEFAULT_ALERT_RULES }
        for (const r of data as AlertRule[]) map[r.rule_key] = r
        return map
      }
    } catch (err) {
      console.error('[elaraConfig] alert rules read failed:', err)
    }
    return DEFAULT_ALERT_RULES
  })
}

/** A single rule's effective config (falls back to the built-in default). */
export async function getAlertRule(key: string): Promise<AlertRule> {
  const rules = await getAlertRules()
  return rules[key] ?? { rule_key: key, label: key, enabled: true, severity: 'warning', sms_enabled: false, threshold: null, destination_id: null }
}

// ─── Destinations + routes ───────────────────────────────────────────────────

export interface Destination {
  id: string
  kind: 'slack' | 'sms' | 'email'
  label: string
  target: string   // slack channel id | phone | email | 'webhook'
  enabled: boolean
}

/** Synthetic fallback destinations keyed by stable ids (used when DB is empty). */
function defaultDestinations(): Destination[] {
  return [
    { id: 'default',  kind: 'slack', label: 'Default (webhook)', target: 'webhook',                                 enabled: true },
    { id: 'activity', kind: 'slack', label: '#cf-activity',      target: process.env.SLACK_ACTIVITY_CHANNEL_ID ?? '', enabled: true },
    { id: 'fp',       kind: 'slack', label: '#forgepilot-ops',   target: process.env.FP_SLACK_CHANNEL_ID ?? '',       enabled: true },
    { id: 'clutch',   kind: 'sms',   label: 'Clutch',            target: process.env.CLUTCH_PHONE_NUMBER ?? '',       enabled: true },
  ]
}

export async function getDestinations(): Promise<Destination[]> {
  return cached('destinations', async () => {
    try {
      const { data } = await overseerDb
        .from('elara_notify_destinations')
        .select('id, kind, label, target, enabled')
      if (data && data.length) return data as Destination[]
    } catch (err) {
      console.error('[elaraConfig] destinations read failed:', err)
    }
    return defaultDestinations()
  })
}

const DEFAULT_ROUTES: Record<string, string> = {
  briefing: 'default',
  health_alert: 'default',
  fp_alert: 'fp',
  activity: 'activity',
  new_subscriber: 'default',
  team_rhythm: 'default', // team channel (#all-crimson-forge), like the briefing
}

async function getRoutes(): Promise<Record<string, string>> {
  return cached('routes', async () => {
    try {
      const { data } = await overseerDb
        .from('elara_notify_routes')
        .select('notification_type, destination_id')
      if (data && data.length) {
        const map: Record<string, string> = { ...DEFAULT_ROUTES }
        for (const r of data as Array<{ notification_type: string; destination_id: string | null }>) {
          if (r.destination_id) map[r.notification_type] = r.destination_id
        }
        return map
      }
    } catch (err) {
      console.error('[elaraConfig] routes read failed:', err)
    }
    return DEFAULT_ROUTES
  })
}

/**
 * Resolve a notification type (or an explicit destination id) to a concrete
 * destination, falling back to the default route then the default webhook.
 */
export async function resolveDestination(notificationType: string, explicitDestinationId?: string | null): Promise<Destination | null> {
  const [destinations, routes] = await Promise.all([getDestinations(), getRoutes()])
  const byId = (id: string | null | undefined) => (id ? destinations.find((d) => d.id === id) ?? null : null)

  const destId = explicitDestinationId ?? routes[notificationType] ?? DEFAULT_ROUTES[notificationType] ?? 'default'
  return byId(destId) ?? destinations.find((d) => d.id === 'default') ?? null
}

// ─── Recipients ──────────────────────────────────────────────────────────────

export async function getRecipients(kind: 'briefing' | 'sms'): Promise<string[]> {
  return cached(`recipients:${kind}`, async () => {
    try {
      const { data } = await overseerDb
        .from('elara_recipients')
        .select('value, enabled')
        .eq('kind', kind)
        .eq('enabled', true)
      if (data && data.length) return (data as Array<{ value: string }>).map((r) => r.value)
    } catch (err) {
      console.error('[elaraConfig] recipients read failed:', err)
    }
    if (kind === 'sms' && process.env.CLUTCH_PHONE_NUMBER) return [process.env.CLUTCH_PHONE_NUMBER]
    return []
  })
}

// ─── Quiet hours ─────────────────────────────────────────────────────────────

export interface QuietHours {
  enabled: boolean
  start_local: string   // 'HH:MM[:SS]'
  end_local: string
  timezone: string | null
  exempt_severities: string[]
}

export async function getQuietHours(): Promise<QuietHours> {
  return cached('quiet_hours', async () => {
    const fallback: QuietHours = { enabled: false, start_local: '21:00', end_local: '07:00', timezone: null, exempt_severities: ['critical'] }
    try {
      const { data } = await overseerDb
        .from('elara_quiet_hours')
        .select('enabled, start_local, end_local, timezone, exempt_severities')
        .eq('id', 1)
        .maybeSingle()
      if (data) return data as QuietHours
    } catch (err) {
      console.error('[elaraConfig] quiet hours read failed:', err)
    }
    return fallback
  })
}

/** True if a non-exempt alert of `severity` should be suppressed right now. */
export async function isWithinQuietHours(severity: string): Promise<boolean> {
  const q = await getQuietHours()
  if (!q.enabled) return false
  if (q.exempt_severities.includes(severity)) return false

  const tz = q.timezone || process.env.TIMEZONE || 'America/Detroit'
  const now = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: tz }) // 'HH:MM:SS'
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const nowMin = toMin(now)
  const start = toMin(q.start_local)
  const end = toMin(q.end_local)
  // Window may wrap past midnight (e.g. 21:00 → 07:00)
  return start <= end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end
}
