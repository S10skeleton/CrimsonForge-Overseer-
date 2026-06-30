/**
 * CRM table grid + saved views (P3) — the Attio "spreadsheet" surface over
 * companies / contacts / deals. Server-side filter/sort/paging, built-in +
 * custom (P1a) columns, inline edit (manage-gated), and named/shared saved
 * views. Row → existing detail page; detail/pipeline pages are untouched.
 */
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { api } from '../../api'
import type { CrmFilter, CrmSavedView, ViewConfig } from '../../api'
import { useToast } from '../../components/Toast'
import { usePermissions, canManage } from '../../lib/permissions'
import { useFields } from './CustomFields'
import { COMPANY_TYPES } from './crmShared'

type Obj = 'companies' | 'contacts' | 'deals'
type ColType = 'text' | 'number' | 'currency' | 'date' | 'boolean' | 'email' | 'phone' | 'url' | 'badge' | 'select' | 'tags'
interface Col { key: string; label: string; type: ColType; editable?: boolean; link?: boolean; options?: string[] }

const OBJECT_FIELD: Record<Obj, 'company' | 'contact' | 'deal'> = { companies: 'company', contacts: 'contact', deals: 'deal' }

const BUILTIN: Record<Obj, Col[]> = {
  companies: [
    { key: 'name', label: 'Name', type: 'text', editable: true, link: true },
    { key: 'type', label: 'Type', type: 'select', editable: true, options: COMPANY_TYPES },
    { key: 'status', label: 'Status', type: 'text', editable: true },
    { key: 'website', label: 'Website', type: 'url', editable: true },
    { key: 'owner', label: 'Owner', type: 'text', editable: true },
    { key: 'tags', label: 'Tags', type: 'tags' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
  contacts: [
    { key: 'name', label: 'Name', type: 'text', editable: true, link: true },
    { key: 'title', label: 'Title', type: 'text', editable: true },
    { key: 'email', label: 'Email', type: 'email', editable: true },
    { key: 'phone', label: 'Phone', type: 'phone', editable: true },
    { key: 'is_primary', label: 'Primary', type: 'boolean' },
    { key: 'sms_opt_in', label: 'SMS opt-in', type: 'boolean', editable: true },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
  deals: [
    { key: 'name', label: 'Name', type: 'text', editable: true, link: true },
    { key: 'stage', label: 'Stage', type: 'badge', editable: true },
    { key: 'pipeline', label: 'Pipeline', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'currency', editable: true },
    { key: 'status', label: 'Status', type: 'badge', editable: true },
    { key: 'probability', label: 'Prob %', type: 'number', editable: true },
    { key: 'expected_close', label: 'Close', type: 'date', editable: true },
    { key: 'owner', label: 'Owner', type: 'text', editable: true },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
}

const DEFAULT_COLS: Record<Obj, string[]> = {
  companies: ['name', 'type', 'status', 'owner', 'created_at'],
  contacts: ['name', 'title', 'email', 'phone', 'created_at'],
  deals: ['name', 'stage', 'amount', 'status', 'expected_close'],
}

const OPS_BY_TYPE: Record<string, Array<{ op: string; label: string }>> = {
  text: [{ op: 'contains', label: 'contains' }, { op: 'eq', label: 'is' }, { op: 'neq', label: 'is not' }, { op: 'is_empty', label: 'is empty' }, { op: 'is_not_empty', label: 'is not empty' }],
  number: [{ op: 'eq', label: '=' }, { op: 'gt', label: '>' }, { op: 'lt', label: '<' }, { op: 'gte', label: '≥' }, { op: 'lte', label: '≤' }],
  date: [{ op: 'gte', label: 'on/after' }, { op: 'lte', label: 'on/before' }, { op: 'is_empty', label: 'is empty' }, { op: 'is_not_empty', label: 'is not empty' }],
  boolean: [{ op: 'eq', label: 'is' }],
  select: [{ op: 'eq', label: 'is' }, { op: 'neq', label: 'is not' }, { op: 'is_empty', label: 'is empty' }],
}
const opsFor = (t: ColType) => OPS_BY_TYPE[t === 'currency' ? 'number' : t === 'email' || t === 'phone' || t === 'url' || t === 'badge' || t === 'tags' ? 'text' : t] ?? OPS_BY_TYPE.text

function errMsg(e: unknown): string {
  if (e instanceof Error) { try { return JSON.parse(e.message).error ?? e.message } catch { return e.message } }
  return 'Something went wrong'
}
const fmtMoney = (n: unknown) => { const x = Number(n); return Number.isNaN(x) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x) }

export default function CrmTable() {
  const { permissions, role } = usePermissions()
  const navigate = useNavigate()
  const qc = useQueryClient(); const toast = useToast()
  const [object, setObject] = useState<Obj>(() => (localStorage.getItem('crm_table_object') as Obj) || 'companies')
  const mayManage = canManage(permissions, role, object === 'deals' ? 'crm.pipeline' : 'crm.companies')

  useEffect(() => { localStorage.setItem('crm_table_object', object) }, [object])

  const fieldsQ = useFields(OBJECT_FIELD[object])
  const customCols: Col[] = useMemo(() => (fieldsQ.data ?? []).map(d => ({
    key: `custom.${d.key}`, label: d.label,
    type: (d.type === 'multi_select' ? 'tags' : d.type === 'select' ? 'select' : d.type) as ColType,
    editable: true, options: d.options ?? undefined,
  })), [fieldsQ.data])
  const allCols = useMemo(() => [...BUILTIN[object], ...customCols], [object, customCols])
  const colByKey = useMemo(() => new Map(allCols.map(c => [c.key, c])), [allCols])

  const viewsQ = useQuery({ queryKey: ['crm', 'views', object], queryFn: () => api.crm.views(OBJECT_FIELD[object]) })
  const [activeViewId, setActiveViewId] = useState<string>('')
  const [config, setConfig] = useState<ViewConfig>({ columns: DEFAULT_COLS[object], filters: [], pageSize: 50 })
  const [page, setPage] = useState(1)
  const [dirty, setDirty] = useState(false)

  // Resolve the starting view per object (last-opened → default → none).
  useEffect(() => {
    setPage(1)
    const views = viewsQ.data ?? []
    const lastId = localStorage.getItem(`crm_view_${object}`)
    const pick = views.find(v => v.id === lastId) ?? views.find(v => v.is_default) ?? null
    if (pick) { applyView(pick) } else { setActiveViewId(''); setConfig({ columns: DEFAULT_COLS[object], filters: [], pageSize: 50 }); setDirty(false) }
  }, [object, viewsQ.data])

  function applyView(v: CrmSavedView) {
    setActiveViewId(v.id)
    setConfig({ columns: v.config.columns?.length ? v.config.columns : DEFAULT_COLS[object], filters: v.config.filters ?? [], sort: v.config.sort, pageSize: v.config.pageSize ?? 50 })
    setDirty(false)
    localStorage.setItem(`crm_view_${object}`, v.id)
  }

  const columns = (config.columns ?? DEFAULT_COLS[object]).map(k => colByKey.get(k)).filter(Boolean) as Col[]
  const dataQ = useQuery({
    queryKey: ['crm', 'query', object, config.filters, config.sort, page, config.pageSize],
    queryFn: () => api.crm.query(object, { filters: config.filters, sort: config.sort, page, pageSize: config.pageSize ?? 50 }),
  })
  const rows = dataQ.data?.rows ?? []
  const total = dataQ.data?.total ?? 0
  const pageSize = config.pageSize ?? 50
  const pages = Math.max(1, Math.ceil(total / pageSize))

  const patch = (id: string, body: Record<string, unknown>) => {
    if (object === 'companies') return api.crm.updateCompany(id, body)
    if (object === 'contacts') return api.crm.updateContact(id, body)
    return api.crm.updateDeal(id, body)
  }
  const editCell = useMutation({
    mutationFn: ({ id, col, value }: { id: string; col: Col; value: unknown }) =>
      patch(id, col.key.startsWith('custom.') ? { custom: { [col.key.slice(7)]: value } } : { [col.key]: value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm', 'query', object] }); toast.success('Saved') },
    onError: (e) => toast.error(errMsg(e)),
  })

  const setCfg = (patchCfg: Partial<ViewConfig>) => { setConfig(c => ({ ...c, ...patchCfg })); setDirty(true); setPage(1) }
  const toggleSort = (key: string) => {
    const cur = config.sort
    const dir: 'asc' | 'desc' = cur?.field === key && cur.dir === 'asc' ? 'desc' : 'asc'
    setCfg({ sort: { field: key, dir } })
  }

  const saveView = useMutation({
    mutationFn: (p: { name: string; shared: boolean }) => api.crm.createView({ object: OBJECT_FIELD[object], name: p.name, shared: p.shared, config }),
    onSuccess: (v) => { qc.invalidateQueries({ queryKey: ['crm', 'views', object] }); applyView(v); toast.success('View saved') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const updateView = useMutation({
    mutationFn: (p: Partial<{ config: ViewConfig; is_default: boolean; shared: boolean }>) => api.crm.updateView(activeViewId, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm', 'views', object] }); setDirty(false); toast.success('View updated') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const delView = useMutation({
    mutationFn: () => api.crm.deleteView(activeViewId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm', 'views', object] }); setActiveViewId(''); localStorage.removeItem(`crm_view_${object}`); toast.success('View deleted') },
    onError: (e) => toast.error(errMsg(e)),
  })

  const [showCols, setShowCols] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const activeView = (viewsQ.data ?? []).find(v => v.id === activeViewId)

  const rowLink = (r: Record<string, unknown>): string | null => {
    if (object === 'companies') return `/crm/companies/${r.id}`
    return r.company_id ? `/crm/companies/${r.company_id}` : null
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="subtabs subtab-row" style={{ marginBottom: 0, border: 'none' }}>
          {(['companies', 'contacts', 'deals'] as Obj[]).map(o => (
            <button key={o} className={`subtab ${object === o ? 'active' : ''}`} onClick={() => setObject(o)} style={{ textTransform: 'capitalize' }}>{o}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={activeViewId} onChange={e => { const v = (viewsQ.data ?? []).find(x => x.id === e.target.value); if (v) applyView(v); else { setActiveViewId(''); setConfig({ columns: DEFAULT_COLS[object], filters: [], pageSize: 50 }) } }} style={{ width: 'auto' }}>
            <option value="">All {object}</option>
            {(viewsQ.data ?? []).map(v => <option key={v.id} value={v.id}>{v.name}{v.is_default ? ' ★' : ''}{v.shared ? '' : ' (private)'}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowFilter(s => !s)}>Filter{(config.filters?.length ?? 0) > 0 ? ` (${config.filters!.length})` : ''}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowCols(s => !s)}>Columns</button>
          {mayManage && activeViewId && dirty && <button className="btn btn-ghost btn-sm" onClick={() => updateView.mutate({ config })}>Save changes</button>}
          {mayManage && activeViewId && <button className="btn btn-ghost btn-sm" onClick={() => updateView.mutate({ is_default: true })} title="Set as default">★</button>}
          {mayManage && <button className="btn btn-primary btn-sm" onClick={() => { const name = prompt('Save view as:'); if (name?.trim()) saveView.mutate({ name: name.trim(), shared: true }) }}>Save view</button>}
          {mayManage && activeView && (activeView.owner === null || role === 'owner' || activeView.owner) && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-text)' }} onClick={() => delView.mutate()} title="Delete view">✕</button>}
        </div>
      </div>

      {/* Column picker */}
      {showCols && (
        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div className="section-label">Columns</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {allCols.map(c => {
              const on = (config.columns ?? []).includes(c.key)
              return (
                <label key={c.key} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={on} style={{ width: 'auto' }} onChange={() => {
                    const cur = config.columns ?? []
                    setCfg({ columns: on ? cur.filter(k => k !== c.key) : [...cur, c.key] })
                  }} /> {c.label}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter builder */}
      {showFilter && <FilterBar cols={allCols} filters={config.filters ?? []} onChange={f => setCfg({ filters: f })} />}

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {c.label}{config.sort?.field === c.key ? (config.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataQ.isLoading && <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
              {!dataQ.isLoading && rows.length === 0 && <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No rows.</td></tr>}
              {rows.map(r => (
                <tr key={String(r.id)}>
                  {columns.map(c => (
                    <Cell key={c.key} col={c} row={r} mayManage={mayManage} link={c.link ? rowLink(r) : null}
                      onNav={(to) => navigate(to)} onSave={(value) => editCell.mutate({ id: String(r.id), col: c, value })} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
        <span>{total} {object}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  )
}

// ── Cell (display + inline edit) ─────────────────────────────────────────────
function Cell({ col, row, mayManage, link, onNav, onSave }: { col: Col; row: Record<string, unknown>; mayManage: boolean; link: string | null; onNav: (to: string) => void; onSave: (v: unknown) => void }) {
  const [editing, setEditing] = useState(false)
  const raw = col.key.startsWith('custom.') ? (row.custom as Record<string, unknown> | undefined)?.[col.key.slice(7)] : row[col.key]

  if (editing) {
    return <td><CellEditor col={col} value={raw} onCancel={() => setEditing(false)} onCommit={(v) => { setEditing(false); onSave(v) }} /></td>
  }

  const display = renderValue(col, raw)
  const canEdit = mayManage && col.editable
  return (
    <td onClick={() => { if (link) onNav(link); else if (canEdit) setEditing(true) }}
      style={{ cursor: link ? 'pointer' : canEdit ? 'text' : 'default', whiteSpace: 'nowrap', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}
      title={canEdit && !link ? 'Click to edit' : undefined}>
      {link ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{display}</span> : display}
    </td>
  )
}

function renderValue(col: Col, v: unknown): React.ReactNode {
  if (v == null || v === '') return <span style={{ color: 'var(--text-hint)' }}>—</span>
  switch (col.type) {
    case 'currency': return fmtMoney(v)
    case 'date': { try { return format(new Date(String(v)), 'MMM d, yyyy') } catch { return String(v) } }
    case 'boolean': return v ? 'Yes' : 'No'
    case 'badge': return <span className="badge badge-dim">{String(v)}</span>
    case 'select': return <span className="badge badge-dim">{String(v)}</span>
    case 'tags': return Array.isArray(v) ? v.map((t, i) => <span key={i} className="badge badge-dim" style={{ marginRight: 4 }}>{String(t)}</span>) : String(v)
    case 'email': return <a href={`mailto:${v}`} style={{ color: 'var(--accent)' }} onClick={e => e.stopPropagation()}>{String(v)}</a>
    case 'phone': return <span className="mono">{String(v)}</span>
    case 'url': return <a href={String(v).startsWith('http') ? String(v) : `https://${v}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }} onClick={e => e.stopPropagation()}>{String(v)}</a>
    default: return String(v)
  }
}

function CellEditor({ col, value, onCommit, onCancel }: { col: Col; value: unknown; onCommit: (v: unknown) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<any>(value ?? (col.type === 'boolean' ? false : ''))
  const commit = () => onCommit(draft === '' ? null : draft)
  const key = (e: any) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel() }
  if (col.type === 'boolean') return <input type="checkbox" autoFocus checked={!!draft} onChange={e => onCommit(e.target.checked)} onBlur={onCancel} style={{ width: 'auto' }} />
  if (col.type === 'select' && col.options) return (
    <select autoFocus value={String(draft ?? '')} onChange={e => onCommit(e.target.value || null)} onBlur={onCancel}>
      <option value="">—</option>{col.options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  const inputType = col.type === 'number' || col.type === 'currency' ? 'number' : col.type === 'date' ? 'date' : 'text'
  return <input autoFocus type={inputType} value={draft ?? ''} onChange={e => setDraft(inputType === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} onBlur={commit} onKeyDown={key} style={{ minWidth: 120 }} />
}

// ── Filter bar ───────────────────────────────────────────────────────────────
function FilterBar({ cols, filters, onChange }: { cols: Col[]; filters: CrmFilter[]; onChange: (f: CrmFilter[]) => void }) {
  const [field, setField] = useState(cols[0]?.key ?? '')
  const col = cols.find(c => c.key === field) ?? cols[0]
  const ops = col ? opsFor(col.type) : []
  const [op, setOp] = useState(ops[0]?.op ?? 'contains')
  const [value, setValue] = useState('')

  const add = () => {
    if (!col) return
    const needsValue = op !== 'is_empty' && op !== 'is_not_empty'
    if (needsValue && value === '') return
    onChange([...filters, { field, op, value: col.type === 'number' || col.type === 'currency' ? Number(value) : col.type === 'boolean' ? value === 'true' : value }])
    setValue('')
  }

  return (
    <div className="card" style={{ marginBottom: 12, padding: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: filters.length ? 10 : 0 }}>
        {filters.map((f, i) => {
          const c = cols.find(x => x.key === f.field)
          const opLabel = (OPS_BY_TYPE[c ? (c.type === 'currency' ? 'number' : 'text') : 'text'] ?? []).find(o => o.op === f.op)?.label ?? f.op
          return (
            <span key={i} className="badge badge-dim" style={{ gap: 6 }}>
              {c?.label ?? f.field} {opLabel} {String(f.value)}
              <button onClick={() => onChange(filters.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, width: 'auto', fontSize: 12 }}>✕</button>
            </span>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={field} onChange={e => { setField(e.target.value); const nc = cols.find(c => c.key === e.target.value); setOp(opsFor(nc?.type ?? 'text')[0]?.op ?? 'contains') }} style={{ width: 'auto' }}>
          {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={op} onChange={e => setOp(e.target.value)} style={{ width: 'auto' }}>{ops.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
        {op !== 'is_empty' && op !== 'is_not_empty' && (
          col?.type === 'boolean'
            ? <select value={value} onChange={e => setValue(e.target.value)} style={{ width: 'auto' }}><option value="true">Yes</option><option value="false">No</option></select>
            : <input value={value} onChange={e => setValue(e.target.value)} type={col?.type === 'number' || col?.type === 'currency' ? 'number' : col?.type === 'date' ? 'date' : 'text'} placeholder="value" style={{ maxWidth: 180 }} onKeyDown={e => e.key === 'Enter' && add()} />
        )}
        <button className="btn btn-ghost btn-sm" onClick={add}>Add filter</button>
      </div>
    </div>
  )
}
