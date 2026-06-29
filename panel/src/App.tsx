import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Panel from './pages/Panel'
import Placeholder from './components/Placeholder'
import AdminsTab from './tabs/AdminsTab'
import ActivityTab from './tabs/ActivityTab'
import type { LoginResult } from './api'

import SystemTab             from './tabs/SystemTab'
import ShopsTab              from './tabs/ShopsTab'
import UsersTab              from './tabs/UsersTab'
import BillingTab            from './tabs/BillingTab'
import MessagesTab           from './tabs/MessagesTab'
import AIConfigTab           from './tabs/AIConfigTab'
import ElaraTab              from './tabs/ElaraTab'
import LeadsTab              from './tabs/LeadsTab'
import FeedbackTab           from './tabs/FeedbackTab'
import ForgePilotTab         from './tabs/ForgePilotTab'
import ForgePilotBillingTab  from './tabs/ForgePilotBillingTab'
import ForgePilotMessagesTab from './tabs/ForgePilotMessagesTab'
import ForgePilotFeedbackTab from './tabs/ForgePilotFeedbackTab'
import ForgePulseTab         from './tabs/ForgePulseTab'

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
        <Route path="home" element={<Placeholder title="Home" phase="Phase 3" note="Business dashboard — revenue, leads, runway, live activity." />} />

        {/* Elara */}
        <Route path="elara"    element={<ElaraTab role={role} />} />
        <Route path="aiconfig" element={<AIConfigTab role={role} />} />

        {/* CRM */}
        <Route path="leads"    element={<LeadsTab role={role} />} />
        <Route path="pipeline" element={<Placeholder title="Pipeline" phase="Phase 5" note="Deal stages — Investors, Enterprise, Beta partners." />} />
        <Route path="contacts" element={<Placeholder title="Contacts" phase="Phase 5" note="People & companies across the CRM." />} />

        {/* Customers */}
        <Route path="shops"       element={<ShopsTab role={role} />} />
        <Route path="users"       element={<UsersTab />} />
        <Route path="billing"     element={<BillingTab />} />
        <Route path="messages"    element={<MessagesTab role={role} />} />
        <Route path="feedback"    element={<FeedbackTab role={role} />} />
        <Route path="forgepilot"  element={<ForgePilotTab role={role} />} />
        <Route path="fp-billing"  element={<ForgePilotBillingTab />} />
        <Route path="fp-messages" element={<ForgePilotMessagesTab role={role} />} />
        <Route path="fp-feedback" element={<ForgePilotFeedbackTab role={role} />} />

        {/* Platform */}
        <Route path="enterprise" element={<Placeholder title="Enterprise" phase="Phase 6" note="Org accounts, seats, API keys, usage." />} />
        <Route path="financials" element={<Placeholder title="Financials" phase="Phase 6" note="MRR/ARR, burn, runway, cap table." />} />
        <Route path="system"     element={<SystemTab />} />
        <Route path="forgepulse" element={<ForgePulseTab />} />

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
