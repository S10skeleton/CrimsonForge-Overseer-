/**
 * Scheduler
 * Defines cron jobs for health checks and briefings
 */

import cron from 'node-cron'
import { monitors } from './tools/index.js'
import { checkForNewSubscribers } from './tools/stripe.js'
import { sendBriefing, sendAlert, sendRawMessage, sendSMSAlert } from './notifications/slack.js'
import { generateAIBriefing } from './agent/index.js'
import { setLastBriefing } from './slack-bot.js'
import { runCheckinDispatcher } from './jobs/checkins.js'
import type { MorningBriefing, Alert } from './types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const MORNING_BRIEFING_HOUR = Number(process.env.MORNING_BRIEFING_HOUR || '8')

// ─── Health Check Job (every 15 minutes) ──────────────────────────────────

async function runSilentHealthCheck(): Promise<void> {
  console.log('[SCHEDULER] Running silent health check...')

  try {
    const uptimeResult = await monitors.uptime()
    const railwayResult = await monitors.railway()

    const isUptimeDown =
      uptimeResult.success &&
      Array.isArray(uptimeResult.data) &&
      uptimeResult.data.some((e) => e.status === 'down')

    const isUptimeSlow =
      uptimeResult.success &&
      Array.isArray(uptimeResult.data) &&
      uptimeResult.data.some((e) => e.status === 'degraded' && e.responseMs !== null && e.responseMs > 3000)

    const isRailwayDown =
      railwayResult.success && railwayResult.data.status === 'down'

    if (isUptimeDown || isRailwayDown || isUptimeSlow) {
      const alerts: Alert[] = []

      if (isUptimeDown) {
        const downEndpoints = (uptimeResult.data as Array<{ url: string; status: string }>)
          .filter((e) => e.status === 'down')
          .map((e) => e.url)
          .join(', ')
        alerts.push({
          severity: 'critical',
          tool: 'uptime',
          message: 'Services are DOWN',
          details: downEndpoints,
        })
      }

      if (isUptimeSlow) {
        const slowEndpoints = (uptimeResult.data as Array<{ url: string; status: string; responseMs: number | null }>)
          .filter((e) => e.status === 'degraded' && e.responseMs !== null && e.responseMs > 3000)
          .map((e) => `${e.url} (${e.responseMs}ms)`)
          .join(', ')
        alerts.push({
          severity: 'warning',
          tool: 'uptime',
          message: 'Slow response time detected (>3s)',
          details: slowEndpoints,
        })
      }

      if (isRailwayDown) {
        alerts.push({
          severity: 'critical',
          tool: 'railway',
          message: 'Railway deployment is DOWN',
          actionUrl: 'https://railway.app/project/' + process.env.CF_PROJECT_ID,
        })
      }

      for (const alert of alerts) {
        await sendAlert(alert)
        // P0 = critical severity — also SMS Clutch directly
        if (alert.severity === 'critical') {
          await sendSMSAlert(`${alert.message}${alert.details ? ` — ${alert.details}` : ''}`)
        }
      }
    } else {
      console.log('[SCHEDULER] Silent health check passed. No alerts needed.')
    }

    // ── Real-time new subscriber alerts ──────────────────────────────────
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        const { newSubscribers } = await checkForNewSubscribers()
        for (const sub of newSubscribers) {
          await sendAlert({
            severity: 'info',
            tool: 'stripe',
            message: `🎉 New subscriber: ${sub.email} — ${sub.plan} ($${sub.amount}/mo)`,
          })
          console.log(`[SCHEDULER] New subscriber alert: ${sub.email}`)
        }
      }
    } catch (err) {
      console.error('[SCHEDULER] Error in new subscriber check:', err)
    }

  } catch (err) {
    console.error('[SCHEDULER] Error in silent health check:', err)
  }
}

// ─── Morning Briefing Job ─────────────────────────────────────────────────

