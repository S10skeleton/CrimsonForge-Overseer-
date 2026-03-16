/**
 * System status route — runs all monitors and returns combined health
 */

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { monitors } from '../../tools/index.js'

const router = Router()

router.get('/', requireAuth, async (_req, res) => {
  try {
    const [uptime, railway, supabase, sentry, stripe, twilio, resend, netlify] = await Promise.allSettled([
      monitors.uptime(),
      monitors.railway(),
      monitors.supabase(),
      monitors.sentry(),
      monitors.stripe(),
      monitors.twilio(),
      monitors.resend(),
      monitors.netlify(),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolve = (r: PromiseSettledResult<any>) =>
      r.status === 'fulfilled' ? r.value : { success: false, data: null, error: String(r.reason) }

    res.json({
      timestamp: new Date().toISOString(),
      uptime: resolve(uptime),
      railway: resolve(railway),
      supabase: resolve(supabase),
      sentry: resolve(sentry),
      stripe: resolve(stripe),
      twilio: resolve(twilio),
      resend: resolve(resend),
      netlify: resolve(netlify),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
