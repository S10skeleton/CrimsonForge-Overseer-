/**
 * Shared system-messages view (STEP10). CFP and ForgePilot are identical except
 * their data source, so both tabs render this through the customers shell.
 * Keeps all CRUD + owner-gated actions; just unified + restyled to the light theme.
 */
import { useState, useEffect } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { useConfirm } from '../../components/ConfirmDialog'
import { CustomerView, MetricCards, type ProductSlug } from './shared'

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

export interface MessagesSource {
  list: () => Promise<any[]>
  create: (payload: any) => Promise<any>
  update: (id: string, payload: any) => Promise<any>
  remove: (id: string) => Promise<any>
}

const TYPE_BADGE: Record<MsgType, { label: string; cls: string }> = {
  info:        { label: 'Info',        cls: 'badge-cyan' },
  warning:     { label: 'Warning',     cls: 'badge-yellow' },
  maintenance: { label: 'Maintenance', cls: 'badge-red' },
  feature:     { label: 'Feature',     cls: 'badge-green' },
}

const EMPTY_FORM = { title: '', body: '', type: 'info' as MsgType, active: false, expires_at: '' }

export default function MessagesView({ role, product, source }: { role: string; product: ProductSlug; source: MessagesSource }) {
  const readOnly = role !== 'owner'
  const confirm = useConfirm()
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
    source.list().then(setMessages).catch(e => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setError(''); setShowModal(true) }
  const openEdit = (msg: SysMessage) => {
    setEditing(msg)
    setForm({ title: msg.title, body: msg.body, type: msg.type, active: msg.active, expires_at: msg.expires_at ? msg.expires_at.slice(0, 10) : '' })
    setError(''); setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); setEditing(null); setForm(EMPTY_FORM); setError('') }

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) { setError('Title and message body are required.'); return }
    setSaving(true); setError('')
    try {
      const payload = { title: form.title.trim(), body: form.body.trim(), type: form.type, active: form.active, expires_at: form.expires_at || null }
      if (editing) {
        await source.update(editing.id, payload)
        setMessages(prev => prev.map(m => m.id === editing.id ? { ...m, ...payload } : m))
      } else {
        const result = await source.create(payload)
        setMessages(prev => [result.message, ...prev])
      }
      closeModal()
    } catch (e: any) { setError(e.message ?? 'Save failed') } finally { setSaving(false) }
  }

  const handleToggleActive = async (msg: SysMessage) => {
    setTogglingId(msg.id)
    try {
      await source.update(msg.id, { active: !msg.active })
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, active: !m.active } : m))
    } catch (e: any) { setError(e.message ?? 'Toggle failed') } finally { setTogglingId(null) }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: 'Delete this message?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    setDeletingId(id)
    try {
      await source.remove(id)
      setMessages(prev => prev.filter(m => m.id !== id))
    } catch (e: any) { setError(e.message ?? 'Delete failed') } finally { setDeletingId(null) }
  }

  const activeCount = messages.filter(m => m.active).length
  const draftCount  = messages.filter(m => !m.active).length

  return (
    <CustomerView
      title="Messages"
      product={product}
      actions={
        <button className="btn btn-primary" onClick={openNew} disabled={readOnly}
          title={readOnly ? 'SuperAdmin access required' : undefined}
          style={readOnly ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
          + New message
        </button>
      }
    >
      <MetricCards items={[
        { label: 'Total',    value: loading ? '…' : messages.length },
        { label: 'Live now', value: loading ? '…' : activeCount, accent: activeCount > 0 ? 'var(--green)' : undefined },
        { label: 'Staged',   value: loading ? '…' : draftCount,  accent: draftCount > 0 ? 'var(--yellow)' : undefined },
      ]} min={130} />

      {draftCount > 0 && !loading && (
        <div style={{ padding: '12px 18px', borderRadius: 8, marginBottom: 18, border: '1px solid rgba(217,119,6,.3)', background: 'rgba(217,119,6,.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="dot dot-yellow" style={{ width: 10, height: 10, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--yellow)' }}>
            <strong>{draftCount} message{draftCount !== 1 ? 's' : ''} staged</strong> — ready to fire. Hit <strong>Activate</strong> the moment you need it live.
          </span>
        </div>
      )}

      {error && !showModal && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, border: '1px solid rgba(220,38,38,.3)', background: 'rgba(220,38,38,.07)', fontSize: 13, color: 'var(--red-text)' }}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : messages.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: '60px 0', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10 }}>
          <div className="section-label" style={{ margin: '0 0 8px' }}>No messages yet</div>
          <div style={{ fontSize: 13 }}>Create one now and keep it staged — activate instantly when you need it.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map(msg => {
            const cfg = TYPE_BADGE[msg.type] ?? TYPE_BADGE.info
            const isToggling = togglingId === msg.id
            const isDeleting = deletingId === msg.id
            return (
              <div key={msg.id} className="card" style={{ padding: '16px 20px', borderColor: msg.active ? 'var(--border-focus)' : 'var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <span className={`dot ${msg.active ? 'dot-green' : 'dot-dim'}`} style={{ width: 10, height: 10, marginTop: 5, flexShrink: 0 }}
                    title={msg.active ? 'Live — visible to all shops' : 'Staged — not visible yet'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{msg.title}</span>
                      <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
                      <span className={`badge ${msg.active ? 'badge-green' : 'badge-dim'}`}>{msg.active ? 'Live' : 'Staged'}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>{msg.body}</p>
                    <div style={{ fontSize: 11, color: 'var(--text-hint)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>Created {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
                      {msg.expires_at && <span>Expires {format(new Date(msg.expires_at), 'MMM d, yyyy')}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button className={`btn btn-sm ${msg.active ? 'btn-ghost' : 'btn-primary'}`} onClick={() => handleToggleActive(msg)}
                      disabled={isToggling || readOnly} title={readOnly ? 'SuperAdmin access required' : undefined}>
                      {isToggling ? '…' : msg.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(msg)} disabled={readOnly}
                      title={readOnly ? 'SuperAdmin access required' : undefined}
                      style={readOnly ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(msg.id)} disabled={isDeleting || readOnly}
                      title={readOnly ? 'SuperAdmin access required' : undefined}
                      style={{ color: 'var(--red-text)', ...(readOnly ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}>
                      {isDeleting ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,29,35,.45)', padding: 16, animation: 'overlay-in .15s ease' }} onClick={closeModal}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28, animation: 'dialog-in .18s ease both' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{editing ? 'Edit message' : 'New message'}</div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, padding: 4, width: 'auto' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Title *</div>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Scheduled maintenance tonight" autoFocus />
              </div>
              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Message *</div>
                <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={3} placeholder="Details shown to shops and users…" style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Type</div>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as MsgType }))}>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="feature">Feature</option>
                  </select>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Expires (optional)</div>
                  <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${form.active ? 'rgba(22,163,74,.35)' : 'var(--border)'}`, background: form.active ? 'rgba(22,163,74,.06)' : 'var(--bg-elevated)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{form.active ? 'Live immediately' : 'Save as staged draft'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{form.active ? 'Visible to all shops right now' : 'Hidden — activate later with one click'}</div>
                </div>
                <input type="checkbox" checked={form.active} onChange={() => setForm(f => ({ ...f, active: !f.active }))} style={{ width: 18, height: 18, flexShrink: 0 }} />
              </label>
            </div>
            {error && <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(220,38,38,.3)', background: 'rgba(220,38,38,.07)', fontSize: 13, color: 'var(--red-text)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving || !form.title.trim() || !form.body.trim()}>
                {saving ? 'Saving…' : editing ? 'Save changes' : form.active ? 'Create & go live' : 'Save draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerView>
  )
}
