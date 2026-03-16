import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Panel from './pages/Panel'

export default function App() {
  const [token, setToken] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('panel_token')
    setToken(stored)
    setChecking(false)
  }, [])

  const handleLogin = (t: string) => {
    localStorage.setItem('panel_token', t)
    setToken(t)
  }

  const handleLogout = () => {
    localStorage.removeItem('panel_token')
    setToken(null)
  }

  if (checking) return null
  if (!token) return <Login onLogin={handleLogin} />
  return <Panel onLogout={handleLogout} />
}
