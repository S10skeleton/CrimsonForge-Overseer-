import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Panel from './pages/Panel'

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
      setRole(getRoleFromToken(stored))
    }
    setChecking(false)
  }, [])

  const handleLogin = (t: string) => {
    localStorage.setItem('panel_token', t)
    setToken(t)
    setRole(getRoleFromToken(t))
  }

  const handleLogout = () => {
    localStorage.removeItem('panel_token')
    setToken(null)
    setRole('viewer')
  }

  if (checking) return null
  if (!token) return <Login onLogin={handleLogin} />
  return <Panel role={role} onLogout={handleLogout} />
}
