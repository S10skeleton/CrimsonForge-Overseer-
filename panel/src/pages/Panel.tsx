import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useIdleLogout } from '../lib/useIdleLogout'

interface Leaf { to: string; label: string; glyph: string; adminOnly?: boolean }
interface Section { id: string; label: string; accent?: string; online?: boolean; items: Leaf[] }

// ─── Function-based information architecture (Overseer 2.0) ──────────────────
const ELARA: Section = {
  id: 'elara', label: 'Elara', accent: 'var(--elara)', online: true,
  items: [
    { to: '/elara',          label: 'Assistant', glyph: '⬟' },
    { to: '/elara/controls', label: 'Controls',  glyph: '⚙', adminOnly: true },
    { to: '/aiconfig',       label: 'Forge AI',  glyph: '◈' },
  ],
}

const SECTIONS: Section[] = [
  {
    id: 'crm', label: 'CRM', items: [
      { to: '/crm/leads',     label: 'Leads',     glyph: '◇' },
      { to: '/crm/pipeline',  label: 'Pipeline',  glyph: '▤' },
      { to: '/crm/companies', label: 'Companies', glyph: '◉' },
    ],
  },
  {
    id: 'customers', label: 'Customers', items: [
      { to: '/customers', label: 'Customers', glyph: '⬡' },
    ],
  },
  {
    id: 'platform', label: 'Platform', items: [
      { to: '/enterprise', label: 'Enterprise', glyph: '◰' },
      { to: '/financials', label: 'Financials', glyph: '⬨' },
      { to: '/system',     label: 'System',     glyph: '◈' },
      { to: '/forgepulse', label: 'ForgePulse', glyph: '◎' },
    ],
  },
  {
    id: 'settings', label: 'Settings', items: [
      { to: '/settings/admins',       label: 'Admins & Roles', glyph: '◉', adminOnly: true },
      { to: '/settings/audit',        label: 'Audit Log',      glyph: '▤', adminOnly: true },
      { to: '/settings/integrations', label: 'Integrations',   glyph: '◈' },
      { to: '/activity',              label: 'Activity',       glyph: '◎', adminOnly: true },
    ],
  },
]

// Mobile nav — priority items + sign out
const MOBILE_NAV: Leaf[] = [
  { to: '/home',      label: 'HOME',   glyph: '⌂' },
  { to: '/elara',     label: 'ELARA',  glyph: '⬟' },
  { to: '/customers', label: 'CUST',   glyph: '⬡' },
  { to: '/crm/leads', label: 'LEADS',  glyph: '◇' },
  { to: '/system',    label: 'SYSTEM', glyph: '◈' },
]

interface Props { role: string; onLogout: () => void; onIdleLogout: () => void }

function navLinkStyle(accent = 'var(--accent)') {
  return ({ isActive }: { isActive: boolean }) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '8px 12px', marginBottom: 1,
    borderRadius: 7, border: 'none', cursor: 'pointer',
    background: isActive ? 'rgba(192,48,42,.07)' : 'transparent',
    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
    fontWeight: isActive ? 700 : 500, fontSize: 13.5,
    letterSpacing: .1, textAlign: 'left' as const, textDecoration: 'none',
    borderLeft: isActive ? `2px solid ${accent}` : '2px solid transparent',
    transition: 'all .12s',
  })
}

