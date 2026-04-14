/**
 * Scheduler
 * Defines cron jobs for health checks and briefings
 */

import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'
import { monitors } from './tools/index.js'
import { checkForNewSubscribers } from './tools/stripe.js'
import { sendBriefing, sendAlert, sendAlertToChannel, sendRawMessage, sendSMSAlert } from './notifications/slack.js'
import { generateAIBriefing } from './agent/index.js'
import { setLastBriefing } from './slack-bot.js'
import { runCheckinDispatcher } from './jobs/checkins.js'
import { runSummarizationDispatcher } from './jobs/summarize.js'
import { runForgePilotSupabaseCheck } from './tools/supabase-forgepilot.js'
import { runForgePilotStripeCheck }   from './tools/stripe-forgepilot.js'
import { runForgePilotUptimeCheck }   from './tools/uptime-forgepilot.js'
import type { MorningBriefing, Alert, ForgePilotBriefing } from './types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const MORNING_BRIEFING_HOUR = Number(process.env.MORNING_BRIEFING_HOUR || '8')

// ─── Briefing Storage ─────────────────────────────────────────────────────

async function storeBriefing(content: string): Promise<void> {
  try {
    const url = process.env.ELARA_SUPABASE_URL
    const key = process.env.ELARA_SUPABASE_KEY
    if (!url || !key) return

    const sb = createClient(url, key)

    let status = 'green'
    if (content.includes('🔴') || content.toLowerCase().includes('critical') || content.toLowerCase().includes('down')) {
      status = 'red'
    } else if (content.includes('🟡') || content.toLowerCase().includes('degraded') || content.toLowerCase().includes('warning')) {
      status = 'yellow'
    }

    const lines = content.split('\n').filter(l => l.trim())
    const summaryLine = lines[0]?.replace(/[🟢🟡🔴]/g, '').trim() ?? ''

    await sb.from('agent_briefings').insert({
      content,
      status,
      summary_line: summaryLine.slice(0, 200),
      briefing_date: new Date().toISOString().split('T')[0],
    })
  } catch (err) {
    console.error('[briefing-store] Failed to save briefing:', err)
  }
}

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

    // ── New shop onboarding detection ─────────────────────────────────────
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )

        // Demo/excluded shops — comma separated in env var
        const excludedShops = (process.env.EXCLUDED_SHOP_NAMES ?? 'Riverside Auto Service')
          .split(',').map(s => s.trim().toLowerCase())

        // Shops created in the last 15 minutes (new signup alert)
        const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
        const { data: newShops } = await supabase
          .from('shops')
          .select('id, name, created_at')
          .gte('created_at', since)

        for (const shop of (newShops || [])) {
          if (excludedShops.includes(shop.name.toLowerCase())) continue
          await sendAlert({
            severity: 'info',
            tool: 'supabase',
            message: `🏪 New shop onboarded: ${shop.name}`,
            details: `Signed up just now — watch for first ticket in next 24h`,
          })
        }

        // Shops in first 7 days with no tickets after 24h
        // Only alert ONCE per shop — check if we alerted in the last 23 hours
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const almostDayAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()

        const { data: newSilentShops } = await supabase
          .from('shops')
          .select('id, name, created_at')
          .gte('created_at', weekAgo)

        for (const shop of (newSilentShops || [])) {
          // Skip demo/excluded shops
          if (excludedShops.includes(shop.name.toLowerCase())) continue

          const daysSinceSignup = Math.floor(
            (Date.now() - new Date(shop.created_at).getTime()) / (1000 * 60 * 60 * 24)
          )

          // Only alert after at least 1 full day
          if (daysSinceSignup < 1) continue

          // Check ticket count (all time, not just last 24h)
          const { count } = await supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shop.id)

          if ((count ?? 0) > 0) continue // has tickets, skip

          // Check if we already sent this alert in the last 23h using agent_session_flags as dedup store
          const flagKey = `onboarding_alert_${shop.id}`
          const elaraSupabase = process.env.ELARA_SUPABASE_URL && process.env.ELARA_SUPABASE_KEY
            ? createClient(process.env.ELARA_SUPABASE_URL, process.env.ELARA_SUPABASE_KEY)
            : null

          if (elaraSupabase) {
            const { data: existingFlag } = await elaraSupabase
              .from('agent_session_flags')
              .select('created_at')
              .eq('flag', flagKey)
              .eq('active', true)
              .gte('created_at', almostDayAgo)
              .single()

            if (existingFlag) continue // already alerted today

            await sendAlert({
              severity: 'warning',
              tool: 'supabase',
              message: `⚠️ New shop silent: ${shop.name}`,
              details: `Day ${daysSinceSignup + 1} onboarding — 0 tickets ever. May need a check-in.`,
            })

            await elaraSupabase
              .from('agent_session_flags')
              .insert({ flag: flagKey })

            console.log(`[SCHEDULER] New shop silent alert: ${shop.name} (day ${daysSinceSignup + 1})`)
          }
        }
      }
    } catch (err) {
      console.error('[SCHEDULER] Error in new shop onboarding check:', err)
    }

    // ForgePilot health
    try {
      const fpChannelId = process.env.FP_SLACK_CHANNEL_ID

      const fpUptime = await runForgePilotUptimeCheck()
      if (fpUptime.success) {
        const fpDown = [fpUptime.data.frontend, fpUptime.data.api].filter(u => u.status === 'down')
        if (fpDown.length > 0) {
          await sendAlertToChannel(fpChannelId, {
            severity: 'critical',
            tool: 'fp_uptime',
            message: `ForgePilot service DOWN: ${fpDown.map(u => u.url).join(', ')}`,
          })
        }
      }

      const fpStripe = await runForgePilotStripeCheck()
      if (fpStripe.success && fpStripe.data.hasPaymentFailures) {
        await sendAlertToChannel(fpChannelId, {
          severity: 'warning',
          tool: 'fp_stripe',
          message: `ForgePilot: ${fpStripe.data.paymentFailures.length} payment failure(s) detected.`,
          details: fpStripe.data.paymentFailures
            .map(f => `${f.customerEmail} — $${f.amount}`)
            .join('\n'),
        })
      }
    } catch (err) {
      console.error('[scheduler] FP health check error:', err)
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
    const [uptime, supabase, sentry, railway, email, gmail, calendar, twilio, stripe, resend, netlify] =
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
        monitors.resend(),
        monitors.netlify(),
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
    const resendResult = getResult(resend)
    const netlifyResult = getResult(netlify)

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

    // Resend alerts
    const resendData = resendResult.success
      ? (resendResult.data as {
          thresholdBreached: boolean
          bounceRate: number
          bounced: number
          sent: number
          domain: { name: string; status: string } | null
        })
      : null

    if (resendData?.thresholdBreached) {
      alerts.push({
        severity: 'warning',
        tool: 'resend',
        message: `Email bounce rate ${(resendData.bounceRate * 100).toFixed(1)}% exceeds 3% threshold (${resendData.bounced}/${resendData.sent} emails bounced)`,
        actionUrl: 'https://resend.com/emails',
      })
    }

    if (resendData?.domain && resendData.domain.status !== 'verified') {
      alerts.push({
        severity: 'critical',
        tool: 'resend',
        message: `Sending domain ${resendData.domain.name} is ${resendData.domain.status} — emails may not deliver`,
        actionUrl: 'https://resend.com/domains',
      })
    }

    // ForgePilot briefing section
    let fpBriefing: ForgePilotBriefing | null = null
    try {
      const [fpSupabase, fpStripe, fpUptime] = await Promise.all([
        runForgePilotSupabaseCheck(),
        runForgePilotStripeCheck(),
        runForgePilotUptimeCheck(),
      ])

      const fpAlerts: Alert[] = []
      if (!fpUptime.success || fpUptime.data.frontend.status === 'down' || fpUptime.data.api.status === 'down') {
        fpAlerts.push({ severity: 'critical', tool: 'fp_uptime', message: 'ForgePilot service DOWN' })
      }
      if (fpStripe.data?.hasPaymentFailures) {
        fpAlerts.push({ severity: 'warning', tool: 'fp_stripe', message: `${fpStripe.data.paymentFailures.length} FP payment failure(s)` })
      }

      fpBriefing = { supabase: fpSupabase, stripe: fpStripe, uptime: fpUptime, alerts: fpAlerts }
    } catch (err) {
      console.error('[scheduler] FP morning briefing error:', err)
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
      netlify: netlifyResult,
      forgePilot: fpBriefing ?? undefined,
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

    const resendForBriefing = resendResult.success
      ? (resendResult.data as {
          sent: number
          delivered: number
          bounced: number
          bounceRate: number
          thresholdBreached: boolean
          domain: { name: string; status: string } | null
        })
      : undefined

    const netlifyForBriefing = netlifyResult.success
      ? (netlifyResult.data as import('./types/index.js').NetlifyData)
      : undefined

    // Fetch recent feedback (new items only, last 30 days)
    let feedbackForBriefing: Array<{
      type: string; message: string; status: string;
      submitter_name?: string; shop_name?: string; created_at: string
    }> = []

    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const { data: feedbackRows } = await sb
          .from('feedback')
          .select('type, message, status, submitter_name, shop_name, created_at')
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(20)
        feedbackForBriefing = feedbackRows ?? []
      }
    } catch (err) {
      console.error('[SCHEDULER] Error fetching feedback for briefing:', err)
    }

    const aiBriefingText = await generateAIBriefing({
      briefing,
      gmailData,
      calendarData,
      twilioData: twilioSummary,
      stripeData: stripeForBriefing,
      resendData: resendForBriefing,
      netlifyData: netlifyForBriefing,
      feedbackData: feedbackForBriefing,
      fpData: fpBriefing ?? undefined,
    })

    if (aiBriefingText) {
      // Post the AI-generated briefing
      await sendRawMessage(aiBriefingText)
      await storeBriefing(aiBriefingText)
      console.log('[SCHEDULER] AI morning briefing sent.')
    } else {
      // Fall back to the structured briefing if AI is unavailable
      console.log('[SCHEDULER] AI unavailable — sending structured briefing.')
      await sendBriefing(briefing)
      await storeBriefing(`[Structured briefing] Status: ${briefing.overallStatus} — ${briefing.timestamp}`)
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
    try { await runSummarizationDispatcher() } catch (err) {
      console.error('[SCHEDULER] Error in summarization dispatcher:', err)
    }
  }, { timezone })
  console.log('[SCHEDULER] Scheduled: Check-in dispatcher + summarization every minute')

  // Every 15 minutes: silent health check
  cron.schedule('*/15 * * * *', runSilentHealthCheck, { timezone })
  console.log('[SCHEDULER] Scheduled: Silent health check every 15 minutes')

  // Every morning at specified hour: full briefing
  cron.schedule(`0 ${MORNING_BRIEFING_HOUR} * * *`, runMorningBriefing, { timezone })
  console.log(`[SCHEDULER] Scheduled: Morning briefing daily at ${MORNING_BRIEFING_HOUR}:00 (${timezone})`)
}

export { runSilentHealthCheck, runMorningBriefing }
