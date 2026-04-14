/**
 * Slack notifications
 * Formats and sends messages to Slack
 */

import type { MorningBriefing, Alert } from '../types/index.js'
import { getSlackApp } from '../slack-bot.js'

// ─── Configuration ────────────────────────────────────────────────────────

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!

// ─── Helper Functions ─────────────────────────────────────────────────────

/**
 * Determines status icon for individual items
 */
function getItemEmoji(status: string): string {
  switch (status) {
    case 'healthy':
      return '\u2705'     // ✅
    case 'degraded':
      return '\u26A0\uFE0F' // ⚠️
    case 'down':
      return '\uD83D\uDD34' // 🔴
    default:
      return '\u2753'     // ❓
  }
}

/**
 * Formats a single health item for display
 */
function formatHealthItem(name: string, status: string, details?: string): string {
  const emoji = getItemEmoji(status)
  let line = `${emoji} ${name}`
  if (details) {
    line += ` — ${details}`
  }
  return line
}

// ─── Main Functions ───────────────────────────────────────────────────────

/**
 * Sends the morning briefing to Slack
 */
export async function sendBriefing(briefing: MorningBriefing): Promise<void> {
  try {
    // Only flag real issues — Railway unknown and email unavailable are not issues
    const isUptimeDown =
      briefing.uptime.success &&
      Array.isArray(briefing.uptime.data) &&
      briefing.uptime.data.some((e) => e.status === 'down')
    const isSupabaseDown =
      !briefing.supabase.success ||
      briefing.supabase.data?.connectionStatus === 'down'
    const hasNewErrors =
      briefing.sentry.success && (briefing.sentry.data?.newIssueCount ?? 0) > 0
    const hasRealIssues = isUptimeDown || isSupabaseDown || hasNewErrors
    const statusEmoji = isUptimeDown || isSupabaseDown ? '\uD83D\uDD34' : hasNewErrors ? '\uD83D\uDFE1' : '\uD83D\uDFE2'
    const statusText = hasRealIssues ? 'ISSUES DETECTED' : 'ALL SYSTEMS GO'
    const date = new Date(briefing.timestamp)
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: process.env.TIMEZONE || 'America/Detroit',
    })
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: process.env.TIMEZONE || 'America/Detroit',
    })

    let message = `${statusEmoji} CRIMSON FORGE \u2014 ${statusText}\n`
    message += `${dateStr} \u00B7 ${timeStr}\n\n`

    // Infrastructure section
    message += '*INFRASTRUCTURE*\n'
    if (briefing.uptime.success && Array.isArray(briefing.uptime.data)) {
      for (const endpoint of briefing.uptime.data) {
        const displayName = (() => { try { return new URL(endpoint.url).hostname } catch { return endpoint.url } })()
        const details = endpoint.responseMs !== null ? `${endpoint.responseMs}ms` : 'No response'
        message += formatHealthItem(displayName, endpoint.status, details) + '\n'
      }
    } else {
      message += formatHealthItem('Uptime Check', 'down', 'Tool failed') + '\n'
    }

    if (briefing.railway.success && briefing.railway.data.status !== 'unknown') {
      message += formatHealthItem(
        'Railway API',
        briefing.railway.data.status,
        briefing.railway.data.latestDeploymentStatus || undefined
      ) + '\n'
    } else {
      message += '\u26A0\uFE0F Railway API \u2014 check unavailable\n'
    }

    if (briefing.supabase.success) {
      message += formatHealthItem(
        'Supabase',
        briefing.supabase.data.connectionStatus,
        'connected'
      ) + '\n'
    } else {
      message += formatHealthItem('Supabase', 'down', 'Tool failed') + '\n'
    }

    message += '\n'

    // Per-shop status section
    message += '*SHOP STATUS*\n'
    if (briefing.supabase.success && briefing.supabase.data.shopStatuses.length > 0) {
      const tz = process.env.TIMEZONE || 'America/Denver'

      for (const shop of briefing.supabase.data.shopStatuses) {
        // Determine shop status emoji
        let shopEmoji = '\uD83D\uDFE2'  // 🟢
        if (shop.isNewShop && shop.ticketsLast24h === 0 && shop.daysSinceSignup <= 1) {
          shopEmoji = '\uD83D\uDD34'    // 🔴 brand new, no tickets yet
        } else if (shop.daysSinceActive >= 3) {
          shopEmoji = '\uD83D\uDD34'    // 🔴 gone silent
        } else if (shop.daysSinceActive >= 1 && shop.ticketsLast24h === 0) {
          shopEmoji = '\uD83D\uDFE1'    // 🟡 no tickets today
        }

        let shopLine = `${shopEmoji} ${shop.shopName.padEnd(24)}`

        if (shop.isNewShop && shop.daysSinceSignup <= 1) {
          shopLine += ` \u2014 Day ${shop.daysSinceSignup + 1} onboarding`
          if (shop.ticketsLast24h === 0) shopLine += ' \u00B7 no tickets yet \u26A0\uFE0F'
        } else if (shop.ticketsLast24h > 0) {
          shopLine += ` \u2014 ${shop.ticketsLast24h} ticket${shop.ticketsLast24h > 1 ? 's' : ''} today`
          if (shop.lastTicketAt) {
            const lastTime = new Date(shop.lastTicketAt).toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit', timeZone: tz,
            })
            shopLine += ` \u00B7 last: ${lastTime}`
          }
        } else {
          shopLine += ` \u2014 0 tickets`
          if (shop.daysSinceActive > 0) {
            shopLine += ` \u00B7 silent ${shop.daysSinceActive}d`
          }
        }

        message += shopLine + '\n'
      }

      const totalTickets = briefing.supabase.data.ticketsCreatedLast24h
      const aiSessions = briefing.supabase.data.aiSessionsLast24h
      message += `\n_${totalTickets} tickets \u00B7 ${aiSessions || 0} AI sessions across all shops_\n`
    } else if (briefing.supabase.success) {
      message += '_No shops registered yet_\n'
    } else {
      message += '_Shop data unavailable_\n'
    }

    message += '\n'

    // Communications section (Twilio + Resend)
    const hasTwilioData = (briefing as unknown as { twilio?: { success: boolean; data: unknown } }).twilio?.success
    const hasResendData = (briefing as unknown as { resend?: { success: boolean; data: unknown } }).resend?.success

    if (hasTwilioData || hasResendData) {
      message += '*COMMUNICATIONS*\n'

      const twilioStats = (briefing as unknown as {
        twilio?: { success: boolean; data: { sent: number; failed: number; failureRate: number; thresholdBreached: boolean } }
      }).twilio?.data

      if (twilioStats) {
        const smsStatus = twilioStats.thresholdBreached ? '\u26A0\uFE0F' : '\u2705'
        message += `${smsStatus} SMS: ${twilioStats.sent} sent \u00B7 ${twilioStats.failed} failed (${(twilioStats.failureRate * 100).toFixed(1)}%)\n`
      }

      const resendStats = (briefing as unknown as {
        resend?: { success: boolean; data: { sent: number; bounced: number; bounceRate: number; thresholdBreached: boolean; domain: { name: string; status: string } | null } }
      }).resend?.data

      if (resendStats) {
        const emailStatus = resendStats.thresholdBreached || (resendStats.domain && resendStats.domain.status !== 'verified') ? '\u26A0\uFE0F' : '\u2705'
        message += `${emailStatus} Email: ${resendStats.sent} sent \u00B7 ${resendStats.bounced} bounced (${(resendStats.bounceRate * 100).toFixed(1)}%)\n`
        if (resendStats.domain && resendStats.domain.status !== 'verified') {
          message += `\uD83D\uDD34 Domain ${resendStats.domain.name} is ${resendStats.domain.status}\n`
        }
      }

      message += '\n'
    }

    // Revenue section
    if (briefing.stripe?.success && briefing.stripe.data) {
      const s = briefing.stripe.data as import('../types/index.js').StripeData
      message += '*REVENUE*\n'
      if (s.activeSubscriptions === 0) {
        message += `\uD83D\uDCB3 $0 MRR — pre-revenue (closed beta)\n`
      } else {
        message += `\uD83D\uDCB3 ${s.activeSubscriptions} active subs · $${s.mrr.toFixed(0)} MRR\n`
        if (s.newThisMonth > 0) message += `\uD83C\uDF89 ${s.newThisMonth} new this month\n`
        if (s.hasWebhookIssues) message += `\u26A0\uFE0F Webhook issue — check Stripe dashboard\n`
        if (s.hasPaymentFailures) {
          message += `\uD83D\uDD34 ${s.paymentFailures.length} payment failure(s) in last 24h\n`
        }
      }
      message += '\n'
    }

    // Support section
    message += '*SUPPORT*\n'
    if (briefing.email.success) {
      message += `\uD83D\uDCEC ${briefing.email.data.unreadCount} unread emails\n`
    } else {
      message += `\u26A0\uFE0F Email check unavailable\n`
    }

    message += '\n'

    // Errors section
    message += '*ERRORS*\n'
    if (briefing.sentry.success) {
      if (briefing.sentry.data.newIssueCount === 0) {
        message += '\u2705 No new Sentry issues\n'
      } else {
        message += `\u26A0\uFE0F ${briefing.sentry.data.newIssueCount} new issues since yesterday\n`
        message += `${briefing.sentry.data.unresolvedCount} unresolved total\n`
      }
    } else {
      message += '\u26A0\uFE0F Sentry check unavailable\n'
    }

    // Alerts section
    if (briefing.alerts.length > 0) {
      message += '\n*ALERTS*\n'
      for (const alert of briefing.alerts) {
        const icon = alert.severity === 'critical' ? '\uD83D\uDD34' : '\u26A0\uFE0F'
        message += `${icon} ${alert.message}`
        if (alert.details) {
          message += ` \u2014 ${alert.details}`
        }
        message += '\n'
      }
    }

    await postToSlack({
      text: message,
    })
  } catch (err) {
    console.error('Error sending briefing to Slack:', err)
  }
}

