/**
 * Elara data routes — reads from Elara Supabase
 * Also handles chat with Elara agent
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../middleware/auth.js'
import { runAgent } from '../../agent/index.js'
import { allAgentTools } from '../../tools/index.js'

const router = Router()

function getElaraSupabase() {
  return createClient(
    process.env.ELARA_SUPABASE_URL!,
    process.env.ELARA_SUPABASE_KEY!
  )
}

// ── Memory ──────────────────────────────────────────────────────────────────

router.get('/memory', requireAuth, async (_req, res) => {
  try {
    const sb = getElaraSupabase()
    const { data, error } = await sb
      .from('agent_memory')
      .select('key, value, category, confidence, learned_at, last_used')
      .order('last_used', { ascending: false })

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Knowledge ───────────────────────────────────────────────────────────────

router.get('/knowledge', requireAuth, async (_req, res) => {
  try {
    const sb = getElaraSupabase()
    const { data, error } = await sb
      .from('agent_knowledge')
      .select('section_key, label, content, active, updated_at')
      .order('section_key', { ascending: true })

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

router.patch('/knowledge/:key', requireAuth, async (req, res) => {
  const { key } = req.params
  const { content, label } = req.body as { content?: string; label?: string }

  if (!content) {
    res.status(400).json({ error: 'content is required' })
    return
  }

  try {
    const sb = getElaraSupabase()
    const update: Record<string, unknown> = { content, updated_at: new Date().toISOString() }
    if (label) update.label = label

    const { data, error } = await sb
      .from('agent_knowledge')
      .update(update)
      .eq('section_key', key)
      .select('section_key, label')
      .single()

    if (error) throw error
    res.json({ success: true, updated: data })
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Parking Lot ─────────────────────────────────────────────────────────────

router.get('/parking-lot', requireAuth, async (_req, res) => {
  try {
    const sb = getElaraSupabase()
    const { data, error } = await sb
      .from('agent_parking_lot')
      .select('id, item, context, phase_relevant, priority, status, created_at, resolved_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

router.patch('/parking-lot/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { status } = req.body as { status?: string }

  try {
    const sb = getElaraSupabase()
    const update: Record<string, unknown> = { status }
    if (status === 'resolved') update.resolved_at = new Date().toISOString()

    const { error } = await sb
      .from('agent_parking_lot')
      .update(update)
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Check-ins ───────────────────────────────────────────────────────────────

router.get('/checkins', requireAuth, async (_req, res) => {
  try {
    const sb = getElaraSupabase()
    const { data, error } = await sb
      .from('agent_routines')
      .select('routine_type, items, notes, updated_at')
      .eq('routine_type', 'checkin')
      .single()

    if (error && error.code !== 'PGRST116') throw error
    res.json(data?.items ?? [])
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Briefings ───────────────────────────────────────────────────────────────

router.get('/briefings', requireAuth, async (_req, res) => {
  try {
    const sb = getElaraSupabase()
    const { data, error } = await sb
      .from('agent_briefings')
      .select('id, content, status, summary_line, briefing_date, created_at')
      .order('briefing_date', { ascending: false })
      .limit(30)

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Tools Status ────────────────────────────────────────────────────────────

router.get('/tools', requireAuth, (_req, res) => {
  const tools = allAgentTools.map(t => {
    let status: 'green' | 'amber' | 'red' = 'green'
    let note = ''

    if (t.name === 'twilio_stats' || t.name === 'send_sms') {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        status = 'amber'
        note = 'Twilio credentials not configured'
      } else {
        status = 'amber'
        note = 'Carrier verification pending — EIN required'
      }
    }
    if (t.name === 'stripe_metrics' && !process.env.STRIPE_SECRET_KEY) {
      status = 'amber'
      note = 'STRIPE_SECRET_KEY not set'
    }
    if ((t.name === 'check_gmail' || t.name === 'read_gmail') && !process.env.GOOGLE_REFRESH_TOKEN) {
      status = 'amber'
      note = 'Google OAuth not configured'
    }
    if (t.name === 'netlify_status' && !process.env.NETLIFY_API_TOKEN) {
      status = 'amber'
      note = 'NETLIFY_API_TOKEN not set'
    }
    if (t.name === 'web_search' && !process.env.BRAVE_SEARCH_API_KEY) {
      status = 'amber'
      note = 'BRAVE_SEARCH_API_KEY not set'
    }

    return {
      name: t.name,
      description: t.description.slice(0, 100) + (t.description.length > 100 ? '...' : ''),
      status,
      note,
    }
  })

  res.json(tools)
})

// ── Doc Debt ────────────────────────────────────────────────────────────────

router.get('/doc-debt', requireAuth, async (_req, res) => {
  try {
    const sb = getElaraSupabase()
    const { data, error } = await sb
      .from('agent_doc_debt')
      .select('id, feature, docs_to_update, shipped_at, resolved, resolved_at, draft_doc_url')
      .order('shipped_at', { ascending: false })

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── Chat ─────────────────────────────────────────────────────────────────────

router.post('/chat', requireAuth, async (req, res) => {
  const { message, history } = req.body as {
    message?: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  try {
    const response = await runAgent(message.trim(), undefined, history ?? [])
    res.json({ response })
  } catch (err) {
    console.error('[elara] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

export default router
