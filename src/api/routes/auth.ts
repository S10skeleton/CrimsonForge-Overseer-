/**
 * Auth routes — named accounts (overseer_admins), JWT issuance, password reset.
 * Replaces the legacy shared-passphrase login.
 *
 * Side effects (audit, events, last_login, email) are all fail-safe: a failure
 * there must never 500 a login or reset.
 */

import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import type { AuthRequest } from '../middleware/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import {
  verifyPassword,
  hashPassword,
  assertPasswordStrength,
  PasswordPolicyError,
  DUMMY_HASH,
} from '../../lib/password.js'
import { audit } from '../../lib/audit.js'
import { sendEmail } from '../../notifications/email.js'
import { resetEmail } from '../../notifications/emailTemplates.js'
import type { Permissions } from '../../lib/permissions.js'
import { generateTotpSecret, otpauthUrl, qrDataUrl, verifyToken, encryptSecret, decryptSecret, genRecoveryCodes, hashRecoveryCode } from '../../lib/totp.js'

const router = Router()

// ─── Brute-force lockout (per IP — single Railway instance; in-memory) ───────
// NOTE: per-IP, not per IP+username. Adequate for the founder panel and exactly
// matches the GET /api/auth/status contract the panel already polls.
const MAX_ATTEMPTS = 5
const LOCK_MS = 15 * 60 * 1000
const attempts = new Map<string, { count: number; lockedUntil: number }>()

function clientIp(req: AuthRequest): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

function lockState(ip: string): { locked: boolean; secondsRemaining: number } {
  const rec = attempts.get(ip)
  if (rec && rec.lockedUntil > Date.now()) {
    return { locked: true, secondsRemaining: Math.ceil((rec.lockedUntil - Date.now()) / 1000) }
  }
  return { locked: false, secondsRemaining: 0 }
}

function recordFailure(ip: string): { locked: boolean; secondsRemaining: number; attemptsLeft: number } {
  const rec = attempts.get(ip) ?? { count: 0, lockedUntil: 0 }
  rec.count += 1
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MS
    rec.count = 0
    attempts.set(ip, rec)
    return { locked: true, secondsRemaining: Math.ceil(LOCK_MS / 1000), attemptsLeft: 0 }
  }
  attempts.set(ip, rec)
  return { locked: false, secondsRemaining: 0, attemptsLeft: MAX_ATTEMPTS - rec.count }
}

