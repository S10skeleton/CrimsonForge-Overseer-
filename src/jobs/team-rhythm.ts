/**
 * Team rhythm (Elara capability) — a few scheduled, Elara-composed team messages
 * that set priorities and nudge the team to keep Elara current. Replaces the
 * removed personal wellness cadence with a team-productivity one. Reuses the
 * STEP4 scheduler + routing + quiet hours + calendar; pulls REAL context (today's
 * calendar + open CRM deals) so messages are specific, never generic filler.
 *
 * Posts to the `team_rhythm` route (#all-crimson-forge). Weekday + quiet-hours
 * aware; fail-safe (one bad run never crashes the scheduler). Times/on-off live
 * in elara_schedules (Elara Controls).
 */
import Anthropic from '@anthropic-ai/sdk'
import { overseerDb } from '../lib/overseerDb.js'
import { resolveDestination, isWithinQuietHours } from '../lib/elaraConfig.js'
import { sendAgentMessage, sendRawMessage } from '../notifications/slack.js'
import { runCalendarCheck, type CalendarEvent } from '../tools/calendar.js'

export type RhythmSlot = 'kickoff' | 'midday' | 'eod'

interface RhythmConfig { weekdays_only: boolean; kickoff_intent: string | null; midday_intent: string | null; eod_intent: string | null }
interface DealPriority { name: string; company: string | null; reason: string }

async function loadRhythmConfig(): Promise<RhythmConfig> {
  const fallback: RhythmConfig = { weekdays_only: true, kickoff_intent: null, midday_intent: null, eod_intent: null }
  try {
    const { data } = await overseerDb.from('team_rhythm_config').select('weekdays_only, kickoff_intent, midday_intent, eod_intent').eq('id', 1).maybeSingle()
    return data ? { ...fallback, ...data } : fallback
  } catch { return fallback }
}

/** Open deals that need attention: stale (no update in 5d) or closing soon (≤7d). */
async function loadDealPriorities(): Promise<DealPriority[]> {
  try {
    const { data } = await overseerDb.from('crm_deals')
      .select('id, name, company_id, status, expected_close, updated_at')
      .eq('status', 'open').order('updated_at', { ascending: true }).limit(25)
    const deals = data ?? []
    if (deals.length === 0) return []
    const ids = [...new Set(deals.map((d) => d.company_id).filter(Boolean))] as string[]
    const nameById = new Map<string, string>()
    if (ids.length) {
      const { data: cos } = await overseerDb.from('crm_companies').select('id, name').in('id', ids)
      for (const c of cos ?? []) nameById.set(c.id, c.name)
    }
    const now = Date.now()
    const out: DealPriority[] = []
    for (const d of deals) {
      const staleDays = Math.floor((now - new Date(d.updated_at).getTime()) / 86400000)
      const closeDays = d.expected_close ? Math.ceil((new Date(d.expected_close).getTime() - now) / 86400000) : null
      let reason = ''
      if (closeDays !== null && closeDays >= 0 && closeDays <= 7) reason = `closing in ${closeDays}d`
      else if (staleDays >= 5) reason = `quiet ${staleDays}d`
      if (reason) out.push({ name: d.name, company: d.company_id ? nameById.get(d.company_id) ?? null : null, reason })
    }
    return out.slice(0, 4)
  } catch { return [] }
}

function eventLine(e: CalendarEvent, tz: string): string {
  const t = e.isAllDay ? 'All day' : new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  return `${t} ${e.title}`
}

