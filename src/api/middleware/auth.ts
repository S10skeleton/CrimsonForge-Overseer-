/**
 * JWT auth middleware for the control panel API.
 *
 * Roles: 'owner' (full), 'admin' (write/privileged), 'read_only' (GET only).
 *   requireAuth   — any valid login (sets req.panelUser = { id, username, role })
 *   requireRole() — factory gating on an allowed role set
 *   requireAdmin  — owner or admin (any write/privileged action)
 *   requireOwner  — owner only (admin management, role changes)
 *
 * Legacy: old tokens may carry only { role:'owner'|'viewer' }. 'viewer' maps to
 * 'read_only'; a missing id/username degrades gracefully to ''.
 */

import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export type Role = 'owner' | 'admin' | 'read_only'

export interface AuthRequest extends Request {
  panelUser?: { id: string; username: string; role: Role }
}

interface PanelJwtPayload {
  sub?: string
  username?: string
  role?: string
}

export function normalizeRole(role: string | undefined): Role {
  if (role === 'owner' || role === 'admin' || role === 'read_only') return role
  if (role === 'viewer') return 'read_only' // legacy tokens mid-rotation
  return 'read_only'
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
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

  try {
    const payload = jwt.verify(token, secret) as PanelJwtPayload
    req.panelUser = {
      id: payload.sub ?? '',
      username: payload.username ?? '',
      role: normalizeRole(payload.role),
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...allowed: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      if (!req.panelUser || !allowed.includes(req.panelUser.role)) {
        res.status(403).json({ error: 'Insufficient permissions' })
        return
      }
      next()
    })
  }
}

/** Owner or admin — any write/privileged action. */
export const requireAdmin = requireRole('owner', 'admin')

/** Owner only — admin management, role changes. Name preserved for existing imports. */
export function requireOwner(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.panelUser?.role !== 'owner') {
      res.status(403).json({ error: 'Owner access required' })
      return
    }
    next()
  })
}
