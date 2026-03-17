import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { formatDistanceToNow, format } from 'date-fns'

type SubTab = 'chat' | 'memory' | 'knowledge' | 'parking' | 'checkins' | 'tools'

export default function ElaraTab() {
  const [sub, setSub] = useState<SubTab>('chat')

  return (
    <div>
      {/* Header with full orb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
        {/* Medium orb */}
        <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '1px dashed rgba(89,73,172,.2)', animation: 'orbit-cw 14s linear infinite' }} />
          <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1px dashed rgba(74,204,254,.1)', animation: 'orbit-ccw 22s linear infinite' }} />
          <div className="orb-ring ring-1" style={{ inset: 0,  borderWidth: 2 }} />
          <div className="orb-ring ring-2" style={{ inset: 12, borderWidth: 1.5 }} />
          <div className="orb-ring ring-3" style={{ inset: 22, borderWidth: 1 }} />
          <div className="ring-core" style={{ inset: 32 }} />
        </div>
        <div>
          <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4 }} className="grad">
            ELARA
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', animation: 'pulse-ring 2.5s infinite' }} />
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--green)', letterSpacing: 1 }}>ONLINE</span>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--dim)', marginLeft: 8 }}>
              AI Ops Intelligence v0.3
            </span>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
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

// ── Chat ──────────────────────────────────────────────────────────────────────

type ChatMessage = { role: 'user' | 'assistant'; content: string; via?: 'voice' }

