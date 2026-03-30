import { useState, useEffect } from 'react'
import { api } from '../api'
import { format, formatDistanceToNow } from 'date-fns'

export default function BillingTab() {
  const [shops, setShops]     = useState<any[]>([])
  const [events, setEvents]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.cfp.shops(), api.cfp.billingEvents()])
      .then(([s, e]) => { setShops(s); setEvents(e) })
      .finally(() => setLoading(false))
  }, [])

  const active    = shops.filter(s => s.subscription_status === 'active' || s.subscription_tier === 'partner')
  const pastDue   = shops.filter(s => s.subscription_status === 'past_due')
  const trialBeta = shops.filter(s => ['trial', 'beta'].includes(s.subscription_status))
  const mrr       = active.reduce((sum, s) => sum + (s.monthly_revenue ?? 0), 0)

  return (
    <div>
      <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 28 }} className="grad">
        BILLING DASHBOARD
      </h1>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'MRR',         value: loading ? '\u2014' : `$${mrr.toLocaleString()}`,         color: 'var(--green)' },
          { label: 'ARR',         value: loading ? '\u2014' : `$${(mrr * 12).toLocaleString()}`,  color: 'var(--green)' },
          { label: 'Active Subs', value: loading ? '\u2014' : active.length,                       color: 'var(--cyan)' },
          { label: 'Past Due',    value: loading ? '\u2014' : pastDue.length,                      color: pastDue.length > 0 ? 'var(--red)' : 'var(--dim)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Past Due Alert */}
      {pastDue.length > 0 && (
        <div style={{ marginBottom: 24, padding: '14px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.05)' }}>
          <div className="section-label" style={{ color: 'var(--red)', marginBottom: 10 }}>PAYMENT FAILURES \u2014 ACTION REQUIRED</div>
          {pastDue.map(shop => (
            <div key={shop.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{shop.name}</div>
                <div style={{ color: 'var(--dim)', fontSize: 12 }}>{shop.email || '\u2014'}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono' }}>
                {shop.stripe_subscription_id ? `${shop.stripe_subscription_id.slice(0, 20)}...` : 'No Stripe ID'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Subscriptions */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Active Subscriptions</div>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)' }}>Loading...</div>
        ) : active.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)' }}>No active subscriptions.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Shop</th><th>Tier</th><th>MRR</th><th>Tickets</th><th>Last Activity</th></tr>
              </thead>
              <tbody>
                {active.map(shop => (
                  <tr key={shop.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{shop.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--dim)' }}>{shop.email || '\u2014'}</div>
                    </td>
                    <td style={{ color: 'var(--dim)', fontSize: 13 }}>
                      {shop.subscription_tier === 'partner' ? '\u2666 Partner' : (shop.subscription_tier ?? 'free')}
                    </td>
                    <td style={{ color: 'var(--green)', fontWeight: 700 }}>${shop.monthly_revenue ?? 0}/mo</td>
                    <td style={{ fontFamily: 'Orbitron', fontWeight: 900, color: 'var(--cyan)' }}>{shop.ticket_count ?? 0}</td>
                    <td style={{ color: 'var(--dim)', fontSize: 12 }}>
                      {shop.last_ticket_created
                        ? formatDistanceToNow(new Date(shop.last_ticket_created), { addSuffix: true })
                        : 'No activity'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trial & Beta Countdown */}
      {trialBeta.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Trial & Beta Accounts</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Shop</th><th>Status</th><th>Tickets</th><th>Last Activity</th><th>Trial Ends</th><th>Days Left</th></tr>
              </thead>
              <tbody>
                {trialBeta.map(shop => {
                  const isBeta = shop.subscription_status === 'beta'
                  let daysLeft: number | null = null
                  let trialEnds = '\u2014'
                  if (!isBeta && shop.trial_ends_at) {
                    const endsAt = new Date(shop.trial_ends_at)
                    daysLeft  = Math.ceil((endsAt.getTime() - Date.now()) / 86400000)
                    trialEnds = format(endsAt, 'MMM d, yyyy')
                  }
                  const daysColor = isBeta ? 'var(--cyan)'
                    : daysLeft == null ? 'var(--dim)'
                    : daysLeft > 14 ? 'var(--green)'
                    : daysLeft > 7  ? 'var(--yellow)'
                    : 'var(--red)'
                  return (
                    <tr key={shop.id}>
                      <td style={{ fontWeight: 600 }}>{shop.name}</td>
                      <td><span className={`badge ${isBeta ? 'badge-cyan' : 'badge-yellow'}`}>{isBeta ? 'BETA' : 'TRIAL'}</span></td>
                      <td style={{ fontFamily: 'Orbitron', fontWeight: 900, color: 'var(--cyan)' }}>{shop.ticket_count ?? 0}</td>
                      <td style={{ color: 'var(--dim)', fontSize: 12 }}>
                        {shop.last_ticket_created
                          ? formatDistanceToNow(new Date(shop.last_ticket_created), { addSuffix: true })
                          : 'No activity'}
                      </td>
                      <td style={{ color: 'var(--dim)', fontSize: 12 }}>
                        {isBeta ? <span style={{ color: 'var(--cyan)' }}>No expiry</span> : trialEnds}
                      </td>
                      <td style={{ fontFamily: 'Orbitron', fontWeight: 900, color: daysColor }}>
                        {isBeta ? '\u221E' : (daysLeft ?? '\u2014')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Billing Events Log */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Billing Events Log</div>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)' }}>Loading...</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)' }}>No billing events yet.</div>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Shop</th><th>Event</th><th>Details</th></tr></thead>
            <tbody>
              {events.map(e => {
                let details = '\u2014'
                try {
                  const m = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata ?? {})
                  if (m.amount_paid != null) details = `$${(m.amount_paid / 100).toFixed(2)}`
                  else if (m.tier) details = m.tier
                } catch {}
                return (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--dim)', fontSize: 12, fontFamily: 'Share Tech Mono' }}>
                      {e.created_at ? format(new Date(e.created_at), 'MMM d HH:mm') : '\u2014'}
                    </td>
                    <td>{e.shops?.name ?? '\u2014'}</td>
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
