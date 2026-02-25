/**
 * Sentry monitoring tool
 * Checks for new errors and unresolved issues
 */

import type { ToolResult, SentryData, SentryIssue, AgentTool } from '../types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const SENTRY_API_BASE = 'https://sentry.io/api/0'
const SENTRY_ORG = process.env.SENTRY_ORG!
const SENTRY_PROJECT = process.env.SENTRY_PROJECT!
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN!

// ─── Core Logic ───────────────────────────────────────────────────────────

interface SentryIssueRaw {
  id: string
  title: string
  level: string
  count: number
  firstSeen: string
  lastSeen: string
  permalink: string
}

async function fetchSentryIssues(query: string): Promise<SentryIssueRaw[]> {
  try {
    const url = new URL(
      `${SENTRY_API_BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/`
    )
    url.searchParams.set('query', query)
    url.searchParams.set('limit', '10')
    url.searchParams.set('sort', 'date')

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new Error(`Sentry API error: ${res.statusText}`)
    }

    return (await res.json()) as SentryIssueRaw[]
  } catch (err) {
    console.error('Error fetching Sentry issues:', err)
    return []
  }
}

export async function runSentryCheck(): Promise<ToolResult<SentryData>> {
  try {
    // Get new issues in last 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const newIssuesData = await fetchSentryIssues(`firstSeen:>${yesterday} is:unresolved`)

    // Get all unresolved issues
    const unresolvedData = await fetchSentryIssues('is:unresolved')

    // Transform recent issues
    const recentIssues: SentryIssue[] = unresolvedData.slice(0, 5).map((issue) => ({
      id: issue.id,
      title: issue.title,
      level: (issue.level as 'fatal' | 'error' | 'warning') || 'error',
      count: issue.count,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      url: issue.permalink,
    }))

    return {
      tool: 'sentry',
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        newIssueCount: newIssuesData.length,
        unresolvedCount: unresolvedData.length,
        recentIssues,
      },
    }
  } catch (err) {
    return {
      tool: 'sentry',
      success: false,
      timestamp: new Date().toISOString(),
      data: {
        newIssueCount: 0,
        unresolvedCount: 0,
        recentIssues: [],
      },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const sentryTool: AgentTool = {
  name: 'check_sentry',
  description:
    'Checks Sentry for new errors and unresolved issues. Returns count of issues and details of recent ones.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runSentryCheck(),
}
