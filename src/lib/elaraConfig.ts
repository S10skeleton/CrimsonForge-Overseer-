/**
 * Elara Controls — DB-backed runtime config for the scheduler + notifier.
 *
 * ADDITIVE + SAFE: every getter computes an "effective" value by starting from
 * today's env/constant defaults and overlaying any saved DB override. So a
 * fresh install (no rows) behaves exactly as before, and a failed DB read
 * falls back to the same defaults — config never throws into the scheduler.
 *
 * Results are cached briefly so hot paths (every-minute cron) don't hammer the DB.
 */

import { overseerDb } from './overseerDb.js'

const CACHE_TTL_MS = 30_000

// ─── Morning briefing ────────────────────────────────────────────────────────

export const BRIEFING_SECTIONS = [
  'system',           // infra/uptime/supabase/railway/netlify health
  'sentry',           // error issues
  'stripe',           // revenue
  'payment_failures', // failed payments
  'signups',          // new subscribers / shops
  'feedback',         // recent feedback
  'gmail',            // inbox digest
  'calendar',         // today's events
  'forgepilot',       // ForgePilot section
] as const

export type BriefingSection = (typeof BRIEFING_SECTIONS)[number]

export interface BriefingConfig {
  timeHour: number
  timezone: string
  aiSummaryEnabled: boolean
  sections: Record<BriefingSection, boolean>
}

function briefingDefaults(): BriefingConfig {
  return {
    timeHour: Number(process.env.MORNING_BRIEFING_HOUR || '8'),
    timezone: process.env.TIMEZONE || 'America/Detroit',
    aiSummaryEnabled: true,
    sections: Object.fromEntries(BRIEFING_SECTIONS.map((s) => [s, true])) as Record<BriefingSection, boolean>,
  }
}

interface BriefingRow {
  sections: Partial<Record<string, boolean>> | null
  ai_summary_enabled: boolean | null
  time_hour: number | null
  timezone: string | null
}

let briefingCache: { value: BriefingConfig; at: number } | null = null

export async function getBriefingConfig(): Promise<BriefingConfig> {
  if (briefingCache && Date.now() - briefingCache.at < CACHE_TTL_MS) return briefingCache.value

  const base = briefingDefaults()
  try {
    const { data } = await overseerDb
      .from('elara_briefing_config')
      .select('sections, ai_summary_enabled, time_hour, timezone')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const row = data as BriefingRow | null
    if (row) {
      const merged: BriefingConfig = {
        timeHour: row.time_hour ?? base.timeHour,
        timezone: row.timezone ?? base.timezone,
        aiSummaryEnabled: row.ai_summary_enabled ?? base.aiSummaryEnabled,
        sections: { ...base.sections, ...(row.sections ?? {}) },
      }
      briefingCache = { value: merged, at: Date.now() }
      return merged
    }
  } catch (err) {
    console.error('[elaraConfig] briefing read failed — using defaults:', err)
  }

  briefingCache = { value: base, at: Date.now() }
  return base
}

export interface BriefingConfigPatch {
  timeHour?: number | null
  timezone?: string | null
  aiSummaryEnabled?: boolean | null
  sections?: Partial<Record<BriefingSection, boolean>>
}

/** Upsert the single active briefing-config row. Returns the new effective config. */
export async function saveBriefingConfig(patch: BriefingConfigPatch): Promise<BriefingConfig> {
  const current = await getBriefingConfig()

  // Sections persist as the full effective map so future default changes don't
  // silently flip a section the user explicitly set.
  const sections = { ...current.sections, ...(patch.sections ?? {}) }

  const { data: existing } = await overseerDb
    .from('elara_briefing_config')
    .select('id')
    .eq('active', true)
    .limit(1)
    .maybeSingle()

  const rowValues = {
    sections,
    ai_summary_enabled: patch.aiSummaryEnabled ?? current.aiSummaryEnabled,
    time_hour: patch.timeHour ?? current.timeHour,
    timezone: patch.timezone ?? current.timezone,
    active: true,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    await overseerDb.from('elara_briefing_config').update(rowValues).eq('id', existing.id)
  } else {
    await overseerDb.from('elara_briefing_config').insert(rowValues)
  }

  briefingCache = null
  return getBriefingConfig()
}

/** Drop cached config (call after any write). */
export function invalidateConfigCache(): void {
  briefingCache = null
}
