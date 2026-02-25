/**
 * Railway monitoring tool
 * Checks deployment status and service health
 */

import type { ToolResult, RailwayData, AgentTool } from '../types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const RAILWAY_GRAPHQL_URL = 'https://backboard.railway.app/graphql/v2'
const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN!
const RAILWAY_SERVICE_ID = process.env.CF_SERVICE_ID!

// ─── Core Logic ───────────────────────────────────────────────────────────

async function fetchRailwayStatus(): Promise<{
  status: string
  latestDeploymentStatus: string | null
  latestDeploymentAt: string | null
}> {
  const query = `
    query {
      deployments(input: { serviceId: "${RAILWAY_SERVICE_ID}", first: 1 }) {
        edges {
          node {
            id
            status
            createdAt
          }
        }
      }
    }
  `

  try {
    const res = await fetch(RAILWAY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new Error(`Railway API error: ${res.statusText}`)
    }

    interface DeploymentEdge {
      node?: {
        id: string
        status: string
        createdAt: string
      }
    }
    interface RailwayResponse {
      data?: {
        deployments?: {
          edges: DeploymentEdge[]
        }
      }
      errors?: Array<{ message: string }>
    }
    const data = (await res.json()) as RailwayResponse

    if (data.errors) {
      throw new Error(`GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`)
    }

    const deployment = data.data?.deployments?.edges[0]?.node

    return {
      status: deployment?.status === 'SUCCESS' ? 'healthy' : 'degraded',
      latestDeploymentStatus: deployment?.status || null,
      latestDeploymentAt: deployment?.createdAt || null,
    }
  } catch (err) {
    console.error('Error fetching Railway status:', err)
    return {
      status: 'down',
      latestDeploymentStatus: null,
      latestDeploymentAt: null,
    }
  }
}

export async function runRailwayCheck(): Promise<ToolResult<RailwayData>> {
  try {
    const railwayStatus = await fetchRailwayStatus()

    return {
      tool: 'railway',
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        status: (railwayStatus.status as 'healthy' | 'degraded' | 'down' | 'unknown'),
        latestDeploymentStatus: railwayStatus.latestDeploymentStatus,
        latestDeploymentAt: railwayStatus.latestDeploymentAt,
      },
    }
  } catch (err) {
    return {
      tool: 'railway',
      success: false,
      timestamp: new Date().toISOString(),
      data: {
        status: 'unknown',
        latestDeploymentStatus: null,
        latestDeploymentAt: null,
      },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const railwayTool: AgentTool = {
  name: 'check_railway',
  description:
    'Checks Railway deployment status and service health for the Crimson Forge backend.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runRailwayCheck(),
}
