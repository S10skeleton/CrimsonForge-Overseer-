/**
 * Check-in dispatcher
 * Runs every minute. Fires Slack DMs for wellness check-ins whose time
 * window contains the current UTC time and haven't fired today yet.
 * Uses randomized firing within the window so it never feels like clockwork.
 */

import { createClient } from '@supabase/supabase-js'
import { WebClient } from '@slack/web-api'

function getSupabase() {
  return createClient(
    process.env.ELARA_SUPABASE_URL!,
    process.env.ELARA_SUPABASE_KEY!
  )
}

function getSlack() {
  return new WebClient(process.env.SLACK_BOT_TOKEN!)
}

const FOUNDER_SLACK_USER_ID = process.env.SLACK_FOUNDER_USER_ID!

// ─── Time helpers ──────────────────────────────────────────────────────────

function isInWindow(windowStart: string, windowEnd: string): boolean {
  const now = new Date()
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()

  const [startH, startM] = windowStart.split(':').map(Number)
  const [endH, endM] = windowEnd.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  // Handle windows that cross midnight (e.g. night check 03:45–04:15 UTC)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes
}

function firedToday(lastFiredAt: string | null): boolean {
  if (!lastFiredAt) return false
  const last = new Date(lastFiredAt)
  const now = new Date()
  return (
    last.getUTCFullYear() === now.getUTCFullYear() &&
    last.getUTCMonth() === now.getUTCMonth() &&
    last.getUTCDate() === now.getUTCDate()
  )
}

function windowLengthMinutes(windowStart: string, windowEnd: string): number {
  const [startH, startM] = windowStart.split(':').map(Number)
  const [endH, endM] = windowEnd.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  // Handle midnight-crossing windows
  const diff = endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : 1440 - startMinutes + endMinutes
  return diff || 30
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface CheckinItem {
  label: string
  window_start_utc: string  // "HH:MM"
  window_end_utc: string    // "HH:MM"
  message: string
  enabled: boolean
  last_fired_at?: string
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export async function runCheckinDispatcher(): Promise<void> {
  if (!process.env.ELARA_SUPABASE_URL || !process.env.ELARA_SUPABASE_KEY) return
  if (!process.env.SLACK_BOT_TOKEN || !FOUNDER_SLACK_USER_ID) return

  const supabase = getSupabase()

  // All check-ins live in a single row as a JSONB items array
  const { data: row, error } = await supabase
    .from('agent_routines')
    .select('items')
    .eq('routine_type', 'checkin')
    .single()

  if (error || !row?.items) return

  const routines: CheckinItem[] = row.items

  for (const routine of routines) {
    if (!routine.enabled) continue
    if (firedToday(routine.last_fired_at ?? null)) continue
    if (!isInWindow(routine.window_start_utc, routine.window_end_utc)) continue

    // Probabilistic firing: ~1 chance per minute spreads the exact fire time
    // naturally across the window without extra complexity
    const windowMinutes = windowLengthMinutes(routine.window_start_utc, routine.window_end_utc)
    if (Math.random() > 1 / windowMinutes) continue

    try {
      const slack = getSlack()
      const dm = await slack.conversations.open({ users: FOUNDER_SLACK_USER_ID })
      const channelId = (dm as { channel?: { id?: string } }).channel?.id
      if (!channelId) continue

      await slack.chat.postMessage({
        channel: channelId,
        text: routine.message,
      })

      // Update last_fired_at inside the JSONB array
      const updatedItems = routines.map((r) =>
        r.label === routine.label
          ? { ...r, last_fired_at: new Date().toISOString() }
          : r
      )

      await supabase
        .from('agent_routines')
        .update({ items: updatedItems, updated_at: new Date().toISOString() })
        .eq('routine_type', 'checkin')

      console.log(`\u2705 [CHECKIN] Fired: ${routine.label}`)
    } catch (err) {
      console.error(`\u274C [CHECKIN] Failed to send ${routine.label}:`, err)
    }
  }
}
