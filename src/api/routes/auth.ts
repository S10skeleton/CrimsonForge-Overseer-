/**
 * Auth route — issues a JWT in exchange for the correct passphrase
 */

import { Router } from 'express'
import jwt from 'jsonwebtoken'

const router = Router()

router.post('/login', (req, res) => {
  const { passphrase } = req.body as { passphrase?: string }
  const correct = process.env.PANEL_PASSPHRASE
  const secret = process.env.PANEL_JWT_SECRET

  if (!correct || !secret) {
    res.status(500).json({ error: 'Panel auth not configured' })
    return
  }

  if (!passphrase || passphrase !== correct) {
    res.status(401).json({ error: 'Incorrect passphrase' })
    return
  }

  const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '7d' })
  res.json({ token })
})

export default router
