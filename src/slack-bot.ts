/**
 * Slack Socket Mode Bot
 * Enables two-way conversation — listens for messages and routes to AI agent
 */

import pkg from '@slack/bolt'
const { App, LogLevel } = pkg
import { createClient } from '@supabase/supabase-js'
import { runAgent } from './agent/index.js'
import type { MorningBriefing } from './types/index.js'

// ─── Supabase client for conversation persistence ─────────────────────────

let _convSupabase: ReturnType<typeof createClient> | null = null

function getConvSupabase() {
  const url = process.env.ELARA_SUPABASE_URL
  const key = process.env.ELARA_SUPABASE_KEY
  if (!url || !key) return null
  if (!_convSupabase) _convSupabase = createClient(url, key)
  return _convSupabase
}

async function persistMessage(threadKey: string, role: 'user' | 'assistant', content: string): Promise<void> {
  try {
    const db = getConvSupabase()
    if (!db) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('slack_conversations').insert({ thread_key: threadKey, role, content })
  } catch {
    // Non-critical — never let persistence errors affect the bot
  }
}

async function loadRecentConversations(): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  try {
    const db = getConvSupabase()
    if (!db) return []

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('slack_conversations')
      .select('role, content, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error || !data) return []
    return (data as Array<{ role: string; content: string }>).map(row => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }))
  } catch {
    return []
  }
}

// ─── Conversation History ─────────────────────────────────────────────────

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// Keyed by thread_ts (or message ts for top-level DMs)
const conversationHistory = new Map<string, ConversationMessage[]>()
const conversationLastSeen = new Map<string, number>()

// Max messages to keep per thread (older messages pruned)
const MAX_HISTORY = 20

// Max number of threads to hold in memory at once
const MAX_THREADS = 200

// Threads not seen for this many ms are eligible for eviction (24 hours)
const THREAD_TTL_MS = 24 * 60 * 60 * 1000

function getHistory(threadKey: string): ConversationMessage[] {
  return conversationHistory.get(threadKey) ?? []
}

function appendHistory(threadKey: string, role: 'user' | 'assistant', content: string): void {
  const history = getHistory(threadKey)
  history.push({ role, content })
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY)
  }
  conversationHistory.set(threadKey, history)
  conversationLastSeen.set(threadKey, Date.now())

  // Evict stale threads if we're over the thread cap
  if (conversationHistory.size > MAX_THREADS) {
    const now = Date.now()
    for (const [key, lastSeen] of conversationLastSeen.entries()) {
      if (now - lastSeen > THREAD_TTL_MS) {
        conversationHistory.delete(key)
        conversationLastSeen.delete(key)
      }
    }
    // If still over cap after TTL eviction, evict oldest threads
    if (conversationHistory.size > MAX_THREADS) {
      const sorted = [...conversationLastSeen.entries()].sort((a, b) => a[1] - b[1])
      const toEvict = sorted.slice(0, conversationHistory.size - MAX_THREADS)
      for (const [key] of toEvict) {
        conversationHistory.delete(key)
        conversationLastSeen.delete(key)
      }
    }
  }
}

// ─── Rate Limiting ────────────────────────────────────────────────────────
// Prevent rapid-fire messages from spamming the Anthropic API.
// One active request per thread at a time.

const activeRequests = new Set<string>()

// ─── State ────────────────────────────────────────────────────────────────

let lastBriefing: MorningBriefing | undefined = undefined
let recentConversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []

export function setLastBriefing(briefing: MorningBriefing): void {
  lastBriefing = briefing
}

async function refreshConversationHistory(): Promise<void> {
  recentConversationHistory = await loadRecentConversations()
  console.log(`[SLACK BOT] Loaded ${recentConversationHistory.length} recent conversation messages from DB.`)
}

// ─── Bot Setup ────────────────────────────────────────────────────────────

