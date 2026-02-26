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
    console.log('[supabase] Running shop activity queries...')

    // Check connection
    const { error: connError } = await supabase.from('shops').select('count').limit(1)
    if (connError) {
      throw new Error(`Database connection failed: ${connError.message}`)
    }
    console.log('[supabase] Connection: OK')

    // Get total shops
    const { count: totalShops, error: shopsError } = await supabase
      .from('shops')
      .select('*', { count: 'exact', head: true })
    console.log('[supabase] Total shops:', totalShops, shopsError ? `ERROR: ${shopsError.message}` : 'OK')

    // Get active shops last 24h
    const { data: activeShops, error: activeError } = await supabase.rpc('get_active_shops_last_24h')
    console.log('[supabase] Active shops:', activeShops?.length ?? 0, activeError ? `ERROR: ${activeError.message}` : 'OK')

    // Get tickets created last 24h
    const { count: ticketsCreatedLast24h, error: ticketsError } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    console.log('[supabase] Tickets last 24h:', ticketsCreatedLast24h, ticketsError ? `ERROR: ${ticketsError.message}` : 'OK')

    // Get AI sessions last 24h — table may not exist yet, degrade gracefully
    const { count: aiSessionsLast24h, error: aiError } = await supabase
      .from('ai_sessions')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if (aiError) {
      console.log('[supabase] AI sessions: 0 (table unavailable:', aiError.message, ')')
    } else {
      console.log('[supabase] AI sessions:', aiSessionsLast24h, 'OK')
    }

    // Get silent shops (no activity in N days)
    interface SilentShopRow {
      shop_id: string
      shop_name: string
      last_activity_at: string | null
    }
    const { data: silentShopsData, error: silentError } = await supabase.rpc('get_silent_shops', {
      threshold_days: SILENT_SHOP_THRESHOLD_DAYS,
    }) as { data: SilentShopRow[] | null, error: { message: string } | null }
    console.log('[supabase] Silent shops:', silentShopsData?.length ?? 0, silentError ? `ERROR: ${silentError.message}` : 'OK')

    const silentShops = (silentShopsData || []).map((row: SilentShopRow) => {
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
