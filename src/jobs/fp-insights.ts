/**
 * ForgeAssist daily session insight analyzer.
 *
 * Phase 1: storage + analysis only. No surfacing yet.
 *
 * For each unanalyzed fp_session, this job calls Haiku to score:
 *   - ai_helpfulness, ai_specificity (how well did the AI perform?)
 *   - tech_frustration (did the AI cause friction?)
 *   - resolution_score (did the convo end well?)
 * Plus a topic tag, outcome tag, and one short pattern note.
 *
 * Privacy: NO verbatim message content is stored in fp_session_insights.
 * Only scores, categorical tags, and anonymized 1-sentence pattern notes.
 *
 * Lens: "AI product quality" not "tech evaluation" — see the prompt below.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const MODEL = 'claude-haiku-4-5-20251001'
const BATCH_LIMIT   = Number(process.env.FP_INSIGHTS_BATCH_LIMIT   || '100')
const MIN_MESSAGES  = Number(process.env.FP_INSIGHTS_MIN_MESSAGES  || '2')

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

function getFPSupabase(): SupabaseClient {
  return createClient(
    process.env.FP_SUPABASE_URL!,
    process.env.FP_SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface AnalysisRunSummary {
  candidates: number
  analyzed:   number
  skipped:    number
  failed:     number
  durationMs: number
}

/**
 * Find all sessions without an insight row and analyze them, up to BATCH_LIMIT.
 * Called by the nightly cron and the backfill endpoint.
 */
export async function runInsightAnalysis(): Promise<AnalysisRunSummary> {
  const start = Date.now()
  const supabase = getFPSupabase()
  const candidates = await findUnanalyzedSessions(supabase, BATCH_LIMIT)

  let analyzed = 0, skipped = 0, failed = 0
  for (const sessionId of candidates) {
    try {
      const result = await analyzeSession(sessionId)
      if      (result.status === 'success') analyzed++
      else if (result.status === 'skipped') skipped++
      else                                  failed++
    } catch (err) {
      console.error(`[FP-INSIGHTS] Unexpected error on session ${sessionId}:`, err)
      failed++
    }
  }

  const summary: AnalysisRunSummary = {
    candidates: candidates.length,
    analyzed, skipped, failed,
    durationMs: Date.now() - start,
  }
  console.log('[FP-INSIGHTS] Run complete:', summary)
  return summary
}

/** Analyze a single session. Inserts exactly one row into fp_session_insights. */
export async function analyzeSession(sessionId: string): Promise<{
  status: 'success' | 'skipped' | 'failed'
  reason?: string
}> {
  const supabase = getFPSupabase()

  const { data: session, error: sessionErr } = await supabase
    .from('fp_sessions')
    .select('id, shop_id, year, make, model, dtc_codes, concern, message_count, last_dtc')
    .eq('id', sessionId)
    .single()
  if (sessionErr || !session) {
    await insertFailure(supabase, sessionId, null, `session fetch failed: ${sessionErr?.message ?? 'not found'}`)
    return { status: 'failed', reason: 'session fetch failed' }
  }

  if ((session.message_count ?? 0) < MIN_MESSAGES) {
    await supabase.from('fp_session_insights').insert({
      session_id: sessionId,
      shop_id: session.shop_id ?? null,
      status: 'skipped',
      error_message: `message_count=${session.message_count} below MIN_MESSAGES=${MIN_MESSAGES}`,
    })
    return { status: 'skipped', reason: 'too short' }
  }

  const { data: messages, error: msgErr } = await supabase
    .from('fp_session_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (msgErr || !messages || messages.length === 0) {
    await insertFailure(supabase, sessionId, session.shop_id, `message fetch failed: ${msgErr?.message ?? 'empty'}`)
    return { status: 'failed', reason: 'message fetch failed' }
  }

  const prompt = buildPrompt(session, messages)

  let rawText = ''
  let parsed: ParsedInsight | null = null
  try {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim()
    parsed = parseInsightJson(rawText)
  } catch (err) {
    await insertFailure(supabase, sessionId, session.shop_id,
      `Haiku call failed: ${err instanceof Error ? err.message : String(err)}`)
    return { status: 'failed', reason: 'haiku error' }
  }

  if (!parsed) {
    await insertFailure(supabase, sessionId, session.shop_id,
      `JSON parse failed. Raw: ${rawText.slice(0, 200)}`)
    return { status: 'failed', reason: 'parse error' }
  }

  const { error: insertErr } = await supabase.from('fp_session_insights').insert({
    session_id:       sessionId,
    shop_id:          session.shop_id ?? null,
    status:           'success',
    ai_helpfulness:   clamp05(parsed.ai_helpfulness),
    ai_specificity:   clamp05(parsed.ai_specificity),
    tech_frustration: clamp05(parsed.tech_frustration),
    resolution_score: clamp05(parsed.resolution_score),
    topic_tag:        parsed.topic_tag?.slice(0, 50)   ?? null,
    outcome:          parsed.outcome?.slice(0, 30)     ?? null,
    pattern_note:     parsed.pattern_note?.slice(0, 250) ?? null,
    model:            MODEL,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw_response:     parsed as any,
  })

  if (insertErr) {
    console.error(`[FP-INSIGHTS] Insert failed for ${sessionId}:`, insertErr.message)
    return { status: 'failed', reason: 'insert error' }
  }
  return { status: 'success' }
}

