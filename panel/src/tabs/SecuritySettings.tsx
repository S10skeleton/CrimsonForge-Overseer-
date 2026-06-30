import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'

function errMsg(e: unknown): string {
  if (e instanceof Error) { try { return JSON.parse(e.message).error ?? e.message } catch { return e.message } }
  return 'Something went wrong'
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const toast = useToast()
  const copy = () => { navigator.clipboard?.writeText(codes.join('\n')); toast.success('Recovery codes copied') }
  return (
    <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Recovery codes — save these now</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>Each works once if you lose your authenticator. They won't be shown again.</div>
      <div className="mono" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 13, marginBottom: 12 }}>
        {codes.map(c => <span key={c}>{c}</span>)}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={copy} style={{ marginRight: 8 }}>Copy</button>
      <button className="btn btn-primary btn-sm" onClick={onDone}>Done</button>
    </div>
  )
}

export default function SecuritySettings() {
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()
  const { data: status, isLoading } = useQuery({ queryKey: ['2fa-status'], queryFn: api.auth.twofa.status })

  const [enroll, setEnroll] = useState<{ otpauthUrl: string; qrDataUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [disableInput, setDisableInput] = useState('')
  const [regenInput, setRegenInput] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: ['2fa-status'] })

  const setupM = useMutation({ mutationFn: () => api.auth.twofa.setup(), onSuccess: (d) => { setEnroll(d); setCode('') }, onError: (e) => toast.error(errMsg(e)) })
  const verifyM = useMutation({ mutationFn: () => api.auth.twofa.verify(code.trim()), onSuccess: (d) => { setEnroll(null); setRecovery(d.recoveryCodes); refresh(); toast.success('Two-factor enabled') }, onError: (e) => toast.error(errMsg(e)) })
  const disableM = useMutation({ mutationFn: () => api.auth.twofa.disable(/^\d{6}$/.test(disableInput.trim()) ? { code: disableInput.trim() } : disableInput.includes('-') ? { recoveryCode: disableInput.trim() } : { password: disableInput }), onSuccess: () => { setDisableInput(''); refresh(); toast.success('Two-factor disabled') }, onError: (e) => toast.error(errMsg(e)) })
  const regenM = useMutation({ mutationFn: () => api.auth.twofa.regenerate(regenInput.trim()), onSuccess: (d) => { setRegenInput(''); setRecovery(d.recoveryCodes); toast.success('Recovery codes regenerated') }, onError: (e) => toast.error(errMsg(e)) })

  const enabled = status?.enabled

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Security</h1>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>Protect your account with a second factor.</div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div className="section-label" style={{ margin: 0 }}>Two-factor authentication (TOTP)</div>
          {!isLoading && <span className={`badge ${enabled ? 'badge-green' : 'badge-dim'}`}>{enabled ? 'On' : 'Off'}</span>}
        </div>

        {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
          recovery ? (
            <RecoveryCodes codes={recovery} onDone={() => setRecovery(null)} />
          ) : enabled ? (
            <div style={{ display: 'grid', gap: 16, marginTop: 8 }}>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Your account is protected by an authenticator app.</div>
              <div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 6 }}>REGENERATE RECOVERY CODES (enter a current code)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={regenInput} onChange={e => setRegenInput(e.target.value)} placeholder="123456" style={{ maxWidth: 160 }} />
                  <button className="btn btn-ghost" disabled={!regenInput.trim() || regenM.isPending} onClick={() => regenM.mutate()}>Regenerate</button>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 6 }}>DISABLE (code, recovery code, or password)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={disableInput} onChange={e => setDisableInput(e.target.value)} type={/-|\d{6}/.test(disableInput) ? 'text' : 'password'} placeholder="verify to disable" style={{ maxWidth: 200 }} />
                  <button className="btn btn-danger" disabled={!disableInput.trim() || disableM.isPending} onClick={async () => { if (await confirm({ title: 'Disable two-factor?', body: 'Your account will be protected by password only.', confirmLabel: 'Disable', danger: true })) disableM.mutate() }}>Disable</button>
                </div>
              </div>
            </div>
          ) : enroll ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 12 }}>Scan this in your authenticator app (Google Authenticator, Authy, 1Password, Duo), then enter the 6-digit code.</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <img src={enroll.qrDataUrl} alt="2FA QR" width={160} height={160} style={{ border: '1px solid var(--border)', borderRadius: 8 }} />
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>MANUAL KEY</div>
                  <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--text-muted)', marginBottom: 12 }}>{new URL(enroll.otpauthUrl).searchParams.get('secret')}</div>
                  <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" placeholder="123456" onKeyDown={e => e.key === 'Enter' && verifyM.mutate()} style={{ marginBottom: 10, letterSpacing: 3, textAlign: 'center' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" disabled={!code.trim() || verifyM.isPending} onClick={() => verifyM.mutate()}>Verify &amp; enable</button>
                    <button className="btn btn-ghost" onClick={() => setEnroll(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 12 }}>Add a one-time code from an authenticator app to every sign-in.</div>
              <button className="btn btn-primary" disabled={setupM.isPending} onClick={() => setupM.mutate()}>{setupM.isPending ? 'Starting…' : 'Enable two-factor'}</button>
            </div>
          )
        )}
      </div>
    </div>
  )
}
