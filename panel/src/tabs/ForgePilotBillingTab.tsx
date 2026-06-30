import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'
import { CustomerView, MetricCards, DataCard, StateLine, fmtMoney, fmtNum } from './customers/shared'

export default function ForgePilotBillingTab() {
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    api.fp.billing()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const mrr  = data?.mrr  ?? 0
  const arr  = mrr * 12
  const subs = data?.activeSubscriptions ?? 0
  const failures = data?.paymentFailures ?? []
  const dash = loading ? '…' : undefined

  return (
    <CustomerView title="Billing" product="forgepilot">
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -8, marginBottom: 18 }}>
        Solo &amp; Shop subscriptions · Stripe
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: 18, borderRadius: 8, border: '1px solid rgba(220,38,38,.35)', background: 'rgba(220,38,38,.06)', color: 'var(--red-text)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <MetricCards items={[
        { label: 'MRR',            value: dash ?? fmtMoney(mrr) },
        { label: 'ARR',            value: dash ?? fmtMoney(arr) },
        { label: 'Active subs',    value: dash ?? fmtNum(subs) },
        { label: 'Past due',       value: dash ?? fmtNum(failures.length), accent: failures.length > 0 ? 'var(--red-text)' : undefined },
        { label: 'New (mo)',       value: dash ?? fmtNum(data?.newThisMonth ?? 0) },
        { label: 'Cancelled (mo)', value: dash ?? fmtNum(data?.cancelledThisMonth ?? 0), accent: data?.cancelledThisMonth > 0 ? 'var(--yellow)' : undefined },
        { label: 'Solo plans',     value: dash ?? fmtNum(data?.planBreakdown?.solo ?? 0) },
        { label: 'Shop plans',     value: dash ?? fmtNum(data?.planBreakdown?.shop ?? 0) },
      ]} />

      {failures.length > 0 && (
        <DataCard title={<span style={{ color: 'var(--red-text)' }}>Payment failures — action required</span>}>
          {failures.map((f: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{f.customerEmail}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{f.failureMessage}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--red-text)', fontWeight: 700 }}>${f.amount.toFixed(2)}</div>
                <div style={{ color: 'var(--text-hint)', fontSize: 11 }}>{formatDistanceToNow(new Date(f.failedAt), { addSuffix: true })}</div>
              </div>
            </div>
          ))}
        </DataCard>
      )}

      {!loading && subs === 0 && failures.length === 0 && (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div className="section-label" style={{ margin: '0 0 10px' }}>Pre-launch</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 340, margin: '0 auto', lineHeight: 1.7 }}>
            No active ForgePilot subscriptions yet. Stripe products are configured and ready —
            subscriptions will appear here once billing goes live.
          </div>
        </div>
      )}

      {!loading && subs > 0 && (
        <DataCard title="Active subscriptions">
          <StateLine>
            {fmtNum(subs)} active subscription{subs !== 1 ? 's' : ''} — {fmtMoney(mrr)}/mo MRR
            ({data?.planBreakdown?.solo ?? 0} solo, {data?.planBreakdown?.shop ?? 0} shop)
          </StateLine>
        </DataCard>
      )}
    </CustomerView>
  )
}
