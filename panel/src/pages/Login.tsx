import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { LoginResult } from '../api'
import { useToast } from '../components/Toast'

interface Props { onLogin: (result: LoginResult) => void }

export default function Login({ onLogin }: Props) {
  const navigate = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [username, setUsername] = useState('')
  const [pass, setPass]               = useState('')
  const [forgotId, setForgotId]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [locked, setLocked]           = useState(false)
  const [lockCountdown, setLockCountdown] = useState(0)
  const [mounted, setMounted]         = useState(false)

  useEffect(() => {
    setTimeout(() => setMounted(true), 80)
    api.auth.status()
      .then(d => { if (d.locked) { setLocked(true); setLockCountdown(d.secondsRemaining ?? 900) } })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!locked || lockCountdown <= 0) return
    const t = setInterval(() => setLockCountdown(p => {
      if (p <= 1) { setLocked(false); setError(''); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [locked, lockCountdown])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const handleSubmit = async () => {
    if (!username.trim() || !pass.trim() || loading || locked) return
    setLoading(true); setError('')
    try {
      const result = await api.auth.login(username.trim(), pass.trim())
      onLogin(result)
      if (result.user?.must_change_password) navigate('/reset', { replace: true })
      else navigate('/home', { replace: true })
    } catch (e: any) {
      let msg = 'Incorrect username or password'
      try {
        const b = JSON.parse(e.message)
        msg = b.error ?? msg
        if (b.locked) { setLocked(true); setLockCountdown(b.secondsRemaining ?? 900) }
        else if (b.attemptsLeft != null) setAttemptsLeft(b.attemptsLeft)
      } catch { msg = e.message ?? 'Connection error' }
      setError(msg); setPass('')
    } finally { setLoading(false) }
  }

  const handleForgot = async () => {
    if (!forgotId.trim() || loading) return
    setLoading(true)
    try {
      await api.auth.forgot(forgotId.trim())
    } catch { /* never reveal — neutral message regardless */ }
    setLoading(false)
    toast.info('If that account exists, a reset link is on its way.')
    setMode('login'); setForgotId('')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', background: 'var(--bg-base)',
    }}>
      <div style={{
        position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 620, height: 620, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(89,73,172,.08) 0%, rgba(192,48,42,.04) 45%, transparent 70%)',
      }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--accent)' }} />

      <div className="mono" style={{ position: 'absolute', top: 18, left: 24, fontSize: 10, letterSpacing: 2, color: 'var(--text-hint)' }}>
        CRIMSONFORGE // OPS
      </div>
      <div style={{ position: 'absolute', top: 16, right: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
        <span className="mono" style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-hint)' }}>SECURE</span>
      </div>

      <div style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity .55s ease, transform .55s ease', padding: '0 20px',
      }}>
        {/* Orb — Elara identity */}
        <div style={{ position: 'relative', width: 104, height: 104, margin: '0 auto 30px' }}>
          <div className="orbit-cw"  style={{ inset: -16 }} />
          <div className="orbit-ccw" style={{ inset: -28 }} />
          <div className="orb-ring ring-1" style={{ inset: 0,  borderWidth: 2 }} />
          <div className="orb-ring ring-2" style={{ inset: 13, borderWidth: 1.5 }} />
          <div className="orb-ring ring-3" style={{ inset: 25, borderWidth: 1 }} />
          <div style={{ position: 'absolute', inset: 36, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/elara-logo.png" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', width: 5, height: 5, borderRadius: '50%',
            background: 'var(--elara)', transformOrigin: '-70px 0',
            animation: 'orbit-cw 8s linear infinite', marginTop: -2.5, marginLeft: -2.5,
          }} />
        </div>

        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 10, marginBottom: 6, color: 'var(--text-primary)' }}>ELARA</div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 3, color: 'var(--text-hint)', marginBottom: 36 }}>
          AI OPERATIONS INTELLIGENCE
        </div>

        <div style={{
          width: 320, margin: '0 auto', background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 10px 32px rgba(26,29,35,.08)',
        }}>
          <div style={{ height: 3, background: 'var(--accent)' }} />

          <div style={{ padding: '24px 24px 22px' }}>
            {locked ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontWeight: 800, fontSize: 34, color: 'var(--red-text)', marginBottom: 8 }}>{fmt(lockCountdown)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  Access suspended.<br />Too many failed attempts.
                </div>
              </div>
            ) : mode === 'forgot' ? (
              <>
                <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--text-muted)', marginBottom: 10, textAlign: 'left' }}>
                  USERNAME OR EMAIL
                </div>
                <input
                  type="text" value={forgotId} autoFocus disabled={loading}
                  onChange={e => setForgotId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleForgot()}
                  placeholder="you@crimsonforge.pro"
                  style={{ marginBottom: 12 }}
                />
                <button className="btn btn-primary" onClick={handleForgot} disabled={loading || !forgotId.trim()}
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 0', letterSpacing: 1 }}>
                  {loading ? 'SENDING…' : 'SEND RESET LINK'}
                </button>
                <button onClick={() => { setMode('login'); setError('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, marginTop: 14, cursor: 'pointer', width: '100%' }}>
                  ← Back to sign in
                </button>
              </>
            ) : (
              <>
                <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'left' }}>
                  USERNAME
                </div>
                <input
                  type="text" value={username} autoFocus disabled={loading}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  autoCapitalize="none" autoCorrect="off"
                  placeholder="username"
                  style={{ marginBottom: 14 }}
                />
                <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'left' }}>
                  PASSWORD
                </div>
                <input
                  type="password" value={pass} disabled={loading}
                  onChange={e => setPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="••••••••••••"
                  style={{ marginBottom: 12, borderColor: error ? 'var(--red-text)' : undefined }}
                />

                {error && (
                  <div style={{ fontSize: 12, color: 'var(--red-text)', marginBottom: 10, lineHeight: 1.5, textAlign: 'left' }}>{error}</div>
                )}
                {attemptsLeft !== null && attemptsLeft <= 2 && !locked && (
                  <div style={{
                    fontSize: 12, color: 'var(--yellow)', marginBottom: 10,
                    background: 'rgba(217,119,6,.08)', border: '1px solid rgba(217,119,6,.25)',
                    borderRadius: 6, padding: '6px 10px', textAlign: 'left',
                  }}>
                    ⚠ {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                  </div>
                )}

                <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !username.trim() || !pass.trim()}
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 0', letterSpacing: 1 }}>
                  {loading ? 'AUTHENTICATING…' : 'ACCESS CONSOLE'}
                </button>
                <button onClick={() => { setMode('forgot'); setError('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, marginTop: 14, cursor: 'pointer', width: '100%' }}>
                  Forgot password?
                </button>
              </>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-hint)', letterSpacing: 1 }}>AES-256 // NAMED</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-hint)', letterSpacing: 1 }}>v0.4.0</span>
          </div>
        </div>

        <div className="mono" style={{ marginTop: 22, fontSize: 9, color: 'var(--text-hint)', letterSpacing: 2, opacity: .8 }}>
          // RESTRICTED — AUTHORIZED PERSONNEL ONLY
        </div>
      </div>
    </div>
  )
}