async function runMorningBriefing(): Promise<void> {
  console.log('[SCHEDULER] Running morning briefing...')

  try {
    // Run all monitors in parallel (infrastructure + new integrations)
    const [uptime, supabase, sentry, railway, email, gmail, calendar, twilio, stripe] =
      await Promise.allSettled([
        monitors.uptime(),
        monitors.supabase(),
        monitors.sentry(),
        monitors.railway(),
        monitors.email(),
        monitors.gmail(),
        monitors.calendar(),
        monitors.twilio(),
        monitors.stripe(),
      ])

    function getResult<T>(result: PromiseSettledResult<T>): T & { success: boolean; error?: string } {
      if (result.status === 'rejected') {
        return {
          success: false,
          error: (result.reason as Error)?.message || 'Unknown error',
        } as T & { success: boolean; error?: string }
      }
      return result.value as T & { success: boolean; error?: string }
    }

    const uptimeResult = getResult(uptime)
    const supabaseResult = getResult(supabase)
    const sentryResult = getResult(sentry)
    const railwayResult = getResult(railway)
    const emailResult = getResult(email)
    const gmailResult = getResult(gmail)
    const calendarResult = getResult(calendar)
    const twilioResult = getResult(twilio)
    const stripeResult = getResult(stripe)

    // Determine overall status
    const isUptimeDown =
      uptimeResult.success &&
      Array.isArray(uptimeResult.data) &&
      (uptimeResult.data as Array<{ status: string }>).some((e) => e.status === 'down')
    const isSupabaseDown =
      !supabaseResult.success ||
      (supabaseResult.data as { connectionStatus?: string })?.connectionStatus === 'down'
    const hasNewErrors =
      sentryResult.success && ((sentryResult.data as { newIssueCount?: number })?.newIssueCount ?? 0) > 0

    const overallStatus = isUptimeDown || isSupabaseDown ? 'down' : hasNewErrors ? 'degraded' : 'healthy'

    // Build alerts
    const alerts: Alert[] = []

    if (hasNewErrors) {
      alerts.push({
        severity: 'warning',
        tool: 'sentry',
        message: `${(sentryResult.data as { newIssueCount?: number })?.newIssueCount} new error issues detected`,
        actionUrl: `https://sentry.io/organizations/${process.env.SENTRY_ORG}/issues/`,
      })
    }

    const silentShops = (supabaseResult.data as { silentShops?: Array<{ daysSilent: number }> })?.silentShops ?? []
    if (silentShops.length > 0) {
      alerts.push({
        severity: 'info',
        tool: 'supabase',
        message: `${silentShops.length} shops inactive for 3+ days`,
      })
    }

    const twilioData = twilioResult.success
      ? (twilioResult.data as { thresholdBreached: boolean; failureRate: number; failed: number })
      : null

    if (twilioData?.thresholdBreached) {
      alerts.push({
        severity: 'warning',
        tool: 'twilio',
        message: `SMS failure rate ${(twilioData.failureRate * 100).toFixed(1)}% exceeds 5% threshold (${twilioData.failed} failed messages)`,
      })
    }

    // Stripe alerts
    const stripeData = stripeResult.success
      ? (stripeResult.data as import('./types/index.js').StripeData)
      : null

    if (stripeData?.hasWebhookIssues) {
      alerts.push({
        severity: 'critical',
        tool: 'stripe',
        message: 'Stripe webhook endpoint issue detected',
        details: stripeData.webhookHealth?.url || 'endpoint not found',
        actionUrl: 'https://dashboard.stripe.com/webhooks',
      })
    }

    if (stripeData?.hasPaymentFailures) {
      const failureList = stripeData.paymentFailures
        .map((f) => `${f.customerEmail} ($${f.amount})`)
        .join(', ')
      alerts.push({
        severity: 'warning',
        tool: 'stripe',
        message: `${stripeData.paymentFailures.length} payment failure(s) in last 24h`,
        details: failureList,
        actionUrl: 'https://dashboard.stripe.com/payments?status=failed',
      })
    }

    // Build the full briefing object
    const briefing: MorningBriefing = {
      timestamp: new Date().toISOString(),
      overallStatus,
      uptime: uptimeResult,
      supabase: supabaseResult,
      sentry: sentryResult,
      railway: railwayResult,
      email: emailResult,
      stripe: stripeResult,
      alerts,
    }

    // Store for the Slack bot's context
    setLastBriefing(briefing)

    // Try AI-enhanced briefing first
    const gmailData = gmailResult.success ? (gmailResult.data as { unreadCount: number; messages: Array<{ from: string; subject: string; snippet: string }> }) : undefined
    const calendarData = calendarResult.success ? (calendarResult.data as { todayEvents: Array<{ title: string; start: string; end: string; location?: string; attendees: string[] }> }) : undefined

    const twilioSummary = twilioResult.success
      ? (twilioResult.data as { sent: number; delivered: number; failed: number; failureRate: number; thresholdBreached: boolean })
      : undefined

    const stripeForBriefing = stripeResult.success
      ? (stripeResult.data as import('./types/index.js').StripeData)
      : undefined

    const aiBriefingText = await generateAIBriefing({
      briefing,
      gmailData,
      calendarData,
      twilioData: twilioSummary,
      stripeData: stripeForBriefing,
    })

    if (aiBriefingText) {
      // Post the AI-generated briefing
      await sendRawMessage(aiBriefingText)
      console.log('[SCHEDULER] AI morning briefing sent.')
    } else {
      // Fall back to the structured briefing if AI is unavailable
      console.log('[SCHEDULER] AI unavailable — sending structured briefing.')
      await sendBriefing(briefing)
    }

    console.log('[SCHEDULER] Morning briefing complete.')
  } catch (err) {
    console.error('[SCHEDULER] Error in morning briefing:', err)
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function startScheduler(): void {
  console.log('[SCHEDULER] Starting cron jobs...')

  const timezone = process.env.TIMEZONE || 'America/Denver'

  // Every minute: wellness check-in dispatcher (fires within randomized window)
  cron.schedule('* * * * *', async () => {
    try { await runCheckinDispatcher() } catch (err) {
      console.error('[SCHEDULER] Error in check-in dispatcher:', err)
    }
  }, { timezone })
  console.log('[SCHEDULER] Scheduled: Check-in dispatcher every minute')

  // Every 15 minutes: silent health check
  cron.schedule('*/15 * * * *', runSilentHealthCheck, { timezone })
  console.log('[SCHEDULER] Scheduled: Silent health check every 15 minutes')

  // Every morning at specified hour: full briefing
  cron.schedule(`0 ${MORNING_BRIEFING_HOUR} * * *`, runMorningBriefing, { timezone })
  console.log(`[SCHEDULER] Scheduled: Morning briefing daily at ${MORNING_BRIEFING_HOUR}:00 (${timezone})`)
}

export { runSilentHealthCheck, runMorningBriefing }
