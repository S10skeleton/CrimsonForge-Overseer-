/**
 * ForgePilot customer views (STEP10) — decomposed from the old ForgePilotTab
 * mega-tab into parallel, light-theme views. Same data + actions as before
 * (stats, accounts, sessions, insights, invites incl. the invite modal +
 * resend/revoke), just lifted to top-level views through the customers shell.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import InsightsPanel from '../../components/InsightsPanel'
import WaitlistTable from '../../components/WaitlistTable'
import { CustomerView, MetricCards, DataCard, fmtNum } from './shared'

const PRODUCT = 'forgepilot' as const

function planBadge(tier: string): string {
  if (tier === 'shop') return 'badge-cyan'
  if (tier === 'solo') return 'badge-green'
  return 'badge-dim'
}
function statusBadge(status: string): string {
  if (status === 'active')   return 'badge-green'
  if (status === 'trialing') return 'badge-cyan'
  if (status === 'past_due') return 'badge-red'
  if (status === 'canceled') return 'badge-dim'
  return 'badge-yellow'
}
const rel = (d?: string | null) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : '—')

// ── Overview ────────────────────────────────────────────────────────────────
export function FpOverview() {
  const stats    = useQuery({ queryKey: ['fp', 'stats'], queryFn: api.fp.stats })
  const sessions = useQuery({ queryKey: ['fp', 'sessions'], queryFn: api.fp.sessions })
  const waitlist = useQuery({ queryKey: ['cfp', 'forgepilot-waitlist'], queryFn: api.cfp.forgePilotWaitlist })

  const s = stats.data
  const sLoad = stats.isLoading
  const recent = (sessions.data ?? []).slice(0, 8)

  return (
    <CustomerView title="Overview" product={PRODUCT}>
      <MetricCards items={[
        { label: 'Total users',     value: sLoad ? '…' : fmtNum(s?.totalUsers ?? 0) },
        { label: 'Total sessions',  value: sLoad ? '…' : fmtNum(s?.totalSessions ?? 0) },
        { label: 'Sessions (24h)',  value: sLoad ? '…' : fmtNum(s?.sessionsLast24h ?? 0) },
        { label: 'Sessions (7d)',   value: sLoad ? '…' : fmtNum(s?.sessionsLast7d ?? 0) },
        { label: 'OBD scans (24h)', value: sLoad ? '…' : fmtNum(s?.obdScansLast24h ?? 0) },
        { label: 'AI messages (24h)', value: sLoad ? '…' : fmtNum(s?.aiMessages24h ?? 0) },
        { label: 'Active shops',    value: sLoad ? '…' : fmtNum(s?.activeShops ?? 0), accent: s?.activeShops > 0 ? 'var(--green)' : undefined },
        { label: 'Motor cache',     value: sLoad ? '…' : fmtNum(s?.motorCacheEntries ?? 0) },
        { label: 'Waitlist',        value: waitlist.isLoading ? '…' : fmtNum(waitlist.data?.length ?? 0) },
      ]} min={140} />

      <DataCard title="Recent sessions" flush>
        {sessions.isLoading ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : recent.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No sessions yet.</div>
        ) : (
          <table>
            <thead><tr><th>Vehicle</th><th>DTCs</th><th>Source</th><th>When</th></tr></thead>
            <tbody>
              {recent.map(se => (
                <tr key={se.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{se.year} {se.make} {se.model}</span>
                    {se.engine_name && <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>{se.engine_name}</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{(se.dtc_codes?.length ?? 0) > 0 ? `${se.dtc_codes.length} DTC` : '—'}</td>
                  <td><span className={`badge ${se.scan_timestamp ? 'badge-cyan' : 'badge-dim'}`}>{se.scan_timestamp ? 'OBD' : 'manual'}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{rel(se.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataCard>
    </CustomerView>
  )
}

// ── Accounts (shops + users/seats) ──────────────────────────────────────────
export function FpAccounts() {
  const shops = useQuery({ queryKey: ['fp', 'shops'], queryFn: api.fp.shops })
  const users = useQuery({ queryKey: ['fp', 'users'], queryFn: api.fp.users })

  return (
    <CustomerView title="Accounts" product={PRODUCT}>
      <DataCard title={`Shops — ${shops.data?.length ?? 0}`} flush>
        {shops.isLoading ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (shops.data ?? []).length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No shops yet — billing not active.</div>
        ) : (
          <table>
            <thead><tr><th>Shop</th><th>Seats</th><th>Plan</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {shops.data!.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.seat_used}/{s.seat_limit} · {s.billing_cycle ?? '—'}</td>
                  <td><span className={`badge ${planBadge(s.plan_tier)}`}>{s.plan_tier}</span></td>
                  <td><span className={`badge ${statusBadge(s.subscription_status)}`}>{s.subscription_status}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{rel(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataCard>

      <DataCard title={`Users — ${users.data?.length ?? 0}`} flush>
        {users.isLoading ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (users.data ?? []).length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No users yet.</div>
        ) : (
          <table>
            <thead><tr><th>User</th><th>Plan</th><th>OBD</th><th>Last session</th><th className="mobile-hide">Joined</th></tr></thead>
            <tbody>
              {users.data!.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {u.shop_role} · {u.session_count} sessions
                      {u.cfp_linked && <span style={{ color: 'var(--cobalt)', marginLeft: 8 }}>CFP linked</span>}
                    </div>
                  </td>
                  <td><span className={`badge ${planBadge(u.subscription_tier)}`}>{u.subscription_tier}</span></td>
                  <td style={{ fontSize: 11, color: u.obd_enabled ? 'var(--green)' : 'var(--text-muted)' }}>{u.obd_enabled ? 'OBD ✓' : 'no OBD'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.last_session_at ? rel(u.last_session_at) : 'no sessions'}</td>
                  <td className="mobile-hide" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rel(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataCard>
    </CustomerView>
  )
}

// ── Sessions ────────────────────────────────────────────────────────────────
export function FpSessions() {
  const sessions = useQuery({ queryKey: ['fp', 'sessions'], queryFn: api.fp.sessions })
  const rows = sessions.data ?? []
  return (
    <CustomerView title="Sessions" product={PRODUCT}>
      <DataCard title={`${rows.length} most recent`} flush>
        {sessions.isLoading ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No sessions yet.</div>
        ) : (
          <table>
            <thead><tr><th>Vehicle</th><th>DTCs</th><th>Messages</th><th className="mobile-hide">OBD</th><th>When</th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{s.year} {s.make} {s.model}</span>
                    {s.ro_number && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>RO#{s.ro_number}</span>}
                    {s.engine_name && <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{s.engine_name}</div>}
                  </td>
                  <td style={{ color: (s.dtc_codes?.length ?? 0) > 0 ? 'var(--yellow)' : 'var(--text-muted)', fontSize: 12 }}>
                    {(s.dtc_codes?.length ?? 0) > 0 ? s.dtc_codes.join(', ') : 'no DTCs'}
                  </td>
                  <td style={{ color: s.message_count > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 12 }}>{s.message_count > 0 ? `${s.message_count} msgs` : '—'}</td>
                  <td className="mobile-hide" style={{ fontSize: 12, color: s.scan_timestamp ? 'var(--green)' : 'var(--text-muted)' }}>{s.scan_timestamp ? 'OBD' : '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{rel(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataCard>
    </CustomerView>
  )
}

// ── Insights ────────────────────────────────────────────────────────────────
export function FpInsights() {
  const [days, setDays] = useState(7)
  const insights = useQuery({ queryKey: ['fp', 'insights', days], queryFn: () => api.fp.insights(days) })
  return (
    <CustomerView title="Insights" product={PRODUCT}>
      <InsightsPanel insights={insights.data ?? []} loading={insights.isLoading} daysFilter={days} onDaysFilterChange={setDays} />
    </CustomerView>
  )
}

// ── Waitlist ────────────────────────────────────────────────────────────────
export function FpWaitlist() {
  const waitlist = useQuery({ queryKey: ['cfp', 'forgepilot-waitlist'], queryFn: api.cfp.forgePilotWaitlist })
  return (
    <CustomerView title="Waitlist" product={PRODUCT}>
      <WaitlistTable entries={waitlist.data ?? []} loading={waitlist.isLoading} product="forgepilot" />
    </CustomerView>
  )
}

// ── Invites ─────────────────────────────────────────────────────────────────
export function FpInvites({ role }: { role: string }) {
  const readOnly = role !== 'owner'
  const toast = useToast()
  const confirm = useConfirm()
  const invitesQ = useQuery({ queryKey: ['fp', 'invites'], queryFn: api.fp.invites })
  const invites = invitesQ.data ?? []

  const [modal, setModal] = useState(false)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm]   = useState<{ email: string; full_name: string; role: 'owner' | 'tech' | 'advisor'; notes: string }>({ email: '', full_name: '', role: 'owner', notes: '' })

  const refresh = () => invitesQ.refetch()

  const send = async () => {
    setBusy(true); setError(null)
    try {
      await api.fp.invite({ email: form.email.trim(), full_name: form.full_name.trim() || undefined, role: form.role, notes: form.notes.trim() || undefined })
      await refresh()
      setModal(false); setForm({ email: '', full_name: '', role: 'owner', notes: '' })
      toast.success('Invite sent')
    } catch (e: any) { setError(e?.message || 'Failed to send invite') } finally { setBusy(false) }
  }

  const resend = async (id: string) => {
    if (!(await confirm({ title: 'Resend invite email?', confirmLabel: 'Resend' }))) return
    try { await api.fp.resendInvite(id); await refresh(); toast.success('Invite resent') }
    catch (e: any) { toast.error(`Resend failed: ${e?.message || 'unknown'}`) }
  }
  const revoke = async (id: string, email: string) => {
    if (!(await confirm({ title: `Revoke invite for ${email}?`, body: "If the user hasn't confirmed yet, their auth row will be deleted.", confirmLabel: 'Revoke', danger: true }))) return
    try { await api.fp.revokeInvite(id); await refresh(); toast.success('Invite revoked') }
    catch (e: any) { toast.error(`Revoke failed: ${e?.message || 'unknown'}`) }
  }

  const active7d = invites.filter(i => i.last_session_at && (Date.now() - new Date(i.last_session_at).getTime()) < 7 * 86400000).length

  return (
    <CustomerView
      title="Invites"
      product={PRODUCT}
      actions={
        <button className="btn btn-primary" onClick={() => { setModal(true); setError(null) }} disabled={readOnly}
          title={readOnly ? 'SuperAdmin access required' : undefined}
          style={readOnly ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>+ Invite user</button>
      }
    >
      <MetricCards items={[
        { label: 'Pending',        value: fmtNum(invites.filter(i => i.status === 'pending').length), accent: 'var(--yellow)' },
        { label: 'Activated',      value: fmtNum(invites.filter(i => i.status === 'activated').length), accent: 'var(--green)' },
        { label: 'Active last 7d', value: fmtNum(active7d) },
        { label: 'Revoked',        value: fmtNum(invites.filter(i => i.status === 'revoked').length) },
      ]} min={130} />

      <DataCard title={`Invites — ${invites.length}`} flush>
        {invitesQ.isLoading ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : invites.length === 0 ? (
          <div style={{ padding: 30, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No invites yet. Click “+ Invite user” to send the first one.</div>
        ) : (
          <table>
            <thead><tr><th>User</th><th>Status</th><th>Activity</th><th></th></tr></thead>
            <tbody>
              {invites.map(inv => (
                <tr key={inv.id} style={{ opacity: inv.status === 'revoked' ? 0.5 : 1 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{inv.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {inv.full_name || 'no name'} · {inv.role} · invited by {inv.invited_by || 'overseer'}{inv.notes ? ` · ${inv.notes}` : ''}
                    </div>
                  </td>
                  <td><span className={`badge ${inv.status === 'pending' ? 'badge-yellow' : inv.status === 'activated' ? 'badge-green' : 'badge-dim'}`}>{inv.status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {inv.last_session_at ? `active ${rel(inv.last_session_at)}` : inv.activated_at ? `activated ${rel(inv.activated_at)}` : `invited ${rel(inv.invited_at)}`}
                  </td>
                  <td>
                    {inv.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => resend(inv.id)} disabled={readOnly} title={readOnly ? 'SuperAdmin access required' : undefined}>Resend</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => revoke(inv.id, inv.email)} disabled={readOnly} style={{ color: 'var(--red-text)' }} title={readOnly ? 'SuperAdmin access required' : undefined}>Revoke</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataCard>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,29,35,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16, animation: 'overlay-in .15s ease' }} onClick={() => !busy && setModal(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 28, animation: 'dialog-in .18s ease both' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>Invite ForgePilot user</div>
            {error && <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,.08)', color: 'var(--red-text)', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
              <div>
                <div className="section-label" style={{ marginBottom: 4 }}>Email *</div>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tech@shop.com" autoFocus />
              </div>
              <div>
                <div className="section-label" style={{ marginBottom: 4 }}>Full name</div>
                <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Michael MacMasters" />
              </div>
              <div>
                <div className="section-label" style={{ marginBottom: 4 }}>Role</div>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))}>
                  <option value="owner">Shop owner</option>
                  <option value="tech">Technician</option>
                  <option value="advisor">Service advisor</option>
                </select>
              </div>
              <div>
                <div className="section-label" style={{ marginBottom: 4 }}>Notes (Overseer only)</div>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. first paying customer, Colorado Springs" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(false)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={send} disabled={busy || !form.email.trim()}>{busy ? 'Sending…' : 'Send invite'}</button>
            </div>
          </div>
        </div>
      )}
    </CustomerView>
  )
}
