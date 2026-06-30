/**
 * SuperAdmin — owner-only control center (SUPERADMIN-2). One nav leaf, three
 * sub-tabs: Blocklist (#14), Admins & Roles (moved from Settings), and
 * Sessions & Devices (sign-out-everywhere kill-switch). The whole area is
 * owner-only — both here and on every backing endpoint.
 */
import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usePermissions } from '../../lib/permissions'

const TABS = [
  { to: '/superadmin/blocklist', label: 'Blocklist' },
  { to: '/superadmin/admins',    label: 'Admins & Roles' },
  { to: '/superadmin/sessions',  label: 'Sessions & Devices' },
]

export default function SuperAdminLayout() {
  const { role } = usePermissions()
  const loc = useLocation()
  const navigate = useNavigate()

  // Land on the first sub-tab if the bare area is hit.
  useEffect(() => {
    if (loc.pathname === '/superadmin' || loc.pathname === '/superadmin/') {
      navigate('/superadmin/blocklist', { replace: true })
    }
  }, [loc.pathname, navigate])

  if (role !== 'owner') return <div style={{ color: 'var(--text-muted)', padding: 24 }}>Not available.</div>

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>SuperAdmin</h1>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>Owner-only controls. Sensitive settings live here.</div>
      <div className="subtabs subtab-row">
        {TABS.map(t => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `subtab ${isActive ? 'active' : ''}`}>{t.label}</NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
