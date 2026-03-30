import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-cyan', contacted: 'badge-yellow', demo_scheduled: 'badge-violet',
  invite_sent: 'badge-cyan', converted: 'badge-green', lost: 'badge-red',
}
const STATUS_OPTIONS = [
  { value: 'new',            label: 'New' },
  { value: 'contacted',      label: 'Contacted' },
  { value: 'demo_scheduled', label: 'Demo Scheduled' },
  { value: 'invite_sent',    label: 'Invite Sent' },
  { value: 'converted',      label: 'Converted' },
  { value: 'lost',           label: 'Lost' },
]

export default function LeadsTab() {
  const [leads, setLeads]           = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')

  useEffect(() => {
    api.cfp.leads().then(setLeads).finally(() => setLoading(false))
  }, [])

  const updateLead = async (id: string, updates: Record<string, unknown>) => {
    await api.cfp.updateLead(id, updates)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l))
  }

  const deleteLead = async (id: string) => {
    if (!confirm('Delete this lead? Cannot be undone.')) return
    await api.cfp.deleteLead(id)
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4 }} className="grad">
          LEADS & PIPELINE
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map(({ value, label }) => {
            const count = leads.filter(l => (l.status || 'new') === value).length
            if (!count) return null
            return (
              <span key={value} className={`badge ${STATUS_BADGE[value] ?? 'badge-dim'}`} style={{ fontSize: 11 }}>
                {count} {label}
              </span>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--dim)' }}>Loading...</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--dim)' }}>No leads yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {leads.map(lead => {
            const status    = lead.status || 'new'
            const isEditing = editingId === lead.id
            return (
              <div key={lead.id} className="card">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{lead.shop_name}</span>
                      <span style={{ fontSize: 12, color: 'var(--dim)' }}>
                        {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.8 }}>
                      <div>{lead.contact_name}</div>
                      <div>{lead.email}</div>
                      {lead.phone && <div>{lead.phone}</div>}
                    </div>
                    {lead.message && (
                      <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--bg-dark)', borderRadius: 6, fontSize: 12, fontStyle: 'italic', color: 'var(--dim)' }}>
                        "{lead.message}"
                      </div>
                    )}
                    {lead.last_contacted_at && (
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
                        Last contacted {formatDistanceToNow(new Date(lead.last_contacted_at), { addSuffix: true })}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <select
                      value={status}
                      onChange={async e => updateLead(lead.id, {
                        status: e.target.value,
                        last_contacted_at: ['contacted','demo_scheduled','invite_sent'].includes(e.target.value)
                          ? new Date().toISOString() : lead.last_contacted_at,
                      })}
                      style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
                    >
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditingId(isEditing ? null : lead.id); setNotesDraft(lead.notes || '') }} className="btn btn-ghost btn-sm">
                        {isEditing ? 'Done' : 'Notes'}
                      </button>
                      <button onClick={() => deleteLead(lead.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{'\u2717'}</button>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {isEditing ? (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <textarea
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      placeholder="Notes about this lead..."
                      rows={2}
                      style={{ width: '100%', fontSize: 12, background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', resize: 'none', fontFamily: 'Rajdhani, sans-serif' }}
                    />
                    <button
                      onClick={async () => { await updateLead(lead.id, { notes: notesDraft }); setEditingId(null) }}
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 6, color: 'var(--green)', borderColor: 'var(--green)' }}
                    >Save Notes</button>
                  </div>
                ) : lead.notes ? (
                  <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 12, color: 'var(--dim)' }}>
                    {lead.notes}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
