import { useState, useEffect } from 'react'
import SystemTab  from '../tabs/SystemTab'
import ShopsTab   from '../tabs/ShopsTab'
import UsersTab   from '../tabs/UsersTab'
import BillingTab from '../tabs/BillingTab'
import MessagesTab from '../tabs/MessagesTab'
import AIConfigTab from '../tabs/AIConfigTab'
import ElaraTab   from '../tabs/ElaraTab'

type Tab = 'system' | 'shops' | 'users' | 'billing' | 'messages' | 'aiconfig' | 'elara'

const NAV: { id: Tab; label: string; glyph: string }[] = [
  { id: 'system',   label: 'System',   glyph: '◈' },
  { id: 'shops',    label: 'Shops',    glyph: '⬡' },
  { id: 'users',    label: 'Users',    glyph: '◉' },
  { id: 'billing',  label: 'Billing',  glyph: '⬨' },
  { id: 'messages', label: 'Messages', glyph: '◎' },
  { id: 'aiconfig', label: 'Forge AI', glyph: '⬟' },
  { id: 'elara',    label: 'Elara',    glyph: '⬟' },
]

interface Props { onLogout: () => void }

export default function Panel({ onLogout }: Props) {
  const [tab, setTab]     = useState<Tab>('system')
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 228, flexShrink: 0,
        background: 'var(--bg-dark)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>

        {/* Top gradient bar */}
        <div style={{
          height: 2,
          background: 'linear-gradient(90deg, #EA1823, #8D1845, #5949AC, #4ACCFE)',
          opacity: .6, flexShrink: 0,
        }} />

        {/* Logo area — mini orb */}
        <div style={{ padding: '22px 20px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Mini orb */}
          <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
            <div className="orbit-cw"  style={{ inset: -5 }} />
            <div className="orb-ring ring-1" style={{ inset: 0,  borderWidth: 1.5 }} />
            <div className="orb-ring ring-2" style={{ inset: 8,  borderWidth: 1 }} />
            <div className="orb-ring ring-3" style={{ inset: 14, borderWidth: 1 }} />
            <div className="ring-core" style={{ inset: 20 }} />
          </div>
          <div>
            <div style={{
              fontFamily: 'Orbitron', fontWeight: 900, fontSize: 13, letterSpacing: 3, lineHeight: 1.1,
              background: 'linear-gradient(90deg, #EA1823, #8D1845, #5949AC, #4ACCFE)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              CRIMSON<br />FORGE
            </div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 8, letterSpacing: 2, color: 'var(--dimmer)', marginTop: 3 }}>
              OPS CONSOLE
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px 14px' }} />

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 10px' }}>
          {NAV.map((item, i) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 12px', marginBottom: 2,
                  borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(89,73,172,.12)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--dim)',
                  fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 14,
                  letterSpacing: .5, textAlign: 'left',
                  borderLeft: active
                    ? '2px solid var(--crimson)'
                    : '2px solid transparent',
                  transition: 'all .15s',
                  animation: `slide-right .2s ease ${i * 0.04}s both`,
                }}
              >
                <span style={{
                  width: 18, textAlign: 'center', fontSize: 15,
                  color: active ? 'var(--cyan)' : 'var(--dimmer)',
                  transition: 'color .15s',
                }}>
                  {item.glyph}
                </span>
                {item.label}
                {/* Elara online dot */}
                {item.id === 'elara' && (
                  <span style={{
                    marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--green)',
                    boxShadow: '0 0 8px var(--green)',
                    animation: 'pulse-ring 3s ease-in-out infinite',
                  }} />
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom status block */}
        <div style={{
          margin: '12px 12px 0',
          background: 'rgba(89,73,172,.06)',
          border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--dim)', letterSpacing: 1 }}>
              ELARA ONLINE
            </span>
          </div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--violet)', letterSpacing: 1 }}>
            {clock}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 16px 16px', borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <button
            onClick={onLogout}
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Sign Out
          </button>
          <div style={{
            fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--dimmer)',
            textAlign: 'center', marginTop: 10, letterSpacing: 1,
          }}>
            // OVERSEER v0.3.2
          </div>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowX: 'hidden', overflowY: 'auto' }}>
        {/* Content top bar */}
        <div style={{
          height: 2,
          background: 'linear-gradient(90deg, rgba(89,73,172,.4), rgba(74,204,254,.2), transparent)',
          flexShrink: 0,
        }} />
        <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
          {tab === 'system'   && <SystemTab />}
          {tab === 'shops'    && <ShopsTab />}
          {tab === 'users'    && <UsersTab />}
          {tab === 'billing'  && <BillingTab />}
          {tab === 'messages' && <MessagesTab />}
          {tab === 'aiconfig' && <AIConfigTab />}
          {tab === 'elara'    && <ElaraTab />}
        </div>
      </div>
    </div>
  )
}
