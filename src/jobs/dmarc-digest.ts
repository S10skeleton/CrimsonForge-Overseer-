/**
 * DMARC report digest (Elara email-security check).
 *
 * crimsonforge.pro's DMARC aggregate reports land in admin@ as compressed XML
 * from Google/Microsoft daily. This job reads them (reusing the existing admin@
 * Gmail OAuth), parses the XML, and tells the founder in plain English whether
 * mail "as crimsonforge.pro" is authenticating — catching spoofing or a
 * misconfigured sender. All-clear is a one-line briefing item; a failure also
 * fires a standalone alert. DMARC mails are already excluded from the CRM by the
 * P1b automated-sender filter.
 *
 * History table `dmarc_reports` is optional (used for dedup + the briefing line);
 * the digest degrades gracefully if it isn't migrated.
 */
import zlib from 'node:zlib'
import dns from 'node:dns'
import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'
import Anthropic from '@anthropic-ai/sdk'
import { google } from 'googleapis'
import { createOAuthClient, isGoogleConfigured } from '../lib/google-auth.js'
import { overseerDb } from '../lib/overseerDb.js'
import { notifyAlert } from '../notifications/slack.js'

const DMARC_SENDERS = ['noreply-dmarc-support@google.com', 'dmarcreport@microsoft.com']

export interface DmarcFailure { ip: string; sender: string; count: number; failed: string }
export interface DmarcAgg { total: number; passing: number; passPct: number; failures: DmarcFailure[]; orgs: string[] }

// ── Parse one aggregate report ──────────────────────────────────────────────
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true })

function decompress(filename: string, buf: Buffer): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.gz')) return zlib.gunzipSync(buf).toString('utf8')
  if (lower.endsWith('.zip')) {
    const zip = new AdmZip(buf)
    const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.xml')) ?? zip.getEntries()[0]
    return entry ? zip.readAsText(entry) : ''
  }
  return buf.toString('utf8')
}

async function senderName(ip: string): Promise<string> {
  try { const names = await dns.promises.reverse(ip); return names[0] || ip } catch { return ip }
}

async function parseReport(xml: string): Promise<{ total: number; passing: number; failures: DmarcFailure[]; org: string | null }> {
  const doc = parser.parse(xml)
  const feedback = doc?.feedback
  if (!feedback) return { total: 0, passing: 0, failures: [], org: null }
  const org = feedback.report_metadata?.org_name ? String(feedback.report_metadata.org_name) : null
  const records = Array.isArray(feedback.record) ? feedback.record : feedback.record ? [feedback.record] : []
  let total = 0, passing = 0
  const failures: DmarcFailure[] = []
  for (const r of records) {
    const row = r?.row ?? {}
    const count = Number(row.count ?? 0) || 0
    const ip = String(row.source_ip ?? '')
    const pe = row.policy_evaluated ?? {}
    const dkim = String(pe.dkim ?? 'fail').toLowerCase()
    const spf = String(pe.spf ?? 'fail').toLowerCase()
    total += count
    if (dkim === 'pass' || spf === 'pass') {
      passing += count
    } else {
      const failed = [dkim !== 'pass' && 'DKIM', spf !== 'pass' && 'SPF'].filter(Boolean).join(' + ')
      failures.push({ ip, sender: await senderName(ip), count, failed: failed || 'DMARC' })
    }
  }
  return { total, passing, failures, org }
}

// ── Gmail ingest ────────────────────────────────────────────────────────────
function findAttachments(payload: any, acc: Array<{ filename: string; attachmentId: string }> = []): Array<{ filename: string; attachmentId: string }> {
  if (!payload) return acc
  if (payload.filename && payload.body?.attachmentId && /\.(zip|gz|xml)$/i.test(payload.filename)) {
    acc.push({ filename: payload.filename, attachmentId: payload.body.attachmentId })
  }
  for (const part of payload.parts ?? []) findAttachments(part, acc)
  return acc
}

/** Message ids processed in the last few days (dedup), if the table exists. */
async function recentlyProcessed(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await overseerDb.from('dmarc_reports').select('message_ids').gte('report_date', cutoff)
  if (error) return new Set()
  const ids = new Set<string>()
  for (const row of data ?? []) for (const id of (row.message_ids as string[] | null) ?? []) ids.add(id)
  return ids
}

// ── Elara summary ────────────────────────────────────────────────────────────
let _client: Anthropic | null = null
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

function deterministicSummary(agg: DmarcAgg): string {
  if (agg.total === 0) return '✅ Email security — no DMARC reports to summarize this period.'
  if (agg.failures.length === 0) {
    const senders = agg.orgs.length ? ` Reporting: ${agg.orgs.join(', ')}.` : ''
    return `✅ Email security — all ${agg.total} messages sent as crimsonforge.pro authenticated (SPF/DKIM/DMARC).${senders}`
  }
  const f = agg.failures[0]
  const more = agg.failures.length > 1 ? ` (+${agg.failures.length - 1} more source${agg.failures.length > 2 ? 's' : ''})` : ''
  return `⚠️ Email security — ${f.count} message(s) from ${f.sender} failed ${f.failed}${more}. If you don't recognize this sender it could be spoofing, or a legit service whose SPF/DKIM isn't set up. Review the source before trusting it.`
}

