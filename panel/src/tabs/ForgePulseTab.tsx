import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow, format } from 'date-fns'

interface WaitlistEntry {
  id: string
  email: string
  source: string | null
  created_at: string
}

function sourceLabel(source: string | null): string {
  if (!source) return 'Unknown'
  if (source === 'marketing_site') return 'Marketing Site'
  return source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

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

  // Group by source for breakdown
  const sourceCounts: Record<string, number> = {}
  for (const entry of waitlist) {
    const key = entry.source ?? 'unknown'
    sourceCounts[key] = (sourceCounts[key] ?? 0) + 1
  }

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
          { label: 'Total Signups', value: loading ? '\u2014' : waitlist.length,  color: 'var(--cyan)'  },
          { label: 'Last 7 Days',   value: loading ? '\u2014' : last7d,           color: last7d > 0 ? 'var(--green)' : 'var(--dim)' },
          { label: 'Sources',       value: loading ? '\u2014' : Object.keys(sourceCounts).length, color: 'var(--violet)' },
          { label: 'Status',        value: 'PRE-LAUNCH',                     color: 'var(--yellow)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: k.label === 'Status' ? '0.9rem' : '1.5rem' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Source breakdown */}
      {!loading && Object.keys(sourceCounts).length > 0 && (
        <div style={{ marginBottom: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(sourceCounts).map(([src, count]) => (
            <div key={src} style={{
              padding: '6px 14px', borderRadius: 20,
              border: '1px solid var(--border)',
              background: 'rgba(74,204,254,.06)',
              fontSize: 12, color: 'var(--cyan)',
              fontFamily: 'Share Tech Mono',
            }}>
              {sourceLabel(src)} &middot; {count}
            </div>
          ))}
        </div>
      )}

      {/* Waitlist table */}
      {loading ? (
        <div style={{ color: 'var(--dim)', padding: '40px 0', textAlign: 'center', fontSize: 13 }}>Loading...</div>
      ) : waitlist.length === 0 ? (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 14,
          padding: '48px 32px', textAlign: 'center', background: 'rgba(255,255,255,.02)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>{'\u25CE'}</div>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: 'var(--dim)', marginBottom: 10 }}>
            WAITLIST EMPTY
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.7 }}>
            No ForgePulse signups yet. Once the marketing site goes live and people
            join the waitlist, they'll appear here in real time.
          </div>
        </div>
      ) : (
        <div>
          <div className="section-label" style={{ marginBottom: 12 }}>
            WAITLIST &mdash; {waitlist.length} signup{waitlist.length !== 1 ? 's' : ''}
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {waitlist.map((entry, i) => (
              <div key={entry.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 16,
                padding: '11px 16px',
                borderBottom: i < waitlist.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 13,
                alignItems: 'center',
              }}>
                <div style={{ fontWeight: 600, fontFamily: 'Share Tech Mono', fontSize: 12 }}>
                  {entry.email}
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--cyan)', fontFamily: 'Share Tech Mono',
                  padding: '2px 8px', borderRadius: 4,
                  border: '1px solid rgba(74,204,254,.2)',
                  background: 'rgba(74,204,254,.06)',
                }}>
                  {sourceLabel(entry.source)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}>
                  <div>{format(new Date(entry.created_at), 'MMM d, yyyy')}</div>
                  <div style={{ marginTop: 2 }}>
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