function clearFailures(ip: string): void {
  attempts.delete(ip)
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

interface AdminRow {
  id: string
  username: string
  email: string
  password_hash: string
  role: 'owner' | 'admin' | 'read_only'
  status: string
  must_change_password: boolean
  totp_enabled?: boolean
}

// ─── GET /api/auth/status ────────────────────────────────────────────────────
// Preserves the lockout contract the panel polls on the login screen.
router.get('/status', (req: AuthRequest, res) => {
  const { locked, secondsRemaining } = lockState(clientIp(req))
  res.json(locked ? { locked: true, secondsRemaining } : { locked: false })
})

// ─── POST /api/auth/login  { username, password } ────────────────────────────
router.post('/login', async (req: AuthRequest, res) => {
  const { username, password } = req.body as { username?: string; password?: string }
  const secret = process.env.PANEL_JWT_SECRET
  if (!secret) {
    res.status(500).json({ error: 'Panel auth not configured' })
    return
  }

  const ip = clientIp(req)
  const lock = lockState(ip)
  if (lock.locked) {
    res.status(401).json({ error: 'Too many failed attempts', locked: true, secondsRemaining: lock.secondsRemaining })
    return
  }

  // Look up active account (case-insensitive username). Rollout-safe: if the
  // totp_enabled column isn't migrated yet, fall back without it (2FA off).
  let admin: AdminRow | null = null
  if (username) {
    const uname = String(username).toLowerCase()
    const first = await overseerDb
      .from('overseer_admins')
      .select('id, username, email, password_hash, role, status, must_change_password, totp_enabled')
      .eq('username', uname).eq('status', 'active').maybeSingle()
    let row = first.data
    if (first.error) {
      const r2 = await overseerDb
        .from('overseer_admins')
        .select('id, username, email, password_hash, role, status, must_change_password')
        .eq('username', uname).eq('status', 'active').maybeSingle()
      row = r2.data as typeof row
    }
    admin = (row as AdminRow | null) ?? null
  }

  // Always run a compare (against a dummy hash if no user) to equalize timing.
  const ok = await verifyPassword(String(password ?? ''), admin?.password_hash ?? DUMMY_HASH)

  if (!admin || !ok) {
    const f = recordFailure(ip)
    res.status(401).json({
      error: 'Incorrect username or password',
      ...(f.locked ? { locked: true, secondsRemaining: f.secondsRemaining } : { attemptsLeft: f.attemptsLeft }),
    })
    return
  }

  clearFailures(ip)

  // 2FA: if enabled, don't issue a session — return a short-lived pending token
  // that the code step exchanges for the real session.
  if (admin.totp_enabled) {
    const mfaToken = jwt.sign({ sub: admin.id, scope: 'mfa-pending' }, secret, { expiresIn: '5m' })
    res.json({ mfaRequired: true, mfaToken })
    return
  }

  // 24h session for a god-mode panel (was 7d) — paired with the panel's
  // proactive expiry + "session expired" message. Adjust with Clutch if needed.
  const token = jwt.sign({ sub: admin.id, username: admin.username, role: admin.role }, secret, { expiresIn: '24h' })

  // Fail-safe: last_login update + audit must not block the response.
  overseerDb.from('overseer_admins').update({ last_login_at: new Date().toISOString() }).eq('id', admin.id)
    .then(() => {}, (err: unknown) => console.error('[auth] last_login update failed:', err))

  req.panelUser = { id: admin.id, username: admin.username, role: admin.role, permissions: {} }
  audit(req, { action: 'auth.login' })

  res.json({
    token,
    role: admin.role,
    user: { id: admin.id, username: admin.username, email: admin.email, must_change_password: admin.must_change_password },
  })
})

// ─── POST /api/auth/forgot  { usernameOrEmail } ──────────────────────────────
// Always 200 — no user enumeration.
router.post('/forgot', async (req: AuthRequest, res) => {
  const { usernameOrEmail } = req.body as { usernameOrEmail?: string }

  try {
    const needle = String(usernameOrEmail ?? '').toLowerCase().trim()
    if (needle) {
      const { data } = await overseerDb
        .from('overseer_admins')
        .select('id, username, email')
        .or(`username.eq.${needle},email.eq.${needle}`)
        .eq('status', 'active')
        .maybeSingle()

      const account = data as { id: string; username: string; email: string } | null
      if (account) {
        const rawToken = crypto.randomBytes(32).toString('base64url')
        const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString()
        await overseerDb
          .from('overseer_admins')
          .update({ reset_token_hash: sha256(rawToken), reset_token_expires_at: expires })
          .eq('id', account.id)

        const base = process.env.PANEL_RESET_URL_BASE || ''
        const link = `${base}/reset?token=${rawToken}`
        const tpl = resetEmail({ name: account.username, resetUrl: link })
        await sendEmail({ to: account.email, subject: tpl.subject, html: tpl.html, text: tpl.text })
        audit(req, { action: 'auth.password_reset_requested', targetType: 'admin', targetId: account.id, meta: { username: account.username } })
      }
    }
  } catch (err) {
    console.error('[auth] forgot failed:', err)
  }

  res.json({ ok: true })
})

// ─── POST /api/auth/reset  { token, newPassword } ────────────────────────────
router.post('/reset', async (req: AuthRequest, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string }

  if (!token || !newPassword) {
    res.status(400).json({ error: 'Invalid or expired reset link' })
    return
  }

  try {
    assertPasswordStrength(newPassword)
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }

  const { data } = await overseerDb
    .from('overseer_admins')
    .select('id, username')
    .eq('reset_token_hash', sha256(token))
    .gt('reset_token_expires_at', new Date().toISOString())
    .eq('status', 'active')
    .maybeSingle()

  const account = data as { id: string; username: string } | null
  if (!account) {
    res.status(400).json({ error: 'Invalid or expired reset link' })
    return
  }

  const password_hash = await hashPassword(newPassword)
  const { error } = await overseerDb
    .from('overseer_admins')
    .update({ password_hash, reset_token_hash: null, reset_token_expires_at: null, must_change_password: false })
    .eq('id', account.id)

  if (error) {
    res.status(500).json({ error: 'Could not reset password' })
    return
  }

  req.panelUser = { id: account.id, username: account.username, role: 'read_only', permissions: {} }
  audit(req, { action: 'auth.password_reset', targetType: 'admin', targetId: account.id, meta: { username: account.username } })
  res.json({ ok: true })
})

