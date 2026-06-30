/**
 * ForgePilot data routes — reads directly from ForgePilot Supabase
 * Same pattern as cfp.ts. Read-only.
 */

import { Router } from 'express'
import { getForgePilotBilling } from '../../lib/billing.js'
import { createClient } from '@supabase/supabase-js'

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

// ── ForgePilot invite email (Resend) ────────────────────────────────────────
// Why this exists: Supabase's admin.generateLink returns an action_link but
// does NOT send email. admin.inviteUserByEmail errors when the user already
// exists. So for resend-to-existing-user (the 24hr-expired case), neither
// SDK method sends an email on its own. We generate the link with the right
// type and email it ourselves via Resend.

const FP_INVITE_FROM = 'ForgePilot <invites@crimsonforge.pro>'

function buildInviteEmailBody(actionLink: string, fullName: string | null): string {
  const greeting = fullName ? `Hi ${fullName.split(' ')[0]},` : 'Hi,'
  return [
    greeting,
    '',
    'You\'ve been invited to ForgePilot — the AI diagnostic copilot for auto shops.',
    '',
    'Click the link below to set up your account:',
    '',
    actionLink,
    '',
    'This link is valid for 24 hours. If it expires, just reply to this email and we\'ll send a fresh one.',
    '',
    '— The ForgePilot team',
  ].join('\n')
}

async function generateInviteLink(
  sb: ReturnType<typeof getFPSupabase>,
  email: string,
  fullName: string | null,
  role: string,
  isConfirmed: boolean,
): Promise<{ link: string | null; error?: string }> {
  // 'invite' creates the user if needed and returns a signup/invite link.
  // 'magiclink' is used when the user is already confirmed (can't re-invite).
  const linkType = isConfirmed ? 'magiclink' : 'invite'
  const { data, error } = await sb.auth.admin.generateLink({
    type:    linkType as 'invite' | 'magiclink',
    email,
    options: {
      redirectTo: getAppUrl(),
      data: { full_name: fullName, invited_role: role },
    },
  })
  if (error) return { link: null, error: error.message }
  const link = data?.properties?.action_link ?? null
  if (!link) return { link: null, error: 'No action_link returned from Supabase' }
  return { link }
}

