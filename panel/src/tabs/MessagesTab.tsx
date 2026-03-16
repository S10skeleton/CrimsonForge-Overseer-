import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow, format } from 'date-fns'

type MsgType = 'info' | 'warning' | 'maintenance' | 'feature'

interface SysMessage {
  id: string
  title: string
  body: string
  type: MsgType
  active: boolean
  expires_at: string | null
  created_at: string
}

const TYPE_CONFIG: Record<MsgType, { label: string; color: string; border: string; bg: string }> = {
  info:        { label: 'Info',        color: '#00c4d4', border: 'rgba(0,196,212,.3)',   bg: 'rgba(0,196,212,.08)'   },
  warning:     { label: 'Warning',     color: '#eab308', border: 'rgba(234,179,8,.3)',   bg: 'rgba(234,179,8,.08)'   },
  maintenance: { label: 'Maintenance', color: '#ef4444', border: 'rgba(239,68,68,.3)',   bg: 'rgba(239,68,68,.08)'   },
  feature:     { label: 'Feature',     color: '#22c55e', border: 'rgba(34,197,94,.3)',   bg: 'rgba(34,197,94,.08)'   },
}

const EMPTY_FORM = { title: '', body: '', type: 'info' as MsgType, active: false, expires_at: '' }

export default function MessagesTab() {
  const [messages, setMessages]     = useState<SysMessage[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState<SysMessage | null>(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError]           = useState('')

  const load = () => {
    setLoading(true)
    api.cfp.messages()
      .then(setMessages)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  const openEdit = (msg: SysMessage) => {
    setEditing(msg)
    setForm({
      title:      msg.title,
      body:       msg.body,
      type:       msg.type,
      active:     msg.active,
      expires_at: msg.expires_at ? msg.expires_at.slice(0, 10) : '',
    })
    setError('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and message body are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        title:      form.title.trim(),
        body:       form.body.trim(),
        type:       form.type,
        active:     form.active,
        expires_at: form.expires_at || null,
      }
      if (editing) {
        await api.cfp.updateMessage(editing.id, payload)
        setMessages(prev => prev.map(m => m.id === editing.id ? { ...m, ...payload } : m))
      } else {
        const result = await api.cfp.createMessage(payload)
        setMessages(prev => [result.message, ...prev])
      }
      closeModal()
    } catch (e: any) {
      setError(e.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (msg: SysMessage) => {
    setTogglingId(msg.id)
    try {
      await api.cfp.updateMessage(msg.id, { active: !msg.active })
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, active: !m.active } : m))
    } catch (e: any) {
      setError(e.message ?? 'Toggle failed')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this message? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.cfp.deleteMessage(id)
      setMessages(prev => prev.filter(m => m.id !== id))
    } catch (e: any) {
      setError(e.message ?? 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const activeCount = messages.filter(m => m.active).length
  const draftCount  = messages.filter(m => !m.active).length
  const totalCount  = messages.length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 4 }} className="grad">
            SYSTEM MESSAGES
          </h1>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>
            Push platform-wide notices to all shops and users.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Message</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total',    value: totalCount,  color: 'var(--text)' },
          { label: 'Live Now', value: activeCount,  color: activeCount > 0 ? 'var(--green)' : 'var(--dim)' },
          { label: 'Staged',   value: draftCount,   color: draftCount  > 0 ? 'var(--yellow)' : 'var(--dim)' },
        ].map(k => (
          <div key={k.label} className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      {draftCount > 0 && !loading && (
        <div style={{
          padding: '12px 18px', borderRadius: 8, marginBottom: 20,
          border: '1px solid rgba(234,179,8,.3)', background: 'rgba(234,179,8,.06)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span className="dot dot-yellow" style={{ width: 10, height: 10, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--yellow)' }}>
            <strong>{draftCount} message{draftCount !== 1 ? 's' : ''} staged</strong>
            {' '}— ready to fire. Hit <strong>Activate</strong> the moment you need it live.
          </span>
        </div>
      )}

      {error && !showModal && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)',
          fontSize: 13, color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--dim)', padding: '40px 0', textAlign: 'center' }}>Loading...</div>
      ) : messages.length === 0 ? (
        <div style={{
          color: 'var(--dim)', padding: '60px 0', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>
          <div style={{ fontFamily: 'Orbitron', fontSize: 12, letterSpacing: 2 }}>NO MESSAGES YET</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>
            Create one now and keep it staged — activate instantly when you need it.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map(msg => {
            const cfg = TYPE_CONFIG[msg.type] ?? TYPE_CONFIG.info
            const isToggling = togglingId === msg.id
            const isDeleting = deletingId === msg.id

            return (
              <div key={msg.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${msg.active ? cfg.border : 'var(--border)'}`,
                borderRadius: 10, padding: '16px 20px',
                boxShadow: msg.active ? `0 0 20px ${cfg.bg}` : 'none',
                transition: 'all .2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ paddingTop: 4, flexShrink: 0 }}>
                    <span
                      className={`dot ${msg.active ? 'dot-green' : 'dot-dim'}`}
                      style={{ width: 10, height: 10 }}
                      title={msg.active ? 'Live — visible to all shops' : 'Staged — not visible yet'}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{msg.title}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5,
                        padding: '2px 8px', borderRadius: 4,
                        border: `1px solid ${cfg.border}`, background: cfg.bg, color: cfg.color,
                      }}>
                        {cfg.label}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5,
                        padding: '2px 8px', borderRadius: 4,
                        border: msg.active ? '1px solid rgba(34,197,94,.3)' : '1px solid rgba(255,255,255,.1)',
                        background: msg.active ? 'rgba(34,197,94,.1)' : 'rgba(255,255,255,.04)',
                        color: msg.active ? 'var(--green)' : 'var(--dim)',
                      }}>
                        {msg.active ? '● Live' : '○ Staged'}
                      </span>
                    </div>

                    <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 8 }}>
                      {msg.body}
                    </p>

                    <div style={{ fontSize: 11, color: 'var(--dim)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>Created {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
                      {msg.expires_at && (
                        <span>Expires {format(new Date(msg.expires_at), 'MMM d, yyyy')}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggleActive(msg)}
                      disabled={isToggling}
                      style={{
                        padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                        fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 13, letterSpacing: .5,
                        border: '1px solid', transition: 'all .15s', opacity: isToggling ? .5 : 1,
                        ...(msg.active
                          ? { background: 'rgba(239,68,68,.1)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }
                          : { background: 'rgba(34,197,94,.1)', borderColor: 'rgba(34,197,94,.3)', color: 'var(--green)' }
                        ),
                      }}
                    >
                      {isToggling ? '...' : msg.active ? 'Deactivate' : '⚡ Activate'}
                    </button>

                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(msg)}>Edit</button>

                    <button
                      onClick={() => handleDelete(msg.id)}
                      disabled={isDeleting}
                      style={{
                        padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                        fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 12,
                        border: '1px solid rgba(239,68,68,.2)',
                        background: 'transparent', color: 'var(--red)',
                        opacity: isDeleting ? .4 : .6, transition: 'opacity .15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = isDeleting ? '.4' : '.6')}
                    >
                      {isDeleting ? '...' : '✕'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,.75)', padding: 16,
        }}>
          <div style={{
            width: '100%', maxWidth: 480,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 16, letterSpacing: 3 }} className="grad">
                {editing ? 'EDIT MESSAGE' : 'NEW MESSAGE'}
              </div>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontSize: 22, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--dim)', marginBottom: 6 }}>
                  Title *
                </label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Scheduled Maintenance Tonight"
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--dim)', marginBottom: 6 }}>
                  Message *
                </label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={3}
                  placeholder="Details shown to shops and users..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--dim)', marginBottom: 6 }}>
                    Type
                  </label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as MsgType }))}>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="feature">Feature</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--dim)', marginBottom: 6 }}>
                    Expires (optional)
                  </label>
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                  border: `1px solid ${form.active ? 'rgba(34,197,94,.3)' : 'var(--border)'}`,
                  background: form.active ? 'rgba(34,197,94,.06)' : 'rgba(255,255,255,.02)',
                }}
                onClick={() => setForm(f => ({ ...f, active: !f.active }))}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                    {form.active ? '● Live immediately' : '○ Save as staged draft'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                    {form.active ? 'Will be visible to all shops right now' : 'Hidden — activate later with one click'}
                  </div>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative', transition: 'background .2s',
                  background: form.active ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'rgba(255,255,255,.1)',
                  border: form.active ? 'none' : '1px solid var(--border)',
                }}>
                  <div style={{
                    position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
                    background: 'white', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                    left: form.active ? 'calc(100% - 21px)' : '3px',
                  }} />
                </div>
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: 14, padding: '8px 12px', borderRadius: 6,
                border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)',
                fontSize: 13, color: 'var(--red)',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.body.trim()}
              >
                {saving ? 'Saving...' : editing ? 'Save Changes' : form.active ? 'Create & Go Live' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
