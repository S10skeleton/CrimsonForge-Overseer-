/**
 * Admin management — named operator accounts (overseer_admins).
 * List/read: requireAdmin. All mutations: requireOwner. Everything audited;
 * account-changing actions emit activity events. Never returns secrets.
 */

import { Router } from 'express'
import crypto from 'crypto'
import type { Role, AuthRequest } from '../middleware/auth.js'
import { requireOwner } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import { hashPassword } from '../../lib/password.js'
import { audit } from '../../lib/audit.js'
import { sendEmail, isEmailConfigured } from '../../notifications/email.js'
import { inviteEmail } from '../../notifications/emailTemplates.js'
import { presetPermissions } from '../../lib/permissions.js'
import type { Permissions } from '../../lib/permissions.js'
import { bumpTrustedVersion, bumpSessionVersion } from './auth.js'

const router = Router()

const SAFE_COLUMNS = 'id, username, email, role, status, permissions, must_change_password, last_login_at, created_at, created_by'
const INVITE_COLUMNS = 'id, email, display_name, username, role, status, expires_at, created_at, accepted_at'
const ROLES: Role[] = ['owner', 'admin', 'read_only']
const INVITE_ROLES = ['owner', 'admin', 'read_only', 'custom']

function tempPassword(): string {
  // 18 bytes base64url → 24 chars, comfortably above the 12-char policy.
  return crypto.randomBytes(18).toString('base64url')
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

async function activeOwnerCount(): Promise<number> {
  const { count } = await overseerDb
    .from('overseer_admins')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'owner')
    .eq('status', 'active')
  return count ?? 0
}

// All /api/admins routes are OWNER-ONLY (SUPERADMIN-2 — Admins & Roles is now an
// owner surface inside SuperAdmin). The invitee accept flow lives on /api/auth/*
// and stays public so teammates can accept.
// ─── GET /api/admins ─────────────────────────────────────────────────────────
router.get('/', requireOwner, async (_req, res) => {
  const { data, error } = await overseerDb
    .from('overseer_admins')
    .select(SAFE_COLUMNS)
    .order('created_at', { ascending: true })

  if (error) {
    res.status(500).json({ error: 'Could not load admins' })
    return
  }
  res.json(data ?? [])
})

// ─── POST /api/admins  { username, email, role } ─────────────────────────────
router.post('/', requireOwner, async (req: AuthRequest, res) => {
  const { username, email, role } = req.body as { username?: string; email?: string; role?: Role }

  const uname = String(username ?? '').toLowerCase().trim()
  const mail = String(email ?? '').toLowerCase().trim()
  if (!uname || !mail || !role || !ROLES.includes(role)) {
    res.status(400).json({ error: 'username, email and a valid role are required' })
    return
  }

  const temp = tempPassword()
  const password_hash = await hashPassword(temp)

  const { data, error } = await overseerDb
    .from('overseer_admins')
    .insert({
      username: uname,
      email: mail,
      password_hash,
      role,
      status: 'active',
      must_change_password: true,
      created_by: req.panelUser?.id ?? null,
    })
    .select(SAFE_COLUMNS)
    .single()

  if (error) {
    const dup = /duplicate|unique/i.test(error.message)
    res.status(dup ? 409 : 500).json({ error: dup ? 'That username or email already exists' : 'Could not create admin' })
    return
  }

  audit(req, { action: 'admin.create', targetType: 'admin', targetId: data.id, meta: { username: uname, role } })

  // Email the temp password; fall back to returning it once if email is off/failed.
  let emailed = false
  if (isEmailConfigured()) {
    const base = process.env.PANEL_RESET_URL_BASE || ''
    const sent = await sendEmail({
      to: mail,
      subject: 'Your Crimson Forge Overseer account',
      text: `An Overseer account was created for you.\n\nUsername: ${uname}\nTemporary password: ${temp}\n\nSign in at ${base} and you'll be prompted to set a new password.`,
      html: `<p>An Overseer account was created for you.</p><p><b>Username:</b> ${uname}<br/><b>Temporary password:</b> <code>${temp}</code></p><p>Sign in at <a href="${base}">${base || 'the Overseer panel'}</a> and set a new password.</p>`,
    })
    emailed = sent.success
  }

  res.status(201).json({ admin: data, emailed, tempPassword: emailed ? undefined : temp })
})