function ElaraChat() {
  const [history, setHistory]         = useState<ChatMessage[]>([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [recording, setRecording]     = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const bottomRef                     = useRef<HTMLDivElement>(null)
  const mediaRecorderRef              = useRef<MediaRecorder | null>(null)
  const chunksRef                     = useRef<Blob[]>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  useEffect(() => {
    setVoiceSupported(
      typeof window !== 'undefined' &&
      typeof window.MediaRecorder !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    )
  }, [])

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setHistory(h => [...h, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const { response } = await api.elara.chat(msg, history)
      setHistory(h => [...h, { role: 'assistant', content: response }])
    } catch (e: any) {
      setHistory(h => [...h, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  const startRecording = async () => {
    if (recording || loading) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setLoading(true)
        try {
          const { transcript, response } = await api.voice.message(audioBlob, history)
          if (transcript) setHistory(h => [...h, { role: 'user', content: transcript, via: 'voice' }])
          if (response)   setHistory(h => [...h, { role: 'assistant', content: response }])
          // if (audioUrl) { const audio = new Audio(audioUrl); audio.play() }
        } catch (e: any) {
          setHistory(h => [...h, { role: 'assistant', content: `Voice error: ${e.message}` }])
        } finally { setLoading(false) }
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch {
      alert('Microphone access denied.')
    }
  }

  const stopRecording = () => {
    if (!recording) return
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setRecording(false)
  }

  return (
    <div className="chat-area" style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
      {/* Message area */}
      <div className="card" style={{ flex: 1, overflowY: 'auto', marginBottom: 12, padding: '20px' }}>
        {history.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            {/* Idle orb */}
            <div style={{ position: 'relative', width: 60, height: 60, margin: '0 auto 20px' }}>
              <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '1px dashed rgba(89,73,172,.2)', animation: 'orbit-cw 12s linear infinite' }} />
              <div className="orb-ring ring-1" style={{ inset: 0,  borderWidth: 1.5 }} />
              <div className="orb-ring ring-2" style={{ inset: 12, borderWidth: 1 }} />
              <div className="ring-core" style={{ inset: 22 }} />
            </div>
            <div style={{ fontFamily: 'Orbitron', fontWeight: 700, letterSpacing: 3, fontSize: 12, marginBottom: 8 }} className="grad">
              ELARA READY
            </div>
            <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6 }}>
              Ask about infrastructure, status, ops, or anything CFP.<br />
              Elara has access to all 30+ monitoring tools.
            </div>
          </div>
        )}

        {history.map((m, i) => (
          <div key={i} style={{
            marginBottom: 16, display: 'flex',
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            gap: 10, alignItems: 'flex-start',
            animation: 'fade-up .2s ease both',
          }}>
            {/* Avatar */}
            {m.role === 'assistant' ? (
              <div style={{ position: 'relative', width: 24, height: 24, flexShrink: 0, marginTop: 4 }}>
                <div className="orb-ring ring-1" style={{ inset: 0, borderWidth: 1 }} />
                <div className="ring-core" style={{ inset: 8 }} />
              </div>
            ) : (
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                background: 'rgba(234,24,35,.2)', border: '1px solid rgba(234,24,35,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--crimson)',
              }}>
                {m.via === 'voice' ? '🎤' : 'U'}
              </div>
            )}
            <div style={{
              background: m.role === 'user'
                ? 'rgba(234,24,35,.07)'
                : 'rgba(89,73,172,.07)',
              border: `1px solid ${m.role === 'user' ? 'rgba(234,24,35,.18)' : 'rgba(89,73,172,.2)'}`,
              borderRadius: m.role === 'user' ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
              padding: '10px 14px', maxWidth: '78%',
              fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap',
            }}>
              {m.via === 'voice' && (
                <span className="voice-badge">voice</span>
              )}
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ position: 'relative', width: 24, height: 24, flexShrink: 0, marginTop: 4 }}>
              <div className="orb-ring ring-1" style={{ inset: 0, borderWidth: 1 }} />
              <div className="ring-core" style={{ inset: 8 }} />
            </div>
            <div style={{
              background: 'rgba(89,73,172,.07)', border: '1px solid rgba(89,73,172,.2)',
              borderRadius: '2px 10px 10px 10px', padding: '12px 16px',
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, .2, .4].map(d => (
                <div key={d} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--violet)', opacity: .7,
                  animation: `pulse-ring 1.2s ease-in-out ${d}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 10 }}>
        {voiceSupported && (
          <button
            className={`mic-btn ${recording ? 'recording' : ''}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={e => { e.preventDefault(); startRecording() }}
            onTouchEnd={e => { e.preventDefault(); stopRecording() }}
            disabled={loading}
            title="Hold to speak"
          >
            🎤
          </button>
        )}
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={recording ? 'Listening...' : 'Message Elara... (Enter to send, Shift+Enter for newline)'}
            rows={2}
            disabled={recording}
            style={{ resize: 'none', paddingRight: 14 }}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={send}
          disabled={loading || recording || !input.trim()}
          style={{ alignSelf: 'flex-end', minWidth: 80 }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Memory ────────────────────────────────────────────────────────────────────

function ElaraMemory() {
  const [memory, setMemory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('all')

  useEffect(() => { api.elara.memory().then(setMemory).finally(() => setLoading(false)) }, [])

  const cats = ['all', ...Array.from(new Set(memory.map(m => m.category))).sort()]
  const filtered = memory.filter(m =>
    (cat === 'all' || m.category === cat) &&
    (!search || m.key.toLowerCase().includes(search.toLowerCase()) || m.value.toLowerCase().includes(search.toLowerCase()))
  )

  const catColor: Record<string, string> = {
    health: 'badge-green', work_pattern: 'badge-cyan', preference: 'badge-purple',
    stakeholder: 'badge-yellow', project_decision: 'badge-crimson', communication: 'badge-cyan',
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input placeholder="Search memory..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 200 }}>
          {cats.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.replace(/_/g, ' ')}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--dim)', fontSize: 13 }}>{filtered.length} entries</span>
      </div>
      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>LOADING MEMORY...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(m => (
            <div key={m.key} className="card card-sm" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className={`badge ${catColor[m.category] ?? 'badge-dim'}`} style={{ flexShrink: 0, marginTop: 1 }}>
                {m.category?.replace(/_/g, ' ')}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: 'var(--cyan)', marginBottom: 4 }}>{m.key}</div>
                <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>{m.value}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--dimmer)', flexShrink: 0, fontFamily: 'Share Tech Mono' }}>
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

// ── Knowledge ─────────────────────────────────────────────────────────────────

function ElaraKnowledge() {
  const [knowledge, setKnowledge] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving]       = useState(false)

  useEffect(() => { api.elara.knowledge().then(setKnowledge).finally(() => setLoading(false)) }, [])

  const startEdit = (k: any) => { setEditing(k.section_key); setEditContent(k.content) }

  const saveEdit = async (key: string) => {
    setSaving(true)
    try {
      await api.elara.updateKnowledge(key, editContent)
      setKnowledge(prev => prev.map(k => k.section_key === key ? { ...k, content: editContent, updated_at: new Date().toISOString() } : k))
      setEditing(null)
    } catch (e: any) { alert(`Save failed: ${e.message}`) }
    finally { setSaving(false) }
  }

  return (
    <div>
      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>LOADING KNOWLEDGE...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {knowledge.map(k => (
            <div key={k.section_key} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--cyan)', marginBottom: 4 }}>{k.section_key}</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{k.label}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {k.updated_at && <span style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono' }}>{formatDistanceToNow(new Date(k.updated_at), { addSuffix: true })}</span>}
                  {editing === k.section_key ? (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(k.section_key)} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(k)}>Edit</button>
                  )}
                </div>
              </div>
              {editing === k.section_key ? (
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={8} style={{ fontFamily: 'Share Tech Mono', fontSize: 12 }} />
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

// ── Parking Lot ───────────────────────────────────────────────────────────────

function ElaraParkingLot() {
  const [items, setItems]       = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'parked' | 'resolved' | 'all'>('parked')
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => { api.elara.parkingLot().then(setItems).finally(() => setLoading(false)) }, [])

  const resolve = async (id: string) => {
    setResolving(id)
    try {
      await api.elara.resolveParkingLot(id)
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved' } : i))
    } finally { setResolving(null) }
  }

  const shown = items.filter(i => filter === 'all' || i.status === filter)
  const phaseColor: Record<string, string> = {
    phase_a: 'badge-green', phase_b: 'badge-cyan', phase_c: 'badge-purple',
    phase_d: 'badge-violet', investor: 'badge-yellow', general: 'badge-dim',
  }
  const prioColor: Record<string, string> = { high: 'badge-crimson', medium: 'badge-yellow', low: 'badge-dim' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {(['parked', 'resolved', 'all'] as const).map(f => (
          <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--dim)', fontSize: 13 }}>{shown.length} items</span>
      </div>
      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>LOADING...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(i => (
            <div key={i.id} className="card card-sm" style={{ opacity: i.status === 'resolved' ? .45 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${phaseColor[i.phase_relevant] ?? 'badge-dim'}`}>{i.phase_relevant?.replace(/_/g, ' ')}</span>
                    <span className={`badge ${prioColor[i.priority] ?? 'badge-dim'}`}>{i.priority}</span>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{i.item}</div>
                  {i.context && <div style={{ fontSize: 13, color: 'var(--dim)' }}>{i.context}</div>}
                  {i.created_at && <div style={{ fontSize: 11, color: 'var(--dimmer)', marginTop: 6, fontFamily: 'Share Tech Mono' }}>{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</div>}
                </div>
                {i.status === 'parked' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => resolve(i.id)} disabled={resolving === i.id} style={{ flexShrink: 0 }}>
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

// ── Check-ins ─────────────────────────────────────────────────────────────────

function ElaraCheckins() {
  const [checkins, setCheckins] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { api.elara.checkins().then(setCheckins).finally(() => setLoading(false)) }, [])

  return (
    <div>
      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>LOADING...</div>
      ) : checkins.length === 0 ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>No check-ins configured.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {checkins.map((c: any) => (
            <div key={c.label} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{c.label?.replace(/_/g, ' ')}</div>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: 'var(--dim)' }}>{c.window_start_utc} – {c.window_end_utc} UTC</div>
                </div>
                <span className={`badge ${c.enabled ? 'badge-green' : 'badge-dim'}`}>{c.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--dim)', fontStyle: 'italic' }}>"{c.message}"</div>
              {c.last_fired_at && <div style={{ fontSize: 11, color: 'var(--dimmer)', marginTop: 8, fontFamily: 'Share Tech Mono' }}>Last fired {formatDistanceToNow(new Date(c.last_fired_at), { addSuffix: true })}</div>}
            </div>
          ))}
          <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 4 }}>To update check-ins, tell Elara in the Chat tab or via Slack.</div>
        </div>
      )}
    </div>
  )
}

// ── Tools ─────────────────────────────────────────────────────────────────────

function ElaraTools() {
  const [tools, setTools]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.elara.tools().then(setTools).finally(() => setLoading(false)) }, [])

  const green = tools.filter(t => t.status === 'green').length
  const amber = tools.filter(t => t.status === 'amber').length
  const red   = tools.filter(t => t.status === 'red').length

  const statusColor = (s: string) => s === 'green' ? 'var(--green)' : s === 'red' ? 'var(--red)' : 'var(--yellow)'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Online',  value: green, color: 'var(--green)' },
          { label: 'Warning', value: amber, color: 'var(--yellow)' },
          { label: 'Offline', value: red,   color: 'var(--red)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>
      {loading ? (
        <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>LOADING TOOLS...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {tools.map((t, i) => (
            <div key={t.name} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              transition: 'background .15s',
            }}>
              {/* Hex status */}
              <div style={{ width: 20, height: 20, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <polygon points="10,1 18,5.5 18,14.5 10,19 2,14.5 2,5.5" fill={`${statusColor(t.status)}18`} stroke={statusColor(t.status)} strokeWidth="1" />
                </svg>
                <div style={{ position: 'absolute', width: 5, height: 5, borderRadius: '50%', background: statusColor(t.status), boxShadow: `0 0 5px ${statusColor(t.status)}` }} />
              </div>
              <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--cyan)', width: 200, flexShrink: 0 }}>{t.name}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--dim)' }}>{t.description}</span>
              {t.note && <span style={{ fontSize: 11, color: 'var(--yellow)', flexShrink: 0, fontFamily: 'Share Tech Mono' }}>{t.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// suppress unused import warning
void format
