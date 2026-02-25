/**
 * Supabase monitoring tool
 * Checks database connection and queries shop activity
 */

import { createClient } from '@supabase/supabase-js'
import type { ToolResult, SupabaseData, AgentTool } from '../types/index.js'

// ─── Configuration ────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SILENT_SHOP_THRESHOLD_DAYS = Number(
  process.env.SILENT_SHOP_THRESHOLD_DAYS || '3'
)

// ─── Core Logic ───────────────────────────────────────────────────────────

export async function runSupabaseCheck(): Promise<ToolResult<SupabaseData>> {
  try {
    // Check connection
    const connectionCheck = await supabase.from('shops').select('count').limit(1)

    if (connectionCheck.error) {
      throw new Error(`Database connection failed: ${connectionCheck.error.message}`)
    }

    // Get total shops
    const { count: totalShops } = await supabase
      .from('shops')
      .select('*', { count: 'exact', head: true })

    // Get active shops last 24h
    const { data: activeShops } = await supabase.rpc(
      'get_active_shops_last_24h'
    )

    // Get tickets created last 24h
    const { count: ticketsCreatedLast24h } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    // Get AI sessions last 24h
    const { count: aiSessionsLast24h } = await supabase
      .from('ai_sessions')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    // Get silent shops (no activity in N days)
    interface SilentShopRow {
      shop_id: string
      shop_name: string
      last_activity_at: string | null
    }
    const { data: silentShopsData } = await supabase.rpc<SilentShopRow>(
      'get_silent_shops',
      { threshold_days: SILENT_SHOP_THRESHOLD_DAYS }
    )

    const silentShops = (silentShopsData || []).map((row) => {
      const lastActivity = row.last_activity_at
        ? new Date(row.last_activity_at)
        : null
      const now = new Date()
      const daysSilent = lastActivity
        ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : Math.floor((now.getTime() - new Date(0).getTime()) / (1000 * 60 * 60 * 24))

      return {
        shopId: row.shop_id,
        shopName: row.shop_name,
        lastActivityAt: row.last_activity_at,
        daysSilent,
      }
    })

    return {
      tool: 'supabase',
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        connectionStatus: 'healthy',
        totalShops: totalShops || 0,
        activeShopsLast24h: (activeShops as Array<unknown>)?.length || 0,
        ticketsCreatedLast24h: ticketsCreatedLast24h || 0,
        aiSessionsLast24h: aiSessionsLast24h || 0,
        silentShops,
      },
    }
  } catch (err) {
    return {
      tool: 'supabase',
      success: false,
      timestamp: new Date().toISOString(),
      data: {
        connectionStatus: 'down',
        totalShops: 0,
        activeShopsLast24h: 0,
        ticketsCreatedLast24h: 0,
        aiSessionsLast24h: 0,
        silentShops: [],
      },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const supabaseTool: AgentTool = {
  name: 'check_supabase',
  description:
    'Checks Supabase database connection and retrieves shop activity metrics (active shops, tickets, AI sessions, and silent shops).',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runSupabaseCheck(),
}