// ─── PATCH /api/admins/:id  { role?, status?, email? } ───────────────────────
router.patch('/:id', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { role, status, email, permissions } = req.body as { role?: Role; status?: string; email?: string; permissions?: Permissions }

  const { data: current } = await overseerDb
    .from('overseer_admins')
    .select('id, username, role, status')
    .eq('id', id)
    .maybeSingle()

  const target = current as { id: string; username: string; role: Role; status: string } | null
  if (!target) {
    res.status(404).json({ error: 'Admin not found' })
    return
  }

  const updates: Record<string, unknown> = {}
  if (role !== undefined) {
    if (!ROLES.includes(role)) {
      res.status(400).json({ error: 'Invalid role' })
      return
    }
    updates.role = role
  }
  if (permissions !== undefined) updates.permissions = permissions
  if (status !== undefined) {
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Invalid status' })
      return
    }
    updates.status = status
  }
  if (email !== undefined) updates.email = String(email).toLowerCase().trim()

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'Nothing to update' })
    return
  }

  // Last-active-owner guard: block demoting/suspending the only owner.
  const demoting = updates.role !== undefined && updates.role !== 'owner' && target.role === 'owner'
  const suspending = updates.status === 'suspended' && target.role === 'owner' && target.status === 'active'
  if (demoting || suspending) {
    if ((await activeOwnerCount()) <= 1) {
      res.status(409).json({ error: 'Cannot demote or suspend the last active owner' })
      return
    }
  }

  const { data, error } = await overseerDb
    .from('overseer_admins')
    .update(updates)
    .eq('id', id)
    .select(SAFE_COLUMNS)
    .single()

  if (error) {
    res.status(500).json({ error: 'Could not update admin' })
    return
  }

  if (updates.role !== undefined && updates.role !== target.role) {
    audit(req, { action: 'admin.role_change', targetType: 'admin', targetId: id, meta: { username: target.username, role: updates.role } })
  }
  if (updates.status !== undefined && updates.status !== target.status) {
    audit(req, {
      action: updates.status === 'suspended' ? 'admin.suspend' : 'admin.reactivate',
      targetType: 'admin', targetId: id, meta: { username: target.username, status: updates.status },
    })
  }
  if (updates.permissions !== undefined) {
    audit(req, { action: 'admin.permissions_change', targetType: 'admin', targetId: id, meta: { username: target.username } })
  }

  res.json({ admin: data })
})

// ─── POST /api/admins/:id/reset-2fa ── owner clears a locked-out admin's 2FA ──
router.post('/:id/reset-2fa', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { data: current } = await overseerDb.from('overseer_admins').select('id, username').eq('id', id).maybeSingle()
  const target = current as { id: string; username: string } | null
  if (!target) { res.status(404).json({ error: 'Admin not found' }); return }

  const { error } = await overseerDb.from('overseer_admins')
    .update({ totp_secret: null, totp_enabled: false, recovery_codes: [] }).eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not reset 2FA' }); return }
  await bumpTrustedVersion(id) // void the target's trusted devices → TOTP again
  audit(req, { action: 'admin.reset_2fa', targetType: 'admin', targetId: id, meta: { username: target.username } })
  res.json({ ok: true })
})

// ─── POST /api/admins/:id/force-logout ── sign one account out everywhere ──────
// Bumps session_version (kills active 24h sessions) AND trusted_device_version
// (forgets trusted devices → TOTP again). For a lost/compromised device.
router.post('/:id/force-logout', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { data: current } = await overseerDb.from('overseer_admins').select('id, username').eq('id', id).maybeSingle()
  const target = current as { id: string; username: string } | null
  if (!target) { res.status(404).json({ error: 'Admin not found' }); return }

  await bumpSessionVersion(id)
  await bumpTrustedVersion(id)
  audit(req, { action: 'admin.force_logout', targetType: 'admin', targetId: id, meta: { username: target.username } })
  res.json({ ok: true })
})

// ─── POST /api/admins/signout-all ── sign EVERY account out everywhere ─────────
router.post('/signout-all', requireOwner, async (req: AuthRequest, res) => {
  const { data, error } = await overseerDb.from('overseer_admins').select('id').eq('status', 'active')
  if (error) { res.status(500).json({ error: 'Could not load accounts' }); return }
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  for (const id of ids) {
    await bumpSessionVersion(id)
    await bumpTrustedVersion(id)
  }
  audit(req, { action: 'admin.signout_all', targetType: 'admin', targetId: 'all', meta: { count: ids.length } })
  res.json({ ok: true, count: ids.length })
})

// ─── Invites ─────────────────────────────────────────────────────────────────
const INVITE_TTL_MS = 72 * 60 * 60 * 1000

async function emailInvite(opts: { mail: string; name?: string; inviterName?: string; rawToken: string }): Promise<{ emailed: boolean; acceptUrl: string }> {
  const base = process.env.PANEL_RESET_URL_BASE || ''
  const acceptUrl = `${base}/accept?token=${opts.rawToken}`
  let emailed = false
  if (isEmailConfigured()) {
    const tpl = inviteEmail({ name: opts.name, inviterName: opts.inviterName, acceptUrl, expiresHours: 72 })
    const sent = await sendEmail({ to: opts.mail, subject: tpl.subject, html: tpl.html, text: tpl.text })
    emailed = sent.success
  }
  return { emailed, acceptUrl }
}

