import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../api'
import type { CrmContact, CrmDeal, CrmActivity } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { errMsg, TYPE_BADGE, fmtAmount, prettyStage, PIPELINE_OPTIONS, COMPANY_TYPES } from './crmShared'
import { CustomFields, ManageFieldsModal, useFields } from './CustomFields'
import ThreadModal from './ThreadModal'

const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'task']
const ACTIVITY_GLYPH: Record<string, string> = { note: '✎', call: '☎', email: '✉', meeting: '◔', task: '✓' }

type CrmObject = 'company' | 'contact' | 'deal'

export default function CompanyDetail({ role }: { role: string }) {
  const { id = '' } = useParams()
  const canEdit = role === 'owner' || role === 'admin'
  const isOwner = role === 'owner'
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm(); const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({ queryKey: ['crm', 'company', id], queryFn: () => api.crm.company(id) })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm', 'company', id] })
  const companyFields = useFields('company')

  const [contactForm, setContactForm] = useState({ name: '', title: '', email: '', phone: '' })
  const [dealForm, setDealForm] = useState({ name: '', pipeline: 'fundraising', amount: '' })
  const [act, setAct] = useState({ type: 'note', subject: '', body: '' })
  const [manageObj, setManageObj] = useState<CrmObject | null>(null)
  const [threadActivity, setThreadActivity] = useState<string | null>(null)

  const addContact = useMutation({ mutationFn: () => api.crm.createContact({ company_id: id, ...contactForm }), onSuccess: () => { invalidate(); setContactForm({ name: '', title: '', email: '', phone: '' }); toast.success('Contact added') }, onError: (e) => toast.error(errMsg(e)) })
  const delContact = useMutation({ mutationFn: (cid: string) => api.crm.deleteContact(cid), onSuccess: () => { invalidate(); toast.success('Contact removed') }, onError: (e) => toast.error(errMsg(e)) })
  const optIn = useMutation({ mutationFn: (c: CrmContact) => api.crm.updateContact(c.id, { sms_opt_in: !c.sms_opt_in, sms_opt_in_source: 'manual', sms_opt_in_at: new Date().toISOString() } as Partial<CrmContact>), onSuccess: invalidate, onError: (e) => toast.error(errMsg(e)) })
  const addDeal = useMutation({ mutationFn: () => api.crm.createDeal({ company_id: id, name: dealForm.name, pipeline: dealForm.pipeline, amount: dealForm.amount ? Number(dealForm.amount) : null }), onSuccess: () => { invalidate(); setDealForm({ name: '', pipeline: 'fundraising', amount: '' }); toast.success('Deal added') }, onError: (e) => toast.error(errMsg(e)) })
  const addActivity = useMutation({ mutationFn: () => api.crm.createActivity({ company_id: id, type: act.type, subject: act.subject || null, body: act.body || null }), onSuccess: () => { invalidate(); setAct({ type: 'note', subject: '', body: '' }); toast.success('Logged') }, onError: (e) => toast.error(errMsg(e)) })
  const toggleDone = useMutation({ mutationFn: (a: CrmActivity) => api.crm.updateActivity(a.id, { done: !a.done }), onSuccess: invalidate, onError: (e) => toast.error(errMsg(e)) })
  const delActivity = useMutation({ mutationFn: (aid: string) => api.crm.deleteActivity(aid), onSuccess: () => { invalidate(); toast.success('Removed') }, onError: (e) => toast.error(errMsg(e)) })
  const setType = useMutation({ mutationFn: (t: string) => api.crm.updateCompany(id, { type: t }), onSuccess: invalidate, onError: (e) => toast.error(errMsg(e)) })
  const delCompany = useMutation({ mutationFn: () => api.crm.deleteCompany(id), onSuccess: () => { toast.success('Company deleted'); navigate('/crm/companies') }, onError: (e) => toast.error(errMsg(e)) })

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
  if (error || !data) return <div style={{ color: 'var(--red-text)' }}>{error ? errMsg(error) : 'Not found'}</div>
  const { company, contacts, deals, activities } = data
  const hasCompanyFields = (companyFields.data?.length ?? 0) > 0

  const manageBtn = (obj: CrmObject) => canEdit && (
    <button className="btn btn-ghost btn-sm" onClick={() => setManageObj(obj)} title="Manage fields">⚙ Fields</button>
  )

  return (
    <div>
      <Link to="/crm/companies" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>← Companies</Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 18px', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{company.name}</h2>
          <span className={`badge ${TYPE_BADGE[company.type] ?? 'badge-dim'}`}>{company.type}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && (
            <select value={company.type} onChange={e => setType.mutate(e.target.value)} style={{ width: 'auto' }}>
              {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {isOwner && <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirm({ title: 'Delete company?', body: `${company.name} and all its contacts, deals, and activities. Cannot be undone.`, confirmLabel: 'Delete', danger: true })) delCompany.mutate() }}>Delete</button>}
        </div>
      </div>

      <div className="home-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18 }}>
          {/* Custom details */}
          {(canEdit || hasCompanyFields) && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div className="section-label" style={{ margin: 0 }}>Details</div>
                {manageBtn('company')}
              </div>
              {hasCompanyFields
                ? <CustomFields object="company" recordId={company.id} custom={company.custom} canEdit={canEdit} />
                : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No custom fields yet. Add attributes with “⚙ Fields”.</div>}
            </div>
          )}

          {/* Contacts */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="section-label" style={{ margin: 0 }}>Contacts</div>
              {manageBtn('contact')}
            </div>
            {contacts.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet.</div>}
            {contacts.map((c: CrmContact) => (
              <div key={c.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}><Link to={`/crm/contacts/${c.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{c.name}</Link>{c.is_primary && <span className="badge badge-dim" style={{ marginLeft: 6, fontSize: 9 }}>primary</span>}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-hint)' }}>{[c.title, c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  {c.phone && (
                    <button className="btn btn-ghost btn-sm" disabled={!canEdit || optIn.isPending} onClick={() => optIn.mutate(c)}
                      title="SMS marketing consent" style={{ color: c.sms_opt_in ? 'var(--green)' : 'var(--text-hint)' }}>
                      {c.sms_opt_in ? 'SMS ✓' : 'SMS ✗'}
                    </button>
                  )}
                  {isOwner && <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Remove contact?', body: c.name, confirmLabel: 'Remove', danger: true })) delContact.mutate(c.id) }}>✕</button>}
                </div>
                <CustomFields object="contact" recordId={c.id} custom={c.custom} canEdit={canEdit} />
              </div>
            ))}
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <input value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} placeholder="Name" style={{ flex: '1 1 100px' }} />
                <input value={contactForm.title} onChange={e => setContactForm({ ...contactForm, title: e.target.value })} placeholder="Title" style={{ flex: '1 1 80px' }} />
                <input value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} placeholder="Email" style={{ flex: '1 1 120px' }} />
                <input value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="Phone" type="tel" style={{ flex: '1 1 110px' }} />
                <button className="btn btn-primary btn-sm" disabled={!contactForm.name.trim() || addContact.isPending} onClick={() => addContact.mutate()}>Add</button>
              </div>
            )}
          </div>

          {/* Deals */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="section-label" style={{ margin: 0 }}>Deals</div>
              {manageBtn('deal')}
            </div>
            {deals.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet.</div>}
            {deals.map((d: CrmDeal) => (
              <div key={d.id} style={{ padding: '9px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{d.pipeline} · {prettyStage(d.stage)} · <span className={`badge ${d.status === 'won' ? 'badge-green' : d.status === 'lost' ? 'badge-red' : 'badge-dim'}`}>{d.status}</span></div>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{fmtAmount(d.amount, d.currency)}</span>
                </div>
                <CustomFields object="deal" recordId={d.id} custom={d.custom} canEdit={canEdit} />
              </div>
            ))}
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <input value={dealForm.name} onChange={e => setDealForm({ ...dealForm, name: e.target.value })} placeholder="Deal name" style={{ flex: '1 1 130px' }} />
                <select value={dealForm.pipeline} onChange={e => setDealForm({ ...dealForm, pipeline: e.target.value })} style={{ flex: '0 1 130px' }}>{PIPELINE_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
                <input type="number" value={dealForm.amount} onChange={e => setDealForm({ ...dealForm, amount: e.target.value })} placeholder="Amount" style={{ flex: '0 1 100px' }} />
                <button className="btn btn-primary btn-sm" disabled={!dealForm.name.trim() || addDeal.isPending} onClick={() => addDeal.mutate()}>Add</button>
              </div>
            )}
          </div>
        </div>

        {/* Activity timeline */}
        <div className="card">
          <div className="section-label">Activity</div>
          {canEdit && (
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select value={act.type} onChange={e => setAct({ ...act, type: e.target.value })} style={{ flex: '0 1 110px' }}>{ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                <input value={act.subject} onChange={e => setAct({ ...act, subject: e.target.value })} placeholder="Subject" style={{ flex: 1 }} />
              </div>
              <textarea value={act.body} onChange={e => setAct({ ...act, body: e.target.value })} placeholder="Details…" rows={2} style={{ resize: 'vertical', marginBottom: 8 }} />
              <button className="btn btn-primary btn-sm" disabled={(!act.subject.trim() && !act.body.trim()) || addActivity.isPending} onClick={() => addActivity.mutate()}>Log {act.type}</button>
            </div>
          )}
          {activities.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No activity yet.</div>}
          {activities.map((a: CrmActivity) => (
            <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-hint)', fontSize: 13, marginTop: 1 }}>{ACTIVITY_GLYPH[a.type] ?? '•'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  {a.subject && <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>{a.subject}</span>}
                  <span className="badge badge-dim" style={{ fontSize: 9 }}>{a.type}</span>
                  {a.type === 'task' && canEdit && (
                    <label style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <input type="checkbox" checked={a.done} onChange={() => toggleDone.mutate(a)} style={{ width: 'auto' }} /> done
                    </label>
                  )}
                </div>
                {a.body && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{a.body}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{a.created_by ? `${a.created_by} · ` : ''}{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                  {a.created_by === 'Gmail' && <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setThreadActivity(a.id)}>View thread</button>}
                </div>
              </div>
              {isOwner && <button className="btn btn-ghost btn-sm" onClick={() => delActivity.mutate(a.id)}>✕</button>}
            </div>
          ))}
        </div>
      </div>

      {manageObj && <ManageFieldsModal object={manageObj} onClose={() => setManageObj(null)} />}
      {threadActivity && <ThreadModal activityId={threadActivity} onClose={() => setThreadActivity(null)} />}
    </div>
  )
}
