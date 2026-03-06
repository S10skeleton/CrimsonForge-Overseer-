/**
 * Slack Socket Mode Bot
 * Enables two-way conversation — listens for messages and routes to AI agent
 */

import { App, LogLevel } from '@slack/bolt'
import { runAgent } from './agent/index.js'
import type { MorningBriefing } from './types/index.js'

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

    try {
      console.log(`[SLACK BOT] Message received: "${text.slice(0, 80)}"`)

      // Show a typing indicator via the "thinking" message
      const thinkingMsg = await say({
        text: '_🤔 Checking..._',
        thread_ts: (message as { ts: string }).ts,
      })

      const response = await runAgent(text, lastBriefing)

      // Replace thinking indicator with response in same thread
      await say({
        text: response,
        thread_ts: (message as { ts: string }).ts,
      })

      // Delete thinking message (best effort)
      try {
        const client = app.client
        if (thinkingMsg.ts) {
          await client.chat.delete({
            channel: (message as { channel: string }).channel,
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

    try {
      const response = await runAgent(text, lastBriefing)
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
