/**
 * Ask-Elara floating bubble (ELARA-1). Owner/admin only. Chats with the agent
 * (CRM + ops), renders her replies, and surfaces risky actions as Approve/Edit/
 * Cancel cards — only Approve calls the audited /api/elara/action endpoint.
 * Page-context aware; session-only history (no DB v1).
 */
import { useState, useRef, useEffect } from 'react'
import { api } from '../api'
import type { ElaraProposal } from '../api'
import { useToast } from './Toast'
import { usePermissions } from '../lib/permissions'

const ACCENT = '#5949AC'
type Msg = { role: 'user' | 'assistant'; content: string }
type Card = ElaraProposal & { editing?: boolean }

function pageContext(): { area?: string; recordId?: string; recordType?: string } | undefined {
  const m = window.location.pathname.match(/\/crm\/companies\/([0-9a-fA-F-]{8,})/)
  if (m) return { area: 'crm', recordType: 'company', recordId: m[1] }
  return undefined
}

const CHIPS = [
  "What's stale in the pipeline?",
  'Summarize today’s briefing',
  'Any new Sentry errors?',
  "Who haven't we followed up with?",
]

export default function AskElara() {
  const { role } = usePermissions()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, cards, busy])

  if (role !== 'owner' && role !== 'admin') return null

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    const history = msgs.slice(-12)
    setMsgs(m => [...m, { role: 'user', content: message }])
    setDraft(''); setBusy(true)
    try {
      const r = await api.elaraChat.send({ message, history, pageContext: pageContext() })
      setMsgs(m => [...m, { role: 'assistant', content: r.reply || '…' }])
      if (r.proposals?.length) setCards(c => [...c, ...r.proposals])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Something went wrong — try again.' }])
    } finally { setBusy(false) }
  }

  const approve = async (card: Card, idx: number) => {
    try {
      const res = await api.elaraChat.action({ kind: card.kind, payload: card.payload })
      if (res.ok) { toast.success('Done'); setMsgs(m => [...m, { role: 'assistant', content: `✅ ${card.summary} — done.` }]) }
      else { toast.error(res.error || 'Action failed'); setMsgs(m => [...m, { role: 'assistant', content: `⚠️ Couldn’t complete: ${res.error ?? 'failed'}.` }]) }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'failed') }
    setCards(c => c.filter((_, i) => i !== idx))
  }
  const cancel = (idx: number, summary: string) => {
    setCards(c => c.filter((_, i) => i !== idx))
    setMsgs(m => [...m, { role: 'assistant', content: `Cancelled: ${summary}` }])
  }
  const editField = (idx: number, field: string, value: string) =>
    setCards(c => c.map((card, i) => i === idx ? { ...card, payload: { ...card.payload, [field]: value } } : card))

  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Ask Elara" style={{
        position: 'fixed', bottom: 22, right: 22, zIndex: 200, width: 56, height: 56, borderRadius: '50%',
        border: 'none', cursor: 'pointer', background: ACCENT, boxShadow: '0 6px 20px rgba(89,73,172,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}>
        <img src="/elara-mark.png" alt="Elara" width={48} height={48} />
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 22, zIndex: 200, width: 'min(420px, calc(100vw - 32px))', height: 'min(620px, calc(100vh - 130px))',
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 12px 40px rgba(26,29,35,.22)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fade-up .2s ease both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <img src="/elara-mark.png" alt="" width={32} height={32} />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Ask Elara</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMsgs([]); setCards([]) }} disabled={!msgs.length}>Clear</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ marginBottom: 10 }}>Ask about the CRM, pipeline, or ops — or have me draft and stage actions for your approval.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CHIPS.map(c => <button key={c} className="btn btn-ghost btn-sm" onClick={() => send(c)}>{c}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  padding: '9px 12px', borderRadius: 10, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'var(--bg-elevated)' : 'rgba(89,73,172,.08)',
                  border: m.role === 'assistant' ? `1px solid rgba(89,73,172,.2)` : '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}>{m.content}</div>
              </div>
            ))}
            {cards.map((card, idx) => (
              <div key={idx} className="card" style={{ padding: 12, borderColor: ACCENT }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{card.summary}</div>
                {card.editing && (card.editable ?? []).length > 0 && (
                  <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                    {(card.editable ?? []).map(f => (
                      <textarea key={f} value={String(card.payload[f] ?? '')} onChange={e => editField(idx, f, e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder={f} />
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => approve(card, idx)}>Approve</button>
                  {(card.editable ?? []).length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setCards(c => c.map((x, i) => i === idx ? { ...x, editing: !x.editing } : x))}>{card.editing ? 'Done' : 'Edit'}</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => cancel(idx, card.summary)}>Cancel</button>
                </div>
              </div>
            ))}
            {busy && <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: 13 }}>Elara is thinking…</div>}
            <div ref={endRef} />
          </div>

          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)' }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) } }} placeholder="Ask Elara…" disabled={busy} />
            <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={() => send(draft)}>Send</button>
          </div>
        </div>
      )}
    </>
  )
}
