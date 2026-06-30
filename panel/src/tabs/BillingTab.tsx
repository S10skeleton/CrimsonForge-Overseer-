import { useState, useEffect } from 'react'
import { api } from '../api'
import { format, formatDistanceToNow } from 'date-fns'
import { CustomerView, MetricCards, DataCard, fmtMoney, fmtNum } from './customers/shared'

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
  const dash = loading ? '…' : undefined

  return (
    <CustomerView title="Billing" product="crimsonforge-pro">
      <MetricCards items={[
        { label: 'MRR',         value: dash ?? fmtMoney(mrr) },
        { label: 'ARR',         value: dash ?? fmtMoney(mrr * 12) },
        { label: 'Active subs', value: dash ?? fmtNum(active.length) },
        { label: 'Past due',    value: dash ?? fmtNum(pastDue.length), accent: pastDue.length > 0 ? 'var(--red-text)' : undefined },
      ]} />

      {pastDue.length > 0 && (
        <DataCard title={<span style={{ color: 'var(--red-text)' }}>Payment failures — action required</span>}>
          {pastDue.map((shop, i) => (
            <div key={shop.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{shop.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{shop.email || '—'}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-hint)' }} className="mono">
                {shop.stripe_subscription_id ? `${shop.stripe_subscription_id.slice(0, 20)}…` : 'No Stripe ID'}
              </div>
            </div>
          ))}
        </DataCard>
      )}

      <DataCard title="Active subscriptions" flush>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : active.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No active subscriptions.</div>
        ) : (
          <table>
            <thead><tr><th>Shop</th><th>Tier</th><th>MRR</th><th>Tickets</th><th>Last activity</th></tr></thead>
            <tbody>
              {active.map(shop => (
                <tr key={shop.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{shop.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{shop.email || '—'}</div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {shop.subscription_tier === 'partner' ? '♦ Partner' : (shop.subscription_tier ?? 'free')}
                  </td>
                  <td style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtMoney(shop.monthly_revenue ?? 0)}/mo</td>
                  <td style={{ fontWeight: 700 }}>{shop.ticket_count ?? 0}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {shop.last_ticket_created ? formatDistanceToNow(new Date(shop.last_ticket_created), { addSuffix: true }) : 'No activity'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataCard>

      {trialBeta.length > 0 && (
        <DataCard title="Trial & beta accounts" flush>
          <table>
            <thead><tr><th>Shop</th><th>Status</th><th>Tickets</th><th>Last activity</th><th>Trial ends</th><th>Days left</th></tr></thead>
            <tbody>
              {trialBeta.map(shop => {
                const isBeta = shop.subscription_status === 'beta'
                let daysLeft: number | null = null
                let trialEnds = '—'
                if (!isBeta && shop.trial_ends_at) {
                  const endsAt = new Date(shop.trial_ends_at)
                  daysLeft  = Math.ceil((endsAt.getTime() - Date.now()) / 86400000)
                  trialEnds = format(endsAt, 'MMM d, yyyy')
                }
                const daysColor = isBeta ? 'var(--text-muted)'
                  : daysLeft == null ? 'var(--text-muted)'
                  : daysLeft > 14 ? 'var(--green)'
                  : daysLeft > 7  ? 'var(--yellow)'
                  : 'var(--red-text)'
                return (
                  <tr key={shop.id}>
                    <td style={{ fontWeight: 600 }}>{shop.name}</td>
                    <td><span className={`badge ${isBeta ? 'badge-violet' : 'badge-yellow'}`}>{isBeta ? 'BETA' : 'TRIAL'}</span></td>
                    <td style={{ fontWeight: 700 }}>{shop.ticket_count ?? 0}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {shop.last_ticket_created ? formatDistanceToNow(new Date(shop.last_ticket_created), { addSuffix: true }) : 'No activity'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{isBeta ? 'No expiry' : trialEnds}</td>
                    <td style={{ fontWeight: 700, color: daysColor }}>{isBeta ? '∞' : (daysLeft ?? '—')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataCard>
      )}

      <DataCard title="Billing events log" flush>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No billing events yet.</div>
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
                } catch { /* ignore unparseable metadata */ }
                return (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }} className="mono">
                      {e.created_at ? format(new Date(e.created_at), 'MMM d HH:mm') : '—'}
                    </td>
                    <td>{e.shops?.name ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>{e.event_type?.replace(/_/g, ' ')}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{details}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </DataCard>
    </CustomerView>
  )
}