// ─── POST /api/auth/change-password (auth) { currentPassword, newPassword } ───
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string }
  const me = req.panelUser
  if (!me?.id) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    assertPasswordStrength(String(newPassword ?? ''))
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }

  const { data } = await overseerDb
    .from('overseer_admins')
    .select('id, password_hash')
    .eq('id', me.id)
    .maybeSingle()

  const account = data as { id: string; password_hash: string } | null
  if (!account || !(await verifyPassword(String(currentPassword ?? ''), account.password_hash))) {
    res.status(400).json({ error: 'Current password is incorrect' })
    return
  }

  const password_hash = await hashPassword(String(newPassword))
  const { error } = await overseerDb
    .from('overseer_admins')
    .update({ password_hash, must_change_password: false })
    .eq('id', account.id)

  if (error) {
    res.status(500).json({ error: 'Could not change password' })
    return
  }

  audit(req, { action: 'auth.change_password', targetType: 'admin', targetId: account.id })
  res.json({ ok: true })
})

// ─── POST /api/auth/accept-invite  { token, username?, password } ────────────
// Public: creates the account from a valid invite (invitee sets their own pw).
router.post('/accept-invite', async (req: AuthRequest, res) => {
  const { token, username, password } = req.body as { token?: string; username?: string; password?: string }
  const secret = process.env.PANEL_JWT_SECRET
  if (!token || !password || !secret) {
    res.status(400).json({ error: 'Invalid invite' })
    return
  }
  try {
    assertPasswordStrength(password)
  } catch (err) {
    if (err instanceof PasswordPolicyError) { res.status(400).json({ error: err.message }); return }
    throw err
  }

  const { data } = await overseerDb
    .from('overseer_invites')
    .select('id, email, username, role, permissions, invited_by')
    .eq('token_hash', sha256(token))
    .eq('status', 'invited')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  const invite = data as { id: string; email: string; username: string | null; role: string; permissions: Permissions; invited_by: string | null } | null
  if (!invite) {
    res.status(400).json({ error: 'This invite is invalid or has expired' })
    return
  }

  const uname = String(invite.username || username || invite.email.split('@')[0]).toLowerCase().trim()
  if (!uname) { res.status(400).json({ error: 'A username is required' }); return }

  const { data: clash } = await overseerDb.from('overseer_admins').select('id').eq('username', uname).maybeSingle()
  if (clash) { res.status(409).json({ error: 'That username is taken — choose another' }); return }

  const adminRole = invite.role === 'custom' ? 'read_only' : invite.role
  const password_hash = await hashPassword(password)

  const { data: admin, error } = await overseerDb.from('overseer_admins').insert({
    username: uname,
    email: invite.email,
    password_hash,
    role: adminRole,
    status: 'active',
    must_change_password: false,
    permissions: invite.permissions ?? {},
    created_by: invite.invited_by ?? null,
  }).select('id, username, email, role').single()

  if (error) {
    const dup = /duplicate|unique/i.test(error.message)
    res.status(dup ? 409 : 500).json({ error: dup ? 'That username or email already exists' : 'Could not create account' })
    return
  }

  await overseerDb.from('overseer_invites').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invite.id)

  req.panelUser = { id: admin.id, username: admin.username, role: adminRole as 'owner' | 'admin' | 'read_only', permissions: {} }
  audit(req, { action: 'admin.invite_accepted', targetType: 'admin', targetId: admin.id, meta: { username: uname } })

  const sessionToken = jwt.sign({ sub: admin.id, username: admin.username, role: adminRole }, secret, { expiresIn: '24h' })
  res.status(201).json({
    token: sessionToken,
    role: adminRole,
    user: { id: admin.id, username: admin.username, email: admin.email, must_change_password: false },
  })
})

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
// Lets the panel refresh role/permissions without a full re-login.
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const u = req.panelUser
  res.json({ id: u?.id, username: u?.username, role: u?.role, permissions: u?.permissions ?? {} })
})

