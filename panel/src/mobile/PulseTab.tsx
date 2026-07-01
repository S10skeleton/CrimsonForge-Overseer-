/**
 * Pulse (MOBILE-1) — glanceable business + system stats, reusing the same
 * endpoints the desktop Home/Financials screens use. Read-only. Fresh from API.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--red-text)' : tone === 'warn' ? 'var(--yellow)' : tone === 'good' ? 'var(--green)' : 'var(--text-primary)'
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function PulseTab() {
  const rev = useQuery({ queryKey: ['fin', 'revenue'], queryFn: api.financials.revenue })
  const home = useQuery({ queryKey: ['home', 'summary'], queryFn: api.home.summary })
  const triage = useQuery({ queryKey: ['mobile', 'triage'], queryFn: api.mobile.triage })

  const r = rev.data
  const downItems = (triage.data?.items ?? []).filter(i => i.source === 'uptime' || i.source === 'railway')
  const sentry = (triage.data?.items ?? []).find(i => i.source === 'sentry')
  const sysOk = triage.data && downItems.length === 0

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Pulse</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Stat label="MRR" value={rev.isLoading ? '…' : money(r?.mrr ?? 0)} sub={r ? `${money(r.arr)} ARR` : undefined} />
        <Stat label="Active subs" value={rev.isLoading ? '…' : (r?.activeSubs ?? 0)} sub={r ? `+${r.newThisMonth} this month` : undefined} />
        <Stat label="Failed payments" value={rev.isLoading ? '…' : (r?.failedPaymentsCount ?? 0)} tone={(r?.failedPaymentsCount ?? 0) > 0 ? 'warn' : 'good'} sub={r && r.failedPaymentsCount > 0 ? money(r.failedPaymentsAmount) : 'none open'} />
        <Stat label="Signups (7d)" value={home.isLoading ? '…' : (home.data?.signupsThisWeek ?? '—')} />
        <Stat label="Open leads" value={home.isLoading ? '…' : (home.data?.leads.open ?? '—')} sub={home.data?.leads.hot != null ? `${home.data.leads.hot} hot` : undefined} />
        <Stat label="New errors (24h)" value={triage.isLoading ? '…' : (sentry ? sentry.title.match(/^\d+/)?.[0] ?? '1' : 0)} tone={sentry ? 'warn' : 'good'} sub={sentry ? 'tap Triage' : 'all clear'} />
      </div>

      {/* System status */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 8 }}>System status</div>
        {triage.isLoading ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Checking…</div> : sysOk ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} /> All systems operational
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {downItems.map((i, k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, color: i.severity === 'critical' ? 'var(--red-text)' : 'var(--yellow)', fontSize: 13.5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} /> {i.title}
              </div>
            ))}
          </div>
        )}
      </div>

      {(rev.isError || home.isError) && <div style={{ fontSize: 12, color: 'var(--text-hint)', textAlign: 'center' }}>Some stats couldn’t load — pull to refresh.</div>}
    </div>
  )
}
