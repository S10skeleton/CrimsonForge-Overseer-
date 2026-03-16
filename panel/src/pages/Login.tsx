import { useState } from 'react'
import { api } from '../api'

interface Props { onLogin: (token: string) => void }

export default function Login({ onLogin }: Props) {
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!pass.trim()) return
    setLoading(true); setError('')
    try {
      const { token } = await api.auth.login(pass.trim())
      onLogin(token)
    } catch {
      setError('Incorrect passphrase')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(232,28,46,.08) 0%, var(--bg) 70%)',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 28, letterSpacing: 6, lineHeight: 1.1 }} className="grad">
            CRIMSON<br />FORGE
          </div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: 4, color: 'var(--dim)', marginTop: 8 }}>
            OPS CONSOLE
          </div>
        </div>

        <div className="card">
          <div className="section-label" style={{ marginBottom: 20, textAlign: 'center' }}>
            Enter Passphrase
          </div>
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="••••••••••••••"
            style={{ marginBottom: 12, fontSize: 16, letterSpacing: 3, textAlign: 'center' }}
            autoFocus
          />
          {error && (
            <div style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
              {error}
            </div>
          )}
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
            onClick={handleSubmit}
            disabled={loading || !pass.trim()}
          >
            {loading ? 'Authenticating...' : 'Access Console'}
          </button>
        </div>

        <div className="mono" style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'var(--dim)', opacity: .5 }}>
          // RESTRICTED ACCESS — AUTHORIZED PERSONNEL ONLY
        </div>
      </div>
    </div>
  )
}
