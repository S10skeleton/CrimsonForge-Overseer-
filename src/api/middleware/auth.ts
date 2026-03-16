/**
 * JWT auth middleware for the control panel API
 */

import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  panelUser?: { role: string }
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
    const payload = jwt.verify(token, secret) as { role: string }
    req.panelUser = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
