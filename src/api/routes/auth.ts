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

  // Look up active account (case-insensitive username)
  let admin: AdminRow | null = null
  if (username) {
    const { data } = await overseerDb
      .from('overseer_admins')
      .select('id, username, email, password_hash, role, status, must_change_password')
      .eq('username', String(username).toLowerCase())
      .eq('status', 'active')
      .maybeSingle()
    admin = (data as AdminRow | null) ?? null
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
  // 24h session for a god-mode panel (was 7d) — paired with the panel's
  // proactive expiry + "session expired" message. Adjust with Clutch if needed.
  const token = jwt.sign({ sub: admin.id, username: admin.username, role: admin.role }, secret, { expiresIn: '24h' })

  // Fail-safe: last_login update + audit must not block the response.
  overseerDb.from('overseer_admins').update({ last_login_at: new Date().toISOString() }).eq('id', admin.id)
    .then(() => {}, (err: unknown) => console.error('[auth] last_login update failed:', err))

  req.panelUser = { id: admin.id, username: admin.username, role: admin.role }
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
        await sendEmail({
          to: account.email,
          subject: 'Reset your Crimson Forge Overseer password',
          text: `A password reset was requested for ${account.username}.\n\nReset link (valid 30 minutes):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
          html: `<p>A password reset was requested for <b>${account.username}</b>.</p><p><a href="${link}">Reset your password</a> (valid 30 minutes).</p><p>If you didn't request this, you can ignore this email.</p>`,
        })
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

  req.panelUser = { id: account.id, username: account.username, role: 'read_only' }
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

export default router
