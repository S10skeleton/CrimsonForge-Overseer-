import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { CrmDeal } from '../../api'
import { useToast } from '../../components/Toast'
import { errMsg, PIPELINE_OPTIONS, fmtAmount, prettyStage } from './crmShared'

function statusForStage(stage: string): string {
  if (/won/.test(stage)) return 'won'
  if (/lost|churned/.test(stage)) return 'lost'
  return 'open'
}

export default function PipelineView({ role }: { role: string }) {
  const canEdit = role === 'owner' || role === 'admin'
  const qc = useQueryClient(); const toast = useToast()
  const [pipeline, setPipeline] = useState('fundraising')
  const { data, isLoading } = useQuery({ queryKey: ['crm', 'pipeline', pipeline], queryFn: () => api.crm.pipeline(pipeline) })

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ company_id: '', name: '', amount: '' })
  const companies = useQuery({ queryKey: ['crm', 'companies', 'all'], queryFn: () => api.crm.companies({ limit: 200 }).then(r => r.data), enabled: adding })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm', 'pipeline', pipeline] })
  const moveM = useMutation({
    mutationFn: (v: { id: string; stage: string }) => api.crm.updateDeal(v.id, { stage: v.stage, status: statusForStage(v.stage) }),
    onSuccess: () => { invalidate(); toast.success('Deal moved') }, onError: (e) => toast.error(errMsg(e)),
  })
  const createM = useMutation({
    mutationFn: () => api.crm.createDeal({ company_id: form.company_id, name: form.name, pipeline, amount: form.amount ? Number(form.amount) : null }),
    onSuccess: () => { invalidate(); setAdding(false); setForm({ company_id: '', name: '', amount: '' }); toast.success('Deal created') },
    onError: (e) => toast.error(errMsg(e)),
  })

  const stages = data?.stages ?? []
  const allStages = stages.map(s => s.stage)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
          {PIPELINE_OPTIONS.map(p => (
            <button key={p.key} onClick={() => setPipeline(p.key)} style={{
              padding: '6px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              background: pipeline === p.key ? 'var(--bg-surface)' : 'transparent', color: pipeline === p.key ? 'var(--accent)' : 'var(--text-muted)',
            }}>{p.label}</button>
          ))}
        </div>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : '+ New deal'}</button>}
      </div>

      {adding && canEdit && (
        <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>COMPANY</label>
            <select value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })}>
              <option value="">Select…</option>
              {(companies.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div style={{ flex: '1 1 160px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>DEAL NAME</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div style={{ flex: '0 1 120px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>AMOUNT</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={!form.company_id || !form.name.trim() || createM.isPending} onClick={() => createM.mutate()}>Create</button>
        </div>
      )}

      {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {stages.map(col => (
            <div key={col.stage} style={{ flex: '0 0 240px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: .5 }}>{prettyStage(col.stage)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{col.deals.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.deals.map((d: CrmDeal) => (
                  <div key={d.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <Link to={`/crm/companies/${d.company_id}`} style={{ fontSize: 11.5, color: 'var(--text-hint)', textDecoration: 'none' }}>{d.company_name ?? 'Company'}</Link>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', margin: '2px 0' }}>{d.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{fmtAmount(d.amount, d.currency)}</span>
                      {d.owner && <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{d.owner}</span>}
                    </div>
                    {canEdit && (
                      <select value={d.stage} onChange={e => moveM.mutate({ id: d.id, stage: e.target.value })} style={{ marginTop: 8, padding: '4px 6px', fontSize: 12 }}>
                        {allStages.map(s => <option key={s} value={s}>{prettyStage(s)}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                {col.deals.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-hint)', textAlign: 'center', padding: '8px 0' }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
