/**
 * ForgePilot data routes — reads directly from ForgePilot Supabase
 * Same pattern as cfp.ts. Read-only.
 */

import { Router } from 'express'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function getFPSupabase() {
  return createClient(
    process.env.FP_SUPABASE_URL!,
    process.env.FP_SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getAppUrl(): string {
  return process.env.FP_FRONTEND_URL || 'https://app.forgepilot.pro'
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

// ── Billing (Stripe — FP products only) ───────────────────────────────────

const FP_PRODUCT_IDS = new Set([
  'prod_UKSIWeqYK7y4TK', // ForgePilot Solo
  'prod_UKSIUMHG5eSsTs', // ForgePilot Shop
  'prod_UKSI8NgY3miSMh', // ForgePilot Additional Seat
])

function isFPSub(sub: Stripe.Subscription): boolean {
  return sub.items.data.some(
    (item) => item.price.product && FP_PRODUCT_IDS.has(item.price.product as string)
  )
}

router.get('/billing', requireAuth, async (_req, res): Promise<void> => {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    res.json({
      activeSubscriptions: 0, mrr: 0, newThisMonth: 0, cancelledThisMonth: 0,
      paymentFailures: [], hasPaymentFailures: false,
      planBreakdown: { solo: 0, shop: 0 },
    })
    return
  }

  try {
    const stripe = new Stripe(stripeKey)

    const allActive = await stripe.subscriptions.list({
      status: 'active', limit: 100,
    })
    const fpActive = allActive.data.filter(isFPSub)

    const mrr = fpActive.reduce((sum, sub) => {
      const item = sub.items.data[0]
      if (!item) return sum
      const amount = item.price.unit_amount || 0
      const interval = item.price.recurring?.interval
      return sum + (interval === 'year' ? amount / 12 : amount) / 100
    }, 0)

    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

    const newThisMonth = fpActive.filter(
      (s) => new Date(s.created * 1000) >= startOfMonth
    ).length

    const cancelled = await stripe.subscriptions.list({
      status: 'canceled',
      created: { gte: Math.floor(startOfMonth.getTime() / 1000) },
      limit: 100,
    })
    const cancelledThisMonth = cancelled.data.filter(isFPSub).length

    const planBreakdown = { solo: 0, shop: 0 }
    for (const sub of fpActive) {
      for (const item of sub.items.data) {
        const pid = item.price.product as string
        if (pid === 'prod_UKSIWeqYK7y4TK') planBreakdown.solo++
        if (pid === 'prod_UKSIUMHG5eSsTs') planBreakdown.shop++
      }
    }

    // Payment failures — open invoices on FP subscriptions
    const openInvoices = await stripe.invoices.list({
      status: 'open', limit: 20, expand: ['data.customer'],
    })

    const paymentFailures = []
    for (const inv of openInvoices.data) {
      const subId = (inv as any).subscription as string | null
      if (!subId) continue
      try {
        const sub = await stripe.subscriptions.retrieve(
          subId
        )
        if (!isFPSub(sub)) continue
      } catch { continue }
      const customer = inv.customer as Stripe.Customer
      paymentFailures.push({
        customerId:     typeof inv.customer === 'string' ? inv.customer : customer?.id ?? '',
        customerEmail:  customer?.email ?? 'unknown',
        amount:         inv.amount_due / 100,
        currency:       inv.currency,
        failureMessage: inv.last_finalization_error?.message ?? 'Payment failed',
        failedAt:       new Date(inv.created * 1000).toISOString(),
      })
    }

    res.json({
      activeSubscriptions: fpActive.length,
      mrr:                 Math.round(mrr * 100) / 100,
      newThisMonth,
      cancelledThisMonth,
      paymentFailures,
      hasPaymentFailures:  paymentFailures.length > 0,
      planBreakdown,
    })
  } catch (err) {
    console.error('[fp/billing]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── FP System Messages ────────────────────────────────────────────────────────

router.get('/messages', requireAuth, async (_req, res) => {
  try {
    const sb = getFPSupabase()
    const { data, error } = await sb
      .from('fp_system_messages')
      .select('id, title, body, type, active, expires_at, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[fp/messages] GET error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/messages', requireAuth, async (req, res): Promise<void> => {
  const { title, body, type, active, expires_at } = req.body
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: 'title and body are required' })
    return
  }
  try {
    const sb = getFPSupabase()
    const { data, error } = await sb
      .from('fp_system_messages')
      .insert({
        title: title.trim(),
        body:  body.trim(),
        type:  type ?? 'info',
        active: active ?? false,
        expires_at: expires_at || null,
      })
      .select()
      .single()
    if (error) throw error
    res.json({ message: data })
  } catch (err) {
    console.error('[fp/messages] POST error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.patch('/messages/:id', requireAuth, async (req, res) => {
  const { title, body, type, active, expires_at } = req.body
  try {
    const sb = getFPSupabase()
    const updates: Record<string, unknown> = {}
    if (title      !== undefined) updates.title      = title
    if (body       !== undefined) updates.body       = body
    if (type       !== undefined) updates.type       = type
    if (active     !== undefined) updates.active     = active
    if (expires_at !== undefined) updates.expires_at = expires_at
    const { error } = await sb
      .from('fp_system_messages')
      .update(updates)
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[fp/messages] PATCH error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.delete('/messages/:id', requireAuth, async (req, res) => {
  try {
    const sb = getFPSupabase()
    const { error } = await sb
      .from('fp_system_messages')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[fp/messages] DELETE error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── Feedback ────────────────────────────────────────────────────────────────

router.get('/feedback', requireAuth, async (_req, res) => {
  try {
    const sb = getFPSupabase()
    const { data, error } = await sb
      .from('fp_feedback')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[fp/feedback]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.patch('/feedback/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { status } = req.body as { status: string }
  try {
    const sb = getFPSupabase()
    const { error } = await sb.from('fp_feedback').update({ status }).eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[fp/feedback PATCH]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── Invites (founder-level user onboarding) ─────────────────────────────────
// Distinct from fp_shop_invites (the 6-digit code flow used by shop owners
// to add their own techs). These are platform-level onboarding invites
// initiated from the Overseer panel.

type InviteRole = 'owner' | 'tech' | 'advisor'
type InviteRow = {
  id: string
  email: string
  full_name: string | null
  role: InviteRole
  status: 'pending' | 'activated' | 'revoked'
  invited_by: string | null
  invited_at: string
  activated_at: string | null
  last_active_at: string | null
  auth_user_id: string | null
  notes: string | null
}

router.post('/invite', requireAuth, async (req, res): Promise<void> => {
  const { email, full_name, role, notes } = req.body as {
    email?: string
    full_name?: string
    role?: InviteRole
    notes?: string
  }

  const cleanEmail = email?.trim().toLowerCase()
  const cleanName  = full_name?.trim() || null
  const cleanRole: InviteRole = role === 'owner' || role === 'tech' || role === 'advisor' ? role : 'owner'
  const cleanNotes = notes?.trim() || null

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Valid email is required' })
    return
  }

  try {
    const sb = getFPSupabase()

    // Block obvious duplicates (pending or already activated)
    const { data: existingInvite } = await sb
      .from('fp_invites')
      .select('id, status')
      .eq('email', cleanEmail)
      .maybeSingle()

    if (existingInvite && existingInvite.status === 'pending') {
      res.status(409).json({
        error:  'Already invited',
        detail: 'This email has a pending invite. Use resend instead.',
        inviteId: existingInvite.id,
      })
      return
    }
    if (existingInvite && existingInvite.status === 'activated') {
      res.status(409).json({
        error:  'Already activated',
        detail: 'This user has already activated their account.',
      })
      return
    }

    // Check if auth user already exists — handles the "confirmed but stuck" case
    // (e.g. user clicked a prior broken invite link and is now email-confirmed
    // but has no shop yet). inviteUserByEmail errors on confirmed users, so we
    // fall back to generateLink for those.
    const { data: listed } = await sb.auth.admin.listUsers({ perPage: 1000 })
    const existingAuth = listed?.users?.find(u => (u.email ?? '').toLowerCase() === cleanEmail)

    let authUserId: string | null = null

    if (existingAuth && existingAuth.email_confirmed_at) {
      // Confirmed user — send a branded magic link
      const { error: linkErr } = await sb.auth.admin.generateLink({
        type:    'magiclink',
        email:   cleanEmail,
        options: { redirectTo: getAppUrl() },
      })
      if (linkErr) {
        console.error('[fp/invite] generateLink error:', linkErr)
        res.status(500).json({ error: linkErr.message })
        return
      }
      authUserId = existingAuth.id
    } else {
      // New user OR unconfirmed existing user — standard invite flow
      const { data, error } = await sb.auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: getAppUrl(),
        data: {
          full_name:    cleanName,
          invited_role: cleanRole,
        },
      })
      if (error) {
        console.error('[fp/invite] inviteUserByEmail error:', error)
        res.status(500).json({ error: error.message })
        return
      }
      authUserId = data.user?.id ?? null
    }

    // Upsert tracking row (overwrite any prior revoked row for same email)
    const { data: inviteRow, error: insertErr } = await sb
      .from('fp_invites')
      .upsert({
        email:        cleanEmail,
        full_name:    cleanName,
        role:         cleanRole,
        status:       'pending',
        invited_by:   (req as any).user?.email ?? 'overseer',
        invited_at:   new Date().toISOString(),
        auth_user_id: authUserId,
        notes:        cleanNotes,
      }, { onConflict: 'email' })
      .select()
      .single()

    if (insertErr) {
      console.error('[fp/invite] fp_invites insert error:', insertErr)
      // Non-fatal — the email did send, just log the DB failure
    }

    res.json({ success: true, invite: inviteRow, auth_user_id: authUserId })
  } catch (err) {
    console.error('[fp/invite]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.get('/invites', requireAuth, async (_req, res) => {
  try {
    const sb = getFPSupabase()
    const { data, error } = await sb
      .from('fp_invites')
      .select('*')
      .order('invited_at', { ascending: false })

    if (error) throw error

    // Enrich with last_session_at for activated users
    const activatedIds = (data ?? [])
      .filter((i: InviteRow) => i.auth_user_id && i.status === 'activated')
      .map((i: InviteRow) => i.auth_user_id as string)

    const lastSessionMap: Record<string, string> = {}
    if (activatedIds.length > 0) {
      const { data: sessions } = await sb
        .from('fp_sessions')
        .select('user_id, updated_at')
        .in('user_id', activatedIds)
        .order('updated_at', { ascending: false })

      for (const s of sessions ?? []) {
        if (!lastSessionMap[s.user_id]) lastSessionMap[s.user_id] = s.updated_at
      }
    }

    const enriched = (data ?? []).map((i: InviteRow) => ({
      ...i,
      last_session_at: i.auth_user_id ? (lastSessionMap[i.auth_user_id] ?? null) : null,
    }))

    res.json(enriched)
  } catch (err) {
    console.error('[fp/invites] GET', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/invites/:id/resend', requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params
  try {
    const sb = getFPSupabase()
    const { data: invite, error: fetchErr } = await sb
      .from('fp_invites')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !invite) {
      res.status(404).json({ error: 'Invite not found' })
      return
    }
    if (invite.status !== 'pending') {
      res.status(400).json({ error: `Cannot resend invite in status "${invite.status}"` })
      return
    }

    // Determine which path to use (same logic as POST /invite)
    const { data: listed } = await sb.auth.admin.listUsers({ perPage: 1000 })
    const existingAuth = listed?.users?.find(u => (u.email ?? '').toLowerCase() === invite.email.toLowerCase())

    if (existingAuth && existingAuth.email_confirmed_at) {
      const { error } = await sb.auth.admin.generateLink({
        type:    'magiclink',
        email:   invite.email,
        options: { redirectTo: getAppUrl() },
      })
      if (error) { res.status(500).json({ error: error.message }); return }
    } else {
      const { error } = await sb.auth.admin.inviteUserByEmail(invite.email, {
        redirectTo: getAppUrl(),
        data: {
          full_name:    invite.full_name,
          invited_role: invite.role,
        },
      })
      if (error) { res.status(500).json({ error: error.message }); return }
    }

    await sb
      .from('fp_invites')
      .update({ invited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)

    res.json({ success: true })
  } catch (err) {
    console.error('[fp/invites/resend]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.delete('/invites/:id', requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params
  try {
    const sb = getFPSupabase()
    const { data: invite, error: fetchErr } = await sb
      .from('fp_invites')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !invite) {
      res.status(404).json({ error: 'Invite not found' })
      return
    }

    // If still pending and auth user never confirmed, delete the auth row too
    if (invite.status === 'pending' && invite.auth_user_id) {
      const { data: listed } = await sb.auth.admin.listUsers({ perPage: 1000 })
      const authUser = listed?.users?.find(u => u.id === invite.auth_user_id)
      if (authUser && !authUser.email_confirmed_at) {
        const { error: delAuthErr } = await sb.auth.admin.deleteUser(invite.auth_user_id)
        if (delAuthErr) {
          console.warn('[fp/invites/delete] auth user delete failed:', delAuthErr.message)
        }
      }
    }

    await sb
      .from('fp_invites')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', id)

    res.json({ success: true })
  } catch (err) {
    console.error('[fp/invites/delete]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
