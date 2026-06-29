import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Panel from './pages/Panel'
import Placeholder from './components/Placeholder'
import HomeTab from './tabs/HomeTab'
import ElaraControlsTab from './tabs/ElaraControlsTab'
import AdminsTab from './tabs/AdminsTab'
import ActivityTab from './tabs/ActivityTab'
import type { LoginResult } from './api'

import SystemTab    from './tabs/SystemTab'
import AIConfigTab  from './tabs/AIConfigTab'
import ElaraTab     from './tabs/ElaraTab'
import CustomersTab from './tabs/CustomersTab'
import CrmLayout      from './tabs/crm/CrmLayout'
import LeadsView      from './tabs/crm/LeadsView'
import PipelineView   from './tabs/crm/PipelineView'
import CompaniesView  from './tabs/crm/CompaniesView'
import CompanyDetail  from './tabs/crm/CompanyDetail'

function getRoleFromToken(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.role ?? 'viewer'
  } catch {
    return 'viewer'
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState<string>('viewer')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('panel_token')
    if (stored) {
      setToken(stored)
      setRole(localStorage.getItem('panel_role') ?? getRoleFromToken(stored))
    }
    setChecking(false)
  }, [])

  const handleLogin = (result: LoginResult) => {
    localStorage.setItem('panel_token', result.token)
    localStorage.setItem('panel_role', result.role)
    localStorage.setItem('panel_user', JSON.stringify(result.user))
    setToken(result.token)
    setRole(result.role)
  }

  const handleLogout = () => {
    localStorage.removeItem('panel_token')
    localStorage.removeItem('panel_role')
    localStorage.removeItem('panel_user')
    setToken(null)
    setRole('viewer')
  }

  if (checking) return null

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />}
      />

      {/* Public: email reset (?token=) and the logged-in must-change flow */}
      <Route path="/reset" element={<ResetPassword />} />

      <Route
        path="/"
        element={token ? <Panel role={role} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Navigate to="/home" replace />} />

        {/* Home */}
        <Route path="home" element={<HomeTab />} />

        {/* Elara */}
        <Route path="elara"          element={<ElaraTab role={role} />} />
        <Route path="elara/controls" element={<ElaraControlsTab role={role} />} />
        <Route path="aiconfig"       element={<AIConfigTab role={role} />} />

        {/* CRM (STEP5b) */}
        <Route path="crm" element={<CrmLayout />}>
          <Route index element={<Navigate to="/crm/leads" replace />} />
          <Route path="leads"           element={<LeadsView role={role} />} />
          <Route path="pipeline"        element={<PipelineView role={role} />} />
          <Route path="companies"       element={<CompaniesView role={role} />} />
          <Route path="companies/:id"   element={<CompanyDetail role={role} />} />
        </Route>
        {/* Old standalone Leads → folded into CRM */}
        <Route path="leads"    element={<Navigate to="/crm/leads" replace />} />
        <Route path="pipeline" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="contacts" element={<Navigate to="/crm/companies" replace />} />

        {/* Customers — product is a filter, not separate trees (STEP5a) */}
        <Route path="customers"                  element={<CustomersTab role={role} />} />
        <Route path="customers/:product"         element={<CustomersTab role={role} />} />
        <Route path="customers/:product/:view"   element={<CustomersTab role={role} />} />

        {/* Redirects from the old per-product paths so saved links don't 404 */}
        <Route path="shops"       element={<Navigate to="/customers/crimsonforge-pro/shops" replace />} />
        <Route path="users"       element={<Navigate to="/customers/crimsonforge-pro/users" replace />} />
        <Route path="billing"     element={<Navigate to="/customers/crimsonforge-pro/billing" replace />} />
        <Route path="messages"    element={<Navigate to="/customers/crimsonforge-pro/messages" replace />} />
        <Route path="feedback"    element={<Navigate to="/customers/crimsonforge-pro/feedback" replace />} />
        <Route path="forgepilot"  element={<Navigate to="/customers/forgepilot/overview" replace />} />
        <Route path="fp-billing"  element={<Navigate to="/customers/forgepilot/billing" replace />} />
        <Route path="fp-messages" element={<Navigate to="/customers/forgepilot/messages" replace />} />
        <Route path="fp-feedback" element={<Navigate to="/customers/forgepilot/feedback" replace />} />
        <Route path="forgepulse"  element={<Navigate to="/customers/forgepulse/waitlist" replace />} />

        {/* Platform */}
        <Route path="enterprise" element={<Placeholder title="Enterprise" phase="Phase 6" note="Org accounts, seats, API keys, usage." />} />
        <Route path="financials" element={<Placeholder title="Financials" phase="Phase 6" note="MRR/ARR, burn, runway, cap table." />} />
        <Route path="system"     element={<SystemTab />} />

        {/* Settings */}
        <Route path="settings/admins"       element={<AdminsTab role={role} />} />
        <Route path="settings/audit"        element={<Placeholder title="Audit Log" phase="Phase 2" note="overseer_audit viewer (events available now under Activity)." />} />
        <Route path="settings/integrations" element={<Placeholder title="Integrations" phase="Phase 2" note="Slack, Gmail, Calendar, Twilio, Resend, Stripe, Railway, Sentry, Netlify." />} />
        <Route path="activity"              element={<ActivityTab />} />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  )
}
