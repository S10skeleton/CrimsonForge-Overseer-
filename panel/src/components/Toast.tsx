import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const KIND_STYLE: Record<ToastKind, { border: string; bar: string; glyph: string }> = {
  success: { border: 'var(--green)',     bar: 'var(--green)',     glyph: '✓' },
  error:   { border: 'var(--red-text)',  bar: 'var(--red-text)',  glyph: '!' },
  info:    { border: 'var(--elara)',     bar: 'var(--elara)',     glyph: 'i' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++
    setToasts(prev => [...prev, { id, kind, message }])
    setTimeout(() => remove(id), 4000)
  }, [remove])

  const api: ToastApi = {
    success: msg => push('success', msg),
    error:   msg => push('error', msg),
    info:    msg => push('info', msg),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const s = KIND_STYLE[t.kind]
          return (
            <div
              key={t.id}
              onClick={() => remove(t.id)}
              style={{
                pointerEvents: 'auto', cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${s.border}`,
                borderRadius: 8, padding: '11px 14px',
                boxShadow: '0 6px 20px rgba(26,29,35,.12)',
                animation: 'toast-in .2s ease both',
                fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45,
              }}
            >
              <span style={{
                flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                background: s.bar, color: '#fff', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}>
                {s.glyph}
              </span>
              <span>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
