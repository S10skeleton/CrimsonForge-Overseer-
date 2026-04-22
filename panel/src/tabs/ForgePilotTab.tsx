import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'

function planColor(tier: string) {
  if (tier === 'shop') return 'var(--cyan)'
  if (tier === 'solo') return 'var(--green)'
  return 'var(--dim)'
}

function statusColor(status: string) {
  if (status === 'active')   return 'var(--green)'
  if (status === 'trialing') return 'var(--cyan)'
  if (status === 'past_due') return 'var(--red)'
  if (status === 'canceled') return 'var(--dim)'
  return 'var(--yellow)'
}

function smallBtn(color: string): CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    cursor: 'pointer',
    fontFamily: 'Share Tech Mono',
  }
}

export default function ForgePilotTab() {
  const [stats,    setStats]    = useState<any>(null)
  const [users,    setUsers]    = useState<any[]>([])
  const [shops,    setShops]    = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [subTab,   setSubTab]   = useState<'overview' | 'users' | 'invites' | 'shops' | 'sessions'>('overview')

  const [invites,       setInvites]       = useState<any[]>([])
  const [invitesLoaded, setInvitesLoaded] = useState(false)
  const [inviteModal,   setInviteModal]   = useState(false)
  const [inviteBusy,    setInviteBusy]    = useState(false)
  const [inviteError,   setInviteError]   = useState<string | null>(null)
  const [inviteForm,    setInviteForm]    = useState<{ email: string; full_name: string; role: 'owner' | 'tech' | 'advisor'; notes: string }>({
    email: '', full_name: '', role: 'owner', notes: '',
  })

  useEffect(() => {
    Promise.all([
      api.fp.stats(),
      api.fp.users(),
      api.fp.shops(),
      api.fp.sessions(),
    ])
      .then(([s, u, sh, se]) => {
        setStats(s)
        setUsers(u)
        setShops(sh)
        setSessions(se)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (subTab === 'invites' && !invitesLoaded) {
      api.fp.invites().then(setInvites).finally(() => setInvitesLoaded(true))
    }
  }, [subTab, invitesLoaded])

  async function handleSendInvite() {
    setInviteBusy(true); setInviteError(null)
    try {
      await api.fp.invite({
        email:     inviteForm.email.trim(),
        full_name: inviteForm.full_name.trim() || undefined,
        role:      inviteForm.role,
        notes:     inviteForm.notes.trim() || undefined,
      })
      const fresh = await api.fp.invites()
      setInvites(fresh)
      setInviteModal(false)
      setInviteForm({ email: '', full_name: '', role: 'owner', notes: '' })
    } catch (e: any) {
      setInviteError(e?.message || 'Failed to send invite')
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleResend(id: string) {
    if (!confirm('Resend invite email?')) return
    try {
      await api.fp.resendInvite(id)
      const fresh = await api.fp.invites()
      setInvites(fresh)
    } catch (e: any) {
      alert(`Resend failed: ${e?.message || 'unknown'}`)
    }
  }

  async function handleRevoke(id: string, email: string) {
    if (!confirm(`Revoke invite for ${email}? If the user hasn't confirmed yet, their auth row will be deleted.`)) return
    try {
      await api.fp.revokeInvite(id)
      const fresh = await api.fp.invites()
      setInvites(fresh)
    } catch (e: any) {
      alert(`Revoke failed: ${e?.message || 'unknown'}`)
    }
  }

  const SUB_TABS = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'users',    label: 'USERS'    },
    { id: 'invites',  label: 'INVITES'  },
    { id: 'shops',    label: 'SHOPS'    },
    { id: 'sessions', label: 'SESSIONS' },
  ] as const

  return (
    <div>
      <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 6 }} className="grad">
        FORGEPILOT
      </h1>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 24 }}>
        Diagnostic AI platform &mdash; separate product, separate infra
      </div>

      {/* Sub-tab nav */}
      <div className="subtab-row" style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${subTab === t.id ? 'var(--accent)' : 'var(--border)'}`,
              background: subTab === t.id ? 'rgba(234,24,35,.12)' : 'transparent',
              color: subTab === t.id ? 'var(--accent)' : 'var(--dim)',
              fontFamily: 'Share Tech Mono',
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* -- OVERVIEW -- */}
      {subTab === 'overview' && (
        <div>
          {/* KPI grid */}
          <div className="kpi-grid">
            {[
              { label: 'Total Users',      value: loading ? '...' : stats?.totalUsers ?? 0,       color: 'var(--cyan)'  },
              { label: 'Total Sessions',   value: loading ? '...' : stats?.totalSessions ?? 0,    color: 'var(--cyan)'  },
              { label: 'Sessions (24h)',   value: loading ? '...' : stats?.sessionsLast24h ?? 0,  color: 'var(--green)' },
              { label: 'Sessions (7d)',    value: loading ? '...' : stats?.sessionsLast7d ?? 0,   color: 'var(--green)' },
              { label: 'OBD Scans (24h)',  value: loading ? '...' : stats?.obdScansLast24h ?? 0,  color: 'var(--yellow)'},
              { label: 'AI Messages (24h)',value: loading ? '...' : stats?.aiMessages24h ?? 0,    color: 'var(--yellow)'},
              { label: 'Active Shops',     value: loading ? '...' : stats?.activeShops ?? 0,      color: stats?.activeShops > 0 ? 'var(--green)' : 'var(--dim)' },
              { label: 'Motor Cache',      value: loading ? '...' : stats?.motorCacheEntries ?? 0, color: 'var(--dim)'  },
            ].map(k => (
              <div key={k.label} className="kpi">
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={{ color: k.color, fontSize: '1.5rem' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Recent session feed */}
          <div className="section-label" style={{ marginBottom: 12 }}>RECENT SESSIONS</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20, color: 'var(--dim)', fontSize: 13 }}>Loading&hellip;</div>
            ) : sessions.slice(0, 8).map((s, i) => (
              <div key={s.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: 12,
                padding: '10px 16px',
                borderBottom: i < 7 ? '1px solid var(--border)' : 'none',
                fontSize: 13,
                alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontWeight: 600 }}>
                    {s.year} {s.make} {s.model}
                  </span>
                  {s.engine_name && (
                    <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 8 }}>{s.engine_name}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono' }}>
                  {(s.dtc_codes?.length ?? 0) > 0 ? `${s.dtc_codes.length} DTC` : '\u2014'}
                </div>
                <div style={{ fontSize: 11, color: s.scan_timestamp ? 'var(--cyan)' : 'var(--dim)', fontFamily: 'Share Tech Mono' }}>
                  {s.scan_timestamp ? 'OBD \u2713' : 'manual'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                  {s.created_at ? formatDistanceToNow(new Date(s.created_at), { addSuffix: true }) : '\u2014'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -- USERS -- */}
      {subTab === 'users' && (
        <div>
          <div className="section-label" style={{ marginBottom: 12 }}>
            USERS &mdash; {users.length} total
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20, color: 'var(--dim)', fontSize: 13 }}>Loading&hellip;</div>
            ) : users.map((u, i) => (
              <div key={u.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto auto',
                gap: 12,
                padding: '10px 16px',
                borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 13,
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                    {u.shop_role} &middot; {u.session_count} sessions
                    {u.cfp_linked && <span style={{ color: 'var(--cyan)', marginLeft: 8 }}>CFP linked</span>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: planColor(u.subscription_tier), fontFamily: 'Share Tech Mono', textTransform: 'uppercase' }}>
                  {u.subscription_tier}
                </div>
                <div style={{ fontSize: 11, color: u.obd_enabled ? 'var(--green)' : 'var(--dim)' }}>
                  {u.obd_enabled ? 'OBD \u2713' : 'no OBD'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                  {u.last_session_at ? formatDistanceToNow(new Date(u.last_session_at), { addSuffix: true }) : 'no sessions'}
                </div>
                <div className="mobile-hide" style={{ fontSize: 11, color: 'var(--dim)' }}>
                  joined {u.created_at ? formatDistanceToNow(new Date(u.created_at), { addSuffix: true }) : '\u2014'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -- INVITES -- */}
      {subTab === 'invites' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-label">INVITES &mdash; {invites.length} total</div>
            <button
              onClick={() => { setInviteModal(true); setInviteError(null) }}
              style={{
                marginLeft: 'auto',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: 0.5,
              }}
            >
              + INVITE USER
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Pending',        value: invites.filter(i => i.status === 'pending').length,   color: 'var(--yellow)' },
              { label: 'Activated',      value: invites.filter(i => i.status === 'activated').length, color: 'var(--green)'  },
              { label: 'Active Last 7d', value: invites.filter(i => i.last_session_at && (Date.now() - new Date(i.last_session_at).getTime()) < 7 * 86400000).length, color: 'var(--cyan)' },
              { label: 'Revoked',        value: invites.filter(i => i.status === 'revoked').length,   color: 'var(--dim)'    },
            ].map(k => (
              <div key={k.label} className="kpi">
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={{ color: k.color, fontSize: '1.5rem' }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {!invitesLoaded ? (
              <div style={{ padding: 20, color: 'var(--dim)', fontSize: 13 }}>Loading&hellip;</div>
            ) : invites.length === 0 ? (
              <div style={{ padding: 30, color: 'var(--dim)', fontSize: 13, textAlign: 'center' }}>
                No invites yet. Click "+ INVITE USER" to send the first one.
              </div>
            ) : invites.map((inv, i) => (
              <div key={inv.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: 12,
                padding: '10px 16px',
                borderBottom: i < invites.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 13,
                alignItems: 'center',
                opacity: inv.status === 'revoked' ? 0.4 : 1,
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{inv.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                    {inv.full_name || 'no name'} &middot; {inv.role} &middot; invited by {inv.invited_by || 'overseer'}
                    {inv.notes ? ` · ${inv.notes}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'Share Tech Mono', textTransform: 'uppercase',
                  color: inv.status === 'pending'   ? 'var(--yellow)'
                       : inv.status === 'activated' ? 'var(--green)'
                       : 'var(--dim)' }}>
                  {inv.status}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                  {inv.last_session_at
                    ? `active ${formatDistanceToNow(new Date(inv.last_session_at), { addSuffix: true })}`
                    : inv.activated_at
                    ? `activated ${formatDistanceToNow(new Date(inv.activated_at), { addSuffix: true })}`
                    : `invited ${formatDistanceToNow(new Date(inv.invited_at), { addSuffix: true })}`}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {inv.status === 'pending' && (
                    <>
                      <button onClick={() => handleResend(inv.id)} style={smallBtn('var(--cyan)')}>RESEND</button>
                      <button onClick={() => handleRevoke(inv.id, inv.email)} style={smallBtn('var(--red)')}>REVOKE</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteModal && (
        <div
          onClick={() => !inviteBusy && setInviteModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface, #141414)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 28,
              width: '100%',
              maxWidth: 420,
            }}
          >
            <div style={{ fontFamily: 'Orbitron', fontWeight: 800, letterSpacing: 3, fontSize: 14, marginBottom: 18 }} className="grad">
              INVITE FORGEPILOT USER
            </div>

            {inviteError && (
              <div style={{ padding: '8px 12px', background: 'rgba(234,24,35,0.1)', color: 'var(--red, #ea1823)', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
                {inviteError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="tech@shop.com"
                  autoFocus
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Michael MacMasters"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
                  Role
                </label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as any }))}
                  style={{ width: '100%' }}
                >
                  <option value="owner">Shop Owner</option>
                  <option value="tech">Technician</option>
                  <option value="advisor">Service Advisor</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
                  Notes (Overseer only)
                </label>
                <input
                  type="text"
                  value={inviteForm.notes}
                  onChange={e => setInviteForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. first paying customer, Colorado Springs"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setInviteModal(false)}
                disabled={inviteBusy}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--dim)',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleSendInvite}
                disabled={inviteBusy || !inviteForm.email.trim()}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '8px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: inviteBusy ? 'wait' : 'pointer',
                  opacity: !inviteForm.email.trim() ? 0.4 : 1,
                }}
              >
                {inviteBusy ? 'SENDING...' : 'SEND INVITE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- SHOPS -- */}
      {subTab === 'shops' && (
        <div>
          <div className="section-label" style={{ marginBottom: 12 }}>
            SHOPS &mdash; {shops.length} total
          </div>
          {shops.length === 0 && !loading ? (
            <div style={{ padding: 20, color: 'var(--dim)', fontSize: 13, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 10 }}>
              No shops yet &mdash; billing not active
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 20, color: 'var(--dim)', fontSize: 13 }}>Loading&hellip;</div>
              ) : shops.map((s, i) => (
                <div key={s.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  gap: 12,
                  padding: '10px 16px',
                  borderBottom: i < shops.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 13,
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                      {s.seat_used}/{s.seat_limit} seats &middot; {s.billing_cycle ?? '\u2014'}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: planColor(s.plan_tier), fontFamily: 'Share Tech Mono', textTransform: 'uppercase' }}>
                    {s.plan_tier}
                  </div>
                  <div style={{ fontSize: 11, color: statusColor(s.subscription_status), fontFamily: 'Share Tech Mono', textTransform: 'uppercase' }}>
                    {s.subscription_status}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                    {s.created_at ? formatDistanceToNow(new Date(s.created_at), { addSuffix: true }) : '\u2014'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -- SESSIONS -- */}
      {subTab === 'sessions' && (
        <div>
          <div className="section-label" style={{ marginBottom: 12 }}>
            SESSIONS &mdash; {sessions.length} most recent
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20, color: 'var(--dim)', fontSize: 13 }}>Loading&hellip;</div>
            ) : sessions.map((s, i) => (
              <div key={s.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto auto',
                gap: 10,
                padding: '10px 16px',
                borderBottom: i < sessions.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 12,
                alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{s.year} {s.make} {s.model}</span>
                  {s.ro_number && <span style={{ color: 'var(--dim)', marginLeft: 8 }}>RO#{s.ro_number}</span>}
                  {s.engine_name && <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 2 }}>{s.engine_name}</div>}
                </div>
                <div style={{ color: (s.dtc_codes?.length ?? 0) > 0 ? 'var(--yellow)' : 'var(--dim)', fontFamily: 'Share Tech Mono' }}>
                  {(s.dtc_codes?.length ?? 0) > 0 ? s.dtc_codes.join(', ') : 'no DTCs'}
                </div>
                <div style={{ color: s.message_count > 0 ? 'var(--cyan)' : 'var(--dim)' }}>
                  {s.message_count > 0 ? `${s.message_count} msgs` : '\u2014'}
                </div>
                <div className="mobile-hide" style={{ color: s.scan_timestamp ? 'var(--green)' : 'var(--dim)' }}>
                  {s.scan_timestamp ? 'OBD' : '\u2014'}
                </div>
                <div style={{ color: 'var(--dim)' }}>
                  {s.created_at ? formatDistanceToNow(new Date(s.created_at), { addSuffix: true }) : '\u2014'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