export async function startSlackBot(): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN
  const appToken = process.env.SLACK_APP_TOKEN

  if (!botToken || !appToken) {
    console.log(
      '[SLACK BOT] SLACK_BOT_TOKEN or SLACK_APP_TOKEN not set. ' +
        'Two-way bot disabled. Set both to enable chat with the agent.'
    )
    return
  }

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
    logLevel: LogLevel.WARN,
  })

  // ─── Handle Direct Messages ────────────────────────────────────────────

  // Respond to any DM or channel message
  app.message(async ({ message, say, logger }) => {
    // Skip bot messages and message edits
    if (message.subtype) return

    const text = (message as { text?: string }).text || ''
    if (!text.trim()) return

    const msg = message as { ts: string; thread_ts?: string; channel: string }
    const threadKey = msg.thread_ts ?? msg.ts

    try {
      console.log(`[SLACK BOT] Message received: "${text.slice(0, 80)}"`)

      // Skip if a request for this thread is already in-flight
      if (activeRequests.has(threadKey)) {
        console.log(`[SLACK BOT] Skipping — request already in-flight for thread ${threadKey}`)
        return
      }
      activeRequests.add(threadKey)

      const history = getHistory(threadKey)

      // Persist user message to DB (non-blocking)
      void persistMessage(threadKey, 'user', text)

      // Show a typing indicator via the "thinking" message
      const thinkingMsg = await say({
        text: '_🤔 Checking..._',
        thread_ts: msg.ts,
      })

      appendHistory(threadKey, 'user', text)
      // Use in-memory thread history if available, else fall back to recent DB history
      const fullHistory = history.length > 0 ? history : recentConversationHistory.slice(-20)
      const response = await runAgent(text, lastBriefing, fullHistory)
      appendHistory(threadKey, 'assistant', response)
      void persistMessage(threadKey, 'assistant', response)

      // Replace thinking indicator with response in same thread
      await say({
        text: response,
        thread_ts: msg.ts,
      })

      // Delete thinking message (best effort)
      try {
        if (thinkingMsg.ts) {
          await app.client.chat.delete({
            channel: msg.channel,
            ts: thinkingMsg.ts as string,
          })
        }
      } catch {
        // Non-critical — ignore delete failures
      }
    } catch (err) {
      logger.error('Agent error:', err)
      await say({
        text: `\u26A0\uFE0F Agent error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        thread_ts: (message as { ts: string }).ts,
      })
    } finally {
      activeRequests.delete(threadKey)
    }
  })

  // ─── Handle App Mentions (in channels) ────────────────────────────────

  app.event('app_mention', async ({ event, say }) => {
    // Strip the bot mention from the text
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim()
    if (!text) {
      await say({ text: "What's up? Ask me anything about CFP.", thread_ts: event.ts })
      return
    }

    const threadKey = event.thread_ts ?? event.ts

    // Skip if a request for this thread is already in-flight
    if (activeRequests.has(threadKey)) {
      console.log(`[SLACK BOT] Skipping mention — request already in-flight for thread ${threadKey}`)
      return
    }
    activeRequests.add(threadKey)

    const history = getHistory(threadKey)

    try {
      appendHistory(threadKey, 'user', text)
      void persistMessage(threadKey, 'user', text)
      const fullHistory = history.length > 0 ? history : recentConversationHistory.slice(-20)
      const response = await runAgent(text, lastBriefing, fullHistory)
      appendHistory(threadKey, 'assistant', response)
      void persistMessage(threadKey, 'assistant', response)
      await say({ text: response, thread_ts: event.ts })
    } catch (err) {
      await say({
        text: `\u26A0\uFE0F Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        thread_ts: event.ts,
      })
    } finally {
      activeRequests.delete(threadKey)
    }
  })

  // ─── Start ─────────────────────────────────────────────────────────────

  try {
    await app.start()
    console.log('\u2705 [SLACK BOT] Socket Mode bot started — ready to receive messages.')

    // Load recent conversation history from DB
    await refreshConversationHistory()

    // Refresh every 30 minutes to pick up conversations from other sessions
    setInterval(() => { void refreshConversationHistory() }, 30 * 60 * 1000)
  } catch (err) {
    console.error('\u274C [SLACK BOT] Failed to start:', err)
  }
}
