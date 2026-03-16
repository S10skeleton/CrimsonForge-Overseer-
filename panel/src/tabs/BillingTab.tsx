import { useState, useEffect } from 'react'
import { api } from '../api'
import { format } from 'date-fns'

export default function BillingTab() {
  const [shops, setShops] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.cfp.shops(), api.cfp.billingEvents()])
      .then(([s, e]) => { setShops(s); setEvents(e) })
      .finally(() => setLoading(false))
  }, [])

  const active = shops.filter(s => s.subscription_status === 'active')
  const pastDue = shops.filter(s => s.subscription_status === 'past_due')
  const trialBeta = shops.filter(s => ['trial', 'beta'].includes(s.subscription_status))
  const mrr = active.reduce((sum, s) => sum + (s.monthly_revenue ?? 0), 0)

  return (
    <div>
      <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 28 }} className="grad">
        BILLING
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'MRR', value: loading ? '—' : `$${mrr.toLocaleString()}`, color: 'var(--green)' },
          { label: 'ARR', value: loading ? '—' : `$${(mrr * 12).toLocaleString()}`, color: 'var(--green)' },
          { label: 'Active Subs', value: loading ? '—' : active.length, color: 'var(--accent)' },
          { label: 'Past Due', value: loading ? '—' : pastDue.length, color: pastDue.length > 0 ? 'var(--red)' : 'var(--dim)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {trialBeta.length > 0 && (
        <div className="card" style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Trial & Beta Accounts</div>
          </div>
          <table>
            <thead><tr><th>Shop</th><th>Status</th><th>Tickets</th><th>Last Activity</th><th>Days Left</th></tr></thead>
            <tbody>
              {trialBeta.map(s => {
                const isBeta = s.subscription_status === 'beta'
                let daysLeft: number | null = null
                if (!isBeta && s.trial_ends_at) {
                  daysLeft = Math.ceil((new Date(s.trial_ends_at).getTime() - Date.now()) / 86400000)
                }
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><span className={`badge ${isBeta ? 'badge-cyan' : 'badge-yellow'}`}>{isBeta ? 'BETA' : 'TRIAL'}</span></td>
                    <td style={{ fontFamily: 'Orbitron', color: 'var(--accent)', fontWeight: 900 }}>{s.ticket_count ?? 0}</td>
                    <td style={{ color: 'var(--dim)', fontSize: 13 }}>
                      {s.last_ticket_created
                        ? format(new Date(s.last_ticket_created), 'MMM d')
                        : 'No activity'}
                    </td>
                    <td style={{ fontFamily: 'Orbitron', fontWeight: 900, color: isBeta ? 'var(--accent)' : daysLeft != null && daysLeft > 7 ? 'var(--green)' : 'var(--red)' }}>
                      {isBeta ? '∞' : daysLeft ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Recent Billing Events</div>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>Loading...</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)' }}>No billing events yet.</div>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Shop</th><th>Event</th><th>Details</th></tr></thead>
            <tbody>
              {events.map(e => {
                let details = '—'
                try {
                  const m = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata ?? {})
                  if (m.amount_paid != null) details = `$${(m.amount_paid / 100).toFixed(2)}`
                  else if (m.tier) details = m.tier
                } catch {}
                return (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--dim)', fontSize: 12, fontFamily: 'Share Tech Mono' }}>
                      {e.created_at ? format(new Date(e.created_at), 'MMM d HH:mm') : '—'}
                    </td>
                    <td>{e.shops?.name ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>{e.event_type?.replace(/_/g, ' ')}</td>
                    <td style={{ color: 'var(--dim)' }}>{details}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
