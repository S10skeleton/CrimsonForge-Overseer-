/**
 * On-demand Gmail thread viewer (CRM P1b). Full bodies aren't stored — this
 * fetches the thread live from Gmail when an auto-logged email is opened.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { errMsg } from './crmShared'

export default function ThreadModal({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['crm', 'thread', activityId], queryFn: () => api.crm.thread(activityId) })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,29,35,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16, animation: 'overlay-in .15s ease' }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', padding: 24, animation: 'dialog-in .18s ease both' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{q.data?.subject ?? 'Email thread'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, padding: 4, width: 'auto' }}>×</button>
        </div>

        {q.isLoading ? <div style={{ color: 'var(--text-muted)' }}>Fetching from Gmail…</div>
          : q.isError ? <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{errMsg(q.error)}</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(q.data?.messages ?? []).map(m => (
                <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{m.from}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginBottom: 8 }}>to {m.to || '—'} · {m.date}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</div>
                </div>
              ))}
              {(q.data?.messages ?? []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No messages.</div>}
            </div>
          )}
      </div>
    </div>
  )
}
