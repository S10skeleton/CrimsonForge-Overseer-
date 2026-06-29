/**
 * Home dashboard summary — the cheap, cross-source counts the landing page
 * needs that aren't already exposed by another endpoint. MRR comes from
 * /api/fp/billing (Stripe) and the feed from /api/activity; this fills in the
 * gaps (weekly signups, open/hot leads) and flags sources not yet built.
 *
 * Every metric degrades independently — one source failing returns null for
 * that field, never a 500 for the whole dashboard.
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function getFPSupabase() {
  return createClient(process.env.FP_SUPABASE_URL!, process.env.FP_SUPABASE_SERVICE_ROLE_KEY!)
}
function getCFPSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const CLOSED_LEAD_STATUSES = new Set(['converted', 'lost'])

interface HomeSummary {
  signupsThisWeek: number | null
  leads: { open: number | null; hot: number | null; total: number | null }
  runway: { available: false }   // Financials (Phase 6) — no source yet
  pipeline: { available: false } // CRM pipeline (Phase 5) — no source yet
}

router.get('/summary', requireAuth, async (_req, res) => {
  const ago7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const summary: HomeSummary = {
    signupsThisWeek: null,
    leads: { open: null, hot: null, total: null },
    runway: { available: false },
    pipeline: { available: false },
  }

  // New ForgePilot signups this week
  try {
    const sb = getFPSupabase()
    const { count } = await sb
      .from('fp_users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', ago7d)
    summary.signupsThisWeek = count ?? 0
  } catch (err) {
    console.error('[home/summary] signups failed:', err)
  }

  // Open / hot leads (CFP contact_requests — small table, fetch statuses)
  try {
    const sb = getCFPSupabase()
    const { data } = await sb.from('contact_requests').select('status')
    const rows = (data ?? []) as Array<{ status: string | null }>
    const open = rows.filter(r => !CLOSED_LEAD_STATUSES.has(r.status ?? 'new')).length
    const hot = rows.filter(r => (r.status ?? 'new') === 'demo_scheduled').length
    summary.leads = { open, hot, total: rows.length }
  } catch (err) {
    console.error('[home/summary] leads failed:', err)
  }

  res.json(summary)
})

export default router
