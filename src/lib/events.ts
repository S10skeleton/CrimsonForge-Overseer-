/**
 * Activity events — the business-activity stream that feeds #cf-activity.
 * emitEvent() inserts an overseer_events row AND posts a compact Slack line.
 * Fire-and-forget: never throws into or blocks the triggering request.
 */

import { overseerDb } from './overseerDb.js'
import { sendAgentMessage, sendRawMessage } from '../notifications/slack.js'
import { resolveDestination } from './elaraConfig.js'

export type EventSeverity = 'info' | 'success' | 'warning' | 'critical'

export interface EmitEventInput {
  type: string
  title: string
  body?: string
  severity?: EventSeverity
  meta?: Record<string, unknown>
  channelId?: string
}

const SEVERITY_EMOJI: Record<EventSeverity, string> = {
  info: '⚪',      // ⚪
  success: '✅',   // ✅
  warning: '⚠️', // ⚠️
  critical: '🚨', // 🚨
}

export async function emitEvent(input: EmitEventInput): Promise<void> {
  const severity = input.severity ?? 'info'

  // Resolve the 'activity' route via DB-backed config (falls back to
  // SLACK_ACTIVITY_CHANNEL_ID / default webhook). An explicit channelId still wins.
  let channel = input.channelId
  if (!channel) {
    try {
      const dest = await resolveDestination('activity')
      if (dest && dest.kind === 'slack' && dest.target && dest.target !== 'webhook') channel = dest.target
    } catch (err) {
      console.error('[events] route resolve failed:', err)
      channel = process.env.SLACK_ACTIVITY_CHANNEL_ID
    }
  }

  // 1) Persist the event (fail-safe)
  try {
    await overseerDb.from('overseer_events').insert({
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      severity,
      channel: channel ?? null,
      meta: input.meta ?? {},
    })
  } catch (err) {
    console.error('[events] insert failed:', err)
  }

  // 2) Post to Slack (fail-safe)
  try {
    let line = `${SEVERITY_EMOJI[severity]} *${input.title}*`
    if (input.body) line += `\n${input.body}`
    if (channel) await sendAgentMessage(line, channel)
    else await sendRawMessage(line)
  } catch (err) {
    console.error('[events] slack post failed:', err)
  }
}
