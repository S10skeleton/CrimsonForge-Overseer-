import { useState, useEffect } from 'react'
import { api } from '../api'
import WaitlistTable, { type WaitlistEntry } from '../components/WaitlistTable'
import { CustomerView, MetricCards, fmtNum } from './customers/shared'

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
    <CustomerView title="Waitlist" product="forgepulse">
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -8, marginBottom: 18 }}>
        AutoVault · Vehicle history &amp; ownership intelligence
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: 18, borderRadius: 8, border: '1px solid rgba(220,38,38,.35)', background: 'rgba(220,38,38,.06)', color: 'var(--red-text)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <MetricCards items={[
        { label: 'Total signups', value: loading ? '…' : fmtNum(waitlist.length) },
        { label: 'Last 7 days',   value: loading ? '…' : fmtNum(last7d), accent: last7d > 0 ? 'var(--green)' : undefined },
        { label: 'Sources',       value: loading ? '…' : fmtNum(sourceCount) },
        { label: 'Status',        value: <span className="badge badge-yellow">Pre-launch</span> },
      ]} />

      <WaitlistTable entries={waitlist} loading={loading} product="forgepulse" />
    </CustomerView>
  )
}