function fallbackMessage(slot: RhythmSlot, today: CalendarEvent[], tomorrow: CalendarEvent[], deals: DealPriority[], tz: string): string {
  const cal = today.length ? today.map((e) => eventLine(e, tz)).join(' · ') : 'nothing on the calendar'
  const prios = deals.length ? deals.map((d) => `${d.name}${d.company ? ` (${d.company})` : ''} — ${d.reason}`).join('; ') : null
  if (slot === 'kickoff') {
    return `Morning team 👋\nToday: ${cal}.` + (prios ? `\nPriorities: ${prios}.` : '\nNo stale or closing deals — keep the pipeline moving.')
  }
  if (slot === 'midday') {
    return `Quick midday log 📝 — drop in any calls, texts, deal moves, or anything shipped so far. Keeps Elara (and the briefings) current. Anything blocking?`
  }
  // eod
  const tmw = tomorrow.length ? tomorrow.map((e) => eventLine(e, tz)).join(' · ') : 'clear so far'
  return `EOD wrap 🌙 — log today's wins + numbers (calls, texts, deals moved, anything shipped).\nTomorrow: ${tmw}.`
}

let _client: Anthropic | null = null
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const SLOT_INTENT: Record<RhythmSlot, string> = {
  kickoff: 'A short morning kickoff for the team. Lead with today\'s calendar, then 1–3 real priorities from the open deals (stale/closing), then name ONE focus. Warm, brief.',
  midday: 'A short midday nudge to log the morning (calls, texts, deal moves, shipped work) so Elara stays current, and ask if anything is blocking. One or two lines.',
  eod: 'A short end-of-day wrap: ask for wins + numbers, and surface tomorrow\'s calendar on-deck. One or two lines.',
}

async function compose(slot: RhythmSlot, cfg: RhythmConfig, today: CalendarEvent[], tomorrow: CalendarEvent[], deals: DealPriority[], tz: string): Promise<string | null> {
  const client = anthropic()
  if (!client) return null
  const intent = (slot === 'kickoff' ? cfg.kickoff_intent : slot === 'midday' ? cfg.midday_intent : cfg.eod_intent) || SLOT_INTENT[slot]
  const context = {
    today: today.map((e) => eventLine(e, tz)),
    tomorrow: tomorrow.map((e) => eventLine(e, tz)),
    priorities: deals,
  }
  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 280,
      system: `You are Elara, the Crimson Forge team's ops assistant, posting a brief message to the team Slack channel. ${intent} Use ONLY the real context provided — never invent meetings or deals. If there's nothing real to say, keep it to one short line. No preamble, no signature. Plain text, an emoji or two is fine.`,
      messages: [{ role: 'user', content: JSON.stringify(context, null, 2) }],
    })
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.TextBlock).text).join('\n').trim()
    return text || null
  } catch (err) {
    console.error('[team-rhythm] compose via Claude failed, using template:', err instanceof Error ? err.message : err)
    return null
  }
}

async function post(text: string): Promise<void> {
  const dest = await resolveDestination('team_rhythm')
  if (dest && dest.kind === 'slack' && dest.target && dest.target !== 'webhook') await sendAgentMessage(text, dest.target)
  else await sendRawMessage(text)
}

export async function runTeamRhythm(slot: RhythmSlot): Promise<void> {
  const tz = process.env.TIMEZONE || 'America/Denver'
  const cfg = await loadRhythmConfig()

  const dow = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: tz })
  if (cfg.weekdays_only && (dow === 'Sat' || dow === 'Sun')) { console.log(`[team-rhythm] ${slot}: weekend — skipping`); return }
  if (await isWithinQuietHours('info')) { console.log(`[team-rhythm] ${slot}: quiet hours — skipping`); return }

  const cal = await runCalendarCheck()
  const today = cal.success ? cal.data.todayEvents : []
  const tomorrowStr = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
  const tomorrow = (cal.success ? cal.data.upcomingEvents : []).filter((e) => e.start.startsWith(tomorrowStr))
  const deals = slot === 'midday' ? [] : await loadDealPriorities()

  const text = (await compose(slot, cfg, today, tomorrow, deals, tz)) ?? fallbackMessage(slot, today, tomorrow, deals, tz)
  try {
    await post(text)
    console.log(`[team-rhythm] ${slot} posted`)
  } catch (err) {
    console.error(`[team-rhythm] ${slot} post failed:`, err instanceof Error ? err.message : err)
  }
}