/**
 * Sends an immediate alert to Slack
 */
export async function sendAlert(alert: Alert): Promise<void> {
  try {
    const emoji = alert.severity === 'critical' ? '\uD83D\uDD34' : '\u26A0\uFE0F'
    let message = `${emoji} ALERT \u2014 ${alert.tool.toUpperCase()} ISSUE\n`
    message += `Detected: ${new Date().toLocaleTimeString('en-US', { timeZone: process.env.TIMEZONE || 'America/Detroit' })}\n\n`
    message += `${alert.message}\n`

    if (alert.details) {
      message += `\n${alert.details}\n`
    }

    if (alert.actionUrl) {
      message += `\nView: ${alert.actionUrl}\n`
    }

    await postToSlack({
      text: message,
    })
  } catch (err) {
    console.error('Error sending alert to Slack:', err)
  }
}

/**
 * Sends an alert to a specific Slack channel by ID using the bot token.
 * Used for product-specific channels (e.g. #forgepilot-ops).
 * Falls back to the default webhook alert if channel ID is missing.
 */
export async function sendAlertToChannel(channelId: string | undefined, alert: Alert): Promise<void> {
  if (!channelId) {
    // No channel configured — fall back to default webhook channel
    return sendAlert(alert)
  }

  try {
    const emoji = alert.severity === 'critical' ? '\uD83D\uDD34' : '\u26A0\uFE0F'
    let message = `${emoji} ALERT \u2014 ${alert.tool.toUpperCase()}\n`
    message += `${alert.message}\n`
    if (alert.details) message += `\n${alert.details}\n`
    if (alert.actionUrl) message += `\nView: ${alert.actionUrl}\n`

    const slackApp = getSlackApp()
    if (slackApp) {
      await slackApp.client.chat.postMessage({
        channel: channelId,
        text: message,
      })
    } else {
      // Bot not running — fall back to webhook
      await sendAlert(alert)
    }
  } catch (err) {
    console.error('[slack] Error sending alert to channel:', err)
    // Best-effort fallback
    try { await sendAlert(alert) } catch {}
  }
}

