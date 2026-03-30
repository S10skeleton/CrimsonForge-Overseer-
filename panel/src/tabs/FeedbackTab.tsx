import { useState, useEffect } from 'react'
import { api } from '../api'

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  bug:        { label: 'Bug',     color: '#ef4444' },
  suggestion: { label: 'Idea',    color: 'var(--cyan)' },
  praise:     { label: 'Praise',  color: 'var(--green)' },
  general:    { label: 'General', color: 'var(--dim)' },
}
const STATUS_COLOR: Record<string, string> = {
  new: 'var(--yellow)', reviewed: 'var(--cyan)', actioned: 'var(--green)', dismissed: 'var(--dim)',
}

export default function FeedbackTab() {
  const [items, setItems]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')

  const load = () => {
    setLoading(true)
    api.cfp.feedback().then(setItems).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const cycleStatus = async (id: string, current: string) => {
    const next = current === 'new' ? 'reviewed' : current === 'reviewed' ? 'actioned' : current === 'actioned' ? 'dismissed' : 'new'
    await api.cfp.updateFeedback(id, next)
    setItems(prev => prev.map(f => f.id === id ? { ...f, status: next } : f))
  }

  const filtered = items.filter(f => filter === 'all' || f.type === filter)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4 }} className="grad">BETA FEEDBACK</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['all','bug','suggestion','praise'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="btn btn-ghost btn-sm"
              style={filter === f ? { borderColor: 'var(--violet)', color: 'var(--violet)', background: 'rgba(89,73,172,.1)' } : {}}
            >
              {f === 'all' ? 'All' : f === 'bug' ? 'Bugs' : f === 'suggestion' ? 'Ideas' : 'Praise'}
            </button>
          ))}
          <button onClick={load} className="btn btn-ghost btn-sm">{'\u21BB'}</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--dim)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--dim)' }}>No feedback yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(item => {
            const tc = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.general
            return (
              <div key={item.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: .5, background: `${tc.color}18`, color: tc.color, border: `1px solid ${tc.color}40` }}>
                    {tc.label}
                  </span>
                  <span
                    onClick={() => cycleStatus(item.id, item.status)}
                    title="Click to advance status"
                    style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: .5, cursor: 'pointer', background: 'transparent', color: STATUS_COLOR[item.status] ?? 'var(--dim)', border: `1px solid ${STATUS_COLOR[item.status] ?? 'var(--border)'}` }}
                  >
                    {item.status}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono' }}>
                    {new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 8 }}>{item.message}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--dim)', flexWrap: 'wrap' }}>
                  {item.submitter_name && <span>{item.submitter_name} <span style={{ color: 'var(--dimmer)' }}>({item.submitter_role})</span></span>}
                  {item.shop_name && <span>{item.shop_name}</span>}
                  {item.page_url && <span style={{ fontFamily: 'Share Tech Mono' }}>{item.page_url}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
