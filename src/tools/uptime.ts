/**
 * Uptime monitoring tool
 * Checks if all Crimson Forge services are responding
 */

import type { ToolResult, UptimeData, AgentTool } from '../types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const ENDPOINTS = [
  { name: 'Frontend', url: process.env.FRONTEND_URL! },
  { name: 'API', url: process.env.API_HEALTH_URL! },
]

// ─── Core Logic ───────────────────────────────────────────────────────────

const RESPONSE_TIME_WARNING_MS = 3000   // P1 threshold per runbook

async function pingEndpoint(url: string): Promise<UptimeData> {
  const start = Date.now()
  console.log(`[uptime] Checking: ${url}`)
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const responseMs = Date.now() - start
  console.log(`[uptime] Response: ${res.status} in ${responseMs}ms`)

  let status: 'healthy' | 'degraded' | 'down' = 'healthy'
  if (!res.ok) {
    status = 'degraded'
  } else if (responseMs > RESPONSE_TIME_WARNING_MS) {
    status = 'degraded'
    console.log(`[uptime] SLOW RESPONSE: ${url} took ${responseMs}ms (threshold: ${RESPONSE_TIME_WARNING_MS}ms)`)
  }

  return {
    url,
    status,
    responseMs,
    statusCode: res.status,
  }
}

async function checkEndpoint(url: string): Promise<UptimeData> {
  try {
    return await pingEndpoint(url)
  } catch (err) {
    console.log(`[uptime] Failed: ${err instanceof Error ? err.message : String(err)}`)
    // First attempt failed — wait 5s and retry once
    console.log(`[uptime] First attempt failed, retrying in 5s...`)
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    try {
      return await pingEndpoint(url)
    } catch (retryErr) {
      console.log(`[uptime] Retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`)
      return { url, status: 'down', responseMs: null, statusCode: null }
    }
  }
}

export async function runUptimeCheck(): Promise<ToolResult<UptimeData[]>> {
  try {
    const results = await Promise.all(ENDPOINTS.map((e) => checkEndpoint(e.url)))
    return {
      tool: 'uptime',
      success: true,
      timestamp: new Date().toISOString(),
      data: results,
    }
  } catch (err) {
    return {
      tool: 'uptime',
      success: false,
      timestamp: new Date().toISOString(),
      data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const uptimeTool: AgentTool = {
  name: 'check_uptime',
  description:
    'Checks if all Crimson Forge services are responding. Returns response times and HTTP status codes.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runUptimeCheck(),
}
