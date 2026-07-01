/**
 * Ask Elara (MOBILE-1) — the mobile centerpiece. Full-screen chat on the same
 * /api/elara/chat endpoint as the desktop bubble, with the Approve/Edit/Cancel
 * proposal cards so risky actions can be approved from the phone. Accepts a
 * deep-linked prompt from Triage via router state.
 */
import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import type { ElaraProposal } from '../api'
import { useToast } from '../components/Toast'

type Msg = { role: 'user' | 'assistant'; content: string }
type Card = ElaraProposal & { editing?: boolean }

const CHIPS = ['What needs me today?', 'Anything broken?', 'Summarize this morning’s briefing', 'Who haven’t we followed up with?']

export default function ElaraTab() {
  const toast = useToast()
  const loc = useLocation()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const sentDeepLink = useRef(false)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, cards, busy])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    const history = msgs.slice(-12)
    setMsgs(m => [...m, { role: 'user', content: message }])
    setDraft(''); setBusy(true)
    try {
      const r = await api.elaraChat.send({ message, history })
      setMsgs(m => [...m, { role: 'assistant', content: r.reply || '…' }])
      if (r.proposals?.length) setCards(c => [...c, ...r.proposals])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Something went wrong — try again.' }])
    } finally { setBusy(false) }
  }

  // Deep-link from Triage ("Ask Elara about this") — auto-send once.
  useEffect(() => {
    const prompt = (loc.state as { prompt?: string } | null)?.prompt
    if (prompt && !sentDeepLink.current) { sentDeepLink.current = true; send(prompt) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.state])

  const approve = async (card: Card, idx: number) => {
    try {
      const res = await api.elaraChat.action({ kind: card.kind, payload: card.payload })
      if (res.ok) { toast.success('Done'); setMsgs(m => [...m, { role: 'assistant', content: `✅ ${card.summary} — done.` }]) }
      else { toast.error(res.error || 'Action failed'); setMsgs(m => [...m, { role: 'assistant', content: `⚠️ Couldn’t complete: ${res.error ?? 'failed'}.` }]) }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'failed') }
    setCards(c => c.filter((_, i) => i !== idx))
  }
  const cancel = (idx: number, summary: string) => { setCards(c => c.filter((_, i) => i !== idx)); setMsgs(m => [...m, { role: 'assistant', content: `Cancelled: ${summary}` }]) }
  const editField = (idx: number, field: string, value: string) =>
    setCards(c => c.map((card, i) => i === idx ? { ...card, payload: { ...card.payload, [field]: value } } : card))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100dvh - 250px)' }}>
        {msgs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <img src="/ask-elara.png" alt="" width={30} height={30} />
              <span>Ask about ops, the CRM, or what needs attention — I can stage actions for your approval.</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CHIPS.map(c => <button key={c} className="btn btn-ghost btn-sm" onClick={() => send(c)}>{c}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => m.role === 'assistant' ? (
          <div key={i} style={{ alignSelf: 'flex-start', display: 'flex', gap: 7, alignItems: 'flex-start', maxWidth: '92%' }}>
            <img src="/ask-elara.png" alt="" width={22} height={22} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ padding: '9px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'rgba(89,73,172,.08)', border: '1px solid rgba(89,73,172,.2)', color: 'var(--text-primary)' }}>{m.content}</div>
          </div>
        ) : (
          <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '9px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>{m.content}</div>
        ))}
        {cards.map((card, idx) => (
          <div key={idx} className="card" style={{ padding: 12, borderColor: 'var(--elara)' }}>
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

      <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, paddingTop: 6, background: 'var(--bg-base)' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) } }} placeholder="Ask Elara…" disabled={busy} style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={() => send(draft)}>Send</button>
      </div>
    </div>
  )
}
