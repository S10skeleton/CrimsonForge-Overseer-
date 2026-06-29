import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api'
import type { BriefingConfig } from '../api'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'

const SECTIONS: Array<{ key: string; label: string; wired: boolean }> = [
  { key: 'system',           label: 'System health',   wired: false },
  { key: 'sentry',           label: 'Sentry errors',   wired: false },
  { key: 'stripe',           label: 'Stripe revenue',  wired: true },
  { key: 'payment_failures', label: 'Payment failures', wired: false },
  { key: 'signups',          label: 'New signups',     wired: false },
  { key: 'feedback',         label: 'Feedback',        wired: true },
  { key: 'gmail',            label: 'Gmail digest',    wired: true },
  { key: 'calendar',         label: 'Calendar',        wired: true },
  { key: 'forgepilot',       label: 'ForgePilot',      wired: true },
]

type SubTab = 'briefing' | 'jobs' | 'alerts' | 'routing'

function errMsg(e: unknown): string {
  if (e instanceof Error) { try { return JSON.parse(e.message).error ?? e.message } catch { return e.message } }
  return 'Something went wrong'
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={on} style={{
      width: 38, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      background: on ? 'var(--accent)' : 'var(--border-focus)', position: 'relative', flexShrink: 0,
      transition: 'background .15s', opacity: disabled ? 0.5 : 1,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left .15s',
      }} />
    </button>
  )
}

function BriefingPanel({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['briefing-config'], queryFn: api.elaraControls.getBriefingConfig })

  const [form, setForm] = useState<BriefingConfig | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  const saveM = useMutation({
    mutationFn: (patch: Partial<BriefingConfig>) => api.elaraControls.saveBriefingConfig(patch),
    onSuccess: (cfg) => { setForm(cfg); toast.success('Briefing settings saved'); refetch() },
    onError: (e) => toast.error(errMsg(e)),
  })
  const previewM = useMutation({
    mutationFn: () => api.elaraControls.previewBriefing(),
    onSuccess: (r) => setPreview(r.text || '(empty preview)'),
    onError: (e) => toast.error(errMsg(e)),
  })

  if (isLoading || !form) return <div style={{ color: 'var(--text-muted)' }}>{error ? errMsg(error) : 'Loading…'}</div>

  const save = () => saveM.mutate({
    timeHour: form.timeHour, timezone: form.timezone,
    aiSummaryEnabled: form.aiSummaryEnabled, sections: form.sections,
  })

  const sendNow = async () => {
    const ok = await confirm({ title: 'Send briefing now?', body: 'Runs the full morning briefing and posts it to Slack immediately.', confirmLabel: 'Send now' })
    if (!ok) return
    try { await api.elaraControls.sendBriefingNow(); toast.success('Briefing is on its way to Slack') }
    catch (e) { toast.error(errMsg(e)) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }} className="home-grid">
      {/* Settings */}
      <div className="card">
        <div className="section-label">Schedule</div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 1 120px' }}>
            <label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>HOUR (0–23)</label>
            <input type="number" min={0} max={23} value={form.timeHour} disabled={!canEdit}
              onChange={e => setForm({ ...form, timeHour: Number(e.target.value) })} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>TIMEZONE</label>
            <input value={form.timezone} disabled={!canEdit}
              onChange={e => setForm({ ...form, timezone: e.target.value })} placeholder="America/Detroit" />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>AI-written summary</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Off = structured briefing instead.</div>
          </div>
          <Toggle on={form.aiSummaryEnabled} disabled={!canEdit} onClick={() => setForm({ ...form, aiSummaryEnabled: !form.aiSummaryEnabled })} />
        </div>

        <div className="section-label" style={{ marginTop: 16 }}>Sections</div>
        {SECTIONS.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <div style={{ fontSize: 14 }}>
              {s.label}
              {!s.wired && <span className="badge badge-dim" style={{ marginLeft: 8, fontSize: 9 }}>soon</span>}
            </div>
            <Toggle on={form.sections[s.key] !== false} disabled={!canEdit}
              onClick={() => setForm({ ...form, sections: { ...form.sections, [s.key]: form.sections[s.key] === false } })} />
          </div>
        ))}

        {canEdit && (
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn btn-primary" onClick={save} disabled={saveM.isPending}>
              {saveM.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginTop: 12 }}>
          Sections marked “soon” persist now and gate the briefing in a later slice.
        </div>
      </div>

      {/* Send / preview */}
      <div className="card">
        <div className="section-label">Send a briefing now</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Preview what the next briefing will contain, or send it to Slack on demand.
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button className="btn btn-ghost" onClick={() => previewM.mutate()} disabled={previewM.isPending}>
              {previewM.isPending ? 'Building…' : 'Preview'}
            </button>
            <button className="btn btn-primary" onClick={sendNow}>Send now</button>
          </div>
        )}
        {preview && (
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, lineHeight: 1.5,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
            padding: 14, color: 'var(--text-primary)', maxHeight: 420, overflow: 'auto',
            fontFamily: 'inherit',
          }}>{preview}</pre>
        )}
      </div>
    </div>
  )
}

function Soon({ title }: { title: string }) {
  return (
    <div className="card" style={{ maxWidth: 520, color: 'var(--text-muted)' }}>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
      Lands in the next Elara Controls slice — the config table is already in place.
    </div>
  )
}

export default function ElaraControlsTab({ role }: { role: string }) {
  const canEdit = role === 'owner' || role === 'admin'
  const [tab, setTab] = useState<SubTab>('briefing')

  const TABS: Array<{ id: SubTab; label: string }> = [
    { id: 'briefing', label: 'Morning briefing' },
    { id: 'jobs', label: 'Scheduled jobs' },
    { id: 'alerts', label: 'Alert rules' },
    { id: 'routing', label: 'Slack routing' },
  ]

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Elara Controls</h1>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
        Configure Elara's automation — briefings, schedules, alerts, and routing.
      </div>

      <div className="subtabs subtab-row">
        {TABS.map(t => (
          <button key={t.id} className={`subtab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'briefing' && <BriefingPanel canEdit={canEdit} />}
      {tab === 'jobs' && <Soon title="Scheduled jobs" />}
      {tab === 'alerts' && <Soon title="Alert rules + quiet hours" />}
      {tab === 'routing' && <Soon title="Slack routing + recipients" />}
    </div>
  )
}
