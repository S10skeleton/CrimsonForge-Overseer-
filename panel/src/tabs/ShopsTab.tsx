import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'

const PARTNER_LIMIT = 3

function getShopHealth(shop: any): { label: string; color: string } {
  const daysSince = shop.last_ticket_created
    ? Math.floor((Date.now() - new Date(shop.last_ticket_created).getTime()) / 86400000)
    : 999
  if (shop.subscription_status === 'trial' || shop.subscription_status === 'beta') {
    return (shop.recent_tickets_7d ?? 0) > 0
      ? { label: 'Active Trial', color: 'var(--cyan)' }
      : { label: 'Inactive Trial', color: 'var(--yellow)' }
  }
  if (daysSince <= 7)  return { label: 'Healthy',  color: 'var(--green)' }
  if (daysSince <= 14) return { label: 'At Risk',  color: 'var(--yellow)' }
  return { label: 'Churning', color: 'var(--red)' }
}

function OnboardingBar({ shop }: { shop: any }) {
  const items = [
    { label: 'Team invited',     done: (shop.user_count ?? 0) > 1 },
    { label: 'First ticket',     done: (shop.ticket_count ?? 0) > 0 },
    { label: 'Stripe connected', done: !!shop.stripe_connect_charges_enabled },
  ]
  const score = items.filter(i => i.done).length
  const pct   = (score / items.length) * 100
  const color = score === items.length ? 'var(--green)' : score >= 2 ? 'var(--cyan)' : 'var(--yellow)'
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>Onboarding:</span>
        <div style={{ flex: 1, height: 4, background: 'var(--bg-dark)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .3s' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>{score}/{items.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {items.map(item => (
          <span key={item.label} style={{ fontSize: 11, color: item.done ? 'var(--green)' : 'var(--dim)' }}>
            {item.done ? '\u2713' : '\u2717'} {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ShopsTab() {
  const [shops, setShops]             = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [inviteShopId, setInviteShopId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMsg, setInviteMsg]     = useState('')
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesDraft, setNotesDraft]   = useState('')

  useEffect(() => {
    api.cfp.shops().then(setShops).finally(() => setLoading(false))
  }, [])

  const total        = shops.length
  const activeCount  = shops.filter(s => s.subscription_status === 'active' || s.subscription_tier === 'partner').length
  const betaCount    = shops.filter(s => s.subscription_status === 'beta').length
  const mrr          = shops.filter(s => s.subscription_status === 'active').reduce((sum, s) => sum + (s.monthly_revenue ?? 0), 0)
  const totalTickets = shops.reduce((sum, s) => sum + (s.ticket_count ?? 0), 0)
  const partnerCount = shops.filter(s => s.subscription_tier === 'partner' || s.subscription_status === 'partner').length

  const saveNotes = async (shopId: string) => {
    await api.cfp.saveShopNotes(shopId, notesDraft)
    setShops(prev => prev.map(s => s.id === shopId ? { ...s, founder_notes: notesDraft } : s))
    setEditingNotes(null)
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 28 }} className="grad">
        SHOP MANAGEMENT
      </h1>

      {/* KPIs */}
      <div className="kpi-grid">
        {[
          { label: 'Total Shops',      value: total,        color: 'var(--text)' },
          { label: 'Active / Partner', value: activeCount,  color: 'var(--green)' },
          { label: 'Beta',             value: betaCount,    color: 'var(--cyan)' },
          { label: 'Total Tickets',    value: totalTickets, color: 'var(--violet)' },
          { label: 'MRR',              value: `$${mrr}`,   color: 'var(--green)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{loading ? '\u2014' : k.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 0 }}>All Shops</div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: 'rgba(89,73,172,.15)', border: '1px solid rgba(89,73,172,.4)', color: 'var(--violet)',
        }}>
          \u2666 {partnerCount}/{PARTNER_LIMIT} Partner Slots
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>Loading...</div>
        ) : shops.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>No shops yet.</div>
        ) : shops.map((shop, idx) => {
          const health    = getShopHealth(shop)
          const isPartner = shop.subscription_tier === 'partner' || shop.subscription_status === 'partner'
          const isBeta    = shop.subscription_status === 'beta'
          const isEditing = editingNotes === shop.id

          return (
            <div key={shop.id} style={{
              padding: '16px 20px',
              borderBottom: idx < shops.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {/* Row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                {/* Name + health */}
                <div style={{ minWidth: 200, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{shop.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                    Created {formatDistanceToNow(new Date(shop.created_at), { addSuffix: true })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: health.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: health.color }}>{health.label}</span>
                    {(shop.recent_tickets_7d ?? 0) > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--dim)' }}>{'\u00B7'} {shop.recent_tickets_7d} this week</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
                    {shop.email || '\u2014'} {'\u00B7'} {shop.user_count ?? 0} user(s)
                  </div>
                </div>

                {/* Subscription */}
                <div style={{ minWidth: 140 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    {isPartner && <span className="badge" style={{ background: 'rgba(139,92,246,.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,.4)' }}>{'\u2666'} PARTNER</span>}
                    {isBeta && !isPartner && <span className="badge badge-cyan">BETA</span>}
                    {shop.subscription_status === 'active' && !isPartner && <span className="badge badge-green">ACTIVE</span>}
                    {(!shop.subscription_status || shop.subscription_status === 'trial') && <span className="badge badge-yellow">TRIAL</span>}
                    {shop.subscription_status === 'cancelled' && <span className="badge badge-red">CANCELLED</span>}
                    {shop.subscription_status === 'past_due' && <span className="badge badge-red">PAST DUE</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                    {isPartner ? 'Partner \u00B7 No charge'
                      : isBeta ? 'Beta \u00B7 No charge'
                      : `${shop.subscription_tier ?? 'free'} \u00B7 $${shop.monthly_revenue ?? 0}/mo`}
                  </div>
                </div>

                {/* Tickets + actions */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 26, color: 'var(--cyan)', lineHeight: 1 }}>
                    {shop.ticket_count ?? 0}
                    <span style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'Rajdhani', marginLeft: 4 }}>tickets</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => { setInviteShopId(inviteShopId === shop.id ? null : shop.id); setInviteEmail(''); setInviteMsg('') }}
                      className="btn btn-ghost btn-sm"
                    >
                      {inviteShopId === shop.id ? 'Close' : '+ Add User'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Onboarding bar */}
              <OnboardingBar shop={shop} />

              {/* Founder notes */}
              <div style={{ marginTop: 8 }}>
                {isEditing ? (
                  <div>
                    <textarea
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      placeholder="Notes about this shop..."
                      rows={2}
                      style={{
                        width: '100%', fontSize: 12, background: 'var(--bg-dark)',
                        border: '1px solid var(--border)', borderRadius: 6,
                        padding: '6px 10px', color: 'var(--text)', resize: 'none',
                        fontFamily: 'Rajdhani, sans-serif',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button onClick={() => saveNotes(shop.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>Save</button>
                      <button onClick={() => setEditingNotes(null)} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => { setEditingNotes(shop.id); setNotesDraft(shop.founder_notes || '') }}
                    style={{ fontSize: 12, color: 'var(--dim)', cursor: 'pointer' }}
                  >
                    {shop.founder_notes ? <span>{shop.founder_notes}</span> : <span style={{ opacity: .5 }}>+ Add notes</span>}
                  </div>
                )}
              </div>

              {/* Invite inline */}
              {inviteShopId === shop.id && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-dark)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--dim)' }}>Add User:</span>
                    <input
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="user@email.com"
                      style={{ flex: 1, minWidth: 160, fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text)' }}
                    />
                    <button onClick={() => { setInviteMsg(`Send invite to ${inviteEmail} via CFP admin panel`) }} disabled={!inviteEmail.trim()} className="btn btn-ghost btn-sm">Invite</button>
                    <button onClick={() => { setInviteShopId(null); setInviteEmail('') }} className="btn btn-ghost btn-sm">Cancel</button>
                  </div>
                  {inviteMsg && <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 6 }}>{inviteMsg}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
