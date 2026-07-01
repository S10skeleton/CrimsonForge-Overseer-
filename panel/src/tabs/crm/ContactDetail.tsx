/**
 * Contact detail (CRM-P4b) — a person's own page: header (initials, name, title,
 * company chip, inline edit, delete), info, a follow-ups panel (crm_activities
 * with type='task' + due_at + done), and a timestamped activity timeline.
 * Mirrors CompanyDetail. No new DB — reuses the activity primitive.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { formatDistanceToNow, format, isBefore, startOfToday, addDays } from 'date-fns'
import { api } from '../../api'
import type { CrmActivity, CrmContact, CrmDeal } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { errMsg, fmtAmount, prettyStage } from './crmShared'
import { CustomFields } from './CustomFields'
import ThreadModal from './ThreadModal'

const GLYPH: Record<string, string> = { note: '✎', call: '☎', email: '✉', meeting: '◔', sms: '✆', task: '✓' }
const absTime = (d: string) => format(new Date(d), 'MMM d, yyyy · h:mm a')
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'

export default function ContactDetail({ role }: { role: string }) {
  const { id = '' } = useParams()
  const canEdit = role === 'owner' || role === 'admin'
  const isOwner = role === 'owner'
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm(); const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({ queryKey: ['crm', 'contact', id], queryFn: () => api.crm.contact(id) })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm', 'contact', id] })

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', title: '', email: '', phone: '' })
  const [task, setTask] = useState({ subject: '', due_at: '' })
  const [threadActivity, setThreadActivity] = useState<string | null>(null)

  const saveContact = useMutation({ mutationFn: () => api.crm.updateContact(id, form), onSuccess: () => { invalidate(); setEditing(false); toast.success('Saved') }, onError: (e) => toast.error(errMsg(e)) })
  const optIn = useMutation({ mutationFn: (c: CrmContact) => api.crm.updateContact(id, { sms_opt_in: !c.sms_opt_in, sms_opt_in_source: 'manual', sms_opt_in_at: new Date().toISOString() } as Partial<CrmContact>), onSuccess: invalidate, onError: (e) => toast.error(errMsg(e)) })
  const delContact = useMutation({ mutationFn: () => api.crm.deleteContact(id), onSuccess: () => { toast.success('Contact deleted'); navigate('/crm/table') }, onError: (e) => toast.error(errMsg(e)) })

  const addTask = useMutation({
    mutationFn: () => api.crm.createActivity({ company_id: data!.contact.company_id, contact_id: id, type: 'task', subject: task.subject.trim(), due_at: task.due_at || null } as Partial<CrmActivity> & { company_id: string }),
    onSuccess: () => { invalidate(); setTask({ subject: '', due_at: '' }); toast.success('Follow-up added') }, onError: (e) => toast.error(errMsg(e)),
  })
  const toggleDone = useMutation({ mutationFn: (a: CrmActivity) => api.crm.updateActivity(a.id, { done: !a.done }), onSuccess: invalidate, onError: (e) => toast.error(errMsg(e)) })
  const delActivity = useMutation({ mutationFn: (aid: string) => api.crm.deleteActivity(aid), onSuccess: () => { invalidate(); toast.success('Removed') }, onError: (e) => toast.error(errMsg(e)) })

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
  if (error || !data) return <div style={{ color: 'var(--red-text)' }}>{error ? errMsg(error) : 'Not found'}</div>
  const { contact, company, deals, activities } = data

  const startEdit = () => { setForm({ name: contact.name, title: contact.title ?? '', email: contact.email ?? '', phone: contact.phone ?? '' }); setEditing(true) }
  const openTasks = activities.filter(a => a.type === 'task' && !a.done).sort((x, y) => (x.due_at ?? '9999').localeCompare(y.due_at ?? '9999'))
  const timeline = activities.filter(a => a.type !== 'task')

  const dueTone = (due: string | null): string | undefined => {
    if (!due) return undefined
    const d = new Date(due)
    if (isBefore(d, startOfToday())) return 'var(--red-text)'
    if (isBefore(d, addDays(startOfToday(), 2))) return 'var(--yellow)'
    return undefined
  }

  return (
    <div>
      <Link to="/crm/table" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>← Contacts</Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 18px', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--elara)', fontSize: 15 }}>{initials(contact.name)}</div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.15 }}>{contact.name}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {contact.title && <span>{contact.title}</span>}
              {company && <Link to={`/crm/companies/${company.id}`} className="badge badge-dim" style={{ textDecoration: 'none' }}>{company.name}</Link>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && !editing && <button className="btn btn-ghost btn-sm" onClick={startEdit}>Edit</button>}
          {isOwner && <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirm({ title: 'Delete contact?', body: `${contact.name} — their activity history is kept and detached.`, confirmLabel: 'Delete', danger: true })) delContact.mutate() }}>Delete</button>}
        </div>
      </div>

      <div className="home-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18 }}>
          {/* Info / edit */}
          <div className="card">
            <div className="section-label">Info</div>
            {editing ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" />
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title" />
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" />
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone" type="tel" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" disabled={!form.name.trim() || saveContact.isPending} onClick={() => saveContact.mutate()}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6, fontSize: 13.5 }}>
                <Row label="Email">{contact.email ? <a href={`mailto:${contact.email}`} style={{ color: 'var(--accent)' }}>{contact.email}</a> : '—'}</Row>
                <Row label="Phone">{contact.phone ? <span className="mono">{contact.phone}</span> : '—'}</Row>
                <Row label="SMS opt-in">
                  <button className="btn btn-ghost btn-sm" disabled={!canEdit || !contact.phone || optIn.isPending} onClick={() => optIn.mutate(contact)} style={{ color: contact.sms_opt_in ? 'var(--green)' : 'var(--text-hint)', padding: '1px 8px' }}>{contact.sms_opt_in ? 'Opted in ✓' : 'Not opted in ✗'}</button>
                </Row>
              </div>
            )}
            <div style={{ marginTop: 10 }}><CustomFields object="contact" recordId={contact.id} custom={contact.custom} canEdit={canEdit} /></div>
          </div>

          {/* Related deals */}
          {deals.length > 0 && (
            <div className="card">
              <div className="section-label">Deals{company ? ` · ${company.name}` : ''}</div>
              {deals.map((d: CrmDeal) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{d.pipeline} · {prettyStage(d.stage)} · <span className={`badge ${d.status === 'won' ? 'badge-green' : d.status === 'lost' ? 'badge-red' : 'badge-dim'}`}>{d.status}</span></div>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{fmtAmount(d.amount, d.currency)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Follow-ups */}
          <div className="card">
            <div className="section-label">Follow-ups</div>
            {openTasks.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No open follow-ups.</div>}
            {openTasks.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <input type="checkbox" checked={false} disabled={!canEdit} onChange={() => toggleDone.mutate(t)} style={{ width: 'auto' }} title="Mark done" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{t.subject || 'Follow-up'}</div>
                  {t.due_at && <div style={{ fontSize: 12, color: dueTone(t.due_at) ?? 'var(--text-hint)', fontWeight: dueTone(t.due_at) ? 600 : 400 }}>Due {format(new Date(t.due_at), 'MMM d, yyyy')}{isBefore(new Date(t.due_at), startOfToday()) ? ' · overdue' : ''}</div>}
                </div>
                {isOwner && <button className="btn btn-ghost btn-sm" onClick={() => delActivity.mutate(t.id)}>✕</button>}
              </div>
            ))}
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <input value={task.subject} onChange={e => setTask({ ...task, subject: e.target.value })} placeholder="Follow-up (e.g. chase re: proposal)" style={{ flex: '1 1 160px' }} />
                <input type="date" value={task.due_at} onChange={e => setTask({ ...task, due_at: e.target.value })} style={{ flex: '0 1 150px' }} />
                <button className="btn btn-primary btn-sm" disabled={!task.subject.trim() || addTask.isPending} onClick={() => addTask.mutate()}>Add</button>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="card">
          <div className="section-label">Activity</div>
          {timeline.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No activity yet.</div>}
          {timeline.map((a: CrmActivity) => (
            <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-hint)', fontSize: 13, marginTop: 1 }}>{GLYPH[a.type] ?? '•'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  {a.subject && <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>{a.subject}</span>}
                  <span className="badge badge-dim" style={{ fontSize: 9 }}>{a.type}</span>
                </div>
                {a.body && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{a.body}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span title={formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}>{a.created_by ? `${a.created_by} · ` : ''}{absTime(a.created_at)}</span>
                  {a.created_by === 'Gmail' && <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setThreadActivity(a.id)}>View thread</button>}
                </div>
              </div>
              {isOwner && <button className="btn btn-ghost btn-sm" onClick={() => delActivity.mutate(a.id)}>✕</button>}
            </div>
          ))}
        </div>
      </div>

      {threadActivity && <ThreadModal activityId={threadActivity} onClose={() => setThreadActivity(null)} />}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ width: 92, flexShrink: 0, color: 'var(--text-hint)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{children}</span>
    </div>
  )
}
