import { useState, useEffect } from 'react'
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

export default function ForgePilotTab() {
  const [stats,    setStats]    = useState<any>(null)
  const [users,    setUsers]    = useState<any[]>([])
  const [shops,    setShops]    = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [subTab,   setSubTab]   = useState<'overview' | 'users' | 'shops' | 'sessions'>('overview')

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

  const SUB_TABS = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'users',    label: 'USERS'    },
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
