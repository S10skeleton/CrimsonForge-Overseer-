/**
 * Connected inboxes (CRM P1b) — visible to CRM users. Shows the connected
 * Google account(s) + sync status; only real two-way correspondence with
 * EXTERNAL parties is logged (read-only). Account management (add/pause/remove)
 * is owner-only — non-owners get a read-only list. The sensitive blocklist now
 * lives in the owner-only SuperAdmin area (SUPERADMIN), not here.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { errMsg } from './crmShared'

// Honest sync status from enabled + last_sync (CRM-FIX3) — no more permanent
// "Syncing". Amber "Pending" = enabled but never completed a run.
function syncBadge(a: { enabled: boolean; last_sync: string | null }): { label: string; cls: string; style?: React.CSSProperties } {
  if (!a.enabled) return { label: 'Paused', cls: 'badge badge-dim' }
  if (!a.last_sync) return { label: 'Pending', cls: 'badge', style: { background: 'rgba(217,119,6,.12)', color: 'var(--yellow)', borderColor: 'rgba(217,119,6,.3)' } }
  const ageMin = (Date.now() - new Date(a.last_sync).getTime()) / 60000
  return ageMin <= 90 ? { label: 'Synced', cls: 'badge badge-green' } : { label: 'Active', cls: 'badge badge-dim' }
}

export default function InboxesView({ role }: { role: string }) {
  const canManage = role === 'owner'
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()
  const accountsQ = useQuery({ queryKey: ['crm', 'sync-accounts'], queryFn: api.crm.syncAccounts })
  const refreshA = () => qc.invalidateQueries({ queryKey: ['crm', 'sync-accounts'] })

  const [email, setEmail] = useState('')

  const addAccount = useMutation({ mutationFn: () => api.crm.addSyncAccount({ email: email.trim() }), onSuccess: () => { setEmail(''); refreshA(); toast.success('Account added') }, onError: (e) => toast.error(errMsg(e)) })
  const toggle = useMutation({ mutationFn: (m: { email: string; enabled: boolean }) => api.crm.updateSyncAccount(m.email, { enabled: m.enabled }), onSuccess: refreshA, onError: (e) => toast.error(errMsg(e)) })
  const removeAccount = useMutation({ mutationFn: (em: string) => api.crm.removeSyncAccount(em), onSuccess: () => { refreshA(); toast.success('Account removed') }, onError: (e) => toast.error(errMsg(e)) })

  const accounts = accountsQ.data?.data ?? []
  const configured = accountsQ.data?.configured
  const domain = accountsQ.data?.domain

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
                  <td>
                    {(() => { const s = syncBadge(a); return <span className={s.cls} style={s.style}>{s.label}</span> })()}
                    {a.last_error && <span title={a.last_error} style={{ marginLeft: 6, cursor: 'help' }}>⚠️</span>}
                  </td>
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
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="section-label">Add account{domain ? ` (@${domain})` : ''}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder={domain ? `admin@${domain}` : 'admin@yourdomain.com'} type="email" style={{ flex: '1 1 220px' }} />
            <button className="btn btn-primary btn-sm" disabled={!email.trim() || addAccount.isPending} onClick={() => addAccount.mutate()}>Add</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8 }}>v1 syncs the single connected Google account. Multi-inbox (matt@, shane@) arrives with domain-wide delegation later.</div>
        </div>
      )}
    </div>
  )
}
