/**
 * Phone hub (CRM → Phone, P2) — Quo/OpenPhone calls + texts. Overview /
 * Conversations (read + reply) / Calls (transcript) / Scheduled (gated). Sending
 * is gated server-side by crm.phone@manage; scheduled sending is inert until
 * QUO_SCHEDULED_ENABLED. The same calls/texts also land on contact timelines.
 */
import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../api'
import type { QuoInbox } from '../../api'
import { useToast } from '../../components/Toast'
import { usePermissions, canManage } from '../../lib/permissions'

type Sub = 'overview' | 'conversations' | 'calls' | 'scheduled'

function errMsg(e: unknown): string {
  if (e instanceof Error) { try { return JSON.parse(e.message).error ?? e.message } catch { return e.message } }
  return 'Something went wrong'
}
const rel = (d?: string) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : '—')

export default function PhoneHub() {
  const { permissions, role } = usePermissions()
  const mayManage = canManage(permissions, role, 'crm.phone')
  const config = useQuery({ queryKey: ['quo', 'config'], queryFn: api.quo.config })
  const inboxesQ = useQuery({ queryKey: ['quo', 'inboxes'], queryFn: api.quo.inboxes, enabled: config.data?.configured === true })
  const inboxes = inboxesQ.data?.data ?? []
  const [inboxId, setInboxId] = useState<string>('')
  const [sub, setSub] = useState<Sub>('overview')

  const inbox = inboxes.find(i => i.id === inboxId) ?? inboxes[0]

  if (config.isLoading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
  if (!config.data?.configured) {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="section-label">Phone (Quo)</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Quo (OpenPhone) isn’t connected yet — set <span className="mono">QUO_API_KEY</span> (and the webhook secret) to enable calls & texts here. Calls and texts will then auto-log to contact timelines.</div>
      </div>
    )
  }

  const TABS: Array<[Sub, string]> = [['overview', 'Overview'], ['conversations', 'Conversations'], ['calls', 'Calls'], ['scheduled', 'Scheduled']]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="subtabs subtab-row" style={{ marginBottom: 0, border: 'none' }}>
          {TABS.map(([id, label]) => (
            <button key={id} className={`subtab ${sub === id ? 'active' : ''}`} onClick={() => setSub(id)}>{label}</button>
          ))}
        </div>
        {inboxes.length > 0 && (
          <select value={inbox?.id ?? ''} onChange={e => setInboxId(e.target.value)} style={{ width: 'auto', marginLeft: 'auto' }}>
            {inboxes.map(i => <option key={i.id} value={i.id}>{i.label || i.number}</option>)}
          </select>
        )}
      </div>

      {!inbox ? <div style={{ color: 'var(--text-muted)' }}>No Quo numbers found.</div>
        : sub === 'overview' ? <Overview inbox={inbox} />
        : sub === 'conversations' ? <Conversations inbox={inbox} mayManage={mayManage} />
        : sub === 'calls' ? <Calls inbox={inbox} />
        : <Scheduled mayManage={mayManage} enabled={config.data.scheduledEnabled} />}
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────
function Overview({ inbox }: { inbox: QuoInbox }) {
  const convos = useQuery({ queryKey: ['quo', 'conversations', inbox.id], queryFn: () => api.quo.conversations(inbox.id) })
  const calls = useQuery({ queryKey: ['quo', 'calls', inbox.id], queryFn: () => api.quo.calls(inbox.id) })
  const threads = convos.data ?? []
  const callList = calls.data ?? []
  const missed = callList.filter(c => c.direction === 'incoming' && c.status && /missed|no-?answer|unanswered/i.test(c.status)).length

  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="kpi"><div className="kpi-label">Conversations</div><div className="kpi-value">{convos.isLoading ? '…' : threads.length}</div></div>
        <div className="kpi"><div className="kpi-label">Calls</div><div className="kpi-value">{calls.isLoading ? '…' : callList.length}</div></div>
        <div className="kpi"><div className="kpi-label">Missed calls</div><div className="kpi-value" style={missed > 0 ? { color: 'var(--red-text)' } : undefined}>{calls.isLoading ? '…' : missed}</div></div>
      </div>
      <div className="card" style={{ padding: 0, marginBottom: 18 }}>
        <div className="section-label" style={{ padding: '16px 18px 0' }}>Recent texts</div>
        {threads.slice(0, 6).map(t => (
          <div key={t.participant} style={{ display: 'flex', gap: 10, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.participant}</div><div style={{ fontSize: 12.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lastText}</div></div>
            <span style={{ fontSize: 11.5, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>{rel(t.lastAt)}</span>
          </div>
        ))}
        {!convos.isLoading && threads.length === 0 && <div style={{ padding: '12px 18px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No texts yet.</div>}
      </div>
    </div>
  )
}

// ── Conversations ───────────────────────────────────────────────────────────
function Conversations({ inbox, mayManage }: { inbox: QuoInbox; mayManage: boolean }) {
  const qc = useQueryClient(); const toast = useToast()
  const convos = useQuery({ queryKey: ['quo', 'conversations', inbox.id], queryFn: () => api.quo.conversations(inbox.id) })
  const [participant, setParticipant] = useState<string>('')
  const thread = useQuery({ queryKey: ['quo', 'thread', inbox.id, participant], queryFn: () => api.quo.thread(inbox.id, participant), enabled: !!participant })
  const [draft, setDraft] = useState('')

  const send = useMutation({
    mutationFn: () => api.quo.send({ from: inbox.number, to: participant, content: draft.trim() }),
    onSuccess: () => { setDraft(''); thread.refetch(); qc.invalidateQueries({ queryKey: ['quo', 'conversations', inbox.id] }); toast.success('Sent') },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="home-grid">
      <div className="card" style={{ padding: 0, maxHeight: '60vh', overflowY: 'auto' }}>
        {convos.isLoading && <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>}
        {(convos.data ?? []).map(t => (
          <button key={t.participant} onClick={() => setParticipant(t.participant)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderTop: '1px solid var(--border)',
            background: participant === t.participant ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer',
          }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>{t.participant}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lastText}</div>
          </button>
        ))}
        {!convos.isLoading && (convos.data ?? []).length === 0 && <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>No conversations.</div>}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 320, maxHeight: '60vh' }}>
        {!participant ? <div style={{ color: 'var(--text-muted)', fontSize: 13, margin: 'auto' }}>Select a conversation.</div> : (
          <>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{participant}</div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {thread.isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
              {(thread.data ?? []).map(m => {
                const out = m.direction === 'outgoing'
                return (
                  <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                    <div style={{ padding: '8px 12px', borderRadius: 10, fontSize: 13, background: out ? 'var(--accent)' : 'var(--bg-elevated)', color: out ? '#fff' : 'var(--text-primary)' }}>{m.text ?? m.body}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-hint)', marginTop: 2, textAlign: out ? 'right' : 'left' }}>{rel(m.createdAt)}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={mayManage ? 'Reply…' : 'Manage access required to send'} disabled={!mayManage} onKeyDown={e => { if (e.key === 'Enter' && draft.trim() && mayManage) send.mutate() }} />
              <button className="btn btn-primary" disabled={!mayManage || !draft.trim() || send.isPending} onClick={() => send.mutate()}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Calls ───────────────────────────────────────────────────────────────────
function Calls({ inbox }: { inbox: QuoInbox }) {
  const calls = useQuery({ queryKey: ['quo', 'calls', inbox.id], queryFn: () => api.quo.calls(inbox.id) })
  const [openId, setOpenId] = useState<string>('')
  const transcript = useQuery({ queryKey: ['quo', 'transcript', openId], queryFn: () => api.quo.callTranscript(openId), enabled: !!openId, retry: false })

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Direction</th><th>With</th><th>Status</th><th>Duration</th><th>When</th><th></th></tr></thead>
          <tbody>
            {calls.isLoading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Loading…</td></tr>}
            {(calls.data ?? []).map(c => (
              <Fragment key={c.id}>
                <tr>
                  <td><span className={`badge ${c.direction === 'incoming' ? 'badge-cyan' : 'badge-dim'}`}>{c.direction}</span></td>
                  <td style={{ fontWeight: 600 }}>{c.direction === 'incoming' ? c.from : c.to}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{c.status ?? '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{c.duration ? `${Math.round(c.duration / 60)}m` : '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{rel(c.createdAt)}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setOpenId(openId === c.id ? '' : c.id)}>{openId === c.id ? 'Hide' : 'Transcript'}</button></td>
                </tr>
                {openId === c.id && (
                  <tr><td colSpan={6} style={{ background: 'var(--bg-elevated)' }}>
                    {transcript.isLoading ? <span style={{ color: 'var(--text-muted)' }}>Fetching…</span>
                      : transcript.isError ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Transcript not available (needs a Business/Scale plan).</span>
                      : <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: 'var(--text-primary)', margin: 0, fontFamily: 'inherit' }}>{JSON.stringify(transcript.data, null, 2)}</pre>}
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!calls.isLoading && (calls.data ?? []).length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No calls.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Scheduled (gated) ───────────────────────────────────────────────────────
function Scheduled({ mayManage, enabled }: { mayManage: boolean; enabled: boolean }) {
  const qc = useQueryClient(); const toast = useToast()
  const q = useQuery({ queryKey: ['quo', 'scheduled'], queryFn: api.quo.scheduled })
  const refresh = () => qc.invalidateQueries({ queryKey: ['quo', 'scheduled'] })
  const [to, setTo] = useState(''); const [body, setBody] = useState(''); const [when, setWhen] = useState('')

  const create = useMutation({ mutationFn: () => api.quo.schedule({ to_number: to.trim(), body: body.trim(), send_at: new Date(when).toISOString() }), onSuccess: () => { setTo(''); setBody(''); setWhen(''); refresh(); toast.success('Scheduled') }, onError: (e) => toast.error(errMsg(e)) })
  const cancel = useMutation({ mutationFn: (id: string) => api.quo.cancelScheduled(id), onSuccess: () => { refresh(); toast.success('Cancelled') }, onError: (e) => toast.error(errMsg(e)) })

  return (
    <div>
      {!enabled && (
        <div style={{ padding: '12px 16px', marginBottom: 16, borderRadius: 8, border: '1px solid rgba(217,119,6,.3)', background: 'rgba(217,119,6,.06)', color: 'var(--yellow)', fontSize: 13 }}>
          Scheduled sending is <strong>off</strong>. You can compose and save messages, but nothing sends until <span className="mono">QUO_SCHEDULED_ENABLED=true</span> (after opt-in / A2P compliance).
        </div>
      )}
      <div className="card" style={{ padding: 0, marginBottom: 18 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>To</th><th>Message</th><th>Send at</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(q.data?.data ?? []).map(s => (
                <tr key={s.id}>
                  <td className="mono">{s.to_number}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{s.body}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(s.send_at).toLocaleString('en-US')}</td>
                  <td><span className={`badge ${s.status === 'sent' ? 'badge-green' : s.status === 'failed' ? 'badge-red' : s.status === 'cancelled' ? 'badge-dim' : 'badge-yellow'}`}>{s.status}</span></td>
                  <td>{mayManage && s.status === 'scheduled' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-text)' }} onClick={() => cancel.mutate(s.id)}>Cancel</button>}</td>
                </tr>
              ))}
              {!q.isLoading && (q.data?.data ?? []).length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Nothing scheduled.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {mayManage && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="section-label">Compose</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="+1 555 123 4567" className="mono" />
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="Message…" style={{ resize: 'vertical' }} />
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
            <button className="btn btn-primary btn-sm" style={{ justifySelf: 'start' }} disabled={!to.trim() || !body.trim() || !when || create.isPending} onClick={() => create.mutate()}>Schedule</button>
          </div>
        </div>
      )}
    </div>
  )
}
