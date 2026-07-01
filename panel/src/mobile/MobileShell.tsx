/**
 * Mobile shell (MOBILE-1) — a lean, phone-first companion: header + a
 * pull-to-refresh content area + a thumb-reachable bottom tab bar
 * (Pulse · Triage · Elara). Reuses the same auth/session and API as desktop.
 */
import { useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useOnline } from './useIsMobile'

const TABS = [
  { to: '/m/pulse', label: 'Pulse', glyph: '◎' },
  { to: '/m/triage', label: 'Triage', glyph: '⚠' },
  { to: '/m/elara', label: 'Elara', glyph: '✦' },
]

function PullToRefresh({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const ref = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const THRESHOLD = 70

  const onStart = (e: React.TouchEvent) => {
    if ((ref.current?.scrollTop ?? 0) <= 0 && !busy) startY.current = e.touches[0].clientY
  }
  const onMove = (e: React.TouchEvent) => {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setPull(Math.min(dy * 0.5, THRESHOLD + 20))
  }
  const onEnd = async () => {
    if (pull >= THRESHOLD && !busy) {
      setBusy(true)
      await qc.invalidateQueries()
      setTimeout(() => setBusy(false), 400)
    }
    startY.current = null
    setPull(0)
  }

  return (
    <div ref={ref} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 14px 16px' }}>
      {(pull > 0 || busy) && (
        <div style={{ textAlign: 'center', height: busy ? 26 : pull, overflow: 'hidden', color: 'var(--text-hint)', fontSize: 12, transition: busy ? 'height .2s' : undefined }}>
          {busy ? 'Refreshing…' : pull >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      {children}
    </div>
  )
}

export default function MobileShell({ onLogout }: { role: string; onLogout: () => void }) {
  const online = useOnline()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        paddingTop: 'calc(12px + var(--safe-top))', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <img src="/overseer-icon.png" alt="" width={28} height={28} style={{ filter: 'drop-shadow(0 2px 5px rgba(192,48,42,.3))' }} />
        <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: .3, color: 'var(--text-primary)' }}>Overseer</div>
        <button className="btn btn-ghost btn-sm" onClick={onLogout} style={{ marginLeft: 'auto' }}>Sign out</button>
      </header>

      {!online && (
        <div style={{ padding: '8px 14px', background: 'rgba(217,119,6,.1)', color: 'var(--yellow)', fontSize: 12.5, textAlign: 'center' }}>
          You’re offline — showing nothing rather than stale numbers. Reconnect to refresh.
        </div>
      )}

      {/* Active tab */}
      <PullToRefresh><Outlet /></PullToRefresh>

      {/* Bottom tab bar */}
      <nav style={{
        display: 'flex', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)',
        paddingBottom: 'var(--safe-bottom)', position: 'sticky', bottom: 0, zIndex: 10,
      }}>
        {TABS.map(t => (
          <NavLink key={t.to} to={t.to} style={({ isActive }) => ({
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '9px 0 10px', textDecoration: 'none', fontSize: 11, fontWeight: 600,
            color: isActive ? 'var(--accent)' : 'var(--text-muted)',
            borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent', marginTop: -1,
          })}>
            <span style={{ fontSize: 19, lineHeight: 1 }}>{t.glyph}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
