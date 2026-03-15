/**
 * Twilio SMS delivery monitoring
 * Checks delivery stats for the last 24h.
 * Alerts if failure rate exceeds threshold.
 * Zero write access — read-only API calls only.
 */

import type { ToolResult, AgentTool } from '../types/index.js'

// P1 threshold per runbook: >5% failure rate on any batch
const FAILURE_RATE_THRESHOLD = 0.05

interface TwilioStats {
  sent: number
  delivered: number
  failed: number
  undelivered: number
  failureRate: number
  thresholdBreached: boolean
  window: string
}

async function getTwilioStats(): Promise<ToolResult<TwilioStats>> {
  const timestamp = new Date().toISOString()
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    return {
      tool: 'twilio_stats',
      success: false,
      timestamp,
      data: { sent: 0, delivered: 0, failed: 0, undelivered: 0, failureRate: 0, thresholdBreached: false, window: '24h' },
      error: 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not configured.',
    }
  }

  try {
    // Query messages from the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?DateSent>=${since.split('T')[0]}&PageSize=100`

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`Twilio API returned ${response.status}`)
    }

    const data = await response.json() as {
      messages: Array<{ status: string; direction: string }>
    }

    // Only count outbound messages (not inbound replies)
    const outbound = data.messages.filter(
      (m) => m.direction === 'outbound-api' || m.direction === 'outbound-reply'
    )

    const sent = outbound.length
    const delivered = outbound.filter((m) => m.status === 'delivered').length
    const failed = outbound.filter((m) => m.status === 'failed').length
    const undelivered = outbound.filter((m) => m.status === 'undelivered').length

    const failureRate = sent > 0 ? (failed + undelivered) / sent : 0
    const thresholdBreached = failureRate > FAILURE_RATE_THRESHOLD

    if (thresholdBreached) {
      console.log(`[twilio] ⚠️ Failure rate ${(failureRate * 100).toFixed(1)}% exceeds ${FAILURE_RATE_THRESHOLD * 100}% threshold`)
    }

    return {
      tool: 'twilio_stats',
      success: true,
      timestamp,
      data: {
        sent,
        delivered,
        failed,
        undelivered,
        failureRate: Math.round(failureRate * 1000) / 1000,
        thresholdBreached,
        window: '24h',
      },
    }
  } catch (err) {
    return {
      tool: 'twilio_stats',
      success: false,
      timestamp,
      data: { sent: 0, delivered: 0, failed: 0, undelivered: 0, failureRate: 0, thresholdBreached: false, window: '24h' },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AgentTool definition ─────────────────────────────────────────────────

export const twilioStatsTool: AgentTool = {
  name: 'twilio_stats',
  description:
    'Check Twilio SMS delivery stats for the last 24 hours. Returns sent/delivered/failed counts and failure rate. ' +
    'Flags if failure rate exceeds the 5% P1 threshold. Use in morning briefing and when asked about SMS delivery.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => getTwilioStats(),
}

export { getTwilioStats as runTwilioCheck }
