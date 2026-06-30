import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../api'

const SEV: Record<string, string> = {
  info: 'var(--text-hint)', success: 'var(--green)', warning: 'var(--yellow)', critical: 'var(--red-text)',
}

function Metric({ label, value, sub, to, accent }: { label: string; value: string; sub?: React.ReactNode; to?: string; accent?: string }) {
  const inner = (
    <div className="kpi" style={{ height: '100%' }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner
}

// Pipeline stages are Phase 5 (CRM). Shown as a labelled placeholder until then.
const PIPELINE_STAGES = [
  { label: 'Investors', accent: 'var(--accent)' },
  { label: 'Enterprise', accent: 'var(--elara)' },
  { label: 'Beta partners', accent: 'var(--green)' },
]

export default function HomeTab() {
  const billing = useQuery({ queryKey: ['fp', 'billing'], queryFn: api.fp.billing })
  const summary = useQuery({ queryKey: ['home', 'summary'], queryFn: api.home.summary })
  const activity = useQuery({ queryKey: ['home', 'activity'], queryFn: () => api.activity.events({ limit: 8 }) })

  const mrr = billing.data?.mrr as number | undefined
  const newSubs = billing.data?.newThisMonth as number | undefined
  const churned = billing.data?.cancelledThisMonth as number | undefined

  const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`
  const dash = '—'

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Home</h1>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>
        Crimson Forge at a glance.
      </div>

      {/* Metric row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Metric
          label="MRR"
          value={billing.isLoading ? '…' : mrr != null ? fmtMoney(mrr) : dash}
          sub={mrr != null && (newSubs != null || churned != null)
            ? <span style={{ color: 'var(--text-muted)' }}>+{newSubs ?? 0} new · −{churned ?? 0} churned this mo</span>
            : 'ForgePilot · Stripe'}
        />
        <Metric
          label="New signups"
          value={summary.isLoading ? '…' : summary.data?.signupsThisWeek != null ? String(summary.data.signupsThisWeek) : dash}
          sub="ForgePilot · this week"
        />
        <Metric
          label="Open leads"
          value={summary.isLoading ? '…' : summary.data?.leads.open != null ? String(summary.data.leads.open) : dash}
          sub={summary.data?.leads.hot != null
            ? <span style={{ color: summary.data.leads.hot > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{summary.data.leads.hot} hot</span>
            : 'CRM'}
          to="/leads"
        />
        <Metric
          label="Runway"
          value={dash}
          sub={<span style={{ color: 'var(--text-hint)' }}>Financials · Phase 6</span>}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} className="home-grid">
        {/* Activity feed */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px' }}>
            <div className="section-label" style={{ margin: 0 }}>Activity</div>
            <Link to="/activity" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>View all →</Link>
          </div>
          {activity.isLoading && <div style={{ padding: '0 18px 16px', color: 'var(--text-muted)' }}>Loading…</div>}
          {activity.isError && <div style={{ padding: '0 18px 16px', color: 'var(--text-muted)' }}>Activity unavailable.</div>}
          {activity.data && activity.data.data.length === 0 && (
            <div style={{ padding: '0 18px 16px', color: 'var(--text-muted)' }}>No activity yet.</div>
          )}
          {activity.data?.data.map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 11, padding: '11px 18px', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: SEV[e.severity] ?? SEV.info, fontSize: 10, marginTop: 4, flexShrink: 0 }}>●</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{e.title}</div>
                {e.body && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 }}>{e.body}</div>}
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--text-hint)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {formatDistanceToNow(new Date(e.created_at))} ago
              </span>
            </div>
          ))}
        </div>

        {/* Pipeline snapshot */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="section-label" style={{ margin: 0 }}>Pipeline</div>
            <Link to="/pipeline" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>Open →</Link>
          </div>
          {PIPELINE_STAGES.map(s => (
            <div key={s.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                <span style={{ color: 'var(--text-hint)' }}>—</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: '0%', height: '100%', background: s.accent }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 10 }}>
            Deal stages land with CRM (Phase 5).
          </div>
        </div>
      </div>
    </div>
  )
}