async function sendInviteViaResend(
  email: string,
  fullName: string | null,
  actionLink: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured on Overseer' }
  }
  try {
    const toName = fullName?.trim() || email.split('@')[0]
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FP_INVITE_FROM,
        to:      [`${toName} <${email}>`],
        subject: 'You\'re invited to ForgePilot',
        text:    buildInviteEmailBody(actionLink, fullName),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string }
      return { success: false, error: body.message || `Resend HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown Resend error' }
  }
}

/**
 * Full invite flow: look up auth user, generate link via Supabase admin,
 * send via Resend. Hard-requires RESEND_API_KEY. Returns auth_user_id so
 * the caller can store it in fp_invites.
 */
async function sendFPInviteEmail(
  sb: ReturnType<typeof getFPSupabase>,
  email: string,
  fullName: string | null,
  role: string,
): Promise<{ success: boolean; authUserId: string | null; error?: string }> {
  // Look up existing auth user
  const { data: listed } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const existingAuth = listed?.users?.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())
  const isConfirmed = !!existingAuth?.email_confirmed_at

  // Generate the link
  const linkResult = await generateInviteLink(sb, email, fullName, role, isConfirmed)
  if (linkResult.error || !linkResult.link) {
    return { success: false, authUserId: existingAuth?.id ?? null, error: linkResult.error ?? 'No link' }
  }

  // Send it
  const sendResult = await sendInviteViaResend(email, fullName, linkResult.link)
  if (!sendResult.success) {
    return { success: false, authUserId: existingAuth?.id ?? null, error: sendResult.error }
  }

  // Re-fetch in case generateLink created a new user
  let authUserId = existingAuth?.id ?? null
  if (!authUserId) {
    const { data: listed2 } = await sb.auth.admin.listUsers({ perPage: 1000 })
    authUserId = listed2?.users?.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())?.id ?? null
  }

  return { success: true, authUserId }
}

// ── Stats summary ───────────────────────────────────────────────────────────

router.get('/stats', async (_req, res) => {
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

router.get('/users', async (_req, res) => {
  try {
    const sb = getFPSupabase()
    // `phone` is captured at signup; tolerate DBs without the column yet by
    // retrying without it (P1a: surface phone read-only on Accounts).
    const baseCols = 'id, email, subscription_tier, shop_role, obd_enabled, cfp_shop_id, shop_id, created_at, updated_at'
    const selectUsers = (withPhone: boolean) =>
      sb.from('fp_users').select(withPhone ? `${baseCols}, phone` : baseCols).order('created_at', { ascending: false })
    let ur = await selectUsers(true)
    if (ur.error) ur = await selectUsers(false)
    if (ur.error) throw ur.error
    const data = ur.data

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

router.get('/shops', async (_req, res) => {
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

router.get('/sessions', async (_req, res) => {
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

router.get('/billing', async (_req, res): Promise<void> => {
  try {
    res.json(await getForgePilotBilling())
  } catch (err) {
    console.error('[fp/billing]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── FP System Messages ────────────────────────────────────────────────────────

router.get('/messages', async (_req, res) => {
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

router.post('/messages', async (req, res): Promise<void> => {
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

router.patch('/messages/:id', async (req, res) => {
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

router.delete('/messages/:id', async (req, res) => {
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

router.get('/feedback', async (_req, res) => {
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

router.patch('/feedback/:id', async (req, res) => {
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

router.post('/invite', async (req, res): Promise<void> => {
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

    // Generate the action link and send via Resend ourselves. Handles all
    // three cases (new / unconfirmed-existing / confirmed-stuck) in one path.
    const sendResult = await sendFPInviteEmail(sb, cleanEmail, cleanName, cleanRole)
    if (!sendResult.success) {
      console.error('[fp/invite] send error:', sendResult.error)
      res.status(500).json({ error: sendResult.error ?? 'Failed to send invite' })
      return
    }
    const authUserId = sendResult.authUserId

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

router.get('/invites', async (_req, res) => {
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

router.post('/invites/:id/resend', async (req, res): Promise<void> => {
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

    // Same single path as POST /invite — generate link + send via Resend.
    const sendResult = await sendFPInviteEmail(sb, invite.email, invite.full_name, invite.role)
    if (!sendResult.success) {
      console.error('[fp/invites/resend] send error:', sendResult.error)
      res.status(500).json({ error: sendResult.error ?? 'Failed to resend invite' })
      return
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

router.delete('/invites/:id', async (req, res): Promise<void> => {
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

// ── ForgeAssist insights (read) ─────────────────────────────────────────────

router.get('/insights', async (req, res) => {
  try {
    const daysRaw = Number(req.query.days ?? '7')
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 7
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const supabase = getFPSupabase()
    const { data, error } = await supabase
      .from('fp_session_insights')
      .select(`
        id,
        session_id,
        shop_id,
        analyzed_at,
        status,
        ai_helpfulness,
        ai_specificity,
        tech_frustration,
        resolution_score,
        topic_tag,
        outcome,
        pattern_note,
        session:fp_sessions(year, make, model, last_dtc, message_count, created_at)
      `)
      .eq('status', 'success')
      .gte('analyzed_at', sinceIso)
      .order('analyzed_at', { ascending: false })
      .limit(500)

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[fp/insights]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── ForgeAssist insight backfill ────────────────────────────────────────────
// One-time use: populates fp_session_insights for any session that doesn't
// have a row yet. Idempotent — re-running only analyzes sessions still
// missing insights. Bounded by FP_INSIGHTS_BATCH_LIMIT per call.

router.post('/backfill-insights', async (_req, res) => {
  try {
    const { runInsightAnalysis } = await import('../../jobs/fp-insights.js')
    const summary = await runInsightAnalysis()
    res.json(summary)
  } catch (err) {
    console.error('[fp/backfill-insights]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
