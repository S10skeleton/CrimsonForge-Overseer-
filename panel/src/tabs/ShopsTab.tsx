import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'

export default function ShopsTab() {
  const [shops, setShops] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.cfp.shops().then(setShops).finally(() => setLoading(false))
  }, [])

  const total = shops.length
  const active = shops.filter(s => s.subscription_status === 'active').length
  const beta = shops.filter(s => s.subscription_status === 'beta').length
  const totalTickets = shops.reduce((sum, s) => sum + (s.ticket_count ?? 0), 0)
  const mrr = shops.filter(s => s.subscription_status === 'active').reduce((sum, s) => sum + (s.monthly_revenue ?? 0), 0)

  const statusBadge = (s: any) => {
    const map: Record<string, string> = {
      active: 'badge-green', beta: 'badge-cyan', trial: 'badge-yellow',
      cancelled: 'badge-red', past_due: 'badge-red',
    }
    return map[s.subscription_status] ?? 'badge-dim'
  }

  const shopStatus = (s: any): { cls: string; label: string } => {
    if (!s.last_ticket_created) return { cls: 'badge-dim', label: 'No activity' }
    const days = Math.floor((Date.now() - new Date(s.last_ticket_created).getTime()) / 86400000)
    if (days < 1) return { cls: 'badge-green', label: 'Active' }
    if (days < 3) return { cls: 'badge-yellow', label: 'Quiet' }
    return { cls: 'badge-red', label: 'Silent' }
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 28 }} className="grad">
        SHOP MANAGEMENT
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Shops', value: total, color: 'var(--text)' },
          { label: 'Active Paid', value: active, color: 'var(--green)' },
          { label: 'Beta', value: beta, color: 'var(--accent)' },
          { label: 'Total Tickets', value: totalTickets, color: 'var(--secondary)' },
          { label: 'MRR', value: `$${mrr}`, color: 'var(--green)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div className="section-label" style={{ marginBottom: 0 }}>All Shops</div>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>Loading...</div>
        ) : shops.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>No shops yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Shop</th><th>Status</th><th>Activity</th><th>Tickets</th><th>Users</th><th>Tier</th></tr>
              </thead>
              <tbody>
                {shops.map(s => {
                  const act = shopStatus(s)
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--dim)' }}>{s.email || '—'}</div>
                      </td>
                      <td><span className={`badge ${statusBadge(s)}`}>{s.subscription_status?.toUpperCase() ?? '—'}</span></td>
                      <td>
                        <span className={`badge ${act.cls}`}>{act.label}</span>
                        {s.last_ticket_created && (
                          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
                            {formatDistanceToNow(new Date(s.last_ticket_created), { addSuffix: true })}
                          </div>
                        )}
                      </td>
                      <td style={{ fontFamily: 'Orbitron', fontWeight: 900, color: 'var(--accent)', fontSize: 18 }}>
                        {s.ticket_count ?? 0}
                      </td>
                      <td style={{ color: 'var(--dim)' }}>{s.user_count ?? 0}</td>
                      <td style={{ color: 'var(--dim)', fontSize: 13 }}>
                        {s.subscription_tier ? s.subscription_tier.replace('_', ' ') : '—'}
                        {s.monthly_revenue ? <span style={{ color: 'var(--green)' }}> · ${s.monthly_revenue}/mo</span> : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
