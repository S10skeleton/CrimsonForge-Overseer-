import { useState, useEffect } from 'react'
import SystemTab             from '../tabs/SystemTab'
import ShopsTab              from '../tabs/ShopsTab'
import UsersTab              from '../tabs/UsersTab'
import BillingTab            from '../tabs/BillingTab'
import MessagesTab           from '../tabs/MessagesTab'
import AIConfigTab           from '../tabs/AIConfigTab'
import ElaraTab              from '../tabs/ElaraTab'
import LeadsTab              from '../tabs/LeadsTab'
import FeedbackTab           from '../tabs/FeedbackTab'
import ForgePilotTab         from '../tabs/ForgePilotTab'
import ForgePilotBillingTab  from '../tabs/ForgePilotBillingTab'
import ForgePilotMessagesTab from '../tabs/ForgePilotMessagesTab'
import ForgePulseTab         from '../tabs/ForgePulseTab'

type Tab =
  | 'elara' | 'system'
  | 'shops' | 'users' | 'billing' | 'messages' | 'leads' | 'feedback' | 'aiconfig'
  | 'forgepilot' | 'fp-billing' | 'fp-messages'
  | 'forgepulse'

// --- Product group definitions ------------------------------------------------

interface NavItem { id: Tab; label: string; glyph: string }

const GLOBAL_NAV: NavItem[] = [
  { id: 'elara',  label: 'Elara',  glyph: '\u2B1F' },
  { id: 'system', label: 'System', glyph: '\u25C8' },
]

interface ProductGroup {
  id: string
  label: string
  accent: string   // CSS color for the group header
  items: NavItem[]
}

const PRODUCT_GROUPS: ProductGroup[] = [
  {
    id: 'cfp',
    label: 'CrimsonForge Pro',
    accent: '#EA1823',
    items: [
      { id: 'shops',    label: 'Shops',    glyph: '\u2B21' },
      { id: 'leads',    label: 'Leads',    glyph: '\u25C7' },
      { id: 'users',    label: 'Users',    glyph: '\u25C9' },
      { id: 'billing',  label: 'Billing',  glyph: '\u2B28' },
      { id: 'messages', label: 'Messages', glyph: '\u25CE' },
      { id: 'feedback', label: 'Feedback', glyph: '\u25C8' },
      { id: 'aiconfig', label: 'Forge AI', glyph: '\u2B1F' },
    ],
  },
  {
    id: 'fp',
    label: 'ForgePilot',
    accent: '#4ACCFE',
    items: [
      { id: 'forgepilot', label: 'Overview', glyph: '\u25C8' },
      { id: 'fp-billing', label: 'Billing',  glyph: '\u2B28' },
      { id: 'fp-messages', label: 'Messages', glyph: '\u25CE' },
    ],
  },
  {
    id: 'pulse',
    label: 'ForgePulse',
    accent: '#8D1845',
    items: [
      { id: 'forgepulse', label: 'Overview', glyph: '\u25CE' },
    ],
  },
]

// Mobile nav — 5 priority items + sign out
// FP billing is the revenue focus during launch; CFP billing accessible on desktop
const MOBILE_NAV: { id: Tab; glyph: string; label: string; dot?: string }[] = [
  { id: 'elara',      glyph: '\u2B1F', label: 'ELARA'   },
  { id: 'system',     glyph: '\u25C8', label: 'SYSTEM'  },
  { id: 'forgepilot', glyph: '\u25C8', label: 'PILOT'   , dot: '#4ACCFE' },
  { id: 'fp-billing', glyph: '\u2B28', label: 'FP $$$'  , dot: '#4ACCFE' },
  { id: 'shops',      glyph: '\u2B21', label: 'CFP'     , dot: '#EA1823' },
]

interface Props { onLogout: () => void }

