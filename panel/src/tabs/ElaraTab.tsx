import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { formatDistanceToNow, format } from 'date-fns'

type SubTab = 'chat' | 'memory' | 'knowledge' | 'parking' | 'checkins' | 'tools'

export default function ElaraTab() {
  const [sub, setSub] = useState<SubTab>('chat')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4 }} className="grad">
            ELARA
          </h1>
          <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>AI Ops Assistant — Online</div>
        </div>
        <div style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot dot-green" style={{ width: 10, height: 10 }} />
          <span style={{ fontSize: 12, color: 'var(--green)', fontFamily: 'Share Tech Mono' }}>ONLINE</span>
        </div>
      </div>

      <div className="subtabs">
        {([
          ['chat', 'Chat'],
          ['memory', 'Memory'],
          ['knowledge', 'Knowledge'],
          ['parking', 'Parking Lot'],
          ['checkins', 'Check-ins'],
          ['tools', 'Tools'],
        ] as [SubTab, string][]).map(([id, label]) => (
          <button key={id} className={`subtab ${sub === id ? 'active' : ''}`} onClick={() => setSub(id)}>
            {label}
          </button>
        ))}
      </div>

      {sub === 'chat'      && <ElaraChat />}
      {sub === 'memory'    && <ElaraMemory />}
      {sub === 'knowledge' && <ElaraKnowledge />}
      {sub === 'parking'   && <ElaraParkingLot />}
      {sub === 'checkins'  && <ElaraCheckins />}
      {sub === 'tools'     && <ElaraTools />}
    </div>
  )
}

// ── Chat ─────────────────────────────────────────────────────────────────────

function ElaraChat() {
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    const newHistory = [...history, { role: 'user' as const, content: msg }]
    setHistory(newHistory)
    setLoading(true)
    try {
      const { response } = await api.elara.chat(msg, history)
      setHistory(prev => [...prev, { role: 'assistant', content: response }])
    } catch (e: any) {
      setHistory(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
      <div className="card" style={{ flex: 1, overflowY: 'auto', marginBottom: 12, padding: 20 }}>
        {history.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '60px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⬟</div>
            <div style={{ fontFamily: 'Orbitron', fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>ELARA READY</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>Ask Elara anything about CFP infrastructure, status, or operations.</div>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} style={{
            marginBottom: 16,
            display: 'flex',
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <div style={{
              fontSize: 11, fontFamily: 'Share Tech Mono',
              color: m.role === 'user' ? 'var(--primary)' : 'var(--accent)',
              paddingTop: 6, flexShrink: 0,
            }}>
              {m.role === 'user' ? 'YOU' : 'ELARA'}
            </div>
            <div style={{
              background: m.role === 'user' ? 'rgba(232,28,46,.08)' : 'var(--bg-dark)',
              border: `1px solid ${m.role === 'user' ? 'rgba(232,28,46,.2)' : 'var(--border)'}`,
              borderRadius: m.role === 'user' ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
              padding: '10px 14px', maxWidth: '75%', fontSize: 14, lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontFamily: 'Share Tech Mono', color: 'var(--accent)', paddingTop: 6 }}>ELARA</div>
            <div style={{ background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '2px 10px 10px 10px', padding: '10px 14px' }}>
              <span className="mono" style={{ color: 'var(--dim)' }}>thinking</span>
              <span style={{ color: 'var(--accent)' }}> ...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Message Elara... (Enter to send, Shift+Enter for newline)"
          rows={2}
          style={{ flex: 1, resize: 'none' }}
        />
        <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()} style={{ alignSelf: 'flex-end' }}>
          Send
        </button>
      </div>
    </div>
  )
}

// ── Memory ───────────────────────────────────────────────────────────────────

function ElaraMemory() {
  const [memory, setMemory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('all')

  useEffect(() => {
    api.elara.memory().then(setMemory).finally(() => setLoading(false))
  }, [])

  const cats = ['all', ...Array.from(new Set(memory.map((m: any) => m.category))).sort()]
  const filtered = memory.filter((m: any) =>
    (cat === 'all' || m.category === cat) &&
    (!search || m.key.toLowerCase().includes(search.toLowerCase()) || m.value.toLowerCase().includes(search.toLowerCase()))
  )

  const catColor: Record<string, string> = {
    health: 'badge-green', work_pattern: 'badge-cyan', preference: 'badge-purple',
    stakeholder: 'badge-yellow', project_decision: 'badge-red', communication: 'badge-cyan',
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input placeholder="Search memory..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 180 }}>
          {cats.map((c: any) => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.replace('_', ' ')}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--dim)', fontSize: 13 }}>{filtered.length} entries</span>
      </div>

      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>Loading memory...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((m: any) => (
            <div key={m.key} className="card card-sm" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className={`badge ${catColor[m.category] ?? 'badge-dim'}`} style={{ flexShrink: 0, marginTop: 1 }}>
                {m.category?.replace('_', ' ')}
              </span>
              <div style={{ flex: 1 }}>
                <div className="mono" style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 4 }}>{m.key}</div>
                <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>{m.value}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', flexShrink: 0, textAlign: 'right' }}>
                {m.learned_at ? formatDistanceToNow(new Date(m.learned_at), { addSuffix: true }) : ''}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ color: 'var(--dim)', padding: 30, textAlign: 'center' }}>No matching entries.</div>}
        </div>
      )}
    </div>
  )
}

