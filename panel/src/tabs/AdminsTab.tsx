import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../api'
import type { Admin, Invite } from '../api'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import PermissionMatrix from '../components/PermissionMatrix'
import { presetPermissions } from '../lib/permissions'
import type { Permissions } from '../lib/permissions'

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', read_only: 'Read-only', custom: 'Custom' }

function errMsg(e: unknown): string {
  if (e instanceof Error) { try { return JSON.parse(e.message).error ?? e.message } catch { return e.message } }
  return 'Something went wrong'
}

export default function AdminsTab({ role }: { role: string }) {
  const isOwner = role === 'owner'
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()

  const { data: admins, isLoading, error } = useQuery({ queryKey: ['admins'], queryFn: api.admins.list })
  const { data: invites } = useQuery({ queryKey: ['invites'], queryFn: api.admins.invites, enabled: isOwner })

  const [showInvite, setShowInvite] = useState(false)
  const [inv, setInv] = useState({ email: '', displayName: '', username: '', role: 'admin' })
  const [invPerms, setInvPerms] = useState<Permissions>(presetPermissions('admin'))
  const [editId, setEditId] = useState<string | null>(null)
  const [editPerms, setEditPerms] = useState<Permissions>({})

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['admins'] }); qc.invalidateQueries({ queryKey: ['invites'] }) }

  const inviteM = useMutation({
    mutationFn: () => api.admins.invite({ email: inv.email, displayName: inv.displayName || undefined, username: inv.username || undefined, role: inv.role, permissions: invPerms }),
    onSuccess: async (res) => {
      invalidate(); setShowInvite(false); setInv({ email: '', displayName: '', username: '', role: 'admin' }); setInvPerms(presetPermissions('admin'))
      if (res.emailed) toast.success(`Invite sent to ${res.invite.email}`)
      else await confirm({ title: 'Invite link (email is off)', body: `Share this set-password link with ${res.invite.email}:\n\n${res.acceptUrl}`, confirmLabel: 'Copied', cancelLabel: 'Close' })
    },
    onError: (e) => toast.error(errMsg(e)),
  })
  const updateM = useMutation({
    mutationFn: (v: { id: string; payload: Partial<{ role: string; status: string; permissions: Permissions }> }) => api.admins.update(v.id, v.payload),
    onSuccess: () => { invalidate(); toast.success('Admin updated') }, onError: (e) => toast.error(errMsg(e)),
  })
  const resetM = useMutation({
    mutationFn: (id: string) => api.admins.resetPassword(id),
    onSuccess: async (res) => { if (res.emailed) toast.success('Reset link emailed'); else await confirm({ title: 'Temporary password (shown once)', body: `Password: ${res.tempPassword}`, confirmLabel: 'Copied', cancelLabel: 'Close' }) },
    onError: (e) => toast.error(errMsg(e)),
  })
  const resendM = useMutation({ mutationFn: (id: string) => api.admins.resendInvite(id), onSuccess: (res) => { invalidate(); toast.success(res.emailed ? 'Invite re-sent' : 'New link generated') }, onError: (e) => toast.error(errMsg(e)) })
  const revokeM = useMutation({ mutationFn: (id: string) => api.admins.revokeInvite(id), onSuccess: () => { invalidate(); toast.success('Invite revoked') }, onError: (e) => toast.error(errMsg(e)) })

  const onRolePreset = (r: string) => { setInv({ ...inv, role: r }); if (r !== 'custom') setInvPerms(presetPermissions(r)) }

  const changeRole = async (a: Admin, newRole: string) => {
    if (newRole === a.role) return
    if (await confirm({ title: 'Change role?', body: `Set ${a.username} to ${ROLE_LABEL[newRole]}?`, confirmLabel: 'Change role' })) updateM.mutate({ id: a.id, payload: { role: newRole } })
  }
  const toggleStatus = async (a: Admin) => {
    const suspending = a.status === 'active'
    if (await confirm({ title: suspending ? 'Suspend admin?' : 'Reactivate admin?', body: suspending ? `${a.username} loses access immediately.` : `Restore access for ${a.username}?`, confirmLabel: suspending ? 'Suspend' : 'Reactivate', danger: suspending }))
      updateM.mutate({ id: a.id, payload: { status: suspending ? 'suspended' : 'active' } })
  }
  const resetPassword = async (a: Admin) => {
    if (await confirm({ title: 'Reset password?', body: `Issue a new temporary password for ${a.username}?`, confirmLabel: 'Reset password', danger: true })) resetM.mutate(a.id)
  }
  const openPerms = (a: Admin) => { setEditId(editId === a.id ? null : a.id); setEditPerms(a.permissions ?? {}) }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Admins &amp; Roles</h1>
        {isOwner && <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(v => !v)}>{showInvite ? 'Cancel' : '+ Invite teammate'}</button>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>
        Named operator accounts with per-area access. {isOwner ? 'Owner-gated, audited.' : 'Only owners can modify accounts.'}
      </div>

      {showInvite && isOwner && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
          <div className="section-label">Invite teammate</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ flex: '1 1 180px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>EMAIL</label><input value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} placeholder="matt@crimsonforge.pro" /></div>
            <div style={{ flex: '1 1 130px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>NAME</label><input value={inv.displayName} onChange={e => setInv({ ...inv, displayName: e.target.value })} /></div>
            <div style={{ flex: '0 1 120px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>USERNAME</label><input value={inv.username} onChange={e => setInv({ ...inv, username: e.target.value })} placeholder="optional" /></div>
            <div style={{ flex: '0 1 120px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>PRESET</label>
              <select value={inv.role} onChange={e => onRolePreset(e.target.value)}><option value="admin">Admin</option><option value="read_only">Read-only</option><option value="owner">Owner</option><option value="custom">Custom</option></select></div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginBottom: 8 }}>{inv.role === 'custom' ? 'Set each area below.' : 'Preset applied — switch to Custom to edit per area.'}</div>
          <PermissionMatrix value={invPerms} onChange={setInvPerms} disabled={inv.role !== 'custom'} />
          <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={!inv.email.trim() || inviteM.isPending} onClick={() => inviteM.mutate()}>{inviteM.isPending ? 'Sending…' : 'Send invite'}</button>
        </div>
      )}

      {isOwner && invites && invites.filter(i => i.status === 'invited').length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: 0 }}>
          <div style={{ padding: '14px 18px 8px' }}><div className="section-label" style={{ margin: 0 }}>Pending invites</div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Email</th><th>Role</th><th className="mobile-hide">Sent</th><th>Expires</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {invites.filter((i: Invite) => i.status === 'invited').map(i => (
                  <tr key={i.id}>
                    <td>{i.email}{i.display_name ? <span style={{ color: 'var(--text-hint)' }}> · {i.display_name}</span> : null}</td>
                    <td><span className="badge badge-dim">{ROLE_LABEL[i.role] ?? i.role}</span></td>
                    <td className="mobile-hide" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{formatDistanceToNow(new Date(i.created_at))} ago</td>
                    <td style={{ fontSize: 13, color: new Date(i.expires_at) < new Date() ? 'var(--red-text)' : 'var(--text-muted)' }}>{formatDistanceToNow(new Date(i.expires_at), { addSuffix: true })}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => resendM.mutate(i.id)} style={{ marginRight: 6 }}>Resend</button>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Revoke invite?', body: i.email, confirmLabel: 'Revoke', danger: true })) revokeM.mutate(i.id) }}>Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {error && <div style={{ color: 'var(--red-text)' }}>{errMsg(error)}</div>}

      {admins && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>User</th><th>Role</th><th>Status</th><th className="mobile-hide">Last login</th>{isOwner && <th style={{ textAlign: 'right' }}>Actions</th>}</tr></thead>
              <tbody>
                {admins.map(a => (
                  <Fragment key={a.id}>
                    <tr>
                      <td><div style={{ fontWeight: 600 }}>{a.username}</div><div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{a.email}</div></td>
                      <td>
                        {isOwner ? (
                          <select value={a.role} onChange={e => changeRole(a, e.target.value)} style={{ width: 'auto', padding: '5px 8px' }}>
                            <option value="owner">Owner</option><option value="admin">Admin</option><option value="read_only">Read-only</option>
                          </select>
                        ) : <span className={`badge ${a.role === 'owner' ? 'badge-crimson' : a.role === 'admin' ? 'badge-violet' : 'badge-dim'}`}>{ROLE_LABEL[a.role]}</span>}
                      </td>
                      <td><span className={`badge ${a.status === 'active' ? 'badge-green' : 'badge-red'}`}>{a.status}</span>{a.must_change_password && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>must reset</span>}</td>
                      <td className="mobile-hide" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{a.last_login_at ? `${formatDistanceToNow(new Date(a.last_login_at))} ago` : '—'}</td>
                      {isOwner && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openPerms(a)} style={{ marginRight: 6 }}>{editId === a.id ? 'Close' : 'Permissions'}</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(a)} style={{ marginRight: 6 }}>{a.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => resetPassword(a)}>Reset pw</button>
                        </td>
                      )}
                    </tr>
                    {isOwner && editId === a.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--bg-elevated)' }}>
                          <div style={{ padding: '6px 4px' }}>
                            <div className="section-label">Permissions — {a.username}</div>
                            <PermissionMatrix value={editPerms} onChange={setEditPerms} />
                            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => { updateM.mutate({ id: a.id, payload: { permissions: editPerms } }); setEditId(null) }}>Save permissions</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
