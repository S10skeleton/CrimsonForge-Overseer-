import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { errMsg, fmtMoney, prettyStage } from './finShared'

export default function RaiseView() {
  const raise = useQuery({ queryKey: ['fin', 'raise'], queryFn: api.financials.raise })
  if (raise.isLoading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
  if (raise.isError) return <div style={{ color: 'var(--red-text)' }}>{errMsg(raise.error)}</div>
  const r = raise.data!
  const pct = r.target > 0 ? Math.min(100, Math.round((r.committed / r.target) * 100)) : 0

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="card">
        <div className="section-label">Raise progress</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{fmtMoney(r.committed)}</span>
          <span style={{ color: 'var(--text-muted)' }}>committed of {fmtMoney(r.target)} target</span>
          <span className="badge badge-crimson" style={{ marginLeft: 'auto' }}>{pct}%</span>
        </div>
        <div style={{ height: 10, background: 'var(--bg-elevated)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8 }}>From CRM fundraising deals (lost excluded). Manage in CRM → Pipeline.</div>
      </div>

      <div className="card">
        <div className="section-label">By stage</div>
        {r.byStage.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No fundraising deals yet.</div>}
        {r.byStage.map(s => (
          <div key={s.stage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14 }}>{prettyStage(s.stage)} <span style={{ color: 'var(--text-hint)', fontSize: 12 }}>· {s.count}</span></span>
            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmtMoney(s.amount)}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 18px 6px' }}><div className="section-label" style={{ margin: 0 }}>Deals</div></div>
        {r.deals.map((d, i) => (
          <Link key={d.id} to={`/crm/companies/${d.company_id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', textDecoration: 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{d.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{prettyStage(d.stage)} · <span className={`badge ${d.status === 'won' ? 'badge-green' : d.status === 'lost' ? 'badge-red' : 'badge-dim'}`}>{d.status}</span></div>
            </div>
            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmtMoney(d.amount)}</span>
          </Link>
        ))}
        {r.deals.length === 0 && <div style={{ padding: '0 18px 14px', color: 'var(--text-muted)' }}>None.</div>}
      </div>
    </div>
  )
}
