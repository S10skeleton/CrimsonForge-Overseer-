/**
 * Auth route — issues a JWT in exchange for the correct passphrase.
 * Supports two roles: 'owner' (full access) and 'viewer' (read-only).
 */

import { Router } from 'express'
import jwt from 'jsonwebtoken'

const router = Router()

router.post('/login', (req, res) => {
  const { passphrase } = req.body as { passphrase?: string }
  const ownerPass = process.env.PANEL_PASSPHRASE
  const viewerPass = process.env.PANEL_PASSPHRASE_COFOUNDER
  const secret = process.env.PANEL_JWT_SECRET

  if (!ownerPass || !secret) {
    res.status(500).json({ error: 'Panel auth not configured' })
    return
  }

  if (!passphrase) {
    res.status(401).json({ error: 'Incorrect passphrase' })
    return
  }

  let role: string | null = null
  if (passphrase === ownerPass) role = 'owner'
  else if (viewerPass && passphrase === viewerPass) role = 'viewer'

  if (!role) {
    res.status(401).json({ error: 'Incorrect passphrase' })
    return
  }

  const token = jwt.sign({ role }, secret, { expiresIn: '7d' })
  res.json({ token, role })
})

export default router
