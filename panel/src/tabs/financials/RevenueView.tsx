import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../../api'
import { errMsg, fmtMoney, fmtNum } from './finShared'

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export default function RevenueView() {
  const rev = useQuery({ queryKey: ['fin', 'revenue'], queryFn: api.financials.revenue })
  const hist = useQuery({ queryKey: ['fin', 'mrr-history'], queryFn: () => api.financials.mrrHistory(12) })

  const r = rev.data
  const series = (hist.data ?? []).map(p => ({ date: p.snapshot_date.slice(5), mrr: p.mrr }))

  return (
    <div>
      {rev.isError && <div style={{ color: 'var(--red-text)', marginBottom: 12 }}>{errMsg(rev.error)}</div>}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Metric label="MRR" value={rev.isLoading ? '…' : fmtMoney(r?.mrr)} sub="ForgePilot · Stripe" />
        <Metric label="ARR" value={rev.isLoading ? '…' : fmtMoney(r?.arr)} sub="MRR × 12" />
        <Metric label="Active subs" value={rev.isLoading ? '…' : fmtNum(r?.activeSubs)} sub={r ? `+${r.newThisMonth} / −${r.churnedThisMonth} this mo` : undefined} />
        <Metric label="Failed payments" value={rev.isLoading ? '…' : fmtMoney(r?.failedPaymentsAmount)} sub={r ? `${r.failedPaymentsCount} open` : undefined} accent={r && r.failedPaymentsCount > 0 ? 'var(--red-text)' : undefined} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-label">MRR trend</div>
        {hist.isLoading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
          : series.length < 2 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
              Collecting data — the trend starts now. A snapshot is taken nightly; the line appears once there are at least two days.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-hint)' }} stroke="var(--border)" />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-hint)' }} stroke="var(--border)" tickFormatter={(v) => fmtMoney(v, { compact: true })} width={56} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
                <Line type="monotone" dataKey="mrr" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
      </div>

      <div className="card">
        <div className="section-label">Plan breakdown</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div><div className="kpi-value" style={{ fontSize: '1.5rem' }}>{fmtNum(r?.planBreakdown.solo)}</div><div className="kpi-label">Solo</div></div>
          <div><div className="kpi-value" style={{ fontSize: '1.5rem' }}>{fmtNum(r?.planBreakdown.shop)}</div><div className="kpi-label">Shop</div></div>
        </div>
      </div>
    </div>
  )
}
