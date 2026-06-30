import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import AcceptInvite from './pages/AcceptInvite'
import Panel from './pages/Panel'
import { PermissionsProvider } from './lib/permissions'
import AskElara from './components/AskElara'
import type { Permissions } from './lib/permissions'
import { api } from './api'
import Placeholder from './components/Placeholder'
import HomeTab from './tabs/HomeTab'
import ElaraControlsTab from './tabs/ElaraControlsTab'
import AdminsTab from './tabs/AdminsTab'
import ActivityTab from './tabs/ActivityTab'
import SecuritySettings from './tabs/SecuritySettings'
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
import CrmTable       from './tabs/crm/CrmTable'
import InboxesView    from './tabs/crm/InboxesView'
import PhoneHub       from './tabs/phone/PhoneHub'
import FinancialsLayout from './tabs/financials/FinancialsLayout'
import RevenueView      from './tabs/financials/RevenueView'
import RunwayView       from './tabs/financials/RunwayView'
import RaiseView        from './tabs/financials/RaiseView'
import CapTableView     from './tabs/financials/CapTableView'

function getRoleFromToken(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.role ?? 'viewer'
  } catch {
    return 'viewer'
  }
}

// A token is expired if its `exp` (seconds) is at/past now, or it can't be read.
function isExpired(token: string): boolean {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1])) as { exp?: number }
    return exp ? exp * 1000 <= Date.now() : false
  } catch {
    return true
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState<string>('viewer')
  const [permissions, setPermissions] = useState<Permissions>({})
  const [mustChange, setMustChange] = useState(false)
  const [checking, setChecking] = useState(true)

  const clearSession = useCallback((reason?: 'expired' | 'idle') => {
    if (reason) sessionStorage.setItem('panel_logout_reason', reason)
    localStorage.removeItem('panel_token')
    localStorage.removeItem('panel_role')
    localStorage.removeItem('panel_user')
    setToken(null)
    setRole('viewer')
    setMustChange(false)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('panel_token')
    if (stored && !isExpired(stored)) {
      setToken(stored)
      setRole(localStorage.getItem('panel_role') ?? getRoleFromToken(stored))
      try { setMustChange(!!JSON.parse(localStorage.getItem('panel_user') ?? '{}').must_change_password) } catch { /* ignore */ }
    } else if (stored) {
      // Token present but lapsed — clean up + flag so we land on /login with a reason.
      clearSession('expired')
    }
    setChecking(false)
  }, [clearSession])

  // Re-check while the app is open so a session that lapses mid-use logs out.
  useEffect(() => {
    if (!token) return
    const t = setInterval(() => { if (isExpired(token)) clearSession('expired') }, 60_000)
    return () => clearInterval(t)
  }, [token, clearSession])

  // Load current role + permissions whenever logged in (refreshes without re-login).
  useEffect(() => {
    if (!token) { setPermissions({}); return }
    api.auth.me()
      .then(me => { setRole(me.role); setPermissions(me.permissions ?? {}) })
      .catch(() => { /* 401 handled centrally; other errors leave prior perms */ })
  }, [token])

  const handleLogin = (result: LoginResult) => {
    localStorage.setItem('panel_token', result.token)
    localStorage.setItem('panel_role', result.role)
    localStorage.setItem('panel_user', JSON.stringify(result.user))
    setToken(result.token)
    setRole(result.role)
    setMustChange(result.user?.must_change_password ?? false)
  }

  // Manual logout — no reason flag (so Login shows no expiry message).
  const handleLogout = () => clearSession()

  if (checking) return null

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />}
      />

      {/* Public: email reset (?token=) and the logged-in must-change flow */}
      <Route path="/reset" element={<ResetPassword onPasswordChanged={() => setMustChange(false)} />} />

      {/* Public: invite acceptance (set-password link) */}
      <Route path="/accept" element={token ? <Navigate to="/" replace /> : <AcceptInvite onLogin={handleLogin} />} />

      <Route
        path="/"
        element={
          !token ? <Navigate to="/login" replace />
            : mustChange ? <Navigate to="/reset" replace />
            : (
              <PermissionsProvider value={{ permissions, role }}>
                <Panel role={role} onLogout={handleLogout} onIdleLogout={() => clearSession('idle')} />
                <AskElara />
              </PermissionsProvider>
            )
        }
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
          <Route path="table"           element={<CrmTable />} />
          <Route path="inboxes"         element={<InboxesView role={role} />} />
          <Route path="phone"           element={<PhoneHub />} />
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
        <Route path="enterprise" element={<Placeholder title="Enterprise" phase="Phase 6b" note="Org accounts, seats, API keys, usage — gated on the ForgePilot EA-track backend." />} />
        <Route path="financials" element={<FinancialsLayout />}>
          <Route index element={<Navigate to="/financials/revenue" replace />} />
          <Route path="revenue"  element={<RevenueView />} />
          <Route path="runway"   element={<RunwayView role={role} />} />
          <Route path="raise"    element={<RaiseView />} />
          <Route path="captable" element={<CapTableView role={role} />} />
        </Route>
        <Route path="system"     element={<SystemTab />} />

        {/* Settings */}
        <Route path="settings/security"     element={<SecuritySettings />} />
        <Route path="settings/admins"       element={<AdminsTab role={role} />} />
        <Route path="settings/audit"        element={<Placeholder title="Audit Log" phase="Phase 2" note="overseer_audit viewer (events available now under Activity)." />} />
        <Route path="settings/integrations" element={<Placeholder title="Integrations" phase="Phase 2" note="Slack, Gmail, Calendar, Twilio, Resend, Stripe, Railway, Sentry, Netlify." />} />
        <Route path="activity"              element={<ActivityTab />} />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  )
}
