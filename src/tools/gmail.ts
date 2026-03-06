/**
 * Gmail tool
 * Reads unread emails from the CrimsonForge inbox
 */

import { google } from 'googleapis'
import { createOAuthClient, isGoogleConfigured } from '../lib/google-auth.js'
import type { ToolResult, AgentTool } from '../types/index.js'

// ─── Types ────────────────────────────────────────────────────────────────

export interface GmailMessage {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  isUnread: boolean
}

export interface GmailData {
  unreadCount: number
  messages: GmailMessage[]
  checkedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getHeader(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

// ─── Runner ───────────────────────────────────────────────────────────────

export async function runGmailCheck(maxResults = 15): Promise<ToolResult<GmailData>> {
  const timestamp = new Date().toISOString()

  if (!isGoogleConfigured()) {
    return {
      tool: 'gmail',
      success: false,
      timestamp,
      data: { unreadCount: 0, messages: [], checkedAt: timestamp },
      error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.',
    }
  }

  try {
    const auth = createOAuthClient()
    const gmail = google.gmail({ version: 'v1', auth })

    // Get unread messages from last 24 hours
    const after = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `is:unread after:${after}`,
      maxResults,
    })

    const messageRefs = listRes.data.messages || []
    const unreadCount = listRes.data.resultSizeEstimate || messageRefs.length

    // Fetch metadata for each message
    const messages: GmailMessage[] = []
    for (const ref of messageRefs.slice(0, 10)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: ref.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        })

        const headers = detail.data.payload?.headers || []
        messages.push({
          id: ref.id!,
          subject: getHeader(headers, 'Subject') || '(no subject)',
          from: getHeader(headers, 'From') || 'Unknown',
          date: getHeader(headers, 'Date') || '',
          snippet: detail.data.snippet || '',
          isUnread: true,
        })
      } catch {
        // Skip individual message errors
      }
    }

    return {
      tool: 'gmail',
      success: true,
      timestamp,
      data: { unreadCount, messages, checkedAt: timestamp },
    }
  } catch (err) {
    return {
      tool: 'gmail',
      success: false,
      timestamp,
      data: { unreadCount: 0, messages: [], checkedAt: timestamp },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const gmailTool: AgentTool = {
  name: 'check_gmail',
  description:
    'Checks the CrimsonForge Gmail inbox for unread emails from the last 24 hours. Returns sender, subject, and snippet for each message.',
  input_schema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        description: 'Maximum number of messages to return (default: 15)',
      },
    },
    required: [],
  },
  execute: async (input) => runGmailCheck((input.maxResults as number) || 15),
}
