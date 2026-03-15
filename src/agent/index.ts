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
}): Promise<string | null> {
  const client = getClient()
  if (!client) return null

  const tz = process.env.TIMEZONE || 'America/Denver'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz })

  const infraSummary = {
    overallStatus: data.briefing.overallStatus,
    activeShops: data.briefing.supabase?.data?.activeShopsLast24h ?? 'N/A',
    ticketsCreated: data.briefing.supabase?.data?.ticketsCreatedLast24h ?? 'N/A',
    aiSessions: data.briefing.supabase?.data?.aiSessionsLast24h ?? 'N/A',
    newErrors: data.briefing.sentry?.data?.newIssueCount ?? 0,
    alerts: data.briefing.alerts,
  }

  const calSummary = data.calendarData?.todayEvents?.length
    ? data.calendarData.todayEvents.map(e => {
        const time = e.start ? new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : 'All day'
        return `${time} — ${e.title}${e.location ? ` @ ${e.location}` : ''}${e.attendees.length ? ` (${e.attendees.slice(0, 3).join(', ')})` : ''}`
      }).join('\n')
    : 'Nothing on the calendar today.'

  const emailSummary = data.gmailData?.messages?.length
    ? data.gmailData.messages.slice(0, 5).map(m => `• From: ${m.from}\n  Subject: ${m.subject}\n  Preview: ${m.snippet.slice(0, 100)}`).join('\n')
    : 'No unread emails.'

  // Load the system prompt to get roadmap context
  const systemPrompt = await buildSystemPrompt(data.briefing)

  const prompt = `Today is ${today}.

INFRASTRUCTURE: ${JSON.stringify(infraSummary, null, 2)}

CALENDAR:
${calSummary}

UNREAD EMAILS (${data.gmailData?.unreadCount ?? 0} total):
${emailSummary}

Write the morning briefing for Slack in your voice as Elara. Include:
1. One-line status (\uD83D\uDFE2/\uD83D\uDFE1/\uD83D\uDD34)
2. Infrastructure highlights — only flag real issues, skip "all systems nominal" boilerplate
3. Schedule — clean, time-ordered
4. Email highlights — flag anything needing a response today
5. *TODAY'S FOCUS* — 3 specific, concrete goals for today based on the current roadmap phase.
   Not categories. Real tasks. "Finish VIN scanner component and test on Apocalypse Auto VINs" not "work on mobile."
6. Health check — one line. Did you take morning supplements? Workout planned?

Your voice. Direct. Warm. No preamble. No filler.`

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
