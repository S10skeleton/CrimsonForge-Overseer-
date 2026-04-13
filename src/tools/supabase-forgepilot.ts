/**
 * ForgePilot Supabase monitoring tool
 * Queries the ForgePilot-Production Supabase instance.
 * Read-only — zero writes.
 */

import { createClient } from '@supabase/supabase-js'
import type { ToolResult, ForgePilotSupabaseData, AgentTool, HealthStatus } from '../types/index.js'

function getFPSupabase() {
  const url = process.env.FP_SUPABASE_URL
  const key = process.env.FP_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function runForgePilotSupabaseCheck(): Promise<ToolResult<ForgePilotSupabaseData>> {
  const timestamp = new Date().toISOString()

  const supabase = getFPSupabase()
  if (!supabase) {
    return {
      tool: 'fp_supabase',
      success: false,
      timestamp,
      data: {
        connectionStatus: 'unknown',
        totalUsers: 0,
        activeUsersLast24h: 0,
        totalSessions: 0,
        sessionSummary: {
          totalSessions: 0,
          sessionsLast24h: 0,
          sessionsLast7d: 0,
          obdScansLast24h: 0,
          sessionsWithDtcs: 0,
          aiMessagesLast24h: 0,
        },
        shopCount: 0,
        activeShopCount: 0,
        motorCacheEntries: 0,
      },
      error: 'FP_SUPABASE_URL or FP_SUPABASE_SERVICE_ROLE_KEY not configured.',
    }
  }

  try {
    // Connection check
    const { error: connError } = await supabase.from('fp_users').select('id').limit(1)
    if (connError) throw new Error(`FP DB connection failed: ${connError.message}`)

    const connectionStatus: HealthStatus = 'healthy'
    const now = new Date()
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const ago7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString()

    // Total users
    const { count: totalUsers } = await supabase
      .from('fp_users').select('*', { count: 'exact', head: true })

    // Active users last 24h — users with a session updated in last 24h
    const { data: activeUserRows } = await supabase
      .from('fp_sessions')
      .select('user_id')
      .gte('updated_at', ago24h)
    const activeUsersLast24h = new Set((activeUserRows ?? []).map((r: any) => r.user_id)).size

    // Session counts
    const { count: totalSessions } = await supabase
      .from('fp_sessions').select('*', { count: 'exact', head: true })

    const { count: sessionsLast24h } = await supabase
      .from('fp_sessions').select('*', { count: 'exact', head: true })
      .gte('created_at', ago24h)

    const { count: sessionsLast7d } = await supabase
      .from('fp_sessions').select('*', { count: 'exact', head: true })
      .gte('created_at', ago7d)

    const { count: obdScansLast24h } = await supabase
      .from('fp_sessions').select('*', { count: 'exact', head: true })
      .gte('created_at', ago24h)
      .not('scan_timestamp', 'is', null)

    const { count: sessionsWithDtcs } = await supabase
      .from('fp_sessions').select('*', { count: 'exact', head: true })
      .not('dtc_codes', 'eq', '{}')
      .not('dtc_codes', 'is', null)

    // AI messages last 24h (from fp_session_messages)
    const { count: aiMessagesLast24h } = await supabase
      .from('fp_session_messages').select('*', { count: 'exact', head: true })
      .gte('created_at', ago24h)
      .eq('role', 'assistant')

    // Shops
    const { count: shopCount } = await supabase
      .from('fp_shops').select('*', { count: 'exact', head: true })

    const { count: activeShopCount } = await supabase
      .from('fp_shops').select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active')

    // Motor cache
    const { count: motorCacheEntries } = await supabase
      .from('motor_cache').select('*', { count: 'exact', head: true })

    return {
      tool: 'fp_supabase',
      success: true,
      timestamp,
      data: {
        connectionStatus,
        totalUsers: totalUsers ?? 0,
        activeUsersLast24h,
        totalSessions: totalSessions ?? 0,
        sessionSummary: {
          totalSessions:     totalSessions ?? 0,
          sessionsLast24h:   sessionsLast24h ?? 0,
          sessionsLast7d:    sessionsLast7d ?? 0,
          obdScansLast24h:   obdScansLast24h ?? 0,
          sessionsWithDtcs:  sessionsWithDtcs ?? 0,
          aiMessagesLast24h: aiMessagesLast24h ?? 0,
        },
        shopCount:        shopCount ?? 0,
        activeShopCount:  activeShopCount ?? 0,
        motorCacheEntries: motorCacheEntries ?? 0,
      },
    }
  } catch (err) {
    return {
      tool: 'fp_supabase',
      success: false,
      timestamp,
      data: {
        connectionStatus: 'down',
        totalUsers: 0,
        activeUsersLast24h: 0,
        totalSessions: 0,
        sessionSummary: {
          totalSessions: 0,
          sessionsLast24h: 0,
          sessionsLast7d: 0,
          obdScansLast24h: 0,
          sessionsWithDtcs: 0,
          aiMessagesLast24h: 0,
        },
        shopCount: 0,
        activeShopCount: 0,
        motorCacheEntries: 0,
      },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const forgePilotSupabaseTool: AgentTool = {
  name: 'check_forgepilot_database',
  description:
    'Checks ForgePilot database health and returns user counts, session activity, OBD scan counts, AI message volume, and shop subscription counts.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runForgePilotSupabaseCheck(),
}
