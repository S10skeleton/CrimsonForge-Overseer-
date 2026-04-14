/**
 * Elara — AI Agent
 * Full Anthropic agentic loop with modular prompts and persistent memory.
 */

import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt } from './prompts/index.js'
import type { AgentContext, MorningBriefing } from '../types/index.js'
import { allAgentTools } from '../tools/index.js'

let _client: Anthropic | null = null

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

// ─── Main agent runner ────────────────────────────────────────────────────

export async function runAgent(
  userMessage: string,
  recentBriefing?: MorningBriefing,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const client = getClient()
  if (!client) return `[Elara offline] Set ANTHROPIC_API_KEY to activate.`

  // Build system prompt fresh each call (loads runtime memory from Supabase)
  const systemPrompt = await buildSystemPrompt(recentBriefing)

  const tools: Anthropic.Tool[] = allAgentTools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool['input_schema'],
  }))

  const priorMessages: Anthropic.MessageParam[] = (history ?? []).map(m => ({
    role: m.role,
    content: m.content,
  }))

  const messages: Anthropic.MessageParam[] = [
    ...priorMessages,
    { role: 'user', content: userMessage },
  ]

  let iterations = 0
  const MAX_ITERATIONS = 10

  while (iterations < MAX_ITERATIONS) {
    iterations++

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    })

    if (response.stop_reason === 'end_turn') {
      return response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('\n')
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const tool = allAgentTools.find(t => t.name === block.name)
          if (tool) {
            try {
              const result = await tool.execute(block.input as Record<string, unknown>)
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
            } catch (err) {
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${err instanceof Error ? err.message : 'Unknown'}`, is_error: true })
            }
          } else {
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Tool "${block.name}" not found.`, is_error: true })
          }
        }
      }
      messages.push({ role: 'user', content: toolResults })
    } else {
      const textBlocks = response.content.filter(b => b.type === 'text')
      if (textBlocks.length > 0) return textBlocks.map(b => (b as Anthropic.TextBlock).text).join('\n')
      break
    }
  }

  return '[Elara] Could not complete the request. Try rephrasing.'
}

// ─── AI Morning Briefing ──────────────────────────────────────────────────

