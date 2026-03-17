import { useState, useEffect } from 'react'
import { api } from '../api'

interface Props { onLogin: (token: string) => void }

export default function Login({ onLogin }: Props) {
  const [pass, setPass]               = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [locked, setLocked]           = useState(false)
  const [lockCountdown, setLockCountdown] = useState(0)
  const [mounted, setMounted]         = useState(false)

  useEffect(() => {
    setTimeout(() => setMounted(true), 80)
    fetch(`${import.meta.env.VITE_OVERSEER_URL ?? ''}/api/auth/status`)
      .then(r => r.json())
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
    if (!pass.trim() || loading || locked) return
    setLoading(true); setError('')
    try {
      const { token } = await api.auth.login(pass.trim())
      onLogin(token)
    } catch (e: any) {
      let msg = 'Incorrect passphrase'
      try {
        const b = JSON.parse(e.message)
        msg = b.error ?? msg
        if (b.locked) { setLocked(true); setLockCountdown(b.secondsRemaining ?? 900) }
        else if (b.attemptsLeft != null) setAttemptsLeft(b.attemptsLeft)
      } catch { msg = e.message ?? 'Connection error' }
      setError(msg); setPass('')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* Radial atmosphere behind orb */}
      <div style={{
        position: 'absolute', top: '38%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600, height: 600, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(89,73,172,.14) 0%, rgba(234,24,35,.05) 45%, transparent 70%)',
      }} />

      {/* Top gradient line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, #EA1823, #8D1845, #5949AC, #4ACCFE)',
        opacity: .7,
      }} />

      {/* Corner brackets */}
      {[
        { top: 0, left: 0, borderWidth: '2px 0 0 2px' },
        { top: 0, right: 0, borderWidth: '2px 2px 0 0' },
        { bottom: 0, left: 0, borderWidth: '0 0 2px 2px' },
        { bottom: 0, right: 0, borderWidth: '0 2px 2px 0' },
      ].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute', width: 24, height: 24,
          borderColor: i < 2 ? '#EA1823' : '#5949AC',
          borderStyle: 'solid',
          borderWidth: pos.borderWidth,
          opacity: .5,
          top: pos.top,
          left: (pos as any).left,
          right: (pos as any).right,
          bottom: (pos as any).bottom,
        }} />
      ))}

      {/* System label */}
      <div style={{
        position: 'absolute', top: 18, left: 24,
        fontFamily: 'Share Tech Mono', fontSize: 10, letterSpacing: 3, color: 'var(--dimmer)',
      }}>
        CRIMSONFORGE // OPS
      </div>
      <div style={{
        position: 'absolute', top: 16, right: 24,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EA1823', boxShadow: '0 0 8px #EA1823' }} />
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, letterSpacing: 2, color: 'var(--dimmer)' }}>SECURE</span>
      </div>

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity .55s ease, transform .55s ease',
        padding: '0 20px',
      }}>

        {/* THE ORB */}
        <div style={{ position: 'relative', width: 110, height: 110, margin: '0 auto 36px' }}>
          <div className="orbit-cw"  style={{ inset: -18 }} />
          <div className="orbit-ccw" style={{ inset: -30 }} />
          <div className="orb-ring ring-1" style={{ inset: 0,  borderWidth: 2 }} />
          <div className="orb-ring ring-2" style={{ inset: 14, borderWidth: 1.5 }} />
          <div className="orb-ring ring-3" style={{ inset: 26, borderWidth: 1 }} />
          <div style={{
            position: 'absolute', inset: 38,
            borderRadius: '50%', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src="/elara-logo.png" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          {/* Orbiting dot */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 5, height: 5, borderRadius: '50%',
            background: '#4ACCFE', boxShadow: '0 0 10px #4ACCFE',
            transformOrigin: '-73px 0',
            animation: 'orbit-cw 8s linear infinite',
            marginTop: -2.5, marginLeft: -2.5,
          }} />
        </div>

        {/* Identity */}
        <div style={{
          fontFamily: 'Orbitron', fontWeight: 900, fontSize: 14,
          letterSpacing: 10, marginBottom: 6,
          background: 'linear-gradient(90deg, #EA1823, #8D1845, #5949AC, #4ACCFE)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          E L A R A
        </div>
        <div style={{
          fontFamily: 'Share Tech Mono', fontSize: 9, letterSpacing: 4,
          color: 'var(--dimmer)', marginBottom: 40,
        }}>
          AI OPERATIONS INTELLIGENCE
        </div>

        {/* Login card */}
        <div style={{
          width: 310, margin: '0 auto',
          background: 'rgba(8,8,26,.92)',
          border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          {/* Top gradient bar */}
          <div style={{ height: 2, background: 'linear-gradient(90deg, #EA1823, #8D1845, #5949AC, #4ACCFE)', opacity: .55 }} />

          <div style={{ padding: '24px 24px 22px' }}>
            <div style={{
              fontFamily: 'Share Tech Mono', fontSize: 9, letterSpacing: 2,
              color: 'var(--dim)', marginBottom: 10, textAlign: 'left',
            }}>
              PASSPHRASE
            </div>

            {locked ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 34, color: 'var(--red)', marginBottom: 8 }}>
                  {fmt(lockCountdown)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.7 }}>
                  Access suspended.<br />Too many failed attempts.
                </div>
              </div>
            ) : (
              <>
                {/* Password input */}
                <div style={{
                  height: 46, background: 'var(--bg-dark)',
                  border: `1px solid ${error ? 'rgba(239,68,68,.5)' : 'var(--border-lit)'}`,
                  borderRadius: 6, display: 'flex', alignItems: 'center',
                  padding: '0 14px', marginBottom: 12, transition: 'border-color .15s',
                  boxShadow: error ? '0 0 0 3px rgba(239,68,68,.1)' : 'none',
                }}>
                  <input
                    type="password"
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    placeholder="••••••••••••••"
                    autoFocus
                    disabled={loading}
                    style={{
                      background: 'transparent', border: 'none', outline: 'none',
                      color: 'var(--violet)', fontSize: 20, letterSpacing: 5,
                      width: '100%', fontFamily: 'Share Tech Mono', padding: 0,
                      boxShadow: 'none',
                    }}
                  />
                  {loading && (
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: '2px solid var(--violet)', borderTopColor: 'transparent',
                      animation: 'orbit-cw .7s linear infinite', flexShrink: 0,
                    }} />
                  )}
                </div>

                {error && (
                  <div style={{
                    fontSize: 11, color: 'var(--red)', marginBottom: 10,
                    fontFamily: 'Share Tech Mono', letterSpacing: .5, lineHeight: 1.5,
                  }}>
                    {error}
                  </div>
                )}

                {attemptsLeft !== null && attemptsLeft <= 2 && !locked && (
                  <div style={{
                    fontSize: 11, color: 'var(--yellow)', marginBottom: 10,
                    fontFamily: 'Share Tech Mono',
                    background: 'rgba(234,179,8,.06)',
                    border: '1px solid rgba(234,179,8,.2)',
                    borderRadius: 4, padding: '6px 10px',
                  }}>
                    ⚠ {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={loading || !pass.trim()}
                  style={{
                    width: '100%', padding: '11px 0', border: 'none',
                    borderRadius: 6, cursor: loading || !pass.trim() ? 'not-allowed' : 'pointer',
                    background: loading || !pass.trim()
                      ? 'var(--bg-mid)'
                      : 'linear-gradient(90deg, #EA1823, #8D1845, #5949AC, #4ACCFE)',
                    color: loading || !pass.trim() ? 'var(--dim)' : 'white',
                    fontFamily: 'Orbitron', fontWeight: 700, fontSize: 11,
                    letterSpacing: 3, transition: 'all .2s',
                    boxShadow: loading || !pass.trim() ? 'none' : '0 0 20px rgba(89,73,172,.4)',
                  }}
                >
                  {loading ? 'AUTHENTICATING...' : 'ACCESS CONSOLE'}
                </button>
              </>
            )}
          </div>

          {/* Bottom bar */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '8px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--dimmer)', letterSpacing: 1 }}>
              AES-256 // EPHEMERAL
            </span>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--dimmer)', letterSpacing: 1 }}>
              v0.3.2
            </span>
          </div>
        </div>

        <div style={{
          marginTop: 24, fontFamily: 'Share Tech Mono', fontSize: 9,
          color: 'var(--dimmer)', letterSpacing: 3, opacity: .6,
        }}>
          // RESTRICTED — AUTHORIZED PERSONNEL ONLY
        </div>
      </div>
    </div>
  )
}
