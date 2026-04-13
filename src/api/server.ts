/**
 * Express app for the Ops Console control panel API
 */

import express from 'express'
import cors from 'cors'
import authRouter from './routes/auth.js'
import statusRouter from './routes/status.js'
import cfpRouter from './routes/cfp.js'
import elaraRouter from './routes/elara.js'
import voiceRouter from './routes/voice.js'
import filesRouter from './routes/files.js'
import fpRouter from './routes/fp.js'

export function createApiServer(): express.Express {
  const app = express()

  // ── Middleware ──────────────────────────────────────────────────────────────

  // API is JWT-protected so any origin is safe — reflect origin for credentials support
  app.use(cors({ origin: true, credentials: true }))

  app.use(express.json({ limit: '2mb' }))

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
  app.use('/api/voice', voiceRouter)
  app.use('/api/files', filesRouter)
  app.use('/api/fp', fpRouter)

  // ── 404 ─────────────────────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  return app
}
