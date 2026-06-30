/**
 * Express app for the Ops Console control panel API
 */

import express from 'express'
import type { RequestHandler } from 'express'
import cors from 'cors'
import { area, requireArea, requireOwner } from './middleware/auth.js'
import authRouter from './routes/auth.js'
import adminsRouter from './routes/admins.js'
import activityRouter from './routes/activity.js'
import homeRouter from './routes/home.js'
import crmRouter from './routes/crm.js'
import financialsRouter from './routes/financials.js'
import captableRouter from './routes/captable.js'
import statusRouter from './routes/status.js'
import cfpRouter from './routes/cfp.js'
import elaraRouter from './routes/elara.js'
import elaraConfigRouter from './routes/elara-config.js'
import voiceRouter from './routes/voice.js'
import filesRouter from './routes/files.js'
import fpRouter from './routes/fp.js'
import elaraChatRouter from './routes/elara-chat.js'
import quoRouter from './routes/quo.js'
import quoWebhookRouter from './routes/quo-webhook.js'

export function createApiServer(): express.Express {
  const app = express()

  // ── Middleware ──────────────────────────────────────────────────────────────

  // API is JWT-protected so any origin is safe — reflect origin for credentials support
  app.use(cors({ origin: true, credentials: true }))

  // Quo webhook needs the RAW body for Svix signature verification, so it mounts
  // (public) BEFORE the JSON parser. Everything else is JSON.
  app.use('/api/quo/webhook', express.raw({ type: '*/*', limit: '2mb' }), quoWebhookRouter)

  app.use(express.json({ limit: '2mb' }))

  // ── Health check (public — Railway needs this) ──────────────────────────────

  app.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'crimson-forge-ops' })
  })

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  // ── API routes ──────────────────────────────────────────────────────────────

  // ── Per-area permission guards (STEP7) ──────────────────────────────────────
  // One mount-level guard per router enforces the area key (GET -> view, writes
  // -> manage); routers that span areas pick the key by sub-path. Owner always
  // passes. The routers' own handlers no longer carry guards (the mount does it).

  // CRM spans leads / pipeline / companies — pick by sub-path.
  const crmGuard: RequestHandler = (req, res, next) => {
    const p = req.path
    const key = p.includes('/deals') ? 'crm.pipeline' : p.includes('/leads') ? 'crm.leads' : 'crm.companies'
    // The grid query endpoint (P3) is a POST but semantically a read → view-gate it.
    if (p.endsWith('/query')) { requireArea(key, 'view')(req, res, next); return }
    area(key)(req, res, next)
  }
  // Financials spans revenue / runway / raise.
  const finGuard: RequestHandler = (req, res, next) => {
    const p = req.path
    const key = (p.includes('/entries') || p.includes('/runway')) ? 'financials.runway'
      : p.includes('/raise') ? 'financials.raise' : 'financials.revenue'
    area(key)(req, res, next)
  }
  // Cap table: reads need financials.captable; writes are owner-only (equity).
  const capGuard: RequestHandler = (req, res, next) => {
    if (req.method === 'GET') requireArea('financials.captable', 'view')(req, res, next)
    else requireOwner(req, res, next)
  }
  // CFP: Leads list/edits map to CRM Leads; everything else is Customers.
  const cfpGuard: RequestHandler = (req, res, next) => {
    area(req.path.includes('/leads') ? 'crm.leads' : 'customers')(req, res, next)
  }

  app.use('/api/auth', authRouter)
  app.use('/api/admins', adminsRouter)             // administration — owner/admin gates internal
  app.use('/api/activity', requireArea('settings', 'view'), activityRouter)
  app.use('/api/home', area('home'), homeRouter)
  app.use('/api/crm', crmGuard, crmRouter)
  app.use('/api/quo', area('crm.phone'), quoRouter)
  app.use('/api/financials', finGuard, financialsRouter)
  app.use('/api/captable', capGuard, captableRouter)
  app.use('/api/status', area('system'), statusRouter)
  app.use('/api/cfp', cfpGuard, cfpRouter)
  app.use('/api/elara/config', area('elara'), elaraConfigRouter)
  app.use('/api/elara', elaraChatRouter)           // Ask-Elara chat/action (owner/admin gates internal)
  app.use('/api/elara', elaraRouter)               // assistant/voice/files keep their own requireAuth
  app.use('/api/voice', voiceRouter)
  app.use('/api/files', filesRouter)
  app.use('/api/fp', area('customers'), fpRouter)

  // ── 404 ─────────────────────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  return app
}
