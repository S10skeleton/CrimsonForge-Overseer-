/**
 * Scheduler
 * Defines cron jobs for health checks and briefings
 */

import cron from 'node-cron'
import { monitors } from './tools/index.js'
import { sendBriefing, sendAlert } from './notifications/slack.js'
import type { MorningBriefing, Alert } from './types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const MORNING_BRIEFING_HOUR = Number(process.env.MORNING_BRIEFING_HOUR || '8')

// ─── Health Check Job (every 15 minutes) ──────────────────────────────────

async function runSilentHealthCheck(): Promise<void> {
  console.log('[SCHEDULER] Running silent health check...')

  try {
    // Run just uptime and railway checks (fastest tests)
    const uptimeResult = await monitors.uptime()
    const railwayResult = await monitors.railway()

    // Check if any are down
    const isUptimeDown =
      uptimeResult.success &&
      Array.isArray(uptimeResult.data) &&
      uptimeResult.data.some((e) => e.status === 'down')

    const isRailwayDown =
      railwayResult.success && railwayResult.data.status === 'down'

    if (isUptimeDown || isRailwayDown) {
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

      if (isRailwayDown) {
        alerts.push({
          severity: 'critical',
          tool: 'railway',
          message: 'Railway deployment is DOWN',
          actionUrl: 'https://railway.app/project/' + process.env.RAILWAY_PROJECT_ID,
        })
      }

      for (const alert of alerts) {
        await sendAlert(alert)
      }
    } else {
      console.log('[SCHEDULER] Silent health check passed. No alerts needed.')
    }
  } catch (err) {
    console.error('[SCHEDULER] Error in silent health check:', err)
  }
}

// ─── Morning Briefing Job (8 AM daily) ────────────────────────────────────

async function runMorningBriefing(): Promise<void> {
  console.log('[SCHEDULER] Running morning briefing...')

  try {
    // Run all monitors in parallel
    const [uptime, supabase, sentry, railway, email] = await Promise.allSettled([
      monitors.uptime(),
      monitors.supabase(),
      monitors.sentry(),
      monitors.railway(),
      monitors.email(),
    ])

    // Extract results, handling rejections
    function getResult<T>(
      result: PromiseSettledResult<T>
    ): T & { success: boolean; error?: string } {
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

    // Determine overall status
    const statuses = [
      (uptimeResult as { data?: Array<{ status: string }> }).data?.every((e: { status: string }) => e.status === 'healthy') ? 'healthy' : 'degraded',
      (supabaseResult as { data?: { connectionStatus: string } }).data?.connectionStatus || 'unknown',
      (railwayResult as { data?: { status: string } }).data?.status || 'unknown',
    ].filter((s) => s !== 'unknown')

    const hasDown = statuses.includes('down')
    const hasDegraded = statuses.includes('degraded')
    const overallStatus = hasDown ? 'down' : hasDegraded ? 'degraded' : 'healthy'

    // Build alerts
    const alerts: Alert[] = []

    // Check Sentry for new critical issues
    if (
      (sentryResult as { data?: { newIssueCount: number } }).data?.newIssueCount ?? 0 > 0
    ) {
      alerts.push({
        severity: 'warning',
        tool: 'sentry',
        message: `${(sentryResult as { data?: { newIssueCount: number } }).data?.newIssueCount} new error issues detected`,
        actionUrl: `https://sentry.io/organizations/${process.env.SENTRY_ORG}/issues/`,
      })
    }

    // Check for silent shops
    const silentShops = (supabaseResult as { data?: { silentShops: Array<{ daysSilent: number }> } }).data?.silentShops ?? []
    if (silentShops.length > 0) {
      alerts.push({
        severity: 'info',
        tool: 'supabase',
        message: `${silentShops.length} shops inactive for 3+ days`,
      })
    }

    // Build full briefing
    const briefing: MorningBriefing = {
      timestamp: new Date().toISOString(),
      overallStatus,
      uptime: uptimeResult,
      supabase: supabaseResult,
      sentry: sentryResult,
      railway: railwayResult,
      email: emailResult,
      alerts,
    }

    // Send to Slack
    await sendBriefing(briefing)

    // Log full results
    console.log('[SCHEDULER] Morning briefing sent. Summary:')
    console.log(JSON.stringify(briefing, null, 2))
  } catch (err) {
    console.error('[SCHEDULER] Error in morning briefing:', err)
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function startScheduler(): void {
  console.log('[SCHEDULER] Starting cron jobs...')

  // Every 15 minutes: silent health check
  cron.schedule('*/15 * * * *', runSilentHealthCheck)
  console.log('[SCHEDULER] Scheduled: Silent health check every 15 minutes')

  // Every morning at specified hour: full briefing
  const cronExpression = `0 ${MORNING_BRIEFING_HOUR} * * *`
  cron.schedule(cronExpression, runMorningBriefing)
  console.log(`[SCHEDULER] Scheduled: Morning briefing daily at ${MORNING_BRIEFING_HOUR}:00`)
}

// Export functions for manual testing
export { runSilentHealthCheck, runMorningBriefing }
