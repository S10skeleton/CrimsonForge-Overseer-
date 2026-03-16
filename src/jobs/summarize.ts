/**
 * Conversation auto-summarization job
 * Runs after conversations go quiet for 30 minutes.
 * Extracts key facts and writes them to agent_memory automatically.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface ThreadSummaryState {
  lastMessageAt: number
  messageCount: number
  summarized: boolean
}

// ─── In-memory tracker ────────────────────────────────────────────────────

const threadActivity = new Map<string, ThreadSummaryState>()

const IDLE_THRESHOLD_MS = 30 * 60 * 1000  // 30 minutes
const MIN_MESSAGES = 6                     // minimum messages to summarize

// ─── Clients ──────────────────────────────────────────────────────────────

let _supabase: ReturnType<typeof createClient> | null = null
let _anthropic: Anthropic | null = null

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.ELARA_SUPABASE_URL!,
      process.env.ELARA_SUPABASE_KEY!
    )
  }
  return _supabase
}

function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// ─── Activity tracker (called from slack-bot.ts) ──────────────────────────

export function recordThreadActivity(threadKey: string): void {
  const existing = threadActivity.get(threadKey)
  threadActivity.set(threadKey, {
    lastMessageAt: Date.now(),
    messageCount: (existing?.messageCount ?? 0) + 1,
    summarized: existing?.summarized ?? false,
  })
}

export function markThreadSummarized(threadKey: string): void {
  const existing = threadActivity.get(threadKey)
  if (existing) {
    threadActivity.set(threadKey, { ...existing, summarized: true })
  }
}

// ─── Summarization ────────────────────────────────────────────────────────

async function getRecentConversation(threadKey: string): Promise<ConversationMessage[]> {
  try {
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any)
      .from('slack_conversations')
      .select('role, content, created_at')
      .eq('thread_key', threadKey)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error || !data) return []
    return data as ConversationMessage[]
  } catch {
    return []
  }
}

async function summarizeConversation(
  threadKey: string,
  messages: ConversationMessage[]
): Promise<void> {
  const anthropic = getAnthropic()
  if (!anthropic) return

  console.log(`[SUMMARIZE] Summarizing thread ${threadKey} (${messages.length} messages)`)

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'Clutch' : 'Elara'}: ${m.content}`)
    .join('\n\n')

  const prompt = `You are reviewing a conversation between Clutch (founder of CrimsonForgePro)
and Elara (his AI ops assistant). Extract only the facts, decisions, and observations
worth persisting to long-term memory.

CONVERSATION:
${conversationText}

Extract items in this exact JSON format. Only include items genuinely worth remembering
across future sessions. Skip pleasantries, routine questions, and transient states.

Return a JSON array (may be empty if nothing worth remembering):
[
  {
    "key": "short_identifier_snake_case",
    "value": "the fact or observation to store",
    "category": "one of: preference, work_pattern, health, decision, stakeholder, project_decision, observation"
  }
]

Categories:
- preference: how Clutch likes things done
- work_pattern: when/how he works best
- health: supplement/routine/health changes
- decision: a concrete decision that was made
- stakeholder: something learned about Wayne, Steve, Sam, or others
- project_decision: a CFP product/technical decision
- observation: a notable pattern or insight

Return ONLY the JSON array, no other text.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim()

    let items: Array<{ key: string; value: string; category: string }> = []
    try {
      const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
      items = JSON.parse(cleaned)
      if (!Array.isArray(items)) items = []
    } catch {
      console.log(`[SUMMARIZE] Could not parse summary JSON for thread ${threadKey}`)
      markThreadSummarized(threadKey)
      return
    }

    if (items.length === 0) {
      console.log(`[SUMMARIZE] No memorable facts extracted from thread ${threadKey}`)
      markThreadSummarized(threadKey)
      return
    }

    const supabase = getSupabase()
    let written = 0

    for (const item of items) {
      if (!item.key || !item.value || !item.category) continue
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('agent_memory')
          .upsert(
            {
              key: item.key,
              value: item.value,
              category: item.category,
              last_used: new Date().toISOString(),
              learned_at: new Date().toISOString(),
            },
            { onConflict: 'key' }
          )
        if (!error) written++
      } catch { /* skip individual failures */ }
    }

    console.log(`[SUMMARIZE] Wrote ${written}/${items.length} facts from thread ${threadKey}`)
    markThreadSummarized(threadKey)
  } catch (err) {
    console.error(`[SUMMARIZE] Error summarizing thread ${threadKey}:`, err)
  }
}

// ─── Dispatcher (called every minute by scheduler) ────────────────────────

export async function runSummarizationDispatcher(): Promise<void> {
  if (!process.env.ELARA_SUPABASE_URL || !process.env.ELARA_SUPABASE_KEY) return
  if (!process.env.ANTHROPIC_API_KEY) return

  const now = Date.now()

  for (const [threadKey, state] of threadActivity.entries()) {
    if (state.summarized) continue
    if (state.messageCount < MIN_MESSAGES) continue
    if (now - state.lastMessageAt < IDLE_THRESHOLD_MS) continue

    try {
      const messages = await getRecentConversation(threadKey)
      if (messages.length >= MIN_MESSAGES) {
        await summarizeConversation(threadKey, messages)
      } else {
        markThreadSummarized(threadKey)
      }
    } catch (err) {
      console.error(`[SUMMARIZE] Dispatcher error for thread ${threadKey}:`, err)
      markThreadSummarized(threadKey)
    }
  }
}
