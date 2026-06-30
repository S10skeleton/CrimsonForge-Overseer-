/**
 * Connected inboxes (CRM P1b) — owner/admin manage which @workspace mailboxes
 * the sync engine ingests. Read-only Gmail/Calendar; only correspondence with
 * EXTERNAL parties is logged to the CRM. A mailbox can be disabled anytime.
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
  const q = useQuery({ queryKey: ['crm', 'mailboxes'], queryFn: api.crm.mailboxes })
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'mailboxes'] })

  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')

  const add = useMutation({ mutationFn: () => api.crm.addMailbox({ email: email.trim(), label: label.trim() || undefined }), onSuccess: () => { setEmail(''); setLabel(''); refresh(); toast.success('Mailbox added') }, onError: (e) => toast.error(errMsg(e)) })
  const toggle = useMutation({ mutationFn: (m: { email: string; enabled: boolean }) => api.crm.updateMailbox(m.email, { enabled: m.enabled }), onSuccess: refresh, onError: (e) => toast.error(errMsg(e)) })
  const remove = useMutation({ mutationFn: (em: string) => api.crm.removeMailbox(em), onSuccess: () => { refresh(); toast.success('Mailbox removed') }, onError: (e) => toast.error(errMsg(e)) })

  const mailboxes = q.data?.data ?? []
  const configured = q.data?.configured
  const domain = q.data?.domain

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Connected inboxes</h2>
        {domain && <span className="badge badge-dim">{domain}</span>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, maxWidth: 620 }}>
        Read-only Gmail + Calendar sync. Email and meetings with <strong>external</strong> contacts are auto-logged to the CRM
        (and new contacts/companies created). Internal-only threads are skipped. Logged items are visible to CRM admins.
      </div>

      {q.isLoading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
        <>
          {configured === false && (
            <div style={{ padding: '12px 16px', marginBottom: 16, borderRadius: 8, border: '1px solid rgba(217,119,6,.3)', background: 'rgba(217,119,6,.06)', color: 'var(--yellow)', fontSize: 13 }}>
              Workspace sync isn’t configured yet — the service account env (GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY / GOOGLE_WORKSPACE_DOMAIN) needs to be set. Mailboxes you add here start syncing once it is.
            </div>
          )}

          <div className="card" style={{ padding: 0, marginBottom: 18 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Mailbox</th><th>Status</th><th>Last sync</th><th></th></tr></thead>
                <tbody>
                  {mailboxes.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No mailboxes connected yet.</td></tr>}
                  {mailboxes.map(m => (
                    <tr key={m.email}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.email}</div>
                        {m.label && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.label}</div>}
                      </td>
                      <td><span className={`badge ${m.enabled ? 'badge-green' : 'badge-dim'}`}>{m.enabled ? 'Syncing' : 'Paused'}</span></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.last_sync ? formatDistanceToNow(new Date(m.last_sync), { addSuffix: true }) : 'never'}</td>
                      <td>
                        {canManage && (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggle.mutate({ email: m.email, enabled: !m.enabled })}>{m.enabled ? 'Pause' : 'Resume'}</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-text)' }} onClick={async () => { if (await confirm({ title: 'Remove mailbox?', body: `${m.email} — stops new ingest. Already-logged activities stay.`, confirmLabel: 'Remove', danger: true })) remove.mutate(m.email) }}>✕</button>
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
              <div className="section-label">Add mailbox</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div className="section-label" style={{ marginBottom: 4 }}>Email{domain ? ` (@${domain})` : ''}</div>
                  <input value={email} onChange={e => setEmail(e.target.value)} placeholder={domain ? `admin@${domain}` : 'admin@yourdomain.com'} type="email" />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <div className="section-label" style={{ marginBottom: 4 }}>Label (optional)</div>
                  <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Sales inbox" />
                </div>
                <button className="btn btn-primary btn-sm" disabled={!email.trim() || add.isPending} onClick={() => add.mutate()}>Add</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
