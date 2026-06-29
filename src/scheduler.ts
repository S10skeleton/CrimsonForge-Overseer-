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
import { runInsightAnalysis } from './jobs/fp-insights.js'
import { runForgePilotSupabaseCheck } from './tools/supabase-forgepilot.js'
import { runForgePilotStripeCheck }   from './tools/stripe-forgepilot.js'
import { runForgePilotUptimeCheck }   from './tools/uptime-forgepilot.js'
import type { MorningBriefing, Alert, ForgePilotBriefing } from './types/index.js'
import { evaluateEndpointAlert } from './lib/alert-state.js'
import { getBriefingConfig } from './lib/elaraConfig.js'

// ─── Configuration ────────────────────────────────────────────────────────

const FP_INSIGHTS_HOUR = Number(process.env.FP_INSIGHTS_HOUR || '5')

// Handle to the morning-briefing cron task so it can be live-rescheduled when
// the time/timezone is changed from the Elara Controls panel.
let briefingTask: cron.ScheduledTask | null = null

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

    const alerts: Alert[] = []

    // Evaluate each uptime endpoint independently — the evaluator handles
    // dedup, escalation, recovery, and safety re-alerts internally.
    if (uptimeResult.success && Array.isArray(uptimeResult.data)) {
      for (const ep of uptimeResult.data) {
        const decision = evaluateEndpointAlert({
          key: ep.url,
          status: ep.status,
          responseMs: ep.responseMs,
          label: ep.url,
          toolName: 'uptime',
        })
        if (decision) alerts.push(decision)
      }
    }

    // Railway deployment — synthetic key, status normalized to healthy/down
    if (railwayResult.success) {
      const railwayStatus = railwayResult.data.status === 'down' ? 'down' : 'healthy'
      const decision = evaluateEndpointAlert({
        key: 'railway:deployment',
        status: railwayStatus,
        label: 'Railway deployment',
        toolName: 'railway',
        actionUrl: 'https://railway.app/project/' + process.env.CF_PROJECT_ID,
      })
      if (decision) alerts.push(decision)
    }

    if (alerts.length === 0) {
      console.log('[SCHEDULER] Silent health check passed. No alerts needed.')
    } else {
      for (const alert of alerts) {
        await sendAlert(alert)
        // P0 = critical severity — also SMS Clutch directly
        // 'info' (recovery) never SMSes; 'warning' never SMSes.
        if (alert.severity === 'critical') {
          await sendSMSAlert(`${alert.message}${alert.details ? ` — ${alert.details}` : ''}`)
        }
      }
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
        for (const [name, ep] of [
          ['Frontend', fpUptime.data.frontend] as const,
          ['API',      fpUptime.data.api]      as const,
        ]) {
          const decision = evaluateEndpointAlert({
            key: `fp:${name.toLowerCase()}`,
            status: ep.status,
            responseMs: ep.responseMs,
            label: `ForgePilot ${name}`,
            toolName: 'fp_uptime',
          })
          if (decision) {
            await sendAlertToChannel(fpChannelId, decision)
          }
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

    // ForgePulse waitlist — alert on new signups
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient: createCFP } = await import('@supabase/supabase-js')
        const cfpSb = createCFP(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )
        const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
        const { data: newSignups } = await cfpSb
          .from('forgepulse_waitlist')
          .select('email, source')
          .gte('created_at', since)

        for (const signup of newSignups ?? []) {
          await sendAlert({
            severity: 'info',
            tool: 'forgepulse',
            message: `\uD83D\uDE80 ForgePulse waitlist signup: ${signup.email}`,
            details: signup.source ? `Source: ${signup.source}` : undefined,
          })
        }
      }
    } catch (err) {
      console.error('[scheduler] ForgePulse waitlist check error:', err)
    }

  } catch (err) {
    console.error('[SCHEDULER] Error in silent health check:', err)
  }
}

// ─── Morning Briefing Job ─────────────────────────────────────────────────

