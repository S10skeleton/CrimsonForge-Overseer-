/**
 * SuperAdmin → Blocklist (owner-only). Domains/addresses here never become CRM
 * contacts or activities. Calls the owner-only /api/crm/sync/blocklist endpoints
 * (already audited). Moved out of the now-open Inboxes tab in #14.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import { errMsg } from '../crm/crmShared'

export default function BlocklistView() {
  const qc = useQueryClient(); const toast = useToast()
  const blockQ = useQuery({ queryKey: ['crm', 'blocklist'], queryFn: api.crm.blocklist })
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'blocklist'] })

  const [pattern, setPattern] = useState('')
  const [reason, setReason] = useState('')

  const addBlock = useMutation({ mutationFn: () => api.crm.addBlock({ pattern: pattern.trim(), reason: reason.trim() || undefined }), onSuccess: () => { setPattern(''); setReason(''); refresh(); toast.success('Added to blocklist') }, onError: (e) => toast.error(errMsg(e)) })
  const removeBlock = useMutation({ mutationFn: (id: string) => api.crm.removeBlock(id), onSuccess: () => { refresh(); toast.success('Removed') }, onError: (e) => toast.error(errMsg(e)) })

  const blocks = blockQ.data ?? []

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Email blocklist</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, maxWidth: 640 }}>
        Domains or addresses here never become CRM contacts or activities (you still receive their email normally in Gmail).
      </div>
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pattern</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {blockQ.isLoading && <tr><td colSpan={3} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Loading…</td></tr>}
              {!blockQ.isLoading && blocks.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Nothing blocked.</td></tr>}
              {blocks.map(b => (
                <tr key={b.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{b.pattern}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{b.reason || '—'}</td>
                  <td><div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-text)' }} onClick={() => removeBlock.mutate(b.id)}>✕</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="section-label">Add to blocklist</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 170px' }}>
            <div className="section-label" style={{ marginBottom: 4 }}>Domain or email</div>
            <input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="motor.com or x@y.com" className="mono" />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <div className="section-label" style={{ marginBottom: 4 }}>Reason (optional)</div>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="vendor, personal…" />
          </div>
          <button className="btn btn-primary btn-sm" disabled={!pattern.trim() || addBlock.isPending} onClick={() => addBlock.mutate()}>Add</button>
        </div>
      </div>
    </div>
  )
}