// ── Internals ───────────────────────────────────────────────────────────────

async function findUnanalyzedSessions(supabase: SupabaseClient, limit: number): Promise<string[]> {
  const { data: existing, error: insErr } = await supabase
    .from('fp_session_insights')
    .select('session_id')
  if (insErr) {
    console.error('[FP-INSIGHTS] Failed to fetch existing insights:', insErr.message)
    return []
  }
  const analyzedIds = new Set((existing ?? []).map(r => r.session_id as string))

  const { data: sessions, error: sErr } = await supabase
    .from('fp_sessions')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(limit + analyzedIds.size)
  if (sErr) {
    console.error('[FP-INSIGHTS] Failed to fetch sessions:', sErr.message)
    return []
  }

  return (sessions ?? [])
    .map(s => s.id as string)
    .filter(id => !analyzedIds.has(id))
    .slice(0, limit)
}

interface ParsedInsight {
  ai_helpfulness:   number
  ai_specificity:   number
  tech_frustration: number
  resolution_score: number
  topic_tag:        string
  outcome:          string
  pattern_note:     string
}

function parseInsightJson(raw: string): ParsedInsight | null {
  try {
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as ParsedInsight
  } catch {
    return null
  }
}

function clamp05(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.max(0, Math.min(5, Math.round(n)))
}

async function insertFailure(
  supabase: SupabaseClient,
  sessionId: string,
  shopId: string | null,
  errorMessage: string,
): Promise<void> {
  await supabase.from('fp_session_insights').insert({
    session_id:    sessionId,
    shop_id:       shopId ?? null,
    status:        'failed',
    error_message: errorMessage.slice(0, 500),
  })
}

function buildPrompt(
  session: {
    year: string | null
    make: string | null
    model: string | null
    dtc_codes: string[] | null
    concern: string | null
    last_dtc: string | null
    message_count: number | null
  },
  messages: Array<{ role: string; content: string }>,
): string {
  const vehicle = [session.year, session.make, session.model].filter(Boolean).join(' ') || 'unknown vehicle'
  const dtcs = (session.dtc_codes && session.dtc_codes.length > 0)
    ? session.dtc_codes.join(', ')
    : (session.last_dtc || 'none')
  const concern = session.concern || 'not stated'

  // Cap transcript: keep first 4 + last 16 messages if very long, with a gap marker
  const maxMessages = 20
  const trimmed = messages.length > maxMessages
    ? [
        ...messages.slice(0, 4),
        { role: 'system', content: `[... ${messages.length - maxMessages} messages omitted ...]` },
        ...messages.slice(-16),
      ]
    : messages

  const transcript = trimmed.map((m, i) => {
    const role = m.role === 'assistant' ? 'AI' : m.role === 'user' ? 'TECH' : m.role.toUpperCase()
    return `[${i + 1}] ${role}: ${m.content.slice(0, 2000)}`
  }).join('\n\n')

  return `You are an AI product quality analyst evaluating one diagnostic conversation between an automotive technician and ForgePilot's AI assistant. Your job is to score how well the AI performed and describe the interaction pattern in one sentence. This is product feedback for the AI team — NOT an evaluation of the technician.

SESSION CONTEXT
Vehicle: ${vehicle}
DTC codes: ${dtcs}
Stated concern: ${concern}
Message count: ${session.message_count ?? messages.length}

CONVERSATION
${transcript}

SCORE THE AI (integers 0-5):

ai_helpfulness — Did the AI's responses help the tech move forward diagnostically?
  0 = missed the question, no useful guidance
  3 = correct but generic / textbook
  5 = specific, actionable, demonstrated diagnostic reasoning tailored to this vehicle/code

ai_specificity — Were the AI's answers specific to this vehicle, DTC, and symptom?
  0 = generic boilerplate that ignored context
  3 = some references to the specific situation
  5 = clearly used the vehicle/code/concern context throughout

tech_frustration — Did the AI cause friction? (Higher = more friction the AI is responsible for)
  0 = smooth, focused conversation
  3 = some back-and-forth to clarify
  5 = tech had to rephrase repeatedly, gave up, or expressed frustration

resolution_score — Did the conversation end with a forward path?
  0 = clearly abandoned with no resolution
  3 = inconclusive
  5 = clear next steps identified or issue understood

CATEGORIZE

topic_tag — pick ONE from: codes, electrical, fuel, drivetrain, scan-tool, sensors, hvac, no-start, other

outcome — pick ONE from: resolved, abandoned, one-shot, ongoing, escalated

PATTERN NOTE (one sentence, ≤20 words)
Describe the SHAPE of the interaction. Do not quote messages or include identifying details.
Good examples:
  "AI gave generic answer; tech rephrased 3 times before useful response."
  "AI referenced freeze frame data immediately and proposed targeted test."
  "Tech disengaged after one exchange — likely a quick lookup."

OUTPUT
Return strict JSON only. No preamble, no markdown fences, no commentary. Schema:
{
  "ai_helpfulness": 0,
  "ai_specificity": 0,
  "tech_frustration": 0,
  "resolution_score": 0,
  "topic_tag": "...",
  "outcome": "...",
  "pattern_note": "..."
}`
}