async function runMorningBriefing(opts: { preview?: boolean } = {}): Promise<string> {
  const preview = opts.preview === true
  console.log(`[SCHEDULER] ${preview ? 'Building briefing preview' : 'Running morning briefing'}...`)

  // Effective briefing config (env defaults overlaid with any saved overrides).
  const cfg = await getBriefingConfig()

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

    // Store for the Slack bot's context (skip on preview — don't mutate state)
    if (!preview) setLastBriefing(briefing)

    // Section gating — a section turned off in Elara Controls is omitted from
    // the briefing. Default config has every section on, so behavior is
    // unchanged until the founder toggles one.
    const sec = cfg.sections

    // Try AI-enhanced briefing first
    const gmailData = sec.gmail && gmailResult.success ? (gmailResult.data as { unreadCount: number; messages: Array<{ from: string; subject: string; snippet: string }> }) : undefined
    const calendarData = sec.calendar && calendarResult.success ? (calendarResult.data as { todayEvents: Array<{ title: string; start: string; end: string; location?: string; attendees: string[] }> }) : undefined

    const twilioSummary = twilioResult.success
      ? (twilioResult.data as { sent: number; delivered: number; failed: number; failureRate: number; thresholdBreached: boolean })
      : undefined

    const stripeForBriefing = sec.stripe && stripeResult.success
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
    if (!sec.feedback) feedbackForBriefing = []

    // AI summary honors the toggle; when off (or unavailable) we use the
    // structured briefing instead.
    const aiBriefingText = cfg.aiSummaryEnabled
      ? await generateAIBriefing({
          briefing,
          gmailData,
          calendarData,
          twilioData: twilioSummary,
          stripeData: stripeForBriefing,
          resendData: resendForBriefing,
          netlifyData: netlifyForBriefing,
          feedbackData: feedbackForBriefing,
          fpData: sec.forgepilot ? (fpBriefing ?? undefined) : undefined,
        })
      : null

    let outText: string

    if (aiBriefingText) {
      outText = aiBriefingText
      if (!preview) {
        await sendRawMessage(aiBriefingText)
        await storeBriefing(aiBriefingText)
        console.log('[SCHEDULER] AI morning briefing sent.')
      }
    } else {
      // Structured briefing (AI off or unavailable)
      const statusEmoji = overallStatus === 'down' ? '🔴' : overallStatus === 'degraded' ? '🟡' : '🟢'
      outText = `${statusEmoji} Status: ${overallStatus}\n` +
        (alerts.length ? alerts.map((a) => `• ${a.message}`).join('\n') : 'No alerts.')
      if (!preview) {
        console.log('[SCHEDULER] AI unavailable/off — sending structured briefing.')
        await sendBriefing(briefing)
        await storeBriefing(`[Structured briefing] Status: ${briefing.overallStatus} — ${briefing.timestamp}`)
      }
    }

    if (!preview) console.log('[SCHEDULER] Morning briefing complete.')
    return outText
  } catch (err) {
    console.error('[SCHEDULER] Error in morning briefing:', err)
    return preview ? `Preview failed: ${err instanceof Error ? err.message : 'unknown error'}` : ''
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

// Schedule (or re-schedule) the morning briefing from current config.
async function scheduleMorningBriefing(fallbackTz: string): Promise<void> {
  const cfg = await getBriefingConfig()
  const tz = cfg.timezone || fallbackTz
  if (briefingTask) {
    briefingTask.stop()
    briefingTask = null
  }
  briefingTask = cron.schedule(`0 ${cfg.timeHour} * * *`, () => {
    runMorningBriefing().catch((err) => console.error('[SCHEDULER] briefing error:', err))
  }, { timezone: tz })
  console.log(`[SCHEDULER] Scheduled: Morning briefing daily at ${cfg.timeHour}:00 (${tz})`)
}

/** Re-read briefing config and reschedule the cron — called after a config save. */
export async function rescheduleMorningBriefing(): Promise<void> {
  await scheduleMorningBriefing(process.env.TIMEZONE || 'America/Denver')
}

export async function startScheduler(): Promise<void> {
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

  // Every morning: full briefing — time/timezone come from Elara Controls config
  await scheduleMorningBriefing(timezone)

  cron.schedule(`0 ${FP_INSIGHTS_HOUR} * * *`, async () => {
    console.log(`[SCHEDULER] Running ForgeAssist insight analysis at ${FP_INSIGHTS_HOUR}:00 (${timezone})`)
    try {
      await runInsightAnalysis()
    } catch (err) {
      console.error('[SCHEDULER] Insight analysis failed:', err)
    }
  }, { timezone })
  console.log(`[SCHEDULER] Scheduled: ForgeAssist insight analysis daily at ${FP_INSIGHTS_HOUR}:00 (${timezone})`)
}

export { runSilentHealthCheck, runMorningBriefing }
