import { useState, useEffect } from 'react'
import { api } from '../api'

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'badge-red', shop_owner: 'badge-purple',
  lead_tech: 'badge-cyan', technician: 'badge-dim',
  service_advisor: 'badge-yellow',
}

export default function UsersTab() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  useEffect(() => {
    api.cfp.users().then(setUsers).finally(() => setLoading(false))
  }, [])

  const filtered = users.filter(u => {
    const matchSearch = !search || [u.full_name, u.email, u.shops?.name].some((f: any) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  return (
    <div>
      <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 28 }} className="grad">
        USER ACCOUNTS
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Users', value: users.length },
          { label: 'Shop Owners', value: users.filter(u => u.role === 'shop_owner').length },
          { label: 'Technicians', value: users.filter(u => u.role === 'technician' || u.role === 'lead_tech').length },
          { label: 'Active', value: users.filter(u => !u.deactivated).length },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: '1.6rem' }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          placeholder="Search name, email, shop..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width: 160 }}>
          <option value="all">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="shop_owner">Shop Owner</option>
          <option value="lead_tech">Lead Tech</option>
          <option value="technician">Technician</option>
          <option value="service_advisor">Service Advisor</option>
        </select>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--dim)', fontSize: 13 }}>
          {filtered.length} users
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>Loading...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Shop</th><th>Status</th><th>Legal</th></tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} style={{ opacity: u.deactivated ? .4 : 1 }}>
                    <td style={{ fontWeight: 600 }}>{u.full_name || '—'}</td>
                    <td style={{ color: 'var(--dim)', fontSize: 13 }}>{u.email || '—'}</td>
                    <td>
                      <span className={`badge ${ROLE_BADGE[u.role] ?? 'badge-dim'}`}>
                        {u.role?.replace('_', ' ') ?? '—'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--dim)', fontSize: 13 }}>{u.shops?.name ?? '—'}</td>
                    <td>
                      <span className={`badge ${u.deactivated ? 'badge-red' : 'badge-green'}`}>
                        {u.deactivated ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td>
                      {u.tos_accepted_at && u.privacy_accepted_at
                        ? <span className="badge badge-green">✓ Both</span>
                        : u.tos_accepted_at || u.privacy_accepted_at
                        ? <span className="badge badge-yellow">Partial</span>
                        : <span style={{ color: 'var(--dim)', fontSize: 13 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)' }}>No users found.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
