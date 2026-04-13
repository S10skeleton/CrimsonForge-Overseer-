/**
 * ForgePilot uptime monitoring tool
 * Checks frontend (Netlify) and API health (Railway).
 */

import type { ToolResult, ForgePilotUptimeData, UptimeData, AgentTool } from '../types/index.js'

const RESPONSE_TIME_WARNING_MS = 3000

async function pingEndpoint(url: string): Promise<UptimeData> {
  const start = Date.now()
  console.log(`[fp-uptime] Checking: ${url}`)
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const responseMs = Date.now() - start
  console.log(`[fp-uptime] Response: ${res.status} in ${responseMs}ms`)

  let status: UptimeData['status'] = 'healthy'
  if (!res.ok) {
    status = 'degraded'
  } else if (responseMs > RESPONSE_TIME_WARNING_MS) {
    status = 'degraded'
    console.log(`[fp-uptime] SLOW: ${url} took ${responseMs}ms`)
  }

  return { url, status, responseMs, statusCode: res.status }
}

async function checkEndpoint(url: string): Promise<UptimeData> {
  try {
    return await pingEndpoint(url)
  } catch {
    console.log(`[fp-uptime] First attempt failed, retrying in 5s...`)
    await new Promise((r) => setTimeout(r, 5_000))
    try {
      return await pingEndpoint(url)
    } catch {
      return { url, status: 'down', responseMs: null, statusCode: null }
    }
  }
}

export async function runForgePilotUptimeCheck(): Promise<ToolResult<ForgePilotUptimeData>> {
  const timestamp = new Date().toISOString()

  const frontendUrl = process.env.FP_FRONTEND_URL ?? 'https://app.forgepilot.pro'
  const apiUrl      = process.env.FP_API_HEALTH_URL

  if (!apiUrl) {
    return {
      tool: 'fp_uptime',
      success: false,
      timestamp,
      data: {
        frontend: { url: frontendUrl, status: 'unknown', responseMs: null, statusCode: null },
        api:      { url: '',          status: 'unknown', responseMs: null, statusCode: null },
      },
      error: 'FP_API_HEALTH_URL not configured.',
    }
  }

  try {
    const [frontend, api] = await Promise.all([
      checkEndpoint(frontendUrl),
      checkEndpoint(apiUrl),
    ])

    return {
      tool: 'fp_uptime',
      success: true,
      timestamp,
      data: { frontend, api },
    }
  } catch (err) {
    return {
      tool: 'fp_uptime',
      success: false,
      timestamp,
      data: {
        frontend: { url: frontendUrl, status: 'down', responseMs: null, statusCode: null },
        api:      { url: apiUrl,      status: 'down', responseMs: null, statusCode: null },
      },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const forgePilotUptimeTool: AgentTool = {
  name: 'check_forgepilot_uptime',
  description:
    'Checks if ForgePilot frontend (app.forgepilot.pro) and the ForgePilot API backend are responding. Returns response times and status codes.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runForgePilotUptimeCheck(),
}