export default function Panel({ onLogout }: Props) {
  const [tab,        setTab]        = useState<Tab>('system')
  const [clock,      setClock]      = useState('')
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    // Landing on System; FP group open as launch priority
    new Set(['fp'])
  )

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // When navigating to a tab inside a closed group, auto-open that group
  function navigateTo(tabId: Tab) {
    setTab(tabId)
    for (const group of PRODUCT_GROUPS) {
      if (group.items.some(i => i.id === tabId)) {
        setOpenGroups(prev => new Set([...prev, group.id]))
        break
      }
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* -- Desktop Sidebar ------------------------------------------------ */}
      <div className="desktop-sidebar" style={{
        width: 228, flexShrink: 0,
        background: 'var(--bg-dark)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        <div style={{ height: 2, background: 'linear-gradient(90deg, #EA1823, #8D1845, #5949AC, #4ACCFE)', opacity: .6, flexShrink: 0 }} />

        {/* Logo */}
        <div style={{ padding: '22px 20px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
            <div className="orbit-cw"  style={{ inset: -5 }} />
            <div className="orb-ring ring-1" style={{ inset: 0,  borderWidth: 1.5 }} />
            <div className="orb-ring ring-2" style={{ inset: 8,  borderWidth: 1   }} />
            <div className="orb-ring ring-3" style={{ inset: 14, borderWidth: 1   }} />
            <div style={{
              position: 'absolute', inset: 20,
              borderRadius: '50%', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img src="/elara-logo.png" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
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

        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px 10px' }} />

        <nav style={{ flex: 1, padding: '0 10px' }}>

          {/* Global items (Elara, System) */}
          {GLOBAL_NAV.map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 12px', marginBottom: 2,
                  borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(89,73,172,.12)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--dim)',
                  fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 14,
                  letterSpacing: .5, textAlign: 'left',
                  borderLeft: active ? '2px solid var(--crimson)' : '2px solid transparent',
                  transition: 'all .15s',
                }}
              >
                <span style={{ width: 18, textAlign: 'center', fontSize: 15, color: active ? 'var(--cyan)' : 'var(--dimmer)' }}>
                  {item.glyph}
                </span>
                {item.label}
                {item.id === 'elara' && (
                  <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', animation: 'pulse-ring 3s ease-in-out infinite' }} />
                )}
              </button>
            )
          })}

          <div style={{ height: 1, background: 'var(--border)', margin: '8px 4px 6px' }} />

          {/* Product groups */}
          {PRODUCT_GROUPS.map((group) => {
            const isOpen = openGroups.has(group.id)
            const groupActive = group.items.some(i => i.id === tab)

            return (
              <div key={group.id} style={{ marginBottom: 4 }}>

                {/* Group header - clickable toggle */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '7px 10px 7px 12px',
                    borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: groupActive && !isOpen ? 'rgba(89,73,172,.08)' : 'transparent',
                    textAlign: 'left',
                  }}
                >
                  {/* Colored accent dot */}
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: group.accent,
                    boxShadow: groupActive ? `0 0 8px ${group.accent}` : 'none',
                    opacity: groupActive ? 1 : 0.5,
                  }} />
                  <span style={{
                    fontFamily: 'Share Tech Mono', fontSize: 9, letterSpacing: 2,
                    color: groupActive ? 'var(--text)' : 'var(--dimmer)',
                    textTransform: 'uppercase', flex: 1,
                  }}>
                    {group.label}
                  </span>
                  {/* Chevron */}
                  <span style={{
                    fontSize: 9, color: 'var(--dimmer)',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform .2s',
                    display: 'inline-block',
                  }}>
                    {'\u25B6'}
                  </span>
                </button>

                {/* Group items */}
                {isOpen && (
                  <div style={{ paddingLeft: 8, marginBottom: 4 }}>
                    {group.items.map((item) => {
                      const active = tab === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigateTo(item.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            width: '100%', padding: '8px 12px', marginBottom: 1,
                            borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: active ? 'rgba(89,73,172,.12)' : 'transparent',
                            color: active ? 'var(--text)' : 'var(--dim)',
                            fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 13,
                            letterSpacing: .5, textAlign: 'left',
                            borderLeft: active ? `2px solid ${group.accent}` : '2px solid transparent',
                            transition: 'all .15s',
                          }}
                        >
                          <span style={{ width: 16, textAlign: 'center', fontSize: 13, color: active ? group.accent : 'var(--dimmer)' }}>
                            {item.glyph}
                          </span>
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Elara status + clock */}
        <div style={{ margin: '12px 12px 0', background: 'rgba(89,73,172,.06)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--dim)', letterSpacing: 1 }}>ELARA ONLINE</span>
          </div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--violet)', letterSpacing: 1 }}>{clock}</div>
        </div>

        <div style={{ padding: '14px 16px 16px', borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <button onClick={onLogout} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            Sign Out
          </button>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--dimmer)', textAlign: 'center', marginTop: 10, letterSpacing: 1 }}>
            // OVERSEER v0.4.0
          </div>
        </div>
      </div>

      {/* -- Main content --------------------------------------------------- */}
      <div style={{ flex: 1, overflowX: 'hidden', overflowY: 'auto' }}>
        <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(89,73,172,.4), rgba(74,204,254,.2), transparent)' }} />
        <div className="panel-main" style={{ padding: '32px 36px', maxWidth: 1200 }}>
          {tab === 'system'     && <SystemTab />}
          {tab === 'shops'      && <ShopsTab />}
          {tab === 'users'      && <UsersTab />}
          {tab === 'billing'    && <BillingTab />}
          {tab === 'messages'   && <MessagesTab />}
          {tab === 'leads'      && <LeadsTab />}
          {tab === 'feedback'   && <FeedbackTab />}
          {tab === 'aiconfig'   && <AIConfigTab />}
          {tab === 'elara'      && <ElaraTab />}
          {tab === 'forgepilot' && <ForgePilotTab />}
          {tab === 'fp-billing' && <ForgePilotBillingTab />}
          {tab === 'fp-messages' && <ForgePilotMessagesTab />}
          {tab === 'forgepulse' && <ForgePulseTab />}
        </div>
      </div>

      {/* -- Mobile Bottom Tab Bar ------------------------------------------ */}
      <nav className="mobile-tabs">
        {MOBILE_NAV.map(item => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              className={`mobile-tab-btn ${active ? 'active' : ''}`}
              onClick={() => navigateTo(item.id)}
              style={active && item.dot ? { color: item.dot } : undefined}
            >
              {/* Elara live dot */}
              {item.id === 'elara' && (
                <div style={{
                  position: 'absolute', top: 6, right: '50%', marginRight: -18,
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--green)', boxShadow: '0 0 6px var(--green)',
                }} />
              )}
              <span style={active && item.dot ? { color: item.dot } : undefined}>
                {item.glyph}
              </span>
              <span>{item.label}</span>
              {/* Product accent dot */}
              {item.dot && (
                <div style={{
                  position: 'absolute', bottom: 6, left: '50%', marginLeft: -2,
                  width: 4, height: 4, borderRadius: '50%',
                  background: item.dot,
                  opacity: active ? 1 : 0.3,
                }} />
              )}
            </button>
          )
        })}
        <button className="mobile-tab-btn" onClick={onLogout} style={{ color: 'var(--crimson)' }}>
          <span>{'\u23FB'}</span>
          <span>OUT</span>
        </button>
      </nav>
    </div>
  )
}