// POST /api/admins/invite — owner invites a teammate (no temp password)
router.post('/invite', requireOwner, async (req: AuthRequest, res) => {
  const { email, displayName, username, role, permissions } = req.body as
    { email?: string; displayName?: string; username?: string; role?: string; permissions?: Permissions }
  const mail = String(email ?? '').toLowerCase().trim()
  if (!mail) { res.status(400).json({ error: 'email required' }); return }
  const r = role && INVITE_ROLES.includes(role) ? role : 'custom'
  const perms = permissions ?? presetPermissions(r)
  const rawToken = crypto.randomBytes(32).toString('base64url')

  const { data, error } = await overseerDb.from('overseer_invites').insert({
    email: mail,
    display_name: displayName ?? null,
    username: username ? String(username).toLowerCase().trim() : null,
    role: r,
    permissions: perms,
    token_hash: sha256(rawToken),
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    invited_by: req.panelUser?.id ?? null,
  }).select(INVITE_COLUMNS).single()

  if (error) { res.status(500).json({ error: 'Could not create invite' }); return }

  audit(req, { action: 'admin.invite', targetType: 'invite', targetId: data.id, meta: { email: mail, role: r } })
  const { emailed, acceptUrl } = await emailInvite({ mail, name: displayName, inviterName: req.panelUser?.username, rawToken })
  res.status(201).json({ invite: data, emailed, acceptUrl: emailed ? undefined : acceptUrl })
})

// GET /api/admins/invites — pending/recent invites (never the token hash)
router.get('/invites', requireOwner, async (_req, res) => {
  const { data, error } = await overseerDb
    .from('overseer_invites')
    .select(INVITE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) { res.status(500).json({ error: 'Could not load invites' }); return }
  res.json(data ?? [])
})

// POST /api/admins/invites/:id/resend — fresh token + re-email
router.post('/invites/:id/resend', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { data: inv } = await overseerDb.from('overseer_invites').select('id, email, display_name, status').eq('id', id).maybeSingle()
  const invite = inv as { id: string; email: string; display_name: string | null; status: string } | null
  if (!invite || invite.status === 'accepted') { res.status(404).json({ error: 'Invite not found or already accepted' }); return }

  const rawToken = crypto.randomBytes(32).toString('base64url')
  const { error } = await overseerDb.from('overseer_invites').update({
    token_hash: sha256(rawToken), expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(), status: 'invited',
  }).eq('id', id)
  if (error) { res.status(500).json({ error: 'Could not resend invite' }); return }

  audit(req, { action: 'admin.invite_resend', targetType: 'invite', targetId: id, meta: { email: invite.email } })
  const { emailed, acceptUrl } = await emailInvite({ mail: invite.email, name: invite.display_name ?? undefined, inviterName: req.panelUser?.username, rawToken })
  res.json({ ok: true, emailed, acceptUrl: emailed ? undefined : acceptUrl })
})

// POST /api/admins/invites/:id/revoke
router.post('/invites/:id/revoke', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)
  const { error } = await overseerDb.from('overseer_invites').update({ status: 'revoked' }).eq('id', id).neq('status', 'accepted')
  if (error) { res.status(500).json({ error: 'Could not revoke invite' }); return }
  audit(req, { action: 'admin.invite_revoke', targetType: 'invite', targetId: id })
  res.json({ ok: true })
})

// ─── POST /api/admins/:id/reset-password ─────────────────────────────────────
router.post('/:id/reset-password', requireOwner, async (req: AuthRequest, res) => {
  const id = String(req.params.id)

  const { data: current } = await overseerDb
    .from('overseer_admins')
    .select('id, username, email')
    .eq('id', id)
    .maybeSingle()

  const target = current as { id: string; username: string; email: string } | null
  if (!target) {
    res.status(404).json({ error: 'Admin not found' })
    return
  }

  const temp = tempPassword()
  const password_hash = await hashPassword(temp)
  const { error } = await overseerDb
    .from('overseer_admins')
    .update({ password_hash, must_change_password: true, reset_token_hash: null, reset_token_expires_at: null })
    .eq('id', id)

  if (error) {
    res.status(500).json({ error: 'Could not reset password' })
    return
  }

  await bumpTrustedVersion(id) // password reset voids the target's trusted devices
  audit(req, { action: 'admin.password_reset', targetType: 'admin', targetId: id, meta: { username: target.username } })

  let emailed = false
  if (isEmailConfigured()) {
    const base = process.env.PANEL_RESET_URL_BASE || ''
    const sent = await sendEmail({
      to: target.email,
      subject: 'Your Crimson Forge Overseer password was reset',
      text: `Your Overseer password was reset by an owner.\n\nUsername: ${target.username}\nTemporary password: ${temp}\n\nSign in at ${base} and set a new password.`,
      html: `<p>Your Overseer password was reset by an owner.</p><p><b>Username:</b> ${target.username}<br/><b>Temporary password:</b> <code>${temp}</code></p><p>Sign in at <a href="${base}">${base || 'the Overseer panel'}</a> and set a new password.</p>`,
    })
    emailed = sent.success
  }

  res.json({ ok: true, emailed, tempPassword: emailed ? undefined : temp })
})

export default router
