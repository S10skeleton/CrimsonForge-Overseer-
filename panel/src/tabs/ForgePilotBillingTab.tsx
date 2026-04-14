import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'

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

  return (
    <div>
      <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 6 }} className="grad">
        FORGEPILOT BILLING
      </h1>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 28 }}>
        Solo &amp; Shop subscriptions &middot; Stripe
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: 20, borderRadius: 8, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.05)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'MRR',            value: loading ? '...' : `$${mrr.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,  color: 'var(--green)' },
          { label: 'ARR',            value: loading ? '...' : `$${arr.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,  color: 'var(--green)' },
          { label: 'Active Subs',    value: loading ? '...' : subs,                                                                                           color: 'var(--cyan)'  },
          { label: 'Past Due',       value: loading ? '...' : failures.length,                                                                               color: failures.length > 0 ? 'var(--red)' : 'var(--dim)' },
          { label: 'New (mo)',       value: loading ? '...' : data?.newThisMonth ?? 0,                                                                       color: 'var(--cyan)'  },
          { label: 'Cancelled (mo)', value: loading ? '...' : data?.cancelledThisMonth ?? 0,                                                                 color: data?.cancelledThisMonth > 0 ? 'var(--yellow)' : 'var(--dim)' },
          { label: 'Solo Plans',     value: loading ? '...' : data?.planBreakdown?.solo ?? 0,                                                                color: 'var(--violet)'},
          { label: 'Shop Plans',     value: loading ? '...' : data?.planBreakdown?.shop ?? 0,                                                                color: 'var(--violet)'},
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '1.5rem' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Payment failures */}
      {failures.length > 0 && (
        <div style={{ marginBottom: 24, padding: '14px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.05)' }}>
          <div className="section-label" style={{ color: 'var(--red)', marginBottom: 10 }}>
            PAYMENT FAILURES &mdash; ACTION REQUIRED
          </div>
          {failures.map((f: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{f.customerEmail}</div>
                <div style={{ color: 'var(--dim)', fontSize: 12 }}>{f.failureMessage}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--red)', fontWeight: 700 }}>${f.amount.toFixed(2)}</div>
                <div style={{ color: 'var(--dim)', fontSize: 11 }}>
                  {formatDistanceToNow(new Date(f.failedAt), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pre-launch state */}
      {!loading && subs === 0 && failures.length === 0 && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 14,
          padding: '48px 32px', textAlign: 'center', background: 'rgba(255,255,255,.02)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.25 }}>&#11176;</div>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: 'var(--dim)', marginBottom: 10 }}>
            PRE-LAUNCH
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 13, maxWidth: 320, margin: '0 auto', lineHeight: 1.7 }}>
            No active ForgePilot subscriptions yet. Stripe products are configured
            and ready &mdash; subscriptions will appear here once billing goes live.
          </div>
        </div>
      )}

      {/* Active subscriptions table — appears once subs exist */}
      {!loading && subs > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Active Subscriptions</div>
          </div>
          <div style={{ padding: '20px', color: 'var(--dim)', fontSize: 13 }}>
            {subs} active subscription{subs !== 1 ? 's' : ''} &mdash;
            ${mrr.toFixed(0)}/mo MRR
            ({data?.planBreakdown?.solo ?? 0} solo, {data?.planBreakdown?.shop ?? 0} shop)
          </div>
        </div>
      )}
    </div>
  )
}
