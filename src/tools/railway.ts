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

interface DeploymentEdge {
  node?: {
    id: string
    status: string
    createdAt: string
  }
}
interface RailwayResponse {
  data?: {
    service?: {
      id: string
      name: string
      deployments?: {
        edges: DeploymentEdge[]
      }
    }
  }
  errors?: Array<{ message: string }>
}

function resolveStatus(deploymentStatus: string): string {
  if (deploymentStatus === 'SUCCESS' || deploymentStatus === 'ACTIVE') return 'healthy'
  if (deploymentStatus === 'FAILED' || deploymentStatus === 'CRASHED') return 'down'
  return 'degraded'
}

async function fetchRailwayStatus(): Promise<{
  status: string
  latestDeploymentStatus: string | null
  latestDeploymentAt: string | null
}> {
  const query = `
    query {
      service(id: "${RAILWAY_SERVICE_ID}") {
        id
        name
        deployments(first: 1) {
          edges {
            node {
              id
              status
              createdAt
            }
          }
        }
      }
    }
  `

  const res = await fetch(RAILWAY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10_000),
  })

  const body = await res.text()

  if (!res.ok) {
    console.error(`[railway] HTTP ${res.status} from Railway API:`, body)
    return { status: 'unknown', latestDeploymentStatus: null, latestDeploymentAt: null }
  }

  let data: RailwayResponse
  try {
    data = JSON.parse(body) as RailwayResponse
  } catch {
    console.error('[railway] Failed to parse Railway API response:', body)
    return { status: 'unknown', latestDeploymentStatus: null, latestDeploymentAt: null }
  }

  if (data.errors) {
    console.error('[railway] GraphQL errors:', JSON.stringify(data.errors), '\nFull response:', body)
    return { status: 'unknown', latestDeploymentStatus: null, latestDeploymentAt: null }
  }

  const deployment = data.data?.service?.deployments?.edges[0]?.node

  if (!deployment) {
    console.warn('[railway] No deployments found for service:', RAILWAY_SERVICE_ID)
    return { status: 'unknown', latestDeploymentStatus: null, latestDeploymentAt: null }
  }

  return {
    status: resolveStatus(deployment.status),
    latestDeploymentStatus: deployment.status,
    latestDeploymentAt: deployment.createdAt,
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
        status: railwayStatus.status as 'healthy' | 'degraded' | 'down' | 'unknown',
        latestDeploymentStatus: railwayStatus.latestDeploymentStatus,
        latestDeploymentAt: railwayStatus.latestDeploymentAt,
      },
    }
  } catch (err) {
    console.error('[railway] Unexpected error in runRailwayCheck:', err)
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
