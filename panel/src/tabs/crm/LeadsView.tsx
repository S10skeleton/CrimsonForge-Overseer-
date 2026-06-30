import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import { errMsg, COMPANY_TYPES, PIPELINE_OPTIONS } from './crmShared'

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-cyan', contacted: 'badge-yellow', demo_scheduled: 'badge-violet',
  invite_sent: 'badge-cyan', converted: 'badge-green', lost: 'badge-red',
}
const STATUS_OPTIONS = ['new', 'contacted', 'demo_scheduled', 'invite_sent', 'converted', 'lost']

interface Lead { id: string; shop_name?: string; contact_name?: string; email?: string; phone?: string; message?: string; status?: string; created_at: string }

export default function LeadsView({ role }: { role: string }) {
  const canEdit = role === 'owner' || role === 'admin'
  const qc = useQueryClient(); const toast = useToast(); const navigate = useNavigate()
  const { data: leads, isLoading } = useQuery({ queryKey: ['cfp', 'leads'], queryFn: api.cfp.leads })

  const [convertId, setConvertId] = useState<string | null>(null)
  const [form, setForm] = useState({ type: 'prospect', pipeline: '', dealName: '', amount: '' })

  const statusM = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.cfp.updateLead(v.id, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cfp', 'leads'] }),
    onError: (e) => toast.error(errMsg(e)),
  })
  const convertM = useMutation({
    mutationFn: (id: string) => api.crm.convertLead(id, {
      type: form.type, pipeline: form.pipeline || undefined,
      dealName: form.dealName || undefined, amount: form.amount ? Number(form.amount) : undefined,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cfp', 'leads'] })
      toast.success(res.alreadyConverted ? 'Opening existing company' : 'Lead converted to CRM')
      navigate(`/crm/companies/${res.company.id}`)
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
  const list = (leads ?? []) as Lead[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Inbound contact requests. Convert a qualified lead into a CRM company + contact.</div>
      {list.length === 0 && <div className="card" style={{ color: 'var(--text-muted)' }}>No leads yet.</div>}
      {list.map(lead => {
        const status = lead.status || 'new'
        const converted = status === 'converted'
        const opening = convertId === lead.id
        return (
          <div key={lead.id} className="card">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{lead.shop_name || lead.contact_name || 'Lead'}</span>
                  <span className={`badge ${STATUS_BADGE[status] ?? 'badge-dim'}`}>{status}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
                  {lead.contact_name && <div>{lead.contact_name}</div>}
                  {lead.email && <div>{lead.email}</div>}
                  {lead.phone && <div>{lead.phone}</div>}
                </div>
                {lead.message && <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>"{lead.message}"</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <select value={status} disabled={!canEdit} onChange={e => statusM.mutate({ id: lead.id, status: e.target.value })} style={{ width: 'auto', padding: '5px 8px' }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {canEdit && (
                  <button className="btn btn-primary btn-sm" onClick={() => { setConvertId(opening ? null : lead.id); setForm({ type: 'prospect', pipeline: '', dealName: '', amount: '' }) }}>
                    {converted ? 'Open in CRM' : opening ? 'Cancel' : 'Convert →'}
                  </button>
                )}
              </div>
            </div>

            {opening && canEdit && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '0 1 130px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>TYPE</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div style={{ flex: '0 1 140px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>PIPELINE (optional)</label>
                  <select value={form.pipeline} onChange={e => setForm({ ...form, pipeline: e.target.value })}><option value="">— no deal —</option>{PIPELINE_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
                {form.pipeline && <>
                  <div style={{ flex: '1 1 140px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>DEAL NAME</label><input value={form.dealName} onChange={e => setForm({ ...form, dealName: e.target.value })} /></div>
                  <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>AMOUNT</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                </>}
                <button className="btn btn-primary" onClick={() => convertM.mutate(lead.id)} disabled={convertM.isPending}>{converted ? 'Open' : 'Convert'}</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
