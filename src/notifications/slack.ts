/**
 * Slack notifications
 * Formats and sends messages to Slack
 */

import type { MorningBriefing, Alert } from '../types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!

// ─── Helper Functions ─────────────────────────────────────────────────────

/**
 * Determines the overall status emoji
 */
function getStatusEmoji(overallStatus: string): string {
  switch (overallStatus) {
    case 'healthy':
      return '🟢'
    case 'degraded':
      return '🟡'
    case 'down':
      return '🔴'
    default:
      return '⚪'
  }
}

/**
 * Determines status icon for individual items
 */
function getItemEmoji(status: string): string {
  switch (status) {
    case 'healthy':
      return '✅'
    case 'degraded':
      return '⚠️'
    case 'down':
      return '🔴'
    default:
      return '❓'
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
    const statusEmoji = getStatusEmoji(briefing.overallStatus)
    const statusText =
      briefing.overallStatus === 'healthy' ? 'ALL SYSTEMS GO' : 'ISSUES DETECTED'
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

    let message = `${statusEmoji} CRIMSON FORGE — ${statusText}\n`
    message += `${dateStr} · ${timeStr}\n\n`

    // Infrastructure section
    message += '*INFRASTRUCTURE*\n'
    if (briefing.uptime.success && Array.isArray(briefing.uptime.data)) {
      for (const endpoint of briefing.uptime.data) {
        const details =
          endpoint.responseMs !== null ? `${endpoint.responseMs}ms` : 'No response'
        message += formatHealthItem(endpoint.url, endpoint.status, details) + '\n'
      }
    } else {
      message += formatHealthItem('Uptime Check', 'down', 'Tool failed') + '\n'
    }

    if (briefing.railway.success) {
      message += formatHealthItem(
        'Railway API',
        briefing.railway.data.status,
        briefing.railway.data.latestDeploymentStatus || undefined
      ) + '\n'
    } else {
      message += formatHealthItem('Railway API', 'down', 'Tool failed') + '\n'
    }

    if (briefing.supabase.success) {
      message += formatHealthItem(
        'Supabase',
        briefing.supabase.data.connectionStatus
      ) + '\n'
    } else {
      message += formatHealthItem('Supabase', 'down', 'Tool failed') + '\n'
    }

    message += '\n'

    // Activity section
    message += '*ACTIVITY (last 24h)*\n'
    if (briefing.supabase.success) {
      message += `🏪 ${briefing.supabase.data.activeShopsLast24h} active shops\n`
      message += `🎫 ${briefing.supabase.data.ticketsCreatedLast24h} tickets created\n`
      message += `🤖 ${briefing.supabase.data.aiSessionsLast24h} AI sessions\n`
    } else {
      message += '_Activity data unavailable_\n'
    }

    message += '\n'

    // Shops to watch section
    if (briefing.supabase.success && briefing.supabase.data.silentShops.length > 0) {
      message += '*SHOPS TO WATCH* 👀\n'
      for (const shop of briefing.supabase.data.silentShops) {
        const lastActivity = shop.lastActivityAt
          ? new Date(shop.lastActivityAt).toLocaleDateString()
          : 'Never'
        message += `${shop.shopName} — ${shop.daysSilent} days silent (last: ${lastActivity})\n`
      }
      message += '\n'
    }

    // Support section
    message += '*SUPPORT*\n'
    if (briefing.email.success) {
      message += `📬 ${briefing.email.data.unreadCount} unread emails\n`
    } else {
      message += `⚠️ Email check unavailable\n`
    }

    message += '\n'

    // Errors section
    message += '*ERRORS*\n'
    if (briefing.sentry.success) {
      if (briefing.sentry.data.newIssueCount === 0) {
        message += '✅ No new Sentry issues\n'
      } else {
        message += `⚠️ ${briefing.sentry.data.newIssueCount} new issues since yesterday\n`
        message += `${briefing.sentry.data.unresolvedCount} unresolved total\n`
      }
    } else {
      message += '⚠️ Sentry check unavailable\n'
    }

    // Alerts section
    if (briefing.alerts.length > 0) {
      message += '\n*ALERTS*\n'
      for (const alert of briefing.alerts) {
        const icon = alert.severity === 'critical' ? '🔴' : '⚠️'
        message += `${icon} ${alert.message}`
        if (alert.details) {
          message += ` — ${alert.details}`
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
    const emoji = alert.severity === 'critical' ? '🔴' : '⚠️'
    let message = `${emoji} ALERT — ${alert.tool.toUpperCase()} ISSUE\n`
    message += `Detected: ${new Date().toLocaleTimeString()}\n\n`
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
 * Posts a raw message to Slack webhook
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
