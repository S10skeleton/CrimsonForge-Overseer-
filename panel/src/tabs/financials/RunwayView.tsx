import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import type { FinEntry } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { errMsg, fmtMoney } from './finShared'

const TYPE_BADGE: Record<string, string> = { expense: 'badge-red', income: 'badge-green', cash_balance: 'badge-cyan' }

export default function RunwayView({ role }: { role: string }) {
  const canEdit = role === 'owner' || role === 'admin'
  const isOwner = role === 'owner'
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()

  const runway = useQuery({ queryKey: ['fin', 'runway'], queryFn: api.financials.runway })
  const entries = useQuery({ queryKey: ['fin', 'entries'], queryFn: () => api.financials.entries() })

  const [form, setForm] = useState({ month: '', type: 'expense', category: '', label: '', amount: '' })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['fin', 'entries'] }); qc.invalidateQueries({ queryKey: ['fin', 'runway'] }) }
  const createM = useMutation({
    mutationFn: () => api.financials.createEntry({ month: form.month, type: form.type, category: form.category || undefined, label: form.label || undefined, amount: Number(form.amount) }),
    onSuccess: () => { invalidate(); setForm({ month: '', type: 'expense', category: '', label: '', amount: '' }); toast.success('Entry added') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const delM = useMutation({ mutationFn: (id: string) => api.financials.deleteEntry(id), onSuccess: () => { invalidate(); toast.success('Entry deleted') }, onError: (e) => toast.error(errMsg(e)) })

  const r = runway.data

  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="kpi">
          <div className="kpi-label">Runway</div>
          <div className="kpi-value" style={{ color: r?.runwayMonths != null && r.runwayMonths < 6 ? 'var(--red-text)' : 'var(--text-primary)' }}>
            {runway.isLoading ? '…' : r?.runwayMonths != null ? `${r.runwayMonths} mo` : '—'}
          </div>
          <div className="kpi-sub">at current burn</div>
        </div>
        <div className="kpi"><div className="kpi-label">Cash on hand</div><div className="kpi-value" style={{ fontSize: '1.6rem' }}>{runway.isLoading ? '…' : fmtMoney(r?.cashOnHand)}</div><div className="kpi-sub">latest balance entry</div></div>
        <div className="kpi"><div className="kpi-label">Avg monthly burn</div><div className="kpi-value" style={{ fontSize: '1.6rem' }}>{runway.isLoading ? '…' : fmtMoney(r?.avgMonthlyBurn)}</div><div className="kpi-sub">net, trailing 6 mo</div></div>
      </div>
      {r && r.cashOnHand == null && <div style={{ fontSize: 12.5, color: 'var(--text-hint)', marginBottom: 16 }}>Add a <span className="mono">cash_balance</span> entry and some expenses to compute runway.</div>}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 18px 10px' }}><div className="section-label" style={{ margin: 0 }}>Entries</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Type</th><th>Category</th><th>Label</th><th style={{ textAlign: 'right' }}>Amount</th>{isOwner && <th></th>}</tr></thead>
            <tbody>
              {(entries.data ?? []).map((e: FinEntry) => (
                <tr key={e.id}>
                  <td className="mono" style={{ fontSize: 13 }}>{e.month?.slice(0, 7)}</td>
                  <td><span className={`badge ${TYPE_BADGE[e.type] ?? 'badge-dim'}`}>{e.type.replace('_', ' ')}</span></td>
                  <td>{e.category ?? '—'}</td>
                  <td>{e.label ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(e.amount)}</td>
                  {isOwner && <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Delete entry?', body: `${e.type} · ${fmtMoney(e.amount)}`, confirmLabel: 'Delete', danger: true })) delM.mutate(e.id) }}>✕</button></td>}
                </tr>
              ))}
              {entries.data?.length === 0 && <tr><td colSpan={isOwner ? 6 : 5} style={{ color: 'var(--text-muted)' }}>No entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: '0 1 130px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>MONTH</label><input type="month" value={form.month} onChange={e => setForm({ ...form, month: e.target.value ? `${e.target.value}-01` : '' })} /></div>
            <div style={{ flex: '0 1 130px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>TYPE</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="expense">expense</option><option value="income">income</option><option value="cash_balance">cash_balance</option></select></div>
            <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>CATEGORY</label><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="payroll" /></div>
            <div style={{ flex: '1 1 120px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>LABEL</label><input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></div>
            <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>AMOUNT</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <button className="btn btn-primary" disabled={!form.month || !form.amount || createM.isPending} onClick={() => createM.mutate()}>Add</button>
          </div>
        )}
      </div>
    </div>
  )
}