export async function generateAIBriefing(data: {
  briefing: MorningBriefing
  gmailData?: { unreadCount: number; messages: Array<{ from: string; subject: string; snippet: string }> }
  calendarData?: { todayEvents: Array<{ title: string; start: string; end: string; location?: string; attendees: string[] }> }
  twilioData?: { sent: number; delivered: number; failed: number; failureRate: number; thresholdBreached: boolean }
  stripeData?: { activeSubscriptions: number; mrr: number; newThisMonth: number; hasWebhookIssues: boolean; hasPaymentFailures: boolean; paymentFailures: Array<{ customerEmail: string; amount: number }> }
  resendData?: { sent: number; delivered: number; bounced: number; bounceRate: number; thresholdBreached: boolean; domain: { name: string; status: string } | null }
  netlifyData?: { status: string; latestDeployState: string | null; latestDeployAt: string | null; branch: string | null; errorMessage: string | null }
  feedbackData?: Array<{ type: string; message: string; status: string; submitter_name?: string; shop_name?: string; created_at: string }>
  fpData?: import('../types/index.js').ForgePilotBriefing
}): Promise<string | null> {
  const client = getClient()
  if (!client) return null

  const tz = process.env.TIMEZONE || 'America/Denver'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz })

  const calSummary = data.calendarData?.todayEvents?.length
    ? data.calendarData.todayEvents.map(e => {
        const time = e.start ? new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : 'All day'
        return `${time} — ${e.title}${e.location ? ` @ ${e.location}` : ''}${e.attendees.length ? ` (${e.attendees.slice(0, 3).join(', ')})` : ''}`
      }).join('\n')
    : 'Nothing on the calendar today.'

  const emailSummary = data.gmailData?.messages?.length
    ? data.gmailData.messages.slice(0, 5).map(m => `• From: ${m.from}\n  Subject: ${m.subject}\n  Preview: ${m.snippet.slice(0, 100)}`).join('\n')
    : 'No unread emails.'

  const twilioSummary = data.twilioData
    ? `${data.twilioData.sent} sent, ${data.twilioData.delivered} delivered, ${data.twilioData.failed} failed (${(data.twilioData.failureRate * 100).toFixed(1)}% failure rate)${data.twilioData.thresholdBreached ? ' ⚠️ THRESHOLD BREACHED' : ''}`
    : 'Twilio not configured.'

  const resendSummary = data.resendData
    ? `${data.resendData.sent} sent, ${data.resendData.delivered} delivered, ${data.resendData.bounced} bounced (${(data.resendData.bounceRate * 100).toFixed(1)}%)` +
      (data.resendData.thresholdBreached ? ' ⚠️ BOUNCE THRESHOLD BREACHED' : '') +
      (data.resendData.domain && data.resendData.domain.status !== 'verified' ? ` ⚠️ DOMAIN ${data.resendData.domain.status.toUpperCase()}` : '')
    : 'Resend not configured.'

  const netlifyStatus = data.netlifyData
    ? (() => {
        const d = data.netlifyData
        const deployedAt = d.latestDeployAt
          ? new Date(d.latestDeployAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz })
          : 'unknown'
        const state = d.latestDeployState ?? 'unknown'
        const statusFlag = d.status === 'down' ? ' ⚠️ DEPLOY FAILED' : d.status === 'degraded' ? ' ⏳ BUILDING' : ''
        return `${state} · deployed ${deployedAt}${d.branch ? ` (${d.branch})` : ''}${statusFlag}${d.errorMessage ? ` — ${d.errorMessage}` : ''}`
      })()
    : 'Netlify not configured.'

  const feedbackSummary = (() => {
    const items = data.feedbackData ?? []
    if (items.length === 0) return 'No new feedback.'

    const newItems = items.filter(f => f.status === 'new')
    if (newItems.length === 0) return `${items.length} feedback item(s) — all reviewed.`

    const lines = newItems.slice(0, 5).map(f => {
      const who  = [f.submitter_name, f.shop_name].filter(Boolean).join(' @ ')
      const type = f.type === 'bug' ? 'Bug' : f.type === 'suggestion' ? 'Idea' : f.type === 'praise' ? 'Praise' : 'General'
      return `• ${type}${who ? ` (${who})` : ''}: "${f.message.slice(0, 120)}${f.message.length > 120 ? '…' : ''}"`
    }).join('\n')

    return `${newItems.length} new item(s) awaiting review:\n${lines}${newItems.length > 5 ? `\n…and ${newItems.length - 5} more` : ''}`
  })()

  // ── ForgePilot summary ───────────────────────────────────────────────────
  const fpSummary = (() => {
    if (!data.fpData) return 'ForgePilot data unavailable.'

    const sb = data.fpData.supabase?.data
    const st = data.fpData.stripe?.data
    const up = data.fpData.uptime?.data

    const uptimeStr = up
      ? [
          `frontend: ${up.frontend.status}${up.frontend.responseMs ? ` (${up.frontend.responseMs}ms)` : ''}`,
          `api: ${up.api.status}${up.api.responseMs ? ` (${up.api.responseMs}ms)` : ''}`,
        ].join(' \u00B7 ')
      : 'uptime unknown'

    const sessionStr = sb
      ? [
          `${sb.sessionSummary.sessionsLast24h} sessions (24h)`,
          `${sb.sessionSummary.sessionsLast7d} sessions (7d)`,
          `${sb.sessionSummary.obdScansLast24h} OBD scans`,
          `${sb.sessionSummary.aiMessagesLast24h} AI messages`,
          `${sb.totalUsers} total users`,
        ].join(' \u00B7 ')
      : 'no session data'

    const stripeStr = st
      ? st.activeSubscriptions > 0
        ? `${st.activeSubscriptions} active subs \u00B7 $${st.mrr.toFixed(0)}/mo MRR \u00B7 solo: ${st.planBreakdown.solo} \u00B7 shop: ${st.planBreakdown.shop}` +
          (st.newThisMonth > 0 ? ` \u00B7 \uD83C\uDF89 ${st.newThisMonth} new this month` : '') +
          (st.hasPaymentFailures ? ` \u00B7 \u26A0\uFE0F ${st.paymentFailures.length} PAYMENT FAILURES` : '')
        : 'Pre-revenue \u2014 no active subscriptions yet'
      : 'Stripe data unavailable'

    const fpAlertStr = data.fpData.alerts?.length > 0
      ? data.fpData.alerts.map(a => `\uD83D\uDD34 ${a.message}`).join(' | ')
      : '\u2705 No alerts'

    return `Uptime: ${uptimeStr}\nUsage: ${sessionStr}\nRevenue: ${stripeStr}\nAlerts: ${fpAlertStr}`
  })()

  // ── CFP summary (condensed — flag issues only) ──────────────────────────
  const cfpIssues: string[] = []

  if (data.briefing.overallStatus === 'down') cfpIssues.push('\uD83D\uDD34 SERVICES DOWN')
  if ((data.briefing.sentry?.data?.newIssueCount ?? 0) > 0)
    cfpIssues.push(`${data.briefing.sentry!.data!.newIssueCount} new Sentry errors`)
  if (data.stripeData?.hasPaymentFailures)
    cfpIssues.push(`${data.stripeData.paymentFailures.length} payment failure(s): ${data.stripeData.paymentFailures.map(f => f.customerEmail).join(', ')}`)
  if (data.stripeData?.hasWebhookIssues) cfpIssues.push('Stripe webhook issue')
  if (data.resendData?.thresholdBreached)
    cfpIssues.push(`Email bounce rate ${(data.resendData.bounceRate * 100).toFixed(1)}% \u2014 above threshold`)
  if (data.twilioData?.thresholdBreached)
    cfpIssues.push(`SMS failure rate ${(data.twilioData.failureRate * 100).toFixed(1)}% \u2014 above threshold`)

  const silentShopCount = (data.briefing.supabase?.data?.silentShops ?? []).length
  if (silentShopCount > 0) cfpIssues.push(`${silentShopCount} shop(s) silent 3+ days`)

  const cfpStatus = cfpIssues.length > 0
    ? `Issues requiring attention:\n${cfpIssues.map(i => `\u2022 ${i}`).join('\n')}`
    : `Nominal \u2014 ${data.briefing.supabase?.data?.activeShopsLast24h ?? 0} active shops, ` +
      `${data.briefing.supabase?.data?.ticketsCreatedLast24h ?? 0} tickets (24h), ` +
      `${data.stripeData ? `$${data.stripeData.mrr.toFixed(0)} MRR` : 'billing OK'}`

  // Load the system prompt to get roadmap context
  const systemPrompt = await buildSystemPrompt(data.briefing)

  const prompt = `Today is ${today}.

\u2500\u2500\u2500 FORGEPILOT (primary focus) \u2500\u2500\u2500
${fpSummary}

\u2500\u2500\u2500 CRIMSONFORGE PRO (flag issues only) \u2500\u2500\u2500
${cfpStatus}

\u2500\u2500\u2500 CALENDAR \u2500\u2500\u2500
${calSummary}

\u2500\u2500\u2500 UNREAD EMAILS (${data.gmailData?.unreadCount ?? 0} total) \u2500\u2500\u2500
${emailSummary}

\u2500\u2500\u2500 COMMS HEALTH \u2500\u2500\u2500
SMS (Twilio): ${twilioSummary}
Email delivery (Resend): ${resendSummary}
Frontend deploy (Netlify): ${netlifyStatus}

\u2500\u2500\u2500 CFP FEEDBACK \u2500\u2500\u2500
${feedbackSummary}

Write the morning briefing for Slack in your voice as Elara. Structure:

1. **One-line status** \u2014 \uD83D\uDFE2/\uD83D\uDFE1/\uD83D\uDD34 based on the most critical thing right now

2. **ForgePilot** \u2014 Lead here. This is the priority product. Cover:
   - Uptime and API health
   - Session activity (any real usage? OBD scans? AI messages?)
   - Revenue status (pre-launch is fine, just say so clearly)
   - Any alerts. If everything is green, say so with energy \u2014 momentum matters.

3. **CrimsonForge Pro** \u2014 Keep this tight. If there are issues in the CFP section above, surface them clearly. If it says "Nominal", write ONE line max: "CFP nominal \u2014 X shops active." Then move on.

4. **Schedule** \u2014 Clean, time-ordered. Skip if empty.

5. **Email** \u2014 Flag anything needing a response today. Skip boilerplate.

6. **TODAY'S FOCUS** \u2014 3 specific, concrete tasks. Bias toward ForgePilot unless CFP has active fires. Not categories \u2014 real work. "Ship VIN scanner to TestFlight" not "work on mobile."

7. **Health check** \u2014 One line. Supplements? Workout?

Your voice. Direct. Warm. ForgePilot-first. No filler.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('\n')
    return text || null
  } catch (err) {
    console.error('[ELARA] Error generating briefing:', err)
    return null
  }
}

// ─── Context builder (legacy compat) ─────────────────────────────────────

export function buildContext(briefing?: MorningBriefing): AgentContext {
  return {
    systemPrompt: '(loaded async via buildSystemPrompt)',
    availableTools: allAgentTools,
    recentBriefing: briefing,
  }
}
