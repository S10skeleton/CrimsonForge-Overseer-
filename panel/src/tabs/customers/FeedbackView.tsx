/**
 * Shared beta-feedback view (STEP10). CFP and ForgePilot differ only by data
 * source; both render this through the customers shell. Keeps the status-cycle
 * action and type filters; restyled to the light theme with shared badges.
 */
import { useState, useEffect } from 'react'
import { CustomerView, type ProductSlug } from './shared'

export interface FeedbackSource {
  list: () => Promise<any[]>
  updateStatus: (id: string, status: string) => Promise<any>
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  bug:        { label: 'Bug',     cls: 'badge-red' },
  suggestion: { label: 'Idea',    cls: 'badge-cyan' },
  praise:     { label: 'Praise',  cls: 'badge-green' },
  general:    { label: 'General', cls: 'badge-dim' },
}
const STATUS_BADGE: Record<string, string> = {
  new: 'badge-yellow', reviewed: 'badge-cyan', actioned: 'badge-green', dismissed: 'badge-dim',
}

export default function FeedbackView({ role, product, source }: { role: string; product: ProductSlug; source: FeedbackSource }) {
  const [items, setItems]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')
  const readOnly = role !== 'owner'

  const load = () => { setLoading(true); source.list().then(setItems).finally(() => setLoading(false)) }
  useEffect(load, [])

  const cycleStatus = async (id: string, current: string) => {
    if (readOnly) return
    const next = current === 'new' ? 'reviewed' : current === 'reviewed' ? 'actioned' : current === 'actioned' ? 'dismissed' : 'new'
    await source.updateStatus(id, next)
    setItems(prev => prev.map(f => f.id === id ? { ...f, status: next } : f))
  }

  const filtered = items.filter(f => filter === 'all' || f.type === filter)

  return (
    <CustomerView
      title="Feedback"
      product={product}
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['all', 'bug', 'suggestion', 'praise'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="btn btn-ghost btn-sm"
              style={filter === f ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}>
              {f === 'all' ? 'All' : f === 'bug' ? 'Bugs' : f === 'suggestion' ? 'Ideas' : 'Praise'}
            </button>
          ))}
          <button onClick={load} className="btn btn-ghost btn-sm" title="Refresh">↻</button>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No feedback yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(item => {
            const tc = TYPE_BADGE[item.type] ?? TYPE_BADGE.general
            return (
              <div key={item.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span className={`badge ${tc.cls}`}>{tc.label}</span>
                  <button
                    onClick={() => cycleStatus(item.id, item.status)}
                    disabled={readOnly}
                    title={readOnly ? 'Read-only — owner can advance status' : 'Click to advance status'}
                    className={`badge ${STATUS_BADGE[item.status] ?? 'badge-dim'}`}
                    style={{ cursor: readOnly ? 'not-allowed' : 'pointer', width: 'auto' }}
                  >
                    {item.status}
                  </button>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-hint)' }} className="mono">
                    {new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 8 }}>{item.message}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  {item.submitter_name && <span>{item.submitter_name} <span style={{ color: 'var(--text-hint)' }}>({item.submitter_role})</span></span>}
                  {item.shop_name && <span>{item.shop_name}</span>}
                  {item.page_url && <span className="mono">{item.page_url}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CustomerView>
  )
}
