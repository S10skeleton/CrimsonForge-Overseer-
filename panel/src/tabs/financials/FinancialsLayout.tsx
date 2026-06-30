import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usePermissions, canView } from '../../lib/permissions'

const TABS = [
  { to: '/financials/revenue', label: 'Revenue', key: 'financials.revenue' },
  { to: '/financials/runway', label: 'Burn & runway', key: 'financials.runway' },
  { to: '/financials/raise', label: 'Raise', key: 'financials.raise' },
  { to: '/financials/captable', label: 'Cap table', key: 'financials.captable' },
]

export default function FinancialsLayout() {
  const { permissions, role } = usePermissions()
  const loc = useLocation()
  const navigate = useNavigate()
  const tabs = TABS.filter(t => canView(permissions, role, t.key))

  useEffect(() => {
    const onVisible = tabs.some(t => loc.pathname.startsWith(t.to))
    if (tabs.length > 0 && !onVisible) navigate(tabs[0].to, { replace: true })
  }, [loc.pathname, tabs, navigate])

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Financials</h1>
      <div className="subtabs subtab-row">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `subtab ${isActive ? 'active' : ''}`}>{t.label}</NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
