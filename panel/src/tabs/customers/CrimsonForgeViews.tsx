/**
 * CrimsonForge Pro customer views (STEP10) — a new light-theme Overview plus a
 * combined Accounts view (shops directory + users) that unifies the old
 * ShopsTab + UsersTab. Keeps shop-notes editing, health/onboarding, role/status
 * badges and user search/filter — just restyled through the customers shell.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../api'
import { CustomerView, MetricCards, DataCard, fmtMoney, fmtNum } from './shared'

const PRODUCT = 'crimsonforge-pro' as const
const PARTNER_LIMIT = 3

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'badge-red', shop_owner: 'badge-purple',
  lead_tech: 'badge-cyan', technician: 'badge-dim',
  service_advisor: 'badge-yellow',
}

function shopHealth(shop: any): { label: string; color: string } {
  const daysSince = shop.last_ticket_created
    ? Math.floor((Date.now() - new Date(shop.last_ticket_created).getTime()) / 86400000)
    : 999
  if (shop.subscription_status === 'trial' || shop.subscription_status === 'beta') {
    return (shop.recent_tickets_7d ?? 0) > 0
      ? { label: 'Active trial', color: 'var(--cobalt)' }
      : { label: 'Inactive trial', color: 'var(--yellow)' }
  }
  if (daysSince <= 7)  return { label: 'Healthy',  color: 'var(--green)' }
  if (daysSince <= 14) return { label: 'At risk',  color: 'var(--yellow)' }
  return { label: 'Churning', color: 'var(--red-text)' }
}

function OnboardingBar({ shop }: { shop: any }) {
  const items = [
    { label: 'Team invited',     done: (shop.user_count ?? 0) > 1 },
    { label: 'First ticket',     done: (shop.ticket_count ?? 0) > 0 },
    { label: 'Stripe connected', done: !!shop.stripe_connect_charges_enabled },
  ]
  const score = items.filter(i => i.done).length
  const pct   = (score / items.length) * 100
  const color = score === items.length ? 'var(--green)' : score >= 2 ? 'var(--cobalt)' : 'var(--yellow)'
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Onboarding:</span>
        <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .3s' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{score}/{items.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {items.map(item => (
          <span key={item.label} style={{ fontSize: 11, color: item.done ? 'var(--green)' : 'var(--text-hint)' }}>
            {item.done ? '✓' : '✗'} {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────
export function CfpOverview() {
  const shops = useQuery({ queryKey: ['cfp', 'shops'], queryFn: api.cfp.shops })
  const users = useQuery({ queryKey: ['cfp', 'users'], queryFn: api.cfp.users })

  const list = shops.data ?? []
  const active  = list.filter(s => s.subscription_status === 'active' || s.subscription_tier === 'partner').length
  const beta    = list.filter(s => s.subscription_status === 'beta').length
  const tickets = list.reduce((sum, s) => sum + (s.ticket_count ?? 0), 0)
  const mrr     = list.filter(s => s.subscription_status === 'active').reduce((sum, s) => sum + (s.monthly_revenue ?? 0), 0)
  const ld = shops.isLoading

  return (
    <CustomerView title="Overview" product={PRODUCT}>
      <MetricCards items={[
        { label: 'Shops',           value: ld ? '…' : fmtNum(list.length) },
        { label: 'Active / partner', value: ld ? '…' : fmtNum(active), accent: active > 0 ? 'var(--green)' : undefined },
        { label: 'Beta',            value: ld ? '…' : fmtNum(beta) },
        { label: 'Users',           value: users.isLoading ? '…' : fmtNum(users.data?.length ?? 0) },
        { label: 'Tickets',         value: ld ? '…' : fmtNum(tickets) },
        { label: 'MRR',             value: ld ? '…' : fmtMoney(mrr) },
      ]} min={140} />
    </CustomerView>
  )
}

// ── Accounts (shops directory + users) ──────────────────────────────────────
export function CfpAccounts({ role }: { role: string }) {
  const readOnly = role !== 'owner'
  const qc = useQueryClient()
  const shopsQ = useQuery({ queryKey: ['cfp', 'shops'], queryFn: api.cfp.shops })
  const usersQ = useQuery({ queryKey: ['cfp', 'users'], queryFn: api.cfp.users })
  const shops = shopsQ.data ?? []

  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesDraft, setNotesDraft]     = useState('')
  const [search, setSearch]             = useState('')
  const [roleFilter, setRoleFilter]     = useState('all')

  const partnerCount = shops.filter(s => s.subscription_tier === 'partner' || s.subscription_status === 'partner').length

  const saveNotes = async (shopId: string) => {
    if (readOnly) return
    await api.cfp.saveShopNotes(shopId, notesDraft)
    qc.setQueryData(['cfp', 'shops'], (prev: any[] | undefined) =>
      (prev ?? []).map(s => s.id === shopId ? { ...s, founder_notes: notesDraft } : s))
    setEditingNotes(null)
  }

  const users = usersQ.data ?? []
  const filteredUsers = users.filter(u => {
    const matchSearch = !search || [u.full_name, u.email, u.shops?.name].some((f: any) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  return (
    <CustomerView
      title="Accounts"
      product={PRODUCT}
      actions={<span className="badge badge-violet">♦ {partnerCount}/{PARTNER_LIMIT} partner slots</span>}
    >
      {/* Shops directory */}
      <DataCard title={`Shops — ${shops.length}`} flush>
        {shopsQ.isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : shops.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No shops yet.</div>
        ) : shops.map((shop, idx) => {
          const health    = shopHealth(shop)
          const isPartner = shop.subscription_tier === 'partner' || shop.subscription_status === 'partner'
          const isBeta    = shop.subscription_status === 'beta'
          const isEditing = editingNotes === shop.id
          return (
            <div key={shop.id} style={{ padding: '16px 18px', borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{shop.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Created {formatDistanceToNow(new Date(shop.created_at), { addSuffix: true })}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: health.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: health.color }}>{health.label}</span>
                    {(shop.recent_tickets_7d ?? 0) > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {shop.recent_tickets_7d} this week</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{shop.email || '—'} · {shop.user_count ?? 0} user(s)</div>
                </div>

                <div style={{ minWidth: 140 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    {isPartner && <span className="badge badge-violet">♦ PARTNER</span>}
                    {isBeta && !isPartner && <span className="badge badge-cyan">BETA</span>}
                    {shop.subscription_status === 'active' && !isPartner && <span className="badge badge-green">ACTIVE</span>}
                    {(!shop.subscription_status || shop.subscription_status === 'trial') && <span className="badge badge-yellow">TRIAL</span>}
                    {shop.subscription_status === 'cancelled' && <span className="badge badge-red">CANCELLED</span>}
                    {shop.subscription_status === 'past_due' && <span className="badge badge-red">PAST DUE</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {isPartner ? 'Partner · No charge' : isBeta ? 'Beta · No charge' : `${shop.subscription_tier ?? 'free'} · ${fmtMoney(shop.monthly_revenue ?? 0)}/mo`}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--text-primary)', lineHeight: 1 }}>
                    {shop.ticket_count ?? 0}
                    <span style={{ fontSize: 10, color: 'var(--text-hint)', marginLeft: 4, fontWeight: 600 }}>tickets</span>
                  </div>
                </div>
              </div>

              <OnboardingBar shop={shop} />

              <div style={{ marginTop: 8 }}>
                {isEditing ? (
                  <div>
                    <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} placeholder="Notes about this shop…" rows={2} style={{ resize: 'none' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button onClick={() => saveNotes(shop.id)} className="btn btn-primary btn-sm">Save</button>
                      <button onClick={() => setEditingNotes(null)} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => { if (readOnly) return; setEditingNotes(shop.id); setNotesDraft(shop.founder_notes || '') }}
                    style={{ fontSize: 12, color: 'var(--text-muted)', cursor: readOnly ? 'default' : 'pointer' }}
                    title={readOnly ? 'SuperAdmin access required to edit notes' : undefined}
                  >
                    {shop.founder_notes ? <span>{shop.founder_notes}</span> : !readOnly && <span style={{ opacity: .6 }}>+ Add notes</span>}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </DataCard>

      {/* Users */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="Search name, email, shop…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width: 160 }}>
          <option value="all">All roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="shop_owner">Shop Owner</option>
          <option value="lead_tech">Lead Tech</option>
          <option value="technician">Technician</option>
          <option value="service_advisor">Service Advisor</option>
        </select>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{filteredUsers.length} users</span>
      </div>

      <DataCard title="Users" flush>
        {usersQ.isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : (
          <>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Shop</th><th>Status</th><th>Legal</th></tr></thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id} style={{ opacity: u.deactivated ? .5 : 1 }}>
                    <td style={{ fontWeight: 600 }}>{u.full_name || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.email || '—'}</td>
                    <td><span className={`badge ${ROLE_BADGE[u.role] ?? 'badge-dim'}`}>{u.role?.replace('_', ' ') ?? '—'}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.shops?.name ?? '—'}</td>
                    <td><span className={`badge ${u.deactivated ? 'badge-red' : 'badge-green'}`}>{u.deactivated ? 'Inactive' : 'Active'}</span></td>
                    <td>
                      {u.tos_accepted_at && u.privacy_accepted_at ? <span className="badge badge-green">✓ Both</span>
                        : u.tos_accepted_at || u.privacy_accepted_at ? <span className="badge badge-yellow">Partial</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No users found.</div>}
          </>
        )}
      </DataCard>
    </CustomerView>
  )
}
