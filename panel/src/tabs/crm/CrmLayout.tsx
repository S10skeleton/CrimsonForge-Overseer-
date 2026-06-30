import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usePermissions, canView } from '../../lib/permissions'

const TABS = [
  { to: '/crm/leads', label: 'Leads', key: 'crm.leads' },
  { to: '/crm/pipeline', label: 'Pipeline', key: 'crm.pipeline' },
  { to: '/crm/companies', label: 'Companies', key: 'crm.companies' },
]

export default function CrmLayout() {
  const { permissions, role } = usePermissions()
  const loc = useLocation()
  const navigate = useNavigate()
  const tabs = TABS.filter(t => canView(permissions, role, t.key))
  // Connected inboxes is owner/admin only (no separate permission key).
  if (role === 'owner' || role === 'admin') tabs.push({ to: '/crm/inboxes', label: 'Inboxes', key: 'crm.companies' })

  // Land on the first allowed sub-tab (and bounce off hidden ones).
  useEffect(() => {
    const onVisible = tabs.some(t => loc.pathname.startsWith(t.to))
    if (tabs.length > 0 && !onVisible) navigate(tabs[0].to, { replace: true })
  }, [loc.pathname, tabs, navigate])

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>CRM</h1>
      <div className="subtabs subtab-row">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `subtab ${isActive ? 'active' : ''}`}>{t.label}</NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
