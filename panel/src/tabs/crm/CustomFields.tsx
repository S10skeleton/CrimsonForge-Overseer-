/**
 * CRM custom fields (P1a — Attio-style attributes). Generic across company /
 * contact / deal records: `CustomFields` renders user-defined fields with
 * type-appropriate inline editing; `ManageFieldsModal` lets owner/admin
 * add / rename / reorder / archive field definitions. Driven by crm_field_defs.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import type { CrmFieldDef, CrmFieldType, CrmCustom } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { errMsg } from './crmShared'

type CrmObject = 'company' | 'contact' | 'deal'

export function useFields(object: CrmObject) {
  return useQuery({ queryKey: ['crm', 'fields', object], queryFn: () => api.crm.fields(object) })
}

const FIELD_TYPES: CrmFieldType[] = ['text', 'number', 'date', 'select', 'multi_select', 'phone', 'email', 'url', 'boolean', 'currency']

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function updateRecord(object: CrmObject, id: string, custom: CrmCustom) {
  if (object === 'company') return api.crm.updateCompany(id, { custom })
  if (object === 'contact') return api.crm.updateContact(id, { custom })
  return api.crm.updateDeal(id, { custom })
}

function displayValue(def: CrmFieldDef, v: unknown): string {
  if (v == null || v === '') return '—'
  if (def.type === 'boolean') return v ? 'Yes' : 'No'
  if (def.type === 'multi_select' && Array.isArray(v)) return v.join(', ')
  if (def.type === 'currency') { const n = Number(v); return Number.isNaN(n) ? String(v) : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) }
  return String(v)
}

// One editable value control, type-aware.
function ValueEditor({ def, value, onCommit, onCancel }: { def: CrmFieldDef; value: unknown; onCommit: (v: unknown) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<any>(value ?? (def.type === 'multi_select' ? [] : def.type === 'boolean' ? false : ''))
  const commit = () => onCommit(draft === '' ? null : draft)
  const common = { autoFocus: true, onKeyDown: (e: any) => { if (e.key === 'Enter' && def.type !== 'multi_select') commit(); if (e.key === 'Escape') onCancel() } }

  let control: React.ReactNode
  if (def.type === 'boolean') {
    control = <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={!!draft} onChange={e => setDraft(e.target.checked)} style={{ width: 'auto' }} /> {draft ? 'Yes' : 'No'}</label>
  } else if (def.type === 'select') {
    control = <select value={String(draft ?? '')} onChange={e => setDraft(e.target.value)} {...common}><option value="">—</option>{(def.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}</select>
  } else if (def.type === 'multi_select') {
    const arr: string[] = Array.isArray(draft) ? draft : []
    control = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(def.options ?? []).map(o => (
          <label key={o} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12.5 }}>
            <input type="checkbox" checked={arr.includes(o)} onChange={e => setDraft(e.target.checked ? [...arr, o] : arr.filter(x => x !== o))} style={{ width: 'auto' }} /> {o}
          </label>
        ))}
      </div>
    )
  } else if (def.type === 'number' || def.type === 'currency') {
    control = <input type="number" value={draft ?? ''} onChange={e => setDraft(e.target.value === '' ? '' : Number(e.target.value))} {...common} />
  } else if (def.type === 'date') {
    control = <input type="date" value={String(draft ?? '')} onChange={e => setDraft(e.target.value)} {...common} />
  } else {
    control = <input type={def.type === 'email' ? 'email' : def.type === 'url' ? 'url' : def.type === 'phone' ? 'tel' : 'text'} value={String(draft ?? '')} onChange={e => setDraft(e.target.value)} {...common} />
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>{control}</div>
      <button className="btn btn-primary btn-sm" onClick={commit}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  )
}

export function CustomFields({ object, recordId, custom, canEdit }: { object: CrmObject; recordId: string; custom: CrmCustom | undefined; canEdit: boolean }) {
  const fieldsQ = useFields(object)
  const qc = useQueryClient(); const toast = useToast()
  const [editing, setEditing] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => updateRecord(object, recordId, { [key]: value }),
    onSuccess: () => {
      // Refresh whatever view holds this record (company detail caches the bundle).
      qc.invalidateQueries({ queryKey: ['crm'] })
      setEditing(null); toast.success('Saved')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const defs = (fieldsQ.data ?? [])
  if (defs.length === 0) return null
  const values = custom ?? {}

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {defs.map(def => (
        <div key={def.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start', padding: '7px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .4, paddingTop: 3 }}>{def.label}</div>
          {editing === def.key ? (
            <ValueEditor def={def} value={values[def.key]} onCancel={() => setEditing(null)} onCommit={(v) => save.mutate({ key: def.key, value: v })} />
          ) : (
            <div
              onClick={() => canEdit && setEditing(def.key)}
              title={canEdit ? 'Click to edit' : undefined}
              style={{ fontSize: 13.5, color: values[def.key] == null || values[def.key] === '' ? 'var(--text-hint)' : 'var(--text-primary)', cursor: canEdit ? 'pointer' : 'default', paddingTop: 2, minHeight: 20 }}
            >
              {displayValue(def, values[def.key])}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Manage field definitions (owner/admin) ──────────────────────────────────
export function ManageFieldsModal({ object, onClose }: { object: CrmObject; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()
  const fieldsQ = useQuery({ queryKey: ['crm', 'fields', object, 'all'], queryFn: () => api.crm.fields(object, true) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['crm', 'fields', object] }); qc.invalidateQueries({ queryKey: ['crm', 'fields', object, 'all'] }) }

  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [type, setType] = useState<CrmFieldType>('text')
  const [options, setOptions] = useState('')

  const create = useMutation({
    mutationFn: () => api.crm.createField({
      object, key: key.trim(), label: label.trim(), type,
      options: (type === 'select' || type === 'multi_select') ? options.split(',').map(s => s.trim()).filter(Boolean) : null,
      position: (fieldsQ.data?.length ?? 0),
    }),
    onSuccess: () => { setLabel(''); setKey(''); setKeyTouched(false); setType('text'); setOptions(''); refresh(); toast.success('Field added') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const patch = useMutation({ mutationFn: ({ id, ...f }: { id: string } & Partial<CrmFieldDef>) => api.crm.updateField(id, f), onSuccess: refresh, onError: (e) => toast.error(errMsg(e)) })
  const remove = useMutation({ mutationFn: (id: string) => api.crm.deleteField(id), onSuccess: () => { refresh(); toast.success('Field deleted') }, onError: (e) => toast.error(errMsg(e)) })

  const defs = [...(fieldsQ.data ?? [])].sort((a, b) => a.position - b.position)
  const move = (i: number, dir: -1 | 1) => {
    const a = defs[i], b = defs[i + dir]
    if (!a || !b) return
    patch.mutate({ id: a.id, position: b.position })
    patch.mutate({ id: b.id, position: a.position })
  }

  const needsOptions = type === 'select' || type === 'multi_select'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,29,35,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16, animation: 'overlay-in .15s ease' }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', padding: 24, animation: 'dialog-in .18s ease both' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Manage {object} fields</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, padding: 4, width: 'auto' }}>×</button>
        </div>

        {/* Existing fields */}
        {fieldsQ.isLoading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : defs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>No custom fields yet. Add one below.</div>
        ) : (
          <div style={{ marginBottom: 18 }}>
            {defs.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)', opacity: d.archived ? 0.5 : 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', lineHeight: 1.2 }} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', lineHeight: 1.2 }} disabled={i === defs.length - 1} onClick={() => move(i, 1)}>▼</button>
                </div>
                <input defaultValue={d.label} onBlur={e => { if (e.target.value.trim() && e.target.value !== d.label) patch.mutate({ id: d.id, label: e.target.value.trim() }) }} style={{ flex: 1 }} />
                <span className="badge badge-dim">{d.type}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-hint)' }}>{d.key}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => patch.mutate({ id: d.id, archived: !d.archived })}>{d.archived ? 'Restore' : 'Archive'}</button>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-text)' }} onClick={async () => { if (await confirm({ title: 'Delete field?', body: `"${d.label}" — record values for this field stay stored but stop showing.`, confirmLabel: 'Delete', danger: true })) remove.mutate(d.id) }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Add field */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>Add field</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 140px' }}>
              <div className="section-label" style={{ marginBottom: 4 }}>Label</div>
              <input value={label} onChange={e => { setLabel(e.target.value); if (!keyTouched) setKey(slugify(e.target.value)) }} placeholder="Intro source" />
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <div className="section-label" style={{ marginBottom: 4 }}>Key</div>
              <input value={key} onChange={e => { setKey(slugify(e.target.value)); setKeyTouched(true) }} placeholder="intro_source" className="mono" />
            </div>
            <div style={{ flex: '0 1 130px' }}>
              <div className="section-label" style={{ marginBottom: 4 }}>Type</div>
              <select value={type} onChange={e => setType(e.target.value as CrmFieldType)}>{FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            </div>
          </div>
          {needsOptions && (
            <div style={{ marginTop: 10 }}>
              <div className="section-label" style={{ marginBottom: 4 }}>Options (comma-separated)</div>
              <input value={options} onChange={e => setOptions(e.target.value)} placeholder="Referral, Conference, Inbound" />
            </div>
          )}
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} disabled={!label.trim() || !key.trim() || create.isPending || (needsOptions && !options.trim())} onClick={() => create.mutate()}>Add field</button>
        </div>
      </div>
    </div>
  )
}
