import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import { errMsg, COMPANY_TYPES, TYPE_BADGE } from './crmShared'

export default function CompaniesView({ role }: { role: string }) {
  const canEdit = role === 'owner' || role === 'admin'
  const qc = useQueryClient(); const toast = useToast(); const navigate = useNavigate()
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['crm', 'companies', { type, q }], queryFn: () => api.crm.companies({ type: type || undefined, q: q || undefined }).then(r => r.data) })

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'prospect' })
  const createM = useMutation({
    mutationFn: () => api.crm.createCompany({ name: form.name, type: form.type }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['crm', 'companies'] }); setAdding(false); setForm({ name: '', type: 'prospect' }); toast.success('Company created'); navigate(`/crm/companies/${c.id}`) },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All types</option>
          {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search companies…" style={{ flex: '1 1 200px', maxWidth: 320 }} />
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : '+ New company'}</button>}
      </div>

      {adding && canEdit && (
        <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>NAME</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div style={{ flex: '0 1 140px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>TYPE</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <button className="btn btn-primary" disabled={!form.name.trim() || createM.isPending} onClick={() => createM.mutate()}>Create</button>
        </div>
      )}

      {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (data?.length ? (
        <div className="card" style={{ padding: 0 }}>
          {data.map((c, i) => (
            <Link key={c.id} to={`/crm/companies/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', textDecoration: 'none' }}>
              <span className={`badge ${TYPE_BADGE[c.type] ?? 'badge-dim'}`}>{c.type}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{c.name}</div>
                {c.tags.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{c.tags.join(' · ')}</div>}
              </div>
              {c.owner && <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>{c.owner}</span>}
            </Link>
          ))}
        </div>
      ) : <div className="card" style={{ color: 'var(--text-muted)' }}>No companies yet.</div>)}
    </div>
  )
}
