/**
 * Express app for the Ops Console control panel API
 */

import express from 'express'
import cors from 'cors'
import authRouter from './routes/auth.js'
import statusRouter from './routes/status.js'
import cfpRouter from './routes/cfp.js'
import elaraRouter from './routes/elara.js'

export function createApiServer(): express.Express {
  const app = express()

  // ── Middleware ──────────────────────────────────────────────────────────────

  app.use(cors({
    origin: [
      process.env.FRONTEND_URL ?? '',
      process.env.PANEL_URL ?? '',
      'http://localhost:5173',
      'http://localhost:3001',
    ].filter(Boolean),
    credentials: true,
  }))

  app.use(express.json({ limit: '1mb' }))

  // ── Health check (public — Railway needs this) ──────────────────────────────

  app.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'crimson-forge-ops' })
  })

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  // ── API routes ──────────────────────────────────────────────────────────────

  app.use('/api/auth', authRouter)
  app.use('/api/status', statusRouter)
  app.use('/api/cfp', cfpRouter)
  app.use('/api/elara', elaraRouter)

  // ── 404 ─────────────────────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  return app
}
