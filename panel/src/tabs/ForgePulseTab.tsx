import { useState, useEffect } from 'react'
import { api } from '../api'
import WaitlistTable, { type WaitlistEntry } from '../components/WaitlistTable'

export default function ForgePulseTab() {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    api.cfp.forgePulseWaitlist()
      .then(setWaitlist)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const sourceCount = new Set(waitlist.map(e => e.source ?? 'unknown')).size
  const last7d = waitlist.filter(
    e => new Date(e.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length

  return (
    <div>
      <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 6 }} className="grad">
        FORGEPULSE
      </h1>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 28 }}>
        AutoVault &middot; Vehicle history &amp; ownership intelligence
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: 20, borderRadius: 8, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.05)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        {[
          { label: 'Total Signups', value: loading ? '—' : waitlist.length, color: 'var(--cyan)'  },
          { label: 'Last 7 Days',   value: loading ? '—' : last7d,           color: last7d > 0 ? 'var(--green)' : 'var(--dim)' },
          { label: 'Sources',       value: loading ? '—' : sourceCount,      color: 'var(--violet)' },
          { label: 'Status',        value: 'PRE-LAUNCH',                     color: 'var(--yellow)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: k.label === 'Status' ? '0.9rem' : '1.5rem' }}>{k.value}</div>
          </div>
        ))}
      </div>

      <WaitlistTable entries={waitlist} loading={loading} product="forgepulse" />
    </div>
  )
}
