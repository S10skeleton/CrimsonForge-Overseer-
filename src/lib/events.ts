/**
 * Activity events — the business-activity stream that feeds #cf-activity.
 * emitEvent() inserts an overseer_events row AND posts a compact Slack line.
 * Fire-and-forget: never throws into or blocks the triggering request.
 */

import { overseerDb } from './overseerDb.js'
import { sendAgentMessage } from '../notifications/slack.js'

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

/**
 * Per-event-type channel overrides. Resolution order:
 *   explicit channelId arg → EVENT_CHANNEL_ROUTES[type] → SLACK_ACTIVITY_CHANNEL_ID
 * TODO: move routing to an overseer_event_config table in a later phase.
 */
export const EVENT_CHANNEL_ROUTES: Record<string, string | undefined> = {
  // e.g. 'fp.signup': process.env.FP_SLACK_CHANNEL_ID,
}

function resolveChannel(type: string, explicit?: string): string | undefined {
  return explicit ?? EVENT_CHANNEL_ROUTES[type] ?? process.env.SLACK_ACTIVITY_CHANNEL_ID
}

export async function emitEvent(input: EmitEventInput): Promise<void> {
  const severity = input.severity ?? 'info'
  const channel = resolveChannel(input.type, input.channelId)

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
    await sendAgentMessage(line, channel)
  } catch (err) {
    console.error('[events] slack post failed:', err)
  }
}
