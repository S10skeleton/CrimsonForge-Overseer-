/**
 * Resend email delivery monitoring
 * Checks domain health and recent delivery failures.
 * Read-only — never sends emails (that's send-email.ts).
 */

import type { ToolResult, AgentTool } from '../types/index.js'

// P1 threshold — alert if bounce rate exceeds this
const BOUNCE_RATE_THRESHOLD = 0.03  // 3%

// ─── Types ────────────────────────────────────────────────────────────────

interface ResendDomainHealth {
  name: string
  status: 'verified' | 'pending' | 'failed' | 'unknown'
  region: string
}

interface ResendStats {
  domain: ResendDomainHealth | null
  sent: number
  delivered: number
  bounced: number
  complained: number
  bounceRate: number
  thresholdBreached: boolean
  window: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getApiKey(): string | null {
  return process.env.RESEND_API_KEY || null
}

async function resendGet(path: string): Promise<Response> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  return fetch(`https://api.resend.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  })
}

// ─── Core logic ───────────────────────────────────────────────────────────

async function getResendStats(): Promise<ToolResult<ResendStats>> {
  const timestamp = new Date().toISOString()

  const empty: ResendStats = {
    domain: null,
    sent: 0,
    delivered: 0,
    bounced: 0,
    complained: 0,
    bounceRate: 0,
    thresholdBreached: false,
    window: '24h',
  }

  if (!getApiKey()) {
    return {
      tool: 'resend_stats',
      success: false,
      timestamp,
      data: empty,
      error: 'RESEND_API_KEY not configured.',
    }
  }

  try {
    // ── Domain health ────────────────────────────────────────────────────
    let domainHealth: ResendDomainHealth | null = null

    try {
      const domainsRes = await resendGet('/domains')
      if (domainsRes.ok) {
        const domainsData = await domainsRes.json() as {
          data: Array<{ name: string; status: string; region: string }>
        }

        const cfpDomain = domainsData.data?.find(
          (d) => d.name.includes('crimsonforge') || d.name.includes('crimson')
        )

        if (cfpDomain) {
          domainHealth = {
            name: cfpDomain.name,
            status: cfpDomain.status as ResendDomainHealth['status'],
            region: cfpDomain.region,
          }
          console.log(`[resend] Domain: ${domainHealth.name} — ${domainHealth.status}`)
        } else {
          console.log('[resend] No CFP domain found in Resend account')
        }
      }
    } catch (err) {
      console.log('[resend] Domain check failed:', err instanceof Error ? err.message : 'Unknown')
    }

    // ── Recent email stats ───────────────────────────────────────────────
    // Resend /emails endpoint returns recent sends — we check last 100 for
    // bounce/failure rate as a proxy for delivery health
    let sent = 0
    let delivered = 0
    let bounced = 0
    let complained = 0

    try {
      const emailsRes = await resendGet('/emails?limit=100')
      if (emailsRes.ok) {
        const emailsData = await emailsRes.json() as {
          data: Array<{ created_at: string; last_event: string }>
        }

        // Filter to last 24 hours
        const since = Date.now() - 24 * 60 * 60 * 1000
        const recentEmails = (emailsData.data || []).filter(
          (e) => new Date(e.created_at).getTime() > since
        )

        sent = recentEmails.length

        for (const email of recentEmails) {
          switch (email.last_event) {
            case 'delivered': delivered++; break
            case 'bounced':
            case 'delivery_delayed': bounced++; break
            case 'complained': complained++; break
            // 'sent', 'clicked', 'opened' — count as in-flight/healthy
          }
        }

        console.log(`[resend] Last 24h: ${sent} sent, ${delivered} delivered, ${bounced} bounced, ${complained} complained`)
      }
    } catch (err) {
      console.log('[resend] Email stats check failed:', err instanceof Error ? err.message : 'Unknown')
    }

    const bounceRate = sent > 0 ? bounced / sent : 0
    const thresholdBreached = bounceRate > BOUNCE_RATE_THRESHOLD && sent >= 5  // only alert if meaningful volume

    if (thresholdBreached) {
      console.log(`[resend] ⚠️ Bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds ${BOUNCE_RATE_THRESHOLD * 100}% threshold`)
    }

    return {
      tool: 'resend_stats',
      success: true,
      timestamp,
      data: {
        domain: domainHealth,
        sent,
        delivered,
        bounced,
        complained,
        bounceRate: Math.round(bounceRate * 1000) / 1000,
        thresholdBreached,
        window: '24h',
      },
    }
  } catch (err) {
    return {
      tool: 'resend_stats',
      success: false,
      timestamp,
      data: empty,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────

export async function runResendCheck(): Promise<ToolResult<ResendStats>> {
  return getResendStats()
}

export const resendStatsTool: AgentTool = {
  name: 'resend_stats',
  description:
    'Check Resend email delivery health for the last 24 hours. ' +
    'Returns domain verification status, sent/delivered/bounced counts, and bounce rate. ' +
    'Flags if bounce rate exceeds the 3% threshold. ' +
    'Use in morning briefing and when asked about email delivery.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => getResendStats(),
}
