/**
 * Netlify deploy status tool
 * Checks the latest deploy state and health for the CFP frontend site.
 */

import type { ToolResult, NetlifyData, AgentTool } from '../types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const NETLIFY_API_TOKEN = process.env.NETLIFY_API_TOKEN
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID

// ─── Core Logic ───────────────────────────────────────────────────────────

interface NetlifyDeploy {
  id: string
  state: string       // 'ready' | 'building' | 'error' | 'failed' | 'enqueued' | 'processing' | 'canceled'
  created_at: string
  deploy_ssl_url: string | null
  title: string | null
  branch: string | null
  error_message: string | null
  published_at: string | null
}

function resolveStatus(state: string): 'healthy' | 'degraded' | 'down' | 'unknown' {
  if (state === 'ready') return 'healthy'
  if (state === 'building' || state === 'enqueued' || state === 'processing') return 'degraded'
  if (state === 'error' || state === 'failed') return 'down'
  return 'unknown'
}

export async function runNetlifyCheck(): Promise<ToolResult<NetlifyData>> {
  const timestamp = new Date().toISOString()
  const empty: NetlifyData = { status: 'unknown', latestDeployState: null, latestDeployAt: null, branch: null, errorMessage: null }

  if (!NETLIFY_API_TOKEN || !NETLIFY_SITE_ID) {
    return {
      tool: 'netlify',
      success: false,
      timestamp,
      data: empty,
      error: 'NETLIFY_API_TOKEN or NETLIFY_SITE_ID not configured.',
    }
  }

  try {
    const res = await fetch(
      `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys?per_page=5`,
      {
        headers: { Authorization: `Bearer ${NETLIFY_API_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (!res.ok) {
      const body = await res.text()
      console.error(`[netlify] HTTP ${res.status}:`, body)
      return { tool: 'netlify', success: false, timestamp, data: empty, error: `HTTP ${res.status}` }
    }

    const deploys = await res.json() as NetlifyDeploy[]

    if (!Array.isArray(deploys) || deploys.length === 0) {
      return { tool: 'netlify', success: true, timestamp, data: empty }
    }

    // Prefer the most recent 'ready' deploy (what's live), fall back to latest
    const liveDeploy = deploys.find(d => d.state === 'ready') ?? deploys[0]

    return {
      tool: 'netlify',
      success: true,
      timestamp,
      data: {
        status: resolveStatus(liveDeploy.state),
        latestDeployState: liveDeploy.state,
        latestDeployAt: liveDeploy.published_at ?? liveDeploy.created_at,
        branch: liveDeploy.branch,
        errorMessage: liveDeploy.error_message ?? null,
      },
    }
  } catch (err) {
    return {
      tool: 'netlify',
      success: false,
      timestamp,
      data: empty,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const netlifyTool: AgentTool = {
  name: 'check_netlify',
  description:
    'Check the latest Netlify deploy status for the CFP frontend (crimsonforge.pro). ' +
    'Returns deploy state (ready/building/error), deploy time, branch, and error message if any. ' +
    'ALWAYS call this when asked about: Netlify, frontend deploy, did the deploy work, ' +
    'crimsonforge.pro build status, frontend health. ' +
    'Do NOT use the uptime check as a substitute — that only confirms the site is up, ' +
    'not whether the latest deploy succeeded.',
  input_schema: { type: 'object', properties: {}, required: [] },
  execute: async () => runNetlifyCheck(),
}
