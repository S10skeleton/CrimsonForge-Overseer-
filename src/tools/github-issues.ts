/**
 * GitHub Issues tool
 * Create, list, and close issues in CrimsonForgePro without leaving Slack.
 */

import type { ToolResult, AgentTool } from '../types/index.js'

const GITHUB_API = 'https://api.github.com'

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

function getRepo(): string {
  return `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`
}

// ─── Core logic ────────────────────────────────────────────────────────────

async function listIssues(state: 'open' | 'closed' | 'all' = 'open', limit = 10) {
  const repo = getRepo()
  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/issues?state=${state}&per_page=${limit}&sort=updated`,
    { headers: githubHeaders() }
  )
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const issues = await res.json() as Array<Record<string, unknown>>
  return issues
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: (i.labels as Array<{ name: string }>).map((l) => l.name),
      url: i.html_url,
      updatedAt: new Date((i.updated_at as string)).toLocaleDateString(),
    }))
}

async function createIssue(params: { title: string; body?: string; labels?: string[] }) {
  const repo = getRepo()
  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
    method: 'POST',
    headers: githubHeaders(),
    body: JSON.stringify({
      title: params.title,
      body: params.body || '',
      labels: params.labels || [],
    }),
  })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const issue = await res.json() as { number: number; title: string; html_url: string }
  return { number: issue.number, title: issue.title, url: issue.html_url }
}

async function closeIssue(issueNumber: number) {
  const repo = getRepo()
  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: githubHeaders(),
    body: JSON.stringify({ state: 'closed' }),
  })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return { closed: true, issueNumber }
}

// ─── AgentTool definitions ─────────────────────────────────────────────────

export const listIssuesTool: AgentTool = {
  name: 'list_github_issues',
  description: 'List GitHub issues for CrimsonForgePro. Use when asked about open bugs, tasks, or what needs to be worked on.',
  input_schema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['open', 'closed', 'all'],
        description: 'Filter by issue state (default: open)',
      },
      limit: { type: 'number', description: 'Max issues to return (default 10)' },
    },
    required: [],
  },
  execute: async (input): Promise<ToolResult> => {
    const { state, limit } = input as { state?: 'open' | 'closed' | 'all'; limit?: number }
    try {
      const issues = await listIssues(state || 'open', limit || 10)
      return { tool: 'list_github_issues', success: true, timestamp: new Date().toISOString(), data: { issues, total: issues.length } }
    } catch (err) {
      return { tool: 'list_github_issues', success: false, timestamp: new Date().toISOString(), data: { issues: [], total: 0 }, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  },
}

export const createIssueTool: AgentTool = {
  name: 'create_github_issue',
  description: 'Create a GitHub issue in CrimsonForgePro. Use when the user reports a bug, requests a feature, or wants to log a task. Common labels: bug, enhancement, mobile, ai, billing, ui, backend. Always confirm title before creating.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Issue title — concise and descriptive' },
      body: { type: 'string', description: 'Issue description, steps to reproduce, or context' },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels to apply: bug, enhancement, mobile, ai, billing, ui, backend',
      },
    },
    required: ['title'],
  },
  execute: async (input): Promise<ToolResult> => {
    const params = input as { title: string; body?: string; labels?: string[] }
    try {
      const issue = await createIssue(params)
      return { tool: 'create_github_issue', success: true, timestamp: new Date().toISOString(), data: issue }
    } catch (err) {
      return { tool: 'create_github_issue', success: false, timestamp: new Date().toISOString(), data: {}, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  },
}

export const closeIssueTool: AgentTool = {
  name: 'close_github_issue',
  description: 'Close a GitHub issue by number. Always confirm before closing.',
  input_schema: {
    type: 'object',
    properties: {
      issueNumber: { type: 'number', description: 'Issue number to close' },
    },
    required: ['issueNumber'],
  },
  execute: async (input): Promise<ToolResult> => {
    const { issueNumber } = input as { issueNumber: number }
    try {
      const result = await closeIssue(issueNumber)
      return { tool: 'close_github_issue', success: true, timestamp: new Date().toISOString(), data: result }
    } catch (err) {
      return { tool: 'close_github_issue', success: false, timestamp: new Date().toISOString(), data: {}, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  },
}