// ─── POST /api/auth/login/2fa  { mfaToken, code } ────────────────────────────
// Exchanges the pending-MFA token + a TOTP code (or recovery code) for a session.
router.post('/login/2fa', async (req: AuthRequest, res) => {
  const { mfaToken, code } = req.body as { mfaToken?: string; code?: string }
  const secret = process.env.PANEL_JWT_SECRET
  if (!secret || !mfaToken || !code) { res.status(400).json({ error: 'Invalid request' }); return }

  const ip = clientIp(req)
  const lock = lockState(ip)
  if (lock.locked) { res.status(401).json({ error: 'Too many failed attempts', locked: true, secondsRemaining: lock.secondsRemaining }); return }

  let sub = ''
  try {
    const p = jwt.verify(mfaToken, secret) as { sub?: string; scope?: string }
    if (p.scope !== 'mfa-pending' || !p.sub) throw new Error('bad scope')
    sub = p.sub
  } catch {
    res.status(401).json({ error: 'Your sign-in expired — start again' })
    return
  }

  const { data } = await overseerDb
    .from('overseer_admins')
    .select('id, username, email, role, status, must_change_password, totp_secret, recovery_codes')
    .eq('id', sub).eq('status', 'active').maybeSingle()
  const acct = data as (AdminRow & { totp_secret: string | null; recovery_codes: string[] }) | null
  if (!acct || !acct.totp_secret) { res.status(401).json({ error: 'Two-factor is not set up' }); return }

  let valid = await verifyToken(decryptSecret(acct.totp_secret), String(code))
  let usedRecoveryIdx = -1
  if (!valid && Array.isArray(acct.recovery_codes)) {
    usedRecoveryIdx = acct.recovery_codes.indexOf(hashRecoveryCode(String(code)))
    valid = usedRecoveryIdx >= 0
  }

  if (!valid) {
    const f = recordFailure(ip)
    req.panelUser = { id: acct.id, username: acct.username, role: acct.role, permissions: {} }
    audit(req, { action: 'auth.2fa_failed', targetType: 'admin', targetId: acct.id })
    res.status(401).json({ error: 'Incorrect code', ...(f.locked ? { locked: true, secondsRemaining: f.secondsRemaining } : { attemptsLeft: f.attemptsLeft }) })
    return
  }

  clearFailures(ip)
  if (usedRecoveryIdx >= 0) {
    const remaining = acct.recovery_codes.filter((_, i) => i !== usedRecoveryIdx)
    overseerDb.from('overseer_admins').update({ recovery_codes: remaining }).eq('id', acct.id).then(() => {}, () => {})
  }

  const token = jwt.sign({ sub: acct.id, username: acct.username, role: acct.role, mfa: true }, secret, { expiresIn: '24h' })
  overseerDb.from('overseer_admins').update({ last_login_at: new Date().toISOString() }).eq('id', acct.id).then(() => {}, () => {})
  req.panelUser = { id: acct.id, username: acct.username, role: acct.role, permissions: {} }
  audit(req, { action: 'auth.login', meta: { mfa: true } })
  res.json({ token, role: acct.role, user: { id: acct.id, username: acct.username, email: acct.email, must_change_password: acct.must_change_password } })
})

// ─── 2FA enrollment (self-service; requireAuth) ──────────────────────────────
router.get('/2fa/status', requireAuth, async (req: AuthRequest, res) => {
  const { data } = await overseerDb.from('overseer_admins').select('totp_enabled').eq('id', req.panelUser?.id ?? '').maybeSingle()
  res.json({ enabled: Boolean((data as { totp_enabled?: boolean } | null)?.totp_enabled) })
})

