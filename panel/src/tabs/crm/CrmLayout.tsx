import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/crm/leads', label: 'Leads' },
  { to: '/crm/pipeline', label: 'Pipeline' },
  { to: '/crm/companies', label: 'Companies' },
]

export default function CrmLayout() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>CRM</h1>
      <div className="subtabs subtab-row">
        {TABS.map(t => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `subtab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
