/**
 * CFP data routes — reads directly from CFP Supabase (production)
 * Does NOT go through the CFP backend — survives CFP outages
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function getCFPSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Shops ───────────────────────────────────────────────────────────────────

router.get('/shops', requireAuth, async (_req, res) => {
  try {
    const sb = getCFPSupabase()
    const { data, error } = await sb
      .from('shops')
      .select(`
        id, name, email, phone, address,
        subscription_status, subscription_tier, monthly_revenue,
        stripe_customer_id, stripe_subscription_id, trial_ends_at,
        created_at, updated_at,
        tickets:tickets(count),
        profiles:profiles(count)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Get last ticket per shop for activity tracking
    const shopIds = (data ?? []).map((s: any) => s.id)
    const { data: lastTickets } = await sb
      .from('tickets')
      .select('shop_id, created_at')
      .in('shop_id', shopIds)
      .order('created_at', { ascending: false })

    const lastTicketByShop: Record<string, string> = {}
    for (const t of lastTickets ?? []) {
      if (!lastTicketByShop[t.shop_id]) {
        lastTicketByShop[t.shop_id] = t.created_at
      }
    }

    const enriched = (data ?? []).map((s: any) => ({
      ...s,
      ticket_count: s.tickets?.[0]?.count ?? 0,
      user_count: s.profiles?.[0]?.count ?? 0,
      last_ticket_created: lastTicketByShop[s.id] ?? null,
    }))

    res.json(enriched)
  } catch (err) {
    console.error('[cfp/shops] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Users ───────────────────────────────────────────────────────────────────

router.get('/users', requireAuth, async (_req, res) => {
  try {
    const sb = getCFPSupabase()

    // Fetch profiles — email is NOT stored in profiles, it lives in auth.users
    const { data: profiles, error: profilesError } = await sb
      .from('profiles')
      .select(`
        id, full_name, role, deactivated,
        tos_accepted_at, tos_version, privacy_accepted_at,
        created_at, updated_at,
        shops:shop_id(id, name)
      `)
      .order('created_at', { ascending: false })

    if (profilesError) throw profilesError

    // Fetch emails from auth.users via admin API (requires service role key)
    const { data: authData, error: authError } = await sb.auth.admin.listUsers({
      perPage: 1000,
    })

    if (authError) {
      // Non-fatal — return profiles without emails rather than failing the whole route
      console.warn('[cfp/users] Could not fetch auth emails:', authError.message)
      res.json(profiles ?? [])
      return
    }

    // Join emails onto profiles
    const emailMap = Object.fromEntries(
      (authData.users ?? []).map((u) => [u.id, u.email ?? null])
    )

    const enriched = (profiles ?? []).map((p: any) => ({
      ...p,
      email: emailMap[p.id] ?? null,
    }))

    res.json(enriched)
  } catch (err) {
    console.error('[cfp/users] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Stats ───────────────────────────────────────────────────────────────────

router.get('/stats', requireAuth, async (_req, res) => {
  try {
    const sb = getCFPSupabase()
    const [shops, users, tickets, messages] = await Promise.all([
      sb.from('shops').select('*', { count: 'exact', head: true }),
      sb.from('profiles').select('*', { count: 'exact', head: true }),
      sb.from('tickets').select('*', { count: 'exact', head: true }),
      sb.from('chat_messages').select('*', { count: 'exact', head: true }),
    ])

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { count: recentTickets } = await sb
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString())

    res.json({
      shopCount: shops.count ?? 0,
      userCount: users.count ?? 0,
      ticketCount: tickets.count ?? 0,
      messageCount: messages.count ?? 0,
      recentTickets: recentTickets ?? 0,
    })
  } catch (err) {
    console.error('[cfp/stats] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Billing events ──────────────────────────────────────────────────────────

router.get('/billing-events', requireAuth, async (_req, res) => {
  try {
    const sb = getCFPSupabase()
    const { data, error } = await sb
      .from('billing_events')
      .select('*, shops:shop_id(name, email)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[cfp/billing-events] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Leads ───────────────────────────────────────────────────────────────────

router.get('/leads', requireAuth, async (_req, res) => {
  try {
    const sb = getCFPSupabase()
    const { data, error } = await sb
      .from('contact_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[cfp/leads] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── System Messages ─────────────────────────────────────────────────────────

router.get('/messages', requireAuth, async (_req, res) => {
  try {
    const sb = getCFPSupabase()
    const { data, error } = await sb
      .from('system_messages')
      .select('id, title, body, type, active, created_by, expires_at, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[cfp/messages] GET error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

router.post('/messages', requireAuth, async (req, res) => {
  const { title, body, type, active, expires_at } = req.body as {
    title?: string
    body?: string
    type?: string
    active?: boolean
    expires_at?: string | null
  }

  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: 'title and body are required' })
    return
  }

  try {
    const sb = getCFPSupabase()
    const { data, error } = await sb
      .from('system_messages')
      .insert({
        title: title.trim(),
        body: body.trim(),
        type: type ?? 'info',
        active: active ?? false,
        expires_at: expires_at ?? null,
      })
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, message: data })
  } catch (err) {
    console.error('[cfp/messages] POST error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

router.patch('/messages/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { title, body, type, active, expires_at } = req.body as {
    title?: string
    body?: string
    type?: string
    active?: boolean
    expires_at?: string | null
  }

  try {
    const sb = getCFPSupabase()
    const update: Record<string, unknown> = {}
    if (title !== undefined)      update.title = title.trim()
    if (body !== undefined)       update.body = body.trim()
    if (type !== undefined)       update.type = type
    if (active !== undefined)     update.active = active
    if (expires_at !== undefined) update.expires_at = expires_at

    const { data, error } = await sb
      .from('system_messages')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, message: data })
  } catch (err) {
    console.error('[cfp/messages] PATCH error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

router.delete('/messages/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  try {
    const sb = getCFPSupabase()
    const { error } = await sb
      .from('system_messages')
      .delete()
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[cfp/messages] DELETE error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── AI Config ────────────────────────────────────────────────────────────────
// Reads/writes the ai_config table in CFP Supabase.
// Keys actually used by chat.js: model, max_tokens, system_prompt_suffix
// (temperature is stored but not yet read by the chat route)

router.get('/ai-config', requireAuth, async (_req, res) => {
  try {
    const sb = getCFPSupabase()
    const { data, error } = await sb
      .from('ai_config')
      .select('id, config_key, config_value, updated_at')
      .order('config_key')

    if (error) throw error

    const configMap: Record<string, string> = {}
    for (const row of data ?? []) {
      if (row.config_key && row.config_value != null) {
        configMap[row.config_key] = row.config_value
      }
    }

    res.json({ rows: data ?? [], config: configMap })
  } catch (err) {
    console.error('[cfp/ai-config] GET error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

router.patch('/ai-config', requireAuth, async (req, res) => {
  const { updates } = req.body as {
    updates?: Array<{ config_key: string; config_value: string }>
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'updates array required' })
    return
  }

  try {
    const sb = getCFPSupabase()
    const now = new Date().toISOString()

    for (const u of updates) {
      const { error } = await sb
        .from('ai_config')
        .update({ config_value: u.config_value, updated_at: now })
        .eq('config_key', u.config_key)

      if (error) throw error
    }

    res.json({ success: true, updated: updates.map(u => u.config_key) })
  } catch (err) {
    console.error('[cfp/ai-config] PATCH error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

export default router
