/**
 * Slack Socket Mode Bot
 * Enables two-way conversation — listens for messages and routes to AI agent
 */

import pkg from '@slack/bolt'
const { App, LogLevel } = pkg
import { runAgent } from './agent/index.js'
import type { MorningBriefing } from './types/index.js'

// ─── Conversation History ─────────────────────────────────────────────────

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// Keyed by thread_ts (or message ts for top-level DMs)
const conversationHistory = new Map<string, ConversationMessage[]>()

// Max messages to keep per thread (older messages pruned)
const MAX_HISTORY = 20

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
}

// ─── Rate Limiting ────────────────────────────────────────────────────────
// Prevent rapid-fire messages from spamming the Anthropic API.
// One active request per thread at a time.

const activeRequests = new Set<string>()

// ─── State ────────────────────────────────────────────────────────────────

let lastBriefing: MorningBriefing | undefined = undefined

export function setLastBriefing(briefing: MorningBriefing): void {
  lastBriefing = briefing
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

      // Show a typing indicator via the "thinking" message
      const thinkingMsg = await say({
        text: '_🤔 Checking..._',
        thread_ts: msg.ts,
      })

      appendHistory(threadKey, 'user', text)
      const response = await runAgent(text, lastBriefing, history)
      appendHistory(threadKey, 'assistant', response)

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
      activeRequests.delete(threadKey)
    } catch (err) {
      activeRequests.delete(threadKey)
      logger.error('Agent error:', err)
      await say({
        text: `\u26A0\uFE0F Agent error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        thread_ts: (message as { ts: string }).ts,
      })
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
    const history = getHistory(threadKey)

    try {
      appendHistory(threadKey, 'user', text)
      const response = await runAgent(text, lastBriefing, history)
      appendHistory(threadKey, 'assistant', response)
      await say({ text: response, thread_ts: event.ts })
    } catch (err) {
      await say({
        text: `\u26A0\uFE0F Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        thread_ts: event.ts,
      })
    }
  })

  // ─── Start ─────────────────────────────────────────────────────────────

  try {
    await app.start()
    console.log('\u2705 [SLACK BOT] Socket Mode bot started — ready to receive messages.')
  } catch (err) {
    console.error('\u274C [SLACK BOT] Failed to start:', err)
  }
}
