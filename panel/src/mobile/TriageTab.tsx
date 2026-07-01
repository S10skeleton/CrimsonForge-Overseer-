/**
 * Triage (MOBILE-1) — "what needs me right now": down services, payment
 * failures, new Sentry issues, silent shops — from GET /api/mobile/triage, with
 * the latest morning briefing on top. Each item can deep-link into Ask Elara.
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { api } from '../api'
import type { TriageItem } from '../api'

const TONE: Record<TriageItem['severity'], { bg: string; fg: string; dot: string; label: string }> = {
  critical: { bg: 'rgba(220,38,38,.08)', fg: 'var(--red-text)', dot: 'var(--red-text)', label: 'CRITICAL' },
  warning: { bg: 'rgba(217,119,6,.08)', fg: 'var(--yellow)', dot: 'var(--yellow)', label: 'WARNING' },
  info: { bg: 'var(--bg-elevated)', fg: 'var(--text-muted)', dot: 'var(--text-hint)', label: 'INFO' },
}

export default function TriageTab() {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['mobile', 'triage'], queryFn: api.mobile.triage })
  const items = q.data?.items ?? []
  const briefing = q.data?.briefing

  const askElara = (item: TriageItem) => {
    navigate('/m/elara', { state: { prompt: `About this alert — "${item.title}": ${item.detail}. What should I do?` } })
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Triage</div>

      {/* Latest briefing */}
      {briefing?.summary && (
        <div className="card" style={{ padding: 14, borderColor: 'var(--elara)' }}>
          <div style={{ fontSize: 11, color: 'var(--elara)', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 4 }}>
            Morning briefing{briefing.date ? ` · ${(() => { try { return format(new Date(briefing.date), 'MMM d') } catch { return '' } })()}` : ''}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>{briefing.summary}</div>
        </div>
      )}

      {q.isLoading && <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Checking what’s red…</div>}

      {!q.isLoading && items.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>✅</div>
          <div style={{ fontWeight: 700, color: 'var(--green)' }}>Nothing needs you right now</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>No down services, payment failures, or new errors.</div>
        </div>
      )}

      {items.map((item, i) => {
        const t = TONE[item.severity]
        return (
          <div key={i} className="card" style={{ padding: 13, background: t.bg, borderColor: 'var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, color: t.fg }}>{t.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-hint)', textTransform: 'uppercase' }}>{item.source}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-primary)' }}>{item.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>{item.detail}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={() => askElara(item)}>Ask Elara</button>
              {item.actionUrl && <a className="btn btn-ghost btn-sm" href={item.actionUrl} target="_blank" rel="noreferrer">Open ↗</a>}
            </div>
          </div>
        )
      })}

      {q.data?.checkedAt && <div style={{ fontSize: 11, color: 'var(--text-hint)', textAlign: 'center' }}>Checked {(() => { try { return format(new Date(q.data.checkedAt), 'h:mm a') } catch { return '' } })()} · pull to refresh</div>}
    </div>
  )
}
