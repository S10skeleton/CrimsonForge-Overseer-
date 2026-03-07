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

// ─── Dispatcher ────────────────────────────────────────────────────────────

export async function runCheckinDispatcher(): Promise<void> {
  if (!process.env.ELARA_SUPABASE_URL || !process.env.ELARA_SUPABASE_KEY) return
  if (!process.env.SLACK_BOT_TOKEN || !FOUNDER_SLACK_USER_ID) return

  const supabase = getSupabase()

  const { data: routines, error } = await supabase
    .from('agent_routines')
    .select('*')
    .eq('routine_type', 'checkin')
    .eq('enabled', true)

  if (error || !routines) return

  for (const routine of routines) {
    if (firedToday(routine.last_fired_at)) continue
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

      await supabase
        .from('agent_routines')
        .update({ last_fired_at: new Date().toISOString() })
        .eq('id', routine.id)

      console.log(`\u2705 [CHECKIN] Fired: ${routine.label}`)
    } catch (err) {
      console.error(`\u274C [CHECKIN] Failed to send ${routine.label}:`, err)
    }
  }
}