/**
 * Posts a raw message to Slack webhook (low-level)
 */
async function postToSlack(payload: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new Error(`Slack webhook error: ${res.statusText}`)
    }
  } catch (err) {
    console.error('Error posting to Slack:', err)
    // Log but don't throw — Slack being down should not crash the system
  }
}

/**
 * Sends a raw pre-formatted message to Slack (used for AI-generated briefings)
 */
export async function sendRawMessage(text: string): Promise<void> {
  await postToSlack({ text })
}

/**
 * Send an SMS alert directly to Clutch via Twilio.
 * Only fires on P0 (critical) alerts.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, CLUTCH_PHONE_NUMBER.
 */
export async function sendSMSAlert(message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER
  const toNumber = process.env.CLUTCH_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    console.log('[SMS ALERT] Twilio not fully configured — skipping SMS alert.')
    return
  }

  try {
    const body = new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: `🚨 CFP P0: ${message}`,
    })

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error(`[SMS ALERT] Failed to send SMS: ${err}`)
    } else {
      console.log(`[SMS ALERT] P0 SMS sent to Clutch.`)
    }
  } catch (err) {
    console.error('[SMS ALERT] Error sending SMS:', err)
  }
}

/**
 * Sends a text response from the agent to a specific channel
 */
export async function sendAgentMessage(text: string, channelId?: string): Promise<void> {
  const payload: Record<string, unknown> = { text }
  if (channelId) payload.channel = channelId
  await postToSlack(payload)
}
