import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../api'
import type { Admin } from '../api'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', read_only: 'Read-only' }

interface Props { role: string }

function errMsg(e: unknown): string {
  if (e instanceof Error) {
    try { return JSON.parse(e.message).error ?? e.message } catch { return e.message }
  }
  return 'Something went wrong'
}

export default function AdminsTab({ role }: Props) {
  const isOwner = role === 'owner'
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: admins, isLoading, error } = useQuery({ queryKey: ['admins'], queryFn: api.admins.list })

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', role: 'admin' })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admins'] })

  const createM = useMutation({
    mutationFn: () => api.admins.create(form),
    onSuccess: async (res) => {
      invalidate()
      setShowAdd(false); setForm({ username: '', email: '', role: 'admin' })
      if (res.emailed) toast.success(`Invite emailed to ${res.admin.email}`)
      else await confirm({ title: 'Temporary password (shown once)', body: `Username: ${res.admin.username}\nPassword: ${res.tempPassword}\n\nCopy it now — it won't be shown again.`, confirmLabel: 'Copied', cancelLabel: 'Close' })
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const updateM = useMutation({
    mutationFn: (v: { id: string; payload: Partial<{ role: string; status: string }> }) => api.admins.update(v.id, v.payload),
    onSuccess: () => { invalidate(); toast.success('Admin updated') },
    onError: (e) => toast.error(errMsg(e)),
  })

  const resetM = useMutation({
    mutationFn: (id: string) => api.admins.resetPassword(id),
    onSuccess: async (res) => {
      if (res.emailed) toast.success('Reset link emailed')
      else await confirm({ title: 'Temporary password (shown once)', body: `Password: ${res.tempPassword}\n\nCopy it now — it won't be shown again.`, confirmLabel: 'Copied', cancelLabel: 'Close' })
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const changeRole = async (a: Admin, newRole: string) => {
    if (newRole === a.role) return
    const ok = await confirm({ title: 'Change role?', body: `Set ${a.username} to ${ROLE_LABEL[newRole]}?`, confirmLabel: 'Change role' })
    if (ok) updateM.mutate({ id: a.id, payload: { role: newRole } })
  }

  const toggleStatus = async (a: Admin) => {
    const suspending = a.status === 'active'
    const ok = await confirm({
      title: suspending ? 'Suspend admin?' : 'Reactivate admin?',
      body: suspending ? `${a.username} will lose access immediately.` : `Restore access for ${a.username}?`,
      confirmLabel: suspending ? 'Suspend' : 'Reactivate', danger: suspending,
    })
    if (ok) updateM.mutate({ id: a.id, payload: { status: suspending ? 'suspended' : 'active' } })
  }

  const resetPassword = async (a: Admin) => {
    const ok = await confirm({ title: 'Reset password?', body: `Issue a new temporary password for ${a.username}?`, confirmLabel: 'Reset password', danger: true })
    if (ok) resetM.mutate(a.id)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Admins &amp; Roles</h1>
        {isOwner && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? 'Cancel' : '+ Add admin'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>
        Named operator accounts. {isOwner ? 'Owner-gated changes are audited.' : 'Only owners can modify accounts.'}
      </div>

      {showAdd && isOwner && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 620 }}>
          <div className="section-label">New admin</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 140px' }}>
              <label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>USERNAME</label>
              <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="matt" />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>EMAIL</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="matt@crimsonforge.pro" />
            </div>
            <div style={{ flex: '0 1 130px' }}>
              <label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>ROLE</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="read_only">Read-only</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <button className="btn btn-primary" disabled={!form.username.trim() || !form.email.trim() || createM.isPending}
              onClick={() => createM.mutate()}>
              {createM.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {error && <div style={{ color: 'var(--red-text)' }}>{errMsg(error)}</div>}

      {admins && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th><th>Role</th><th>Status</th><th className="mobile-hide">Last login</th>
                  {isOwner && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {admins.map(a => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.username}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{a.email}</div>
                    </td>
                    <td>
                      {isOwner ? (
                        <select value={a.role} onChange={e => changeRole(a, e.target.value)} style={{ width: 'auto', padding: '5px 8px' }}>
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="read_only">Read-only</option>
                        </select>
                      ) : (
                        <span className={`badge ${a.role === 'owner' ? 'badge-crimson' : a.role === 'admin' ? 'badge-violet' : 'badge-dim'}`}>{ROLE_LABEL[a.role]}</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${a.status === 'active' ? 'badge-green' : 'badge-red'}`}>{a.status}</span>
                      {a.must_change_password && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>must reset</span>}
                    </td>
                    <td className="mobile-hide" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {a.last_login_at ? `${formatDistanceToNow(new Date(a.last_login_at))} ago` : '—'}
                    </td>
                    {isOwner && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(a)} style={{ marginRight: 6 }}>
                          {a.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => resetPassword(a)}>Reset pw</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
