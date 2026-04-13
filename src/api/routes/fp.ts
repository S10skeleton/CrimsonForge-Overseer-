/**
 * ForgePilot data routes — reads directly from ForgePilot Supabase
 * Same pattern as cfp.ts. Read-only.
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function getFPSupabase() {
  return createClient(
    process.env.FP_SUPABASE_URL!,
    process.env.FP_SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Stats summary ───────────────────────────────────────────────────────────

router.get('/stats', requireAuth, async (_req, res) => {
  try {
    const sb = getFPSupabase()
    const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const ago7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
      { count: totalUsers },
      { count: totalSessions },
      { count: sessionsLast24h },
      { count: sessionsLast7d },
      { count: obdScans },
      { count: aiMessages24h },
      { count: totalShops },
      { count: activeShops },
      { count: motorCache },
    ] = await Promise.all([
      sb.from('fp_users').select('*', { count: 'exact', head: true }),
      sb.from('fp_sessions').select('*', { count: 'exact', head: true }),
      sb.from('fp_sessions').select('*', { count: 'exact', head: true }).gte('created_at', ago24h),
      sb.from('fp_sessions').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
      sb.from('fp_sessions').select('*', { count: 'exact', head: true }).not('scan_timestamp', 'is', null).gte('created_at', ago24h),
      sb.from('fp_session_messages').select('*', { count: 'exact', head: true }).eq('role', 'assistant').gte('created_at', ago24h),
      sb.from('fp_shops').select('*', { count: 'exact', head: true }),
      sb.from('fp_shops').select('*', { count: 'exact', head: true }).eq('subscription_status', 'active'),
      sb.from('motor_cache').select('*', { count: 'exact', head: true }),
    ])

    res.json({
      totalUsers:       totalUsers ?? 0,
      totalSessions:    totalSessions ?? 0,
      sessionsLast24h:  sessionsLast24h ?? 0,
      sessionsLast7d:   sessionsLast7d ?? 0,
      obdScansLast24h:  obdScans ?? 0,
      aiMessages24h:    aiMessages24h ?? 0,
      totalShops:       totalShops ?? 0,
      activeShops:      activeShops ?? 0,
      motorCacheEntries: motorCache ?? 0,
    })
  } catch (err) {
    console.error('[fp/stats]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── Users ────────────────────────────────────────────────────────────────────

router.get('/users', requireAuth, async (_req, res) => {
  try {
    const sb = getFPSupabase()
    const { data, error } = await sb
      .from('fp_users')
      .select('id, email, subscription_tier, shop_role, obd_enabled, cfp_shop_id, shop_id, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Count sessions per user
    const userIds = (data ?? []).map((u: any) => u.id)
    const { data: sessionCounts } = await sb
      .from('fp_sessions')
      .select('user_id')
      .in('user_id', userIds)

    const countByUser: Record<string, number> = {}
    for (const s of sessionCounts ?? []) {
      countByUser[s.user_id] = (countByUser[s.user_id] ?? 0) + 1
    }

    // Last session per user
    const { data: lastSessions } = await sb
      .from('fp_sessions')
      .select('user_id, updated_at')
      .in('user_id', userIds)
      .order('updated_at', { ascending: false })

    const lastByUser: Record<string, string> = {}
    for (const s of lastSessions ?? []) {
      if (!lastByUser[s.user_id]) lastByUser[s.user_id] = s.updated_at
    }

    const enriched = (data ?? []).map((u: any) => ({
      ...u,
      session_count:    countByUser[u.id] ?? 0,
      last_session_at:  lastByUser[u.id] ?? null,
      cfp_linked:       !!u.cfp_shop_id,
    }))

    res.json(enriched)
  } catch (err) {
    console.error('[fp/users]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── Shops ────────────────────────────────────────────────────────────────────

router.get('/shops', requireAuth, async (_req, res) => {
  try {
    const sb = getFPSupabase()
    const { data, error } = await sb
      .from('fp_shops')
      .select('id, name, owner_id, plan_tier, subscription_status, seat_limit, billing_cycle, stripe_subscription_id, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Get seat counts per shop
    const shopIds = (data ?? []).map((s: any) => s.id)
    const { data: seatCounts } = await sb
      .from('fp_users')
      .select('shop_id')
      .in('shop_id', shopIds)

    const seatByShop: Record<string, number> = {}
    for (const u of seatCounts ?? []) {
      if (u.shop_id) seatByShop[u.shop_id] = (seatByShop[u.shop_id] ?? 0) + 1
    }

    const enriched = (data ?? []).map((s: any) => ({
      ...s,
      seat_used: seatByShop[s.id] ?? 0,
    }))

    res.json(enriched)
  } catch (err) {
    console.error('[fp/shops]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── Recent sessions (for activity feed) ─────────────────────────────────────

router.get('/sessions', requireAuth, async (_req, res) => {
  try {
    const sb = getFPSupabase()
    const { data, error } = await sb
      .from('fp_sessions')
      .select('id, user_id, year, make, model, engine_name, dtc_codes, message_count, scan_timestamp, ro_number, is_shop_session, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[fp/sessions]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
