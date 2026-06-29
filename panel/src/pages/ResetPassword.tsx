import { useState } from 'react'
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom'
import { api } from '../api'
import { useToast } from '../components/Toast'

const MIN = 12

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const token = params.get('token')
  const loggedIn = Boolean(localStorage.getItem('panel_token'))
  // Token in the URL = email reset flow. Otherwise it's the logged-in
  // "must change password" / self-service change flow.
  const mode: 'reset' | 'change' = token ? 'reset' : 'change'

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Change mode requires an active session.
  if (mode === 'change' && !loggedIn) return <Navigate to="/login" replace />

  const tooShort = next.length > 0 && next.length < MIN
  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit = next.length >= MIN && next === confirm && (mode === 'reset' || current.length > 0) && !loading

  const submit = async () => {
    if (!canSubmit) return
    setLoading(true); setError('')
    try {
      if (mode === 'reset') {
        await api.auth.reset(token!, next)
        toast.success('Password updated. Please sign in.')
        navigate('/login', { replace: true })
      } else {
        await api.auth.changePassword(current, next)
        toast.success('Password changed.')
        navigate('/home', { replace: true })
      }
    } catch (e: any) {
      let msg = 'Could not update password'
      try { msg = JSON.parse(e.message).error ?? msg } catch { msg = e.message ?? msg }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', padding: 20,
    }}>
      <div style={{
        width: 360, background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 32px rgba(26,29,35,.08)',
      }}>
        <div style={{ height: 3, background: 'var(--accent)' }} />
        <div style={{ padding: '26px 26px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            {mode === 'reset' ? 'Reset password' : 'Set a new password'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>
            {mode === 'reset'
              ? 'Choose a new password for your Overseer account.'
              : 'Your account requires a new password before continuing.'}
          </div>

          {mode === 'change' && (
            <>
              <label className="mono" style={{ display: 'block', fontSize: 10, letterSpacing: 1.2, color: 'var(--text-muted)', marginBottom: 6 }}>
                CURRENT PASSWORD
              </label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoFocus
                style={{ marginBottom: 16 }} />
            </>
          )}

          <label className="mono" style={{ display: 'block', fontSize: 10, letterSpacing: 1.2, color: 'var(--text-muted)', marginBottom: 6 }}>
            NEW PASSWORD
          </label>
          <input type="password" value={next} onChange={e => setNext(e.target.value)} autoFocus={mode === 'reset'}
            onKeyDown={e => e.key === 'Enter' && submit()} style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 11.5, color: tooShort ? 'var(--red-text)' : 'var(--text-hint)', marginBottom: 14 }}>
            At least {MIN} characters.
          </div>

          <label className="mono" style={{ display: 'block', fontSize: 10, letterSpacing: 1.2, color: 'var(--text-muted)', marginBottom: 6 }}>
            CONFIRM NEW PASSWORD
          </label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            style={{ marginBottom: mismatch ? 6 : 18, borderColor: mismatch ? 'var(--red-text)' : undefined }} />
          {mismatch && <div style={{ fontSize: 11.5, color: 'var(--red-text)', marginBottom: 16 }}>Passwords don't match.</div>}

          {error && <div style={{ fontSize: 12.5, color: 'var(--red-text)', marginBottom: 14 }}>{error}</div>}

          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}
            style={{ width: '100%', justifyContent: 'center', padding: '11px 0' }}>
            {loading ? 'Saving…' : mode === 'reset' ? 'Reset password' : 'Save & continue'}
          </button>

          {mode === 'reset' && (
            <button onClick={() => navigate('/login')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, marginTop: 14, cursor: 'pointer', width: '100%' }}>
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
