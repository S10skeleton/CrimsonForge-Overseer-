/**
 * Connected inboxes (CRM P1b) — owner/admin. v1 syncs the one connected Google
 * account (read-only); only real two-way correspondence with EXTERNAL parties
 * is logged. A blocklist (MOTOR, personal addresses) is never ingested. Accounts
 * can be paused anytime; already-logged activities remain.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { errMsg } from './crmShared'

export default function InboxesView({ role }: { role: string }) {
  const canManage = role === 'owner' || role === 'admin'
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()
  const accountsQ = useQuery({ queryKey: ['crm', 'sync-accounts'], queryFn: api.crm.syncAccounts })
  const blockQ = useQuery({ queryKey: ['crm', 'blocklist'], queryFn: api.crm.blocklist })
  const refreshA = () => qc.invalidateQueries({ queryKey: ['crm', 'sync-accounts'] })
  const refreshB = () => qc.invalidateQueries({ queryKey: ['crm', 'blocklist'] })

  const [email, setEmail] = useState('')
  const [pattern, setPattern] = useState('')
  const [reason, setReason] = useState('')

  const addAccount = useMutation({ mutationFn: () => api.crm.addSyncAccount({ email: email.trim() }), onSuccess: () => { setEmail(''); refreshA(); toast.success('Account added') }, onError: (e) => toast.error(errMsg(e)) })
  const toggle = useMutation({ mutationFn: (m: { email: string; enabled: boolean }) => api.crm.updateSyncAccount(m.email, { enabled: m.enabled }), onSuccess: refreshA, onError: (e) => toast.error(errMsg(e)) })
  const removeAccount = useMutation({ mutationFn: (em: string) => api.crm.removeSyncAccount(em), onSuccess: () => { refreshA(); toast.success('Account removed') }, onError: (e) => toast.error(errMsg(e)) })

  const addBlock = useMutation({ mutationFn: () => api.crm.addBlock({ pattern: pattern.trim(), reason: reason.trim() || undefined }), onSuccess: () => { setPattern(''); setReason(''); refreshB(); toast.success('Added to blocklist') }, onError: (e) => toast.error(errMsg(e)) })
  const removeBlock = useMutation({ mutationFn: (id: string) => api.crm.removeBlock(id), onSuccess: () => { refreshB(); toast.success('Removed') }, onError: (e) => toast.error(errMsg(e)) })

  const accounts = accountsQ.data?.data ?? []
  const configured = accountsQ.data?.configured
  const domain = accountsQ.data?.domain
  const blocks = blockQ.data ?? []

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Connected inboxes</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, maxWidth: 640 }}>
        Read-only Gmail + Calendar sync. Only <strong>two-way</strong> email and meetings with <strong>external</strong> contacts are
        logged to the CRM — newsletters, promotions, automated mail, and blocklisted senders are skipped. Full email bodies aren’t
        stored; opening an item fetches the thread live. Logged items are visible to CRM admins.
      </div>

      {configured === false && (
        <div style={{ padding: '12px 16px', marginBottom: 16, borderRadius: 8, border: '1px solid rgba(217,119,6,.3)', background: 'rgba(217,119,6,.06)', color: 'var(--yellow)', fontSize: 13 }}>
          Google isn’t connected — set the OAuth env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN). Accounts added here start syncing once it is.
        </div>
      )}

      {/* Accounts */}
      <div className="card" style={{ padding: 0, marginBottom: 18 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Account</th><th>Method</th><th>Status</th><th>Last sync</th><th></th></tr></thead>
            <tbody>
              {accountsQ.isLoading && <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Loading…</td></tr>}
              {!accountsQ.isLoading && accounts.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No accounts connected yet.</td></tr>}
              {accounts.map(a => (
                <tr key={a.email}>
                  <td style={{ fontWeight: 600 }}>{a.email}</td>
                  <td><span className="badge badge-dim">{a.method}</span></td>
                  <td><span className={`badge ${a.enabled ? 'badge-green' : 'badge-dim'}`}>{a.enabled ? 'Syncing' : 'Paused'}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.last_sync ? formatDistanceToNow(new Date(a.last_sync), { addSuffix: true }) : 'never'}</td>
                  <td>
                    {canManage && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle.mutate({ email: a.email, enabled: !a.enabled })}>{a.enabled ? 'Pause' : 'Resume'}</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-text)' }} onClick={async () => { if (await confirm({ title: 'Remove account?', body: `${a.email} — stops new ingest. Logged activities stay.`, confirmLabel: 'Remove', danger: true })) removeAccount.mutate(a.email) }}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canManage && (
        <div className="card" style={{ maxWidth: 520, marginBottom: 22 }}>
          <div className="section-label">Add account{domain ? ` (@${domain})` : ''}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder={domain ? `admin@${domain}` : 'admin@yourdomain.com'} type="email" style={{ flex: '1 1 220px' }} />
            <button className="btn btn-primary btn-sm" disabled={!email.trim() || addAccount.isPending} onClick={() => addAccount.mutate()}>Add</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8 }}>v1 syncs the single connected Google account. Multi-inbox (matt@, shane@) arrives with domain-wide delegation later.</div>
        </div>
      )}

      {/* Blocklist */}
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Blocklist</h2>
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
                  <td>{canManage && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-text)' }} onClick={() => removeBlock.mutate(b.id)}>✕</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canManage && (
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
      )}
    </div>
  )
}