router.post('/2fa/setup', requireAuth, async (req: AuthRequest, res) => {
  const me = req.panelUser
  if (!me?.id) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { data } = await overseerDb.from('overseer_admins').select('totp_enabled').eq('id', me.id).maybeSingle()
  if ((data as { totp_enabled?: boolean } | null)?.totp_enabled) { res.status(400).json({ error: '2FA already enabled — disable it first to re-enroll' }); return }

  const secret = generateTotpSecret()
  const url = otpauthUrl(secret, me.username || 'overseer')
  const { error } = await overseerDb.from('overseer_admins').update({ totp_secret: encryptSecret(secret), totp_enabled: false }).eq('id', me.id)
  if (error) { res.status(500).json({ error: 'Could not start 2FA setup' }); return }
  res.json({ otpauthUrl: url, qrDataUrl: await qrDataUrl(url) })
})

router.post('/2fa/verify', requireAuth, async (req: AuthRequest, res) => {
  const me = req.panelUser
  if (!me?.id) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { code } = req.body as { code?: string }
  const { data } = await overseerDb.from('overseer_admins').select('totp_secret').eq('id', me.id).maybeSingle()
  const secretEnc = (data as { totp_secret?: string | null } | null)?.totp_secret
  if (!secretEnc) { res.status(400).json({ error: 'Start setup first' }); return }
  if (!(await verifyToken(decryptSecret(secretEnc), String(code ?? '')))) { res.status(400).json({ error: 'Incorrect code' }); return }

  const { plain, hashes } = genRecoveryCodes()
  const { error } = await overseerDb.from('overseer_admins').update({ totp_enabled: true, recovery_codes: hashes }).eq('id', me.id)
  if (error) { res.status(500).json({ error: 'Could not enable 2FA' }); return }
  audit(req, { action: 'auth.2fa_enabled', targetType: 'admin', targetId: me.id })
  res.json({ ok: true, recoveryCodes: plain })
})

router.post('/2fa/disable', requireAuth, async (req: AuthRequest, res) => {
  const me = req.panelUser
  if (!me?.id) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { code, recoveryCode, password } = req.body as { code?: string; recoveryCode?: string; password?: string }
  const { data } = await overseerDb.from('overseer_admins').select('totp_secret, recovery_codes, password_hash, totp_enabled').eq('id', me.id).maybeSingle()
  const acct = data as { totp_secret: string | null; recovery_codes: string[]; password_hash: string; totp_enabled: boolean } | null
  if (!acct?.totp_enabled) { res.status(400).json({ error: '2FA is not enabled' }); return }

  let ok = false
  if (code && acct.totp_secret) ok = await verifyToken(decryptSecret(acct.totp_secret), String(code))
  if (!ok && recoveryCode && Array.isArray(acct.recovery_codes)) ok = acct.recovery_codes.includes(hashRecoveryCode(String(recoveryCode)))
  if (!ok && password) ok = await verifyPassword(String(password), acct.password_hash)
  if (!ok) { res.status(400).json({ error: 'Verification failed' }); return }

  await overseerDb.from('overseer_admins').update({ totp_secret: null, totp_enabled: false, recovery_codes: [] }).eq('id', me.id)
  audit(req, { action: 'auth.2fa_disabled', targetType: 'admin', targetId: me.id })
  res.json({ ok: true })
})

router.post('/2fa/recovery/regenerate', requireAuth, async (req: AuthRequest, res) => {
  const me = req.panelUser
  if (!me?.id) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { code } = req.body as { code?: string }
  const { data } = await overseerDb.from('overseer_admins').select('totp_secret, totp_enabled').eq('id', me.id).maybeSingle()
  const acct = data as { totp_secret: string | null; totp_enabled: boolean } | null
  if (!acct?.totp_enabled || !acct.totp_secret) { res.status(400).json({ error: '2FA is not enabled' }); return }
  if (!(await verifyToken(decryptSecret(acct.totp_secret), String(code ?? '')))) { res.status(400).json({ error: 'Incorrect code' }); return }

  const { plain, hashes } = genRecoveryCodes()
  await overseerDb.from('overseer_admins').update({ recovery_codes: hashes }).eq('id', me.id)
  res.json({ ok: true, recoveryCodes: plain })
})

export default router