async function summarize(agg: DmarcAgg): Promise<string> {
  const client = anthropic()
  if (!client) return deterministicSummary(agg)
  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 320,
      system: 'You are Elara, the Crimson Forge ops assistant. Summarize a DMARC aggregate report for the founder in ONE short, plain-English paragraph. No XML, no jargon dumps. Start with ✅ if everything authenticated, or ⚠️ if any source failed. If failures exist, name the likely cause (unauthorized/spoof sender vs a legit service missing SPF/DKIM) and a concrete next step. Be concise and calm.',
      messages: [{ role: 'user', content: `DMARC results for crimsonforge.pro this period:\n${JSON.stringify(agg, null, 2)}` }],
    })
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.TextBlock).text).join('\n').trim()
    return text || deterministicSummary(agg)
  } catch (err) {
    console.error('[dmarc] summary via Claude failed, using fallback:', err instanceof Error ? err.message : err)
    return deterministicSummary(agg)
  }
}

// ── Entry point (scheduled as dmarc_digest) ─────────────────────────────────
export async function runDmarcDigest(): Promise<void> {
  if (!isGoogleConfigured()) { console.log('[dmarc] Gmail not configured — skipping'); return }
  const gmail = google.gmail({ version: 'v1', auth: createOAuthClient() })

  const q = `from:(${DMARC_SENDERS.join(' OR ')}) has:attachment newer_than:2d`
  let list
  try {
    list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 25 })
  } catch (err) {
    console.error('[dmarc] gmail list failed:', err instanceof Error ? err.message : err); return
  }
  const refs = list.data.messages ?? []
  if (refs.length === 0) { console.log('[dmarc] no new DMARC reports'); return }

  const seen = await recentlyProcessed()
  const agg: DmarcAgg = { total: 0, passing: 0, passPct: 0, failures: [], orgs: [] }
  const orgs = new Set<string>()
  const processedIds: string[] = []

  for (const ref of refs) {
    if (!ref.id || seen.has(ref.id)) continue
    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'full' })
      const attachments = findAttachments(msg.data.payload)
      for (const att of attachments) {
        const a = await gmail.users.messages.attachments.get({ userId: 'me', messageId: ref.id, id: att.attachmentId })
        if (!a.data.data) continue
        const buf = Buffer.from(a.data.data, 'base64')
        const xml = decompress(att.filename, buf)
        if (!xml) continue
        const r = await parseReport(xml)
        agg.total += r.total
        agg.passing += r.passing
        agg.failures.push(...r.failures)
        if (r.org) orgs.add(r.org)
      }
      processedIds.push(ref.id)
    } catch (err) {
      console.error('[dmarc] report parse failed, skipping message:', ref.id, err instanceof Error ? err.message : err)
    }
  }

  if (processedIds.length === 0) { console.log('[dmarc] nothing new to process'); return }

  agg.orgs = [...orgs]
  agg.passPct = agg.total > 0 ? Math.round((agg.passing / agg.total) * 100) : 100
  const summary = await summarize(agg)

  // Persist (optional history + dedup ledger).
  try {
    await overseerDb.from('dmarc_reports').insert({
      report_date: new Date().toISOString().slice(0, 10),
      total: agg.total, pass_pct: agg.passPct, failures: agg.failures, summary, message_ids: processedIds,
    })
  } catch (err) {
    console.log('[dmarc] dmarc_reports table unavailable — not storing history:', err instanceof Error ? err.message : err)
  }

  // Only failures trigger a standalone alert; the all-clear rides the briefing line.
  if (agg.failures.length > 0) {
    const total = agg.failures.reduce((s, f) => s + f.count, 0)
    await notifyAlert({
      ruleKey: 'dmarc',
      notificationType: 'dmarc_alert',
      alert: { severity: 'warning', tool: 'dmarc', message: summary, details: `${total} message(s) across ${agg.failures.length} source(s) failed DMARC.` },
    })
  }
  console.log(`[dmarc] digest: ${agg.total} msgs, ${agg.passPct}% pass, ${agg.failures.length} failing source(s)`)
}

/** One-line "Email security" status for the morning briefing (null if no data). */
export async function getDmarcBriefingLine(): Promise<string | null> {
  const { data, error } = await overseerDb
    .from('dmarc_reports').select('total, pass_pct, failures').order('report_date', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) return null
  const failures = (data.failures as DmarcFailure[] | null) ?? []
  if (failures.length === 0) return `✅ Email security — all ${data.total} messages authenticated (DMARC ${data.pass_pct}%).`
  const total = failures.reduce((s, f) => s + f.count, 0)
  return `⚠️ Email security — ${total} message(s) from ${failures[0].sender} failed DMARC. Check Elara’s alert.`
}
