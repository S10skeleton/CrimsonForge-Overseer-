/**
 * JWT auth middleware for the control panel API.
 *
 * requireAuth re-loads the admin's current status + role + permissions from the
 * DB on every request (STEP7), so a suspended account is rejected immediately
 * and permission changes take effect without waiting for token expiry.
 *
 *   requireAuth          — any active login; sets req.panelUser incl. permissions
 *   requireArea(key,lvl) — per-area permission gate (owner always passes)
 *   requireAdmin         — owner or admin (legacy; broad privileged actions)
 *   requireOwner         — owner only (administration)
 */

import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { overseerDb } from '../../lib/overseerDb.js'
import { resolveAccess } from '../../lib/permissions.js'
import type { Permissions } from '../../lib/permissions.js'

export type Role = 'owner' | 'admin' | 'read_only'

export interface AuthRequest extends Request {
  panelUser?: { id: string; username: string; role: Role; permissions: Permissions }
}

interface PanelJwtPayload {
  sub?: string
  username?: string
  role?: string
  scope?: string
}

export function normalizeRole(role: string | undefined): Role {
  if (role === 'owner' || role === 'admin' || role === 'read_only') return role
  if (role === 'viewer') return 'read_only' // legacy tokens mid-rotation
  return 'read_only'
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = header.slice(7)
  const secret = process.env.PANEL_JWT_SECRET
  if (!secret) {
    res.status(500).json({ error: 'JWT secret not configured' })
    return
  }

  let payload: PanelJwtPayload
  try {
    payload = jwt.verify(token, secret) as PanelJwtPayload
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  // The pending-MFA token (issued by /login before a code is entered) is signed
  // with the same secret but is NOT a session — never accept it as a Bearer
  // token, or 2FA would be bypassable. Real sessions carry scope:'session'.
  if (payload.scope === 'mfa-pending') {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Per-request status + permission load (fail-safe: reject on error, don't open).
  try {
    let { data, error } = await overseerDb
      .from('overseer_admins')
      .select('status, role, permissions')
      .eq('id', payload.sub ?? '')
      .maybeSingle()

    // Rollout safety: if the `permissions` column isn't migrated yet, fall back
    // to status+role (permissions empty) instead of locking everyone out.
    if (error) {
      const res2 = await overseerDb
        .from('overseer_admins')
        .select('status, role')
        .eq('id', payload.sub ?? '')
        .maybeSingle()
      data = res2.data as typeof data
      error = res2.error
      if (error) throw error
    }

    if (!data || data.status !== 'active') {
      res.status(401).json({ error: 'Session is no longer valid' })
      return
    }

    req.panelUser = {
      id: payload.sub ?? '',
      username: payload.username ?? '',
      role: normalizeRole(data.role),
      permissions: ((data as { permissions?: Permissions }).permissions) ?? {},
    }
    next()
  } catch (err) {
    console.error('[auth] per-request load failed:', err)
    res.status(401).json({ error: 'Auth check failed' })
  }
}

/** Per-area permission gate. Owner always passes; otherwise needs key@level. */
export function requireArea(key: string, level: 'view' | 'manage') {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const u = req.panelUser
      if (!u) { res.status(401).json({ error: 'Unauthorized' }); return }
      if (u.role === 'owner' || resolveAccess(u.permissions, key, level)) { next(); return }
      res.status(403).json({ error: 'Insufficient permissions' })
    })
  }
}

/**
 * Method-aware area gate: GET/HEAD require `view`, anything else `manage`.
 * Convenient as a single router- or route-level guard (e.g. area('crm.leads')).
 */
export function area(key: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const level = req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'manage'
    requireArea(key, level)(req, res, next)
  }
}

/** Owner or admin — legacy broad gate for privileged actions. */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.panelUser?.role === 'owner' || req.panelUser?.role === 'admin') { next(); return }
    res.status(403).json({ error: 'Insufficient permissions' })
  })
}

/** Owner only — administration (invites, roles, permissions, suspend). */
export function requireOwner(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.panelUser?.role !== 'owner') {
      res.status(403).json({ error: 'Owner access required' })
      return
    }
    next()
  })
}
