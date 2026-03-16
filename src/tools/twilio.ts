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

// ─── On-demand SMS send (Elara tool) ─────────────────────────────────────

interface SendSMSResult {
  to: string
  messageSid: string
  status: string
}

async function sendSMS(to: string, body: string): Promise<ToolResult<SendSMSResult>> {
  const timestamp = new Date().toISOString()
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return {
      tool: 'send_sms',
      success: false,
      timestamp,
      data: { to, messageSid: '', status: 'not_sent' },
      error: 'Twilio credentials not configured.',
    }
  }

  // Named recipient resolution — Elara can pass "clutch" instead of a phone number
  if (to.toLowerCase() === 'clutch') { to = process.env.CLUTCH_PHONE_NUMBER || to }
  if (to.toLowerCase() === 'wayne') { to = process.env.WAYNE_PHONE_NUMBER || to }
  if (to.toLowerCase() === 'steve') { to = process.env.STEVE_PHONE_NUMBER || to }

  // Safety: only allow sending to known contacts unless explicitly overridden
  const ALLOWED_NUMBERS = [
    process.env.CLUTCH_PHONE_NUMBER,
    process.env.WAYNE_PHONE_NUMBER,
    process.env.STEVE_PHONE_NUMBER,
  ].filter(Boolean) as string[]

  if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(to)) {
    return {
      tool: 'send_sms',
      success: false,
      timestamp,
      data: { to, messageSid: '', status: 'blocked' },
      error: `Number ${to} is not in the allowed contacts list. Add to env vars to enable.`,
    }
  }

  try {
    const formData = new URLSearchParams({
      From: fromNumber,
      To: to,
      Body: body,
    })

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(10_000),
      }
    )

    const result = await response.json() as { sid: string; status: string; error_message?: string }

    if (!response.ok) {
      throw new Error(result.error_message || `Twilio API error: ${response.status}`)
    }

    console.log(`[twilio] SMS sent to ${to}: ${result.sid}`)
    return {
      tool: 'send_sms',
      success: true,
      timestamp,
      data: { to, messageSid: result.sid, status: result.status },
    }
  } catch (err) {
    return {
      tool: 'send_sms',
      success: false,
      timestamp,
      data: { to, messageSid: '', status: 'failed' },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export const sendSMSTool: AgentTool = {
  name: 'send_sms',
  description:
    'Send an SMS message to a known contact (Clutch, Wayne, or Steve). ' +
    'Use when asked to text someone, send a heads-up, or notify a stakeholder. ' +
    'The "to" field must be an E.164 phone number (+1XXXXXXXXXX). ' +
    'Only sends to numbers configured in env vars — will not send to unknown numbers.',
  input_schema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient phone number in E.164 format (+1XXXXXXXXXX), or a named contact: "clutch", "wayne", or "steve". Named contacts resolve to the corresponding env var (e.g. "clutch" → CLUTCH_PHONE_NUMBER).',
      },
      body: {
        type: 'string',
        description: 'The SMS message text. Keep under 160 characters to avoid multi-part messages.',
      },
    },
    required: ['to', 'body'],
  },
  execute: async (input) => sendSMS(input.to as string, input.body as string),
}
