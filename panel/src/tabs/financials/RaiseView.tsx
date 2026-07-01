import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { errMsg, fmtMoney, prettyStage } from './finShared'

export default function RaiseView() {
  const raise = useQuery({ queryKey: ['fin', 'raise'], queryFn: api.financials.raise })
  if (raise.isLoading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
  if (raise.isError) return <div style={{ color: 'var(--red-text)' }}>{errMsg(raise.error)}</div>
  const r = raise.data!
  const pipeline = r.pipeline ?? 0
  const committedPct = r.target > 0 ? Math.min(100, (r.committed / r.target) * 100) : 0
  const pipelinePct = r.target > 0 ? Math.min(100 - committedPct, (pipeline / r.target) * 100) : 0

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="card">
        <div className="section-label">Raise progress</div>
        <div style={{ display: 'flex', gap: 22, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .6 }}>Target</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{fmtMoney(r.target)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .6 }}>Committed (signed)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{fmtMoney(r.committed)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .6 }}>In pipeline</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-muted)' }}>{fmtMoney(pipeline)}</div>
          </div>
          <span className="badge badge-crimson" style={{ marginLeft: 'auto', alignSelf: 'center' }}>{Math.round(committedPct)}% signed</span>
        </div>
        {/* Solid = signed money; hatched = still in play (never mistaken for closed). */}
        <div style={{ height: 12, background: 'var(--bg-elevated)', borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${committedPct}%`, height: '100%', background: 'var(--accent)' }} />
          <div style={{
            width: `${pipelinePct}%`, height: '100%',
            background: 'repeating-linear-gradient(45deg, rgba(192,48,42,.28) 0, rgba(192,48,42,.28) 5px, rgba(192,48,42,.12) 5px, rgba(192,48,42,.12) 10px)',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-hint)', marginTop: 8, flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--accent)', marginRight: 5 }} />Committed (signed)</span>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'repeating-linear-gradient(45deg, rgba(192,48,42,.28) 0, rgba(192,48,42,.28) 3px, rgba(192,48,42,.12) 3px, rgba(192,48,42,.12) 6px)', marginRight: 5 }} />In pipeline (open)</span>
          <span style={{ marginLeft: 'auto' }}>From CRM fundraising deals (lost excluded). Manage in CRM → Pipeline.</span>
        </div>
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
