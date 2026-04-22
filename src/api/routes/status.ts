/**
 * System status route — runs all monitors for all three products and returns
 * combined health. Includes a light ForgePulse waitlist count (no monitors
 * yet — ForgePulse is pre-build).
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../middleware/auth.js'
import { monitors } from '../../tools/index.js'

const router = Router()

async function getForgePulseWaitlistCount(): Promise<number | null> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try {
    const sb = createClient(url, key)
    const { count, error } = await sb
      .from('forgepulse_waitlist')
      .select('*', { count: 'exact', head: true })
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

router.get('/', requireAuth, async (_req, res) => {
  try {
    const [
      uptime, railway, supabase, sentry, stripe, twilio, resend, netlify,
      fpSupabase, fpStripe, fpUptime,
      pulseWaitlistCount,
    ] = await Promise.allSettled([
      monitors.uptime(),
      monitors.railway(),
      monitors.supabase(),
      monitors.sentry(),
      monitors.stripe(),
      monitors.twilio(),
      monitors.resend(),
      monitors.netlify(),
      monitors.fp_supabase(),
      monitors.fp_stripe(),
      monitors.fp_uptime(),
      getForgePulseWaitlistCount(),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolve = (r: PromiseSettledResult<any>) =>
      r.status === 'fulfilled'
        ? r.value
        : { success: false, data: null, error: r.reason instanceof Error ? r.reason.message : JSON.stringify(r.reason) }

    const pulseCount = pulseWaitlistCount.status === 'fulfilled' ? pulseWaitlistCount.value : null

    res.json({
      timestamp: new Date().toISOString(),

      // CFP infra + shared services
      uptime:   resolve(uptime),
      railway:  resolve(railway),
      supabase: resolve(supabase),
      sentry:   resolve(sentry),
      stripe:   resolve(stripe),
      twilio:   resolve(twilio),
      resend:   resolve(resend),
      netlify:  resolve(netlify),

      // ForgePilot
      fp_supabase: resolve(fpSupabase),
      fp_stripe:   resolve(fpStripe),
      fp_uptime:   resolve(fpUptime),

      // ForgePulse (no monitors yet — pre-build)
      pulse: {
        status: 'pre-build' as const,
        waitlistCount: pulseCount,
      },
    })
  } catch (err) {
    console.error('[status] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

export default router
