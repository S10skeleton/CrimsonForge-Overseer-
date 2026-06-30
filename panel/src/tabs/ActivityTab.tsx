import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../api'
import type { ActivityEvent } from '../api'

const SEV: Record<string, { color: string; glyph: string }> = {
  info:     { color: 'var(--text-hint)', glyph: '○' },
  success:  { color: 'var(--green)',     glyph: '●' },
  warning:  { color: 'var(--yellow)',    glyph: '▲' },
  critical: { color: 'var(--red-text)',  glyph: '■' },
}

const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'lead.new', label: 'Leads' },
  { value: 'fp.signup', label: 'FP signups' },
  { value: 'payment.success', label: 'Payments' },
  { value: 'payment.failed', label: 'Failures' },
  { value: 'admin.create', label: 'Admin' },
  { value: 'auth.password_reset', label: 'Resets' },
]

function errMsg(e: unknown): string {
  if (e instanceof Error) {
    try { return JSON.parse(e.message).error ?? e.message } catch { return e.message }
  }
  return 'Could not load activity'
}

export default function ActivityTab() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const topId = useRef(0)

  const loadFirst = useCallback(async (t: string) => {
    setLoading(true); setError('')
    try {
      const page = await api.activity.events({ type: t || undefined, limit: 50 })
      setEvents(page.data)
      setCursor(page.meta.next_cursor)
      topId.current = page.data[0]?.id ?? 0
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // (Re)load when the filter changes.
  useEffect(() => { loadFirst(type) }, [type, loadFirst])

  // Poll for new events every 30s and prepend anything newer.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const page = await api.activity.events({ type: type || undefined, limit: 50 })
        const fresh = page.data.filter(e => e.id > topId.current)
        if (fresh.length) {
          setEvents(prev => [...fresh, ...prev])
          topId.current = page.data[0]?.id ?? topId.current
        }
      } catch { /* silent — feed keeps last good state */ }
    }, 30_000)
    return () => clearInterval(t)
  }, [type])

  const loadMore = async () => {
    if (cursor == null) return
    setLoadingMore(true)
    try {
      const page = await api.activity.events({ type: type || undefined, cursor, limit: 50 })
      setEvents(prev => [...prev, ...page.data])
      setCursor(page.meta.next_cursor)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Activity</h1>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
        The in-app twin of <span className="mono">#cf-activity</span> — newest first.
      </div>

      <div className="subtab-row" style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {TYPE_FILTERS.map(f => (
          <button key={f.value} onClick={() => setType(f.value)}
            className={`btn btn-sm ${type === f.value ? 'btn-primary' : 'btn-ghost'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {error && <div style={{ color: 'var(--red-text)' }}>{error}</div>}

      {!loading && !error && events.length === 0 && (
        <div className="card" style={{ color: 'var(--text-muted)' }}>No activity yet.</div>
      )}

      {events.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          {events.map((e, i) => {
            const s = SEV[e.severity] ?? SEV.info
            return (
              <div key={e.id} style={{
                display: 'flex', gap: 12, padding: '13px 18px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}>
                <span style={{ color: s.color, fontSize: 11, marginTop: 3, flexShrink: 0 }}>{s.glyph}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{e.title}</span>
                    <span className="badge badge-dim" style={{ fontSize: 9.5 }}>{e.type}</span>
                  </div>
                  {e.body && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{e.body}</div>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-hint)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {formatDistanceToNow(new Date(e.created_at))} ago
                </span>
              </div>
            )
          })}
        </div>
      )}

      {cursor != null && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