export default function Panel({ role, onLogout, onIdleLogout }: Props) {
  const [clock, setClock] = useState('')
  const idle = useIdleLogout(onIdleLogout)

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* -- Desktop Sidebar ------------------------------------------------ */}
      <div className="desktop-sidebar" style={{
        width: 230, flexShrink: 0,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>

        {/* Logo */}
        <div style={{ padding: '20px 18px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
            <div className="orb-ring ring-1" style={{ inset: 0,  borderWidth: 1.5 }} />
            <div className="orb-ring ring-3" style={{ inset: 9,  borderWidth: 1 }} />
            <div style={{
              position: 'absolute', inset: 16,
              borderRadius: '50%', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img src="/elara-logo.png" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: .5, lineHeight: 1.1, color: 'var(--text-primary)' }}>
              Crimson Forge
            </div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--text-hint)', marginTop: 2, textTransform: 'uppercase' }}>
              Overseer
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '0 14px 10px' }} />

        <nav style={{ flex: 1, padding: '0 10px' }}>

          {/* Home */}
          <NavLink to="/home" style={navLinkStyle()}>
            <span style={{ width: 18, textAlign: 'center', fontSize: 14 }}>{'⌂'}</span>
            Home
          </NavLink>

          <div style={{ height: 12 }} />

          {/* Elara — violet identity + live dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px 6px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: ELARA.accent, textTransform: 'uppercase' }}>
              {ELARA.label}
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-ring 3s ease-in-out infinite' }} />
          </div>
          {ELARA.items.filter(it => !it.adminOnly || role !== 'read_only').map(item => (
            <NavLink key={item.to} to={item.to} style={navLinkStyle('var(--elara)')}>
              <span style={{ width: 18, textAlign: 'center', fontSize: 13 }}>{item.glyph}</span>
              {item.label}
            </NavLink>
          ))}

          {/* Functional sections */}
          {SECTIONS.map(section => {
            const items = section.items.filter(it => !it.adminOnly || role !== 'read_only')
            if (items.length === 0) return null
            return (
            <div key={section.id} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: 'var(--text-hint)', textTransform: 'uppercase', padding: '0 12px 6px' }}>
                {section.label}
              </div>
              {items.map(item => (
                <NavLink key={item.to} to={item.to} style={navLinkStyle()}>
                  <span style={{ width: 18, textAlign: 'center', fontSize: 13, color: 'var(--text-hint)' }}>{item.glyph}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
            )
          })}
        </nav>

        {/* Clock */}
        <div style={{ margin: '12px 12px 0', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1 }}>{clock}</span>
          </div>
        </div>

        <div style={{ padding: '12px 14px 16px', borderTop: '1px solid var(--border)', marginTop: 12 }}>
          {role === 'viewer' && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <span style={{
                fontSize: '0.7rem', color: 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '2px 6px', letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                View Only
              </span>
            </div>
          )}
          <button onClick={onLogout} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            Sign Out
          </button>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-hint)', textAlign: 'center', marginTop: 10, letterSpacing: 1 }}>
            OVERSEER v0.4.0
          </div>
        </div>
      </div>

      {/* -- Main content --------------------------------------------------- */}
      <div style={{ flex: 1, overflowX: 'hidden', overflowY: 'auto' }}>
        <div className="panel-main" style={{ padding: '32px 36px', maxWidth: 1200 }}>
          <Outlet />
        </div>
      </div>

      {/* -- Idle warning modal -------------------------------------------- */}
      {idle.warning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(26,29,35,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 'min(380px, 100%)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 48px rgba(26,29,35,.22)' }}>
            <div style={{ height: 3, background: 'var(--accent)' }} />
            <div style={{ padding: '20px 22px 22px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Still there?</div>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 20 }}>
                You'll be signed out for inactivity in about {idle.warnSeconds} seconds.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
                <button className="btn btn-primary btn-sm" onClick={idle.stay} autoFocus>Stay signed in</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -- Mobile Bottom Tab Bar ------------------------------------------ */}
      <nav className="mobile-tabs">
        {MOBILE_NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `mobile-tab-btn ${isActive ? 'active' : ''}`}
          >
            {item.to === '/elara' && (
              <div style={{
                position: 'absolute', top: 6, right: '50%', marginRight: -18,
                width: 5, height: 5, borderRadius: '50%', background: 'var(--green)',
              }} />
            )}
            <span>{item.glyph}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button className="mobile-tab-btn" onClick={onLogout} style={{ color: 'var(--accent)' }}>
          <span>{'⏻'}</span>
          <span>OUT</span>
        </button>
      </nav>
    </div>
  )
}
