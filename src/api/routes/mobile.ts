/**
 * Mobile companion API (MOBILE-1). One endpoint: GET /triage — "what's red right
 * now", by running the same lightweight checks the scheduler/briefing use
 * (uptime, railway, recent Sentry, open payment failures, silent shops) plus the
 * latest stored briefing. Owner/admin. Fail-safe: every source is independent
 * and swallowed — a partial list is fine, this never 500s.
 */
import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { overseerDb } from '../../lib/overseerDb.js'
import { runUptimeCheck } from '../../tools/uptime.js'
import { runRailwayCheck } from '../../tools/railway.js'
import { runSentryCheck } from '../../tools/sentry.js'
import { runSupabaseCheck } from '../../tools/supabase.js'
import { getForgePilotBilling } from '../../lib/billing.js'

const router = Router()

type Severity = 'critical' | 'warning' | 'info'
interface TriageItem { severity: Severity; title: string; detail: string; source: string; actionUrl?: string }

router.get('/triage', requireAdmin, async (_req, res) => {
  const items: TriageItem[] = []

  // Uptime — down/degraded services.
  try {
    const r = await runUptimeCheck()
    for (const u of r.data ?? []) {
      if (u.status === 'down') items.push({ severity: 'critical', title: `${u.url} is DOWN`, detail: `No healthy response (HTTP ${u.statusCode ?? 'n/a'})`, source: 'uptime' })
      else if (u.status === 'degraded') items.push({ severity: 'warning', title: `${u.url} degraded`, detail: `HTTP ${u.statusCode ?? '?'} · ${u.responseMs ?? '?'}ms`, source: 'uptime' })
    }
  } catch (err) { console.error('[mobile/triage] uptime:', err) }

  // Railway — deployment health.
  try {
    const d = (await runRailwayCheck()).data
    if (d && d.status === 'down') items.push({ severity: 'critical', title: 'Railway deployment issue', detail: `Latest: ${d.latestDeploymentStatus ?? 'unknown'}`, source: 'railway' })
    else if (d && d.status === 'degraded') items.push({ severity: 'warning', title: 'Railway degraded', detail: `Latest: ${d.latestDeploymentStatus ?? 'unknown'}`, source: 'railway' })
  } catch (err) { console.error('[mobile/triage] railway:', err) }

  // Sentry — new issues in the last 24h.
  try {
    const d = (await runSentryCheck()).data
    if (d && d.newIssueCount > 0) {
      items.push({ severity: 'warning', title: `${d.newIssueCount} new Sentry ${d.newIssueCount === 1 ? 'issue' : 'issues'} (24h)`, detail: `${d.unresolvedCount} unresolved total`, source: 'sentry', actionUrl: d.recentIssues?.[0]?.url })
    }
  } catch (err) { console.error('[mobile/triage] sentry:', err) }

  // Stripe — open payment failures.
  try {
    const b = await getForgePilotBilling()
    if (b.paymentFailures.length > 0) {
      items.push({ severity: 'warning', title: `${b.paymentFailures.length} open payment ${b.paymentFailures.length === 1 ? 'failure' : 'failures'}`, detail: b.paymentFailures.slice(0, 3).map(f => f.customerEmail || f.customerId).join(', '), source: 'stripe', actionUrl: 'https://dashboard.stripe.com/payments?status=failed' })
    }
  } catch (err) { console.error('[mobile/triage] billing:', err) }

  // Supabase — silent shops.
  try {
    const shops = (await runSupabaseCheck()).data?.silentShops ?? []
    if (shops.length > 0) {
      items.push({ severity: 'info', title: `${shops.length} silent ${shops.length === 1 ? 'shop' : 'shops'}`, detail: shops.slice(0, 3).map(s => `${s.shopName} (${s.daysSilent}d)`).join(', '), source: 'supabase' })
    }
  } catch (err) { console.error('[mobile/triage] supabase:', err) }

  // Latest morning briefing (summary card).
  let briefing: { summary: string | null; date: string | null } | null = null
  try {
    const { data } = await overseerDb
      .from('agent_briefings').select('summary_line, briefing_date, created_at')
      .order('briefing_date', { ascending: false }).limit(1).maybeSingle()
    if (data) briefing = { summary: (data as { summary_line: string | null }).summary_line, date: (data as { briefing_date: string | null; created_at: string }).briefing_date ?? (data as { created_at: string }).created_at }
  } catch (err) { console.error('[mobile/triage] briefing:', err) }

  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
  items.sort((a, b) => rank[a.severity] - rank[b.severity])

  res.json({ data: { items, briefing, checkedAt: new Date().toISOString() } })
})

export default router
