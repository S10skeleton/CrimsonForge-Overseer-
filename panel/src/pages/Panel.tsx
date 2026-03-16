import { useState } from 'react'
import SystemTab from '../tabs/SystemTab'
import ShopsTab from '../tabs/ShopsTab'
import UsersTab from '../tabs/UsersTab'
import BillingTab from '../tabs/BillingTab'
import ElaraTab from '../tabs/ElaraTab'

type Tab = 'system' | 'shops' | 'users' | 'billing' | 'elara'

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'system',  label: 'System',  icon: '◈' },
  { id: 'shops',   label: 'Shops',   icon: '⬡' },
  { id: 'users',   label: 'Users',   icon: '◉' },
  { id: 'billing', label: 'Billing', icon: '⬨' },
  { id: 'elara',   label: 'Elara',   icon: '⬟' },
]

interface Props { onLogout: () => void }

export default function Panel({ onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('system')

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <div style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg-dark)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '28px 20px 20px' }}>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 18, letterSpacing: 4, lineHeight: 1.15 }} className="grad">
            CRIMSON<br/>FORGE
          </div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 3, color: 'var(--dim)', marginTop: 6 }}>
            OPS CONSOLE
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px 16px' }} />

        <nav style={{ flex: 1, padding: '0 10px' }}>
          {NAV.map(item => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 14px', marginBottom: 2,
                  borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(232,28,46,.1)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--dim)',
                  fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 14,
                  letterSpacing: .5, textAlign: 'left',
                  borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                  transition: 'all .15s',
                }}
              >
                <span style={{ width: 18, textAlign: 'center', color: active ? 'var(--primary)' : 'var(--dim)', fontSize: 16 }}>
                  {item.icon}
                </span>
                {item.label}
                {item.id === 'elara' && (
                  <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
                )}
              </button>
            )
          })}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onLogout}
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Sign Out
          </button>
          <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', opacity: .4, textAlign: 'center', marginTop: 10 }}>
            // OVERSEER v0.3
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
          {tab === 'system'  && <SystemTab />}
          {tab === 'shops'   && <ShopsTab />}
          {tab === 'users'   && <UsersTab />}
          {tab === 'billing' && <BillingTab />}
          {tab === 'elara'   && <ElaraTab />}
        </div>
      </div>
    </div>
  )
}