// ── Knowledge ────────────────────────────────────────────────────────────────

function ElaraKnowledge() {
  const [knowledge, setKnowledge] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.elara.knowledge().then(setKnowledge).finally(() => setLoading(false))
  }, [])

  const startEdit = (k: any) => {
    setEditing(k.section_key)
    setEditContent(k.content)
  }

  const saveEdit = async (key: string) => {
    setSaving(true)
    try {
      await api.elara.updateKnowledge(key, editContent)
      setKnowledge(prev => prev.map(k => k.section_key === key ? { ...k, content: editContent, updated_at: new Date().toISOString() } : k))
      setEditing(null)
    } catch (e: any) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>Loading knowledge...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {knowledge.map((k: any) => (
            <div key={k.section_key} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>{k.section_key}</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{k.label}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--dim)' }}>
                    {k.updated_at ? `Updated ${formatDistanceToNow(new Date(k.updated_at), { addSuffix: true })}` : ''}
                  </span>
                  {editing === k.section_key ? (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(k.section_key)} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(k)}>Edit</button>
                  )}
                </div>
              </div>
              {editing === k.section_key ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={8}
                  style={{ fontFamily: 'Share Tech Mono', fontSize: 12 }}
                />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
                  {k.content}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Parking Lot ──────────────────────────────────────────────────────────────

function ElaraParkingLot() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'parked' | 'resolved' | 'all'>('parked')
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => {
    api.elara.parkingLot().then(setItems).finally(() => setLoading(false))
  }, [])

  const resolve = async (id: string) => {
    setResolving(id)
    try {
      await api.elara.resolveParkingLot(id)
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved' } : i))
    } finally {
      setResolving(null)
    }
  }

  const shown = items.filter((i: any) => filter === 'all' || i.status === filter)
  const phaseColor: Record<string, string> = {
    phase_a: 'badge-green', phase_b: 'badge-cyan', phase_c: 'badge-purple',
    investor: 'badge-yellow', general: 'badge-dim',
  }
  const prioColor: Record<string, string> = { high: 'badge-red', medium: 'badge-yellow', low: 'badge-dim' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {(['parked', 'resolved', 'all'] as const).map(f => (
          <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--dim)', fontSize: 13 }}>
          {shown.length} items
        </span>
      </div>

      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((i: any) => (
            <div key={i.id} className="card card-sm" style={{ opacity: i.status === 'resolved' ? .5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${phaseColor[i.phase_relevant] ?? 'badge-dim'}`}>{i.phase_relevant?.replace('_', ' ')}</span>
                    <span className={`badge ${prioColor[i.priority] ?? 'badge-dim'}`}>{i.priority}</span>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{i.item}</div>
                  {i.context && <div style={{ fontSize: 13, color: 'var(--dim)' }}>{i.context}</div>}
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6 }}>
                    Added {i.created_at ? formatDistanceToNow(new Date(i.created_at), { addSuffix: true }) : ''}
                  </div>
                </div>
                {i.status === 'parked' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => resolve(i.id)}
                    disabled={resolving === i.id}
                    style={{ flexShrink: 0 }}
                  >
                    {resolving === i.id ? '...' : '✓ Resolve'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {shown.length === 0 && <div style={{ color: 'var(--dim)', padding: 30, textAlign: 'center' }}>Nothing here.</div>}
        </div>
      )}
    </div>
  )
}

// ── Check-ins ────────────────────────────────────────────────────────────────

function ElaraCheckins() {
  const [checkins, setCheckins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.elara.checkins().then(setCheckins).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>Loading check-ins...</div>
      ) : checkins.length === 0 ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>No check-ins configured.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {checkins.map((c: any) => (
            <div key={c.label} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.label?.replace(/_/g, ' ')}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
                    {c.window_start_utc} – {c.window_end_utc} UTC
                  </div>
                </div>
                <span className={`badge ${c.enabled ? 'badge-green' : 'badge-dim'}`}>
                  {c.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--dim)', fontStyle: 'italic' }}>"{c.message}"</div>
              {c.last_fired_at && (
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
                  Last fired {formatDistanceToNow(new Date(c.last_fired_at), { addSuffix: true })}
                </div>
              )}
            </div>
          ))}
          <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 4 }}>
            To update check-in times or messages, tell Elara in the Chat tab or via Slack.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tools Status ─────────────────────────────────────────────────────────────

function ElaraTools() {
  const [tools, setTools] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.elara.tools().then(setTools).finally(() => setLoading(false))
  }, [])

  const green = tools.filter(t => t.status === 'green').length
  const amber = tools.filter(t => t.status === 'amber').length
  const red = tools.filter(t => t.status === 'red').length

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Online', value: green, color: 'var(--green)' },
          { label: 'Warning', value: amber, color: 'var(--yellow)' },
          { label: 'Offline', value: red, color: 'var(--red)' },
        ].map(k => (
          <div key={k.label} className="kpi" style={{ flex: 1 }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>Loading tools...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {tools.map((t: any, i: number) => (
            <div key={t.name} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              <span className={`dot ${t.status === 'green' ? 'dot-green' : t.status === 'red' ? 'dot-red' : 'dot-yellow'}`} />
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', width: 220, flexShrink: 0 }}>{t.name}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--dim)' }}>{t.description}</span>
              {t.note && <span style={{ fontSize: 11, color: 'var(--yellow)', flexShrink: 0 }}>{t.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// suppress unused import warning — format is used in ElaraCheckins
void format
