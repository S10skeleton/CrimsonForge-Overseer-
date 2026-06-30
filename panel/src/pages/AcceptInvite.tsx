import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { LoginResult } from '../api'
import { useToast } from '../components/Toast'

const MIN = 12

export default function AcceptInvite({ onLogin }: { onLogin: (r: LoginResult) => void }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const token = params.get('token') ?? ''

  const [username, setUsername] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tooShort = next.length > 0 && next.length < MIN
  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit = !!token && next.length >= MIN && next === confirm && !loading

  const submit = async () => {
    if (!canSubmit) return
    setLoading(true); setError('')
    try {
      const result = await api.auth.acceptInvite(token, username.trim(), next)
      onLogin(result)
      toast.success('Welcome to Overseer')
      navigate('/home', { replace: true })
    } catch (e: any) {
      let msg = 'Could not accept invite'
      try { msg = JSON.parse(e.message).error ?? msg } catch { msg = e.message ?? msg }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 20 }}>
      <div style={{ width: 360, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 32px rgba(26,29,35,.08)' }}>
        <div style={{ height: 3, background: 'var(--accent)' }} />
        <div style={{ padding: '26px 26px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Set up your account</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>
            {token ? 'Choose a username and password to activate your Overseer access.' : 'This invite link is missing its token.'}
          </div>

          <label className="mono" style={{ display: 'block', fontSize: 10, letterSpacing: 1.2, color: 'var(--text-muted)', marginBottom: 6 }}>USERNAME (optional)</label>
          <input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" placeholder="leave blank to use your invite default" style={{ marginBottom: 16 }} />

          <label className="mono" style={{ display: 'block', fontSize: 10, letterSpacing: 1.2, color: 'var(--text-muted)', marginBottom: 6 }}>PASSWORD</label>
          <input type="password" value={next} onChange={e => setNext(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 11.5, color: tooShort ? 'var(--red-text)' : 'var(--text-hint)', marginBottom: 14 }}>At least {MIN} characters.</div>

          <label className="mono" style={{ display: 'block', fontSize: 10, letterSpacing: 1.2, color: 'var(--text-muted)', marginBottom: 6 }}>CONFIRM PASSWORD</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
            style={{ marginBottom: mismatch ? 6 : 18, borderColor: mismatch ? 'var(--red-text)' : undefined }} />
          {mismatch && <div style={{ fontSize: 11.5, color: 'var(--red-text)', marginBottom: 16 }}>Passwords don't match.</div>}

          {error && <div style={{ fontSize: 12.5, color: 'var(--red-text)', marginBottom: 14 }}>{error}</div>}

          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit} style={{ width: '100%', justifyContent: 'center', padding: '11px 0' }}>
            {loading ? 'Setting up…' : 'Activate account'}
          </button>
        </div>
      </div>
    </div>
  )
}
