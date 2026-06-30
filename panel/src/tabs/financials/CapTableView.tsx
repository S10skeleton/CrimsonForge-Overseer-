import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '../../api'
import type { CapSecurity, CapSafe } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { errMsg, fmtMoney, fmtNum, CHART_COLORS } from './finShared'

export default function CapTableView({ role }: { role: string }) {
  const isOwner = role === 'owner'
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()

  const summary = useQuery({ queryKey: ['cap', 'summary'], queryFn: api.captable.summary })
  const safes = useQuery({ queryKey: ['cap', 'safes'], queryFn: () => api.captable.safes() })
  const investors = useQuery({ queryKey: ['cap', 'investors'], queryFn: api.captable.investors })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['cap'] }) }

  const [sec, setSec] = useState({ holder_name: '', holder_type: 'investor', security_class: 'common', shares: '', issued: true })
  const addSec = useMutation({
    mutationFn: () => api.captable.createSecurity({ holder_name: sec.holder_name, holder_type: sec.holder_type, security_class: sec.security_class, shares: sec.shares ? Number(sec.shares) : null, issued: sec.issued }),
    onSuccess: () => { invalidate(); setSec({ holder_name: '', holder_type: 'investor', security_class: 'common', shares: '', issued: true }); toast.success('Holder added') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const delSec = useMutation({ mutationFn: (id: string) => api.captable.deleteSecurity(id), onSuccess: () => { invalidate(); toast.success('Removed') }, onError: (e) => toast.error(errMsg(e)) })

  const [safe, setSafe] = useState({ investor_name: '', crm_company_id: '', amount: '', valuation_cap: '', discount_pct: '', status: 'outstanding' })
  const addSafe = useMutation({
    mutationFn: () => api.captable.createSafe({ investor_name: safe.investor_name, crm_company_id: safe.crm_company_id || undefined, amount: Number(safe.amount), valuation_cap: safe.valuation_cap ? Number(safe.valuation_cap) : null, discount_pct: safe.discount_pct ? Number(safe.discount_pct) : null, status: safe.status }),
    onSuccess: () => { invalidate(); setSafe({ investor_name: '', crm_company_id: '', amount: '', valuation_cap: '', discount_pct: '', status: 'outstanding' }); toast.success('SAFE added') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const delSafe = useMutation({ mutationFn: (id: string) => api.captable.deleteSafe(id), onSuccess: () => { invalidate(); toast.success('Removed') }, onError: (e) => toast.error(errMsg(e)) })

  const s = summary.data
  const pieData = (s?.holders ?? []).filter(h => h.issued && (h.shares ?? 0) > 0).map(h => ({ name: h.holder_name, value: Number(h.shares) }))

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Ownership */}
      <div className="card">
        <div className="section-label">Ownership (issued basis)</div>
        <div className="home-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18, alignItems: 'center' }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Holder</th><th>Class</th><th style={{ textAlign: 'right' }}>Shares</th><th style={{ textAlign: 'right' }}>%</th><th></th>{isOwner && <th></th>}</tr></thead>
              <tbody>
                {(s?.holders ?? []).map((h: CapSecurity & { computedPct?: number | null }) => (
                  <tr key={h.id}>
                    <td><div style={{ fontWeight: 600 }}>{h.holder_name}</div><div style={{ fontSize: 11.5, color: 'var(--text-hint)' }}>{h.holder_type}</div></td>
                    <td>{h.security_class}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(h.shares)}</td>
                    <td style={{ textAlign: 'right' }}>{h.computedPct != null ? `${h.computedPct}%` : '—'}</td>
                    <td>{h.issued ? <span className="badge badge-green">issued</span> : <span className="badge badge-yellow">planned</span>}</td>
                    {isOwner && <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Remove holder?', body: h.holder_name, confirmLabel: 'Remove', danger: true })) delSec.mutate(h.id) }}>✕</button></td>}
                  </tr>
                ))}
                {s?.holders.length === 0 && <tr><td colSpan={isOwner ? 6 : 5} style={{ color: 'var(--text-muted)' }}>No holders yet.</td></tr>}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8 }}>
              {fmtNum(s?.totalIssuedShares)} issued shares · {fmtNum(s?.optionPoolReserved)} option pool reserved
            </div>
          </div>
          {pieData.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `${fmtNum(Number(v))} sh`} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        {isOwner && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: '1 1 130px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>HOLDER</label><input value={sec.holder_name} onChange={e => setSec({ ...sec, holder_name: e.target.value })} /></div>
            <div style={{ flex: '0 1 120px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>TYPE</label><select value={sec.holder_type} onChange={e => setSec({ ...sec, holder_type: e.target.value })}>{['founder', 'investor', 'employee', 'option_pool', 'other'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>CLASS</label><select value={sec.security_class} onChange={e => setSec({ ...sec, security_class: e.target.value })}>{['common', 'preferred', 'option'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div style={{ flex: '0 1 120px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>SHARES</label><input type="number" value={sec.shares} onChange={e => setSec({ ...sec, shares: e.target.value })} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, paddingBottom: 8 }}><input type="checkbox" checked={sec.issued} onChange={e => setSec({ ...sec, issued: e.target.checked })} style={{ width: 'auto' }} /> issued</label>
            <button className="btn btn-primary" disabled={!sec.holder_name.trim() || addSec.isPending} onClick={() => addSec.mutate()}>Add</button>
          </div>
        )}
      </div>

      {/* SAFEs */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="section-label" style={{ margin: 0 }}>SAFEs &amp; notes</div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Outstanding: <b style={{ color: 'var(--accent)' }}>{fmtMoney(s?.outstandingSafes.total)}</b> ({s?.outstandingSafes.count ?? 0})</span>
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Investor</th><th>Type</th><th style={{ textAlign: 'right' }}>Amount</th><th>Cap</th><th>Disc.</th><th>Terms</th><th>Status</th>{isOwner && <th></th>}</tr></thead>
            <tbody>
              {(safes.data ?? []).map((f: CapSafe) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 600 }}>{f.investor_name}</td>
                  <td>{f.instrument_type}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(f.amount)}</td>
                  <td>{fmtMoney(f.valuation_cap, { compact: true })}</td>
                  <td>{f.discount_pct != null ? `${f.discount_pct}%` : '—'}</td>
                  <td>{[f.mfn ? 'MFN' : null, f.pro_rata ? 'pro-rata' : null].filter(Boolean).map(t => <span key={t} className="badge badge-dim" style={{ marginRight: 4, fontSize: 9 }}>{t}</span>)}</td>
                  <td><span className={`badge ${f.status === 'outstanding' ? 'badge-violet' : f.status === 'converted' ? 'badge-green' : 'badge-dim'}`}>{f.status}</span></td>
                  {isOwner && <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Remove SAFE?', body: `${f.investor_name} · ${fmtMoney(f.amount)}`, confirmLabel: 'Remove', danger: true })) delSafe.mutate(f.id) }}>✕</button></td>}
                </tr>
              ))}
              {safes.data?.length === 0 && <tr><td colSpan={isOwner ? 8 : 7} style={{ color: 'var(--text-muted)' }}>No SAFEs yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {isOwner && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: '1 1 140px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>INVESTOR</label><input value={safe.investor_name} onChange={e => setSafe({ ...safe, investor_name: e.target.value })} /></div>
            <div style={{ flex: '0 1 150px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>CRM COMPANY</label>
              <select value={safe.crm_company_id} onChange={e => setSafe({ ...safe, crm_company_id: e.target.value })}><option value="">— none —</option>{(investors.data ?? []).map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}</select></div>
            <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>AMOUNT</label><input type="number" value={safe.amount} onChange={e => setSafe({ ...safe, amount: e.target.value })} /></div>
            <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>CAP</label><input type="number" value={safe.valuation_cap} onChange={e => setSafe({ ...safe, valuation_cap: e.target.value })} /></div>
            <div style={{ flex: '0 1 90px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>DISC %</label><input type="number" value={safe.discount_pct} onChange={e => setSafe({ ...safe, discount_pct: e.target.value })} /></div>
            <button className="btn btn-primary" disabled={!safe.investor_name.trim() || !safe.amount || addSafe.isPending} onClick={() => addSafe.mutate()}>Add</button>
          </div>
        )}
      </div>

      {/* Investors */}
      <div className="card">
        <div className="section-label">Investors</div>
        {(investors.data ?? []).length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No investor companies in the CRM yet.</div>}
        {(investors.data ?? []).map(inv => (
          <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
            <Link to={`/crm/companies/${inv.id}`} style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', textDecoration: 'none' }}>{inv.name}</Link>
            <span style={{ fontSize: 12.5, color: 'var(--text-hint)' }}>{inv.safes.length} SAFE{inv.safes.length === 1 ? '' : 's'}</span>
            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmtMoney(inv.outstandingTotal)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
