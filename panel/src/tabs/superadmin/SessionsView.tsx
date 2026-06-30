/**
 * SuperAdmin → Sessions & Devices (owner-only). The "sign out everywhere"
 * kill-switch: per account, bump session_version (kills active 24h sessions) +
 * trusted_device_version (forgets trusted devices → TOTP again). A global
 * "Sign out ALL users" does it for everyone. For a lost/compromised device.
 * Audited server-side (admin.force_logout / admin.signout_all).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { errMsg } from '../crm/crmShared'

export default function SessionsView() {
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()
  const adminsQ = useQuery({ queryKey: ['admins'], queryFn: api.admins.list })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admins'] })

  const forceLogout = useMutation({ mutationFn: (id: string) => api.admins.forceLogout(id), onSuccess: () => { refresh(); toast.success('Signed out — they must log in again (with 2FA)') }, onError: (e) => toast.error(errMsg(e)) })
  const signoutAll = useMutation({ mutationFn: () => api.admins.signoutAll(), onSuccess: (d) => { refresh(); toast.success(`Signed out ${d.count} account${d.count === 1 ? '' : 's'} everywhere`) }, onError: (e) => toast.error(errMsg(e)) })

  const admins = adminsQ.data ?? []

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Sessions &amp; devices</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, maxWidth: 660 }}>
        Sign an account out <strong>everywhere</strong> — kills its active sessions and forgets its trusted devices, so the next sign-in
        needs the password <em>and</em> a 2FA code. Use this if a device is lost or compromised. (Each user can also forget their own
        trusted devices under Settings → Security.)
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Account</th><th>Role</th><th>Last login</th><th></th></tr></thead>
            <tbody>
              {adminsQ.isLoading && <tr><td colSpan={4} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Loading…</td></tr>}
              {!adminsQ.isLoading && admins.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No accounts.</td></tr>}
              {admins.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.username}<span style={{ color: 'var(--text-hint)', fontWeight: 400 }}> · {a.email}</span></td>
                  <td><span className="badge badge-dim">{a.role === 'owner' ? 'SuperAdmin' : a.role}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.last_login_at ? formatDistanceToNow(new Date(a.last_login_at), { addSuffix: true }) : 'never'}</td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-text)' }} disabled={forceLogout.isPending}
                        onClick={async () => { if (await confirm({ title: 'Sign out everywhere?', body: `${a.username} will be signed out on every device and must log in again with 2FA.`, confirmLabel: 'Sign out', danger: true })) forceLogout.mutate(a.id) }}>
                        Sign out everywhere
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520, borderColor: 'rgba(192,48,42,.3)' }}>
        <div className="section-label" style={{ color: 'var(--red-text)' }}>Danger zone</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 10px' }}>Sign out every account on every device at once. Everyone re-authenticates with password + 2FA.</div>
        <button className="btn btn-danger btn-sm" disabled={signoutAll.isPending}
          onClick={async () => { if (await confirm({ title: 'Sign out ALL users?', body: 'Every account — including you — is signed out everywhere and must log in again with 2FA. Use only if you suspect a breach.', confirmLabel: 'Sign out everyone', danger: true })) signoutAll.mutate() }}>
          Sign out all users
        </button>
      </div>
    </div>
  )
}
