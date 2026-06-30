import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface PendingState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

// Promise-based confirm. Every destructive action in later phases
// (suspend user, revoke key, delete lead, reset password) routes through this.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve
      setPending({ ...opts, resolve })
    })
  }, [])

  const close = useCallback((ok: boolean) => {
    resolveRef.current?.(ok)
    resolveRef.current = null
    setPending(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          onClick={() => close(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(26,29,35,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'overlay-in .15s ease both',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(420px, 100%)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(26,29,35,.22)',
              animation: 'dialog-in .18s ease both',
            }}
          >
            <div style={{ height: 3, background: pending.danger ? 'var(--red-text)' : 'var(--accent)' }} />
            <div style={{ padding: '20px 22px 22px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: pending.body ? 8 : 18 }}>
                {pending.title}
              </div>
              {pending.body && (
                <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 20 }}>
                  {pending.body}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => close(false)}
                >
                  {pending.cancelLabel ?? 'Cancel'}
                </button>
                <button
                  className={`btn btn-sm ${pending.danger ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => close(true)}
                  autoFocus
                >
                  {pending.confirmLabel ?? 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}
