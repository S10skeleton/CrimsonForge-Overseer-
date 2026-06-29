import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { ElaraConfig, ElaraSchedule, ElaraAlertRule, ElaraDestination, ElaraRecipient } from '../api'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'

type SubTab = 'briefing' | 'jobs' | 'alerts' | 'routing'

const SECTION_LABELS: Record<string, string> = {
  system_health: 'System health', sentry: 'Sentry errors', stripe_revenue: 'Stripe revenue',
  payment_failures: 'Payment failures', new_signups: 'New signups', feedback: 'Feedback',
  gmail: 'Gmail digest', calendar: 'Calendar', forgepilot: 'ForgePilot',
}
const SECTION_ORDER = ['system_health', 'sentry', 'stripe_revenue', 'payment_failures', 'new_signups', 'feedback', 'gmail', 'calendar', 'forgepilot']

const NOTIF_TYPES = [
  { key: 'briefing', label: 'Morning briefing' },
  { key: 'health_alert', label: 'Health alerts' },
  { key: 'fp_alert', label: 'ForgePilot alerts' },
  { key: 'activity', label: 'Activity feed' },
  { key: 'new_subscriber', label: 'New subscriber' },
]

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
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  )
}

const cronHour = (cron: string): number => { const m = cron.trim().split(/\s+/); return Number(m[1]) || 0 }

// ─── Briefing ────────────────────────────────────────────────────────────────
function BriefingPanel({ config, canEdit }: { config: ElaraConfig; canEdit: boolean }) {
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()
  const morning = config.schedules.find(s => s.job_key === 'morning_briefing')
  const [hour, setHour] = useState(morning ? cronHour(morning.cron) : 8)
  const [tz, setTz] = useState(config.briefing?.timezone ?? '')
  const [ai, setAi] = useState(config.briefing?.ai_summary ?? true)
  const [sections, setSections] = useState<Record<string, boolean>>(config.briefing?.sections ?? {})
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    setHour(morning ? cronHour(morning.cron) : 8)
    setTz(config.briefing?.timezone ?? ''); setAi(config.briefing?.ai_summary ?? true)
    setSections(config.briefing?.sections ?? {})
  }, [config, morning])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['elara-config'] })
  const saveM = useMutation({
    mutationFn: async () => {
      await api.elaraConfig.saveBriefing({ sections, ai_summary: ai, timezone: tz || null })
      await api.elaraConfig.saveSchedule('morning_briefing', { cron: `0 ${hour} * * *` })
    },
    onSuccess: () => { invalidate(); toast.success('Briefing settings saved') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const previewM = useMutation({ mutationFn: () => api.elaraConfig.previewBriefing(), onSuccess: (r) => setPreview(r.text || '(empty)'), onError: (e) => toast.error(errMsg(e)) })
  const sendNow = async () => {
    if (!await confirm({ title: 'Send briefing now?', body: 'Runs the full briefing and posts it to Slack immediately.', confirmLabel: 'Send now' })) return
    try { await api.elaraConfig.sendBriefingNow(); toast.success('Briefing on its way to Slack') } catch (e) { toast.error(errMsg(e)) }
  }

  return (
    <div className="home-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
      <div className="card">
        <div className="section-label">Schedule</div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 1 120px' }}>
            <label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>HOUR (0–23)</label>
            <input type="number" min={0} max={23} value={hour} disabled={!canEdit} onChange={e => setHour(Number(e.target.value))} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>TIMEZONE</label>
            <input value={tz} disabled={!canEdit} onChange={e => setTz(e.target.value)} placeholder="America/Detroit" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          <div><div style={{ fontWeight: 600, fontSize: 14 }}>AI-written summary</div><div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Off = structured briefing.</div></div>
          <Toggle on={ai} disabled={!canEdit} onClick={() => setAi(!ai)} />
        </div>
        <div className="section-label" style={{ marginTop: 16 }}>Sections</div>
        {SECTION_ORDER.map(key => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0' }}>
            <div style={{ fontSize: 14 }}>{SECTION_LABELS[key]}</div>
            <Toggle on={sections[key] !== false} disabled={!canEdit} onClick={() => setSections({ ...sections, [key]: sections[key] === false })} />
          </div>
        ))}
        {canEdit && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? 'Saving…' : 'Save settings'}</button>}
      </div>

      <div className="card">
        <div className="section-label">Send a briefing now</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>Preview the next briefing, or send it to Slack on demand.</div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button className="btn btn-ghost" onClick={() => previewM.mutate()} disabled={previewM.isPending}>{previewM.isPending ? 'Building…' : 'Preview'}</button>
            <button className="btn btn-primary" onClick={sendNow}>Send now</button>
          </div>
        )}
        {preview && <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, lineHeight: 1.5, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, maxHeight: 420, overflow: 'auto', fontFamily: 'inherit', color: 'var(--text-primary)' }}>{preview}</pre>}
      </div>
    </div>
  )
}

// ─── Jobs ────────────────────────────────────────────────────────────────────
function JobRow({ s, canEdit }: { s: ElaraSchedule; canEdit: boolean }) {
  const qc = useQueryClient(); const toast = useToast()
  const [cron, setCron] = useState(s.cron); const [enabled, setEnabled] = useState(s.enabled)
  useEffect(() => { setCron(s.cron); setEnabled(s.enabled) }, [s])
  const m = useMutation({
    mutationFn: (patch: Partial<{ cron: string; enabled: boolean }>) => api.elaraConfig.saveSchedule(s.job_key, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['elara-config'] }); toast.success(`${s.label} updated`) },
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: '1 1 140px', fontWeight: 600, fontSize: 14 }}>{s.label}</div>
      <input value={cron} disabled={!canEdit} onChange={e => setCron(e.target.value)} style={{ flex: '0 1 160px' }} className="mono" />
      <Toggle on={enabled} disabled={!canEdit} onClick={() => { setEnabled(!enabled); m.mutate({ enabled: !enabled }) }} />
      {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => m.mutate({ cron })} disabled={m.isPending}>Save</button>}
    </div>
  )
}

function JobsPanel({ config, canEdit }: { config: ElaraConfig; canEdit: boolean }) {
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()
  const [form, setForm] = useState({ name: '', cron: '', action_type: 'slack_message', text: '' })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['elara-config'] })
  const createM = useMutation({
    mutationFn: () => api.elaraConfig.createCustomJob({ name: form.name, cron: form.cron, action_type: form.action_type, payload: form.action_type === 'slack_message' ? { text: form.text } : { prompt: form.text } }),
    onSuccess: () => { invalidate(); setForm({ name: '', cron: '', action_type: 'slack_message', text: '' }); toast.success('Custom job added') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const delM = useMutation({ mutationFn: (id: string) => api.elaraConfig.deleteCustomJob(id), onSuccess: () => { invalidate(); toast.success('Custom job deleted') }, onError: (e) => toast.error(errMsg(e)) })
  const toggleM = useMutation({ mutationFn: (v: { id: string; enabled: boolean }) => api.elaraConfig.updateCustomJob(v.id, { enabled: v.enabled }), onSuccess: invalidate, onError: (e) => toast.error(errMsg(e)) })

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="card">
        <div className="section-label">Built-in jobs</div>
        {config.schedules.map(s => <JobRow key={s.job_key} s={s} canEdit={canEdit} />)}
      </div>
      <div className="card">
        <div className="section-label">Custom jobs</div>
        {config.customJobs.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet.</div>}
        {config.customJobs.map(j => (
          <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{j.name}</div><div className="mono" style={{ fontSize: 11.5, color: 'var(--text-hint)' }}>{j.cron} · {j.action_type}</div></div>
            <Toggle on={j.enabled} disabled={!canEdit} onClick={() => toggleM.mutate({ id: j.id, enabled: !j.enabled })} />
            {canEdit && <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Delete custom job?', body: j.name, confirmLabel: 'Delete', danger: true })) delM.mutate(j.id) }}>Delete</button>}
          </div>
        ))}
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: '1 1 130px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>NAME</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div style={{ flex: '0 1 140px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>CRON</label><input value={form.cron} onChange={e => setForm({ ...form, cron: e.target.value })} placeholder="0 9 * * 1" className="mono" /></div>
            <div style={{ flex: '0 1 140px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>ACTION</label>
              <select value={form.action_type} onChange={e => setForm({ ...form, action_type: e.target.value })}><option value="slack_message">Slack message</option><option value="agent_prompt">Agent prompt</option></select>
            </div>
            <div style={{ flex: '1 1 200px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>{form.action_type === 'slack_message' ? 'MESSAGE' : 'PROMPT'}</label><input value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} /></div>
            <button className="btn btn-primary" disabled={!form.name.trim() || !form.cron.trim() || createM.isPending} onClick={() => createM.mutate()}>Add</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Alerts ──────────────────────────────────────────────────────────────────
function AlertRow({ r, destinations, canEdit }: { r: ElaraAlertRule; destinations: ElaraDestination[]; canEdit: boolean }) {
  const qc = useQueryClient(); const toast = useToast()
  const m = useMutation({
    mutationFn: (patch: Partial<ElaraAlertRule>) => api.elaraConfig.saveAlert(r.rule_key, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['elara-config'] }); toast.success(`${r.label} updated`) },
    onError: (e) => toast.error(errMsg(e)),
  })
  const rate = r.threshold?.rate
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 150px', fontWeight: 600, fontSize: 14 }}>{r.label}</div>
      <select value={r.severity} disabled={!canEdit} onChange={e => m.mutate({ severity: e.target.value })} style={{ flex: '0 1 110px' }}>
        <option value="info">info</option><option value="warning">warning</option><option value="critical">critical</option>
      </select>
      {rate !== undefined && (
        <input type="number" step="0.01" min="0" max="1" defaultValue={rate} disabled={!canEdit}
          onBlur={e => m.mutate({ threshold: { rate: Number(e.target.value) } })} style={{ flex: '0 1 90px' }} title="threshold rate" />
      )}
      <select value={r.destination_id ?? ''} disabled={!canEdit} onChange={e => m.mutate({ destination_id: e.target.value || null })} style={{ flex: '0 1 150px' }}>
        <option value="">route default</option>
        {destinations.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
        <input type="checkbox" checked={r.sms_enabled} disabled={!canEdit} onChange={e => m.mutate({ sms_enabled: e.target.checked })} style={{ width: 'auto' }} /> SMS
      </label>
      <Toggle on={r.enabled} disabled={!canEdit} onClick={() => m.mutate({ enabled: !r.enabled })} />
    </div>
  )
}

function AlertsPanel({ config, canEdit }: { config: ElaraConfig; canEdit: boolean }) {
  const qc = useQueryClient(); const toast = useToast()
  const q = config.quietHours
  const [qh, setQh] = useState({ enabled: q?.enabled ?? false, start_local: q?.start_local ?? '21:00', end_local: q?.end_local ?? '07:00', exempt: q?.exempt_severities ?? ['critical'] })
  useEffect(() => { if (q) setQh({ enabled: q.enabled, start_local: q.start_local, end_local: q.end_local, exempt: q.exempt_severities }) }, [q])
  const saveQh = useMutation({
    mutationFn: () => api.elaraConfig.saveQuietHours({ enabled: qh.enabled, start_local: qh.start_local, end_local: qh.end_local, exempt_severities: qh.exempt }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['elara-config'] }); toast.success('Quiet hours saved') },
    onError: (e) => toast.error(errMsg(e)),
  })
  const toggleExempt = (s: string) => setQh(p => ({ ...p, exempt: p.exempt.includes(s) ? p.exempt.filter(x => x !== s) : [...p.exempt, s] }))

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="card">
        <div className="section-label">Alert rules</div>
        {config.alertRules.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No rules loaded (seed pending).</div>}
        {config.alertRules.map(r => <AlertRow key={r.rule_key} r={r} destinations={config.destinations} canEdit={canEdit} />)}
      </div>
      <div className="card">
        <div className="section-label">Quiet hours</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 12px' }}>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Hold non-exempt alerts overnight. Exempt severities always page.</div>
          <Toggle on={qh.enabled} disabled={!canEdit} onClick={() => setQh({ ...qh, enabled: !qh.enabled })} />
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>START</label><input type="time" value={qh.start_local} disabled={!canEdit} onChange={e => setQh({ ...qh, start_local: e.target.value })} /></div>
          <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>END</label><input type="time" value={qh.end_local} disabled={!canEdit} onChange={e => setQh({ ...qh, end_local: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 8 }}>
            {['info', 'warning', 'critical'].map(s => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                <input type="checkbox" checked={qh.exempt.includes(s)} disabled={!canEdit} onChange={() => toggleExempt(s)} style={{ width: 'auto' }} /> {s}
              </label>
            ))}
          </div>
          {canEdit && <button className="btn btn-primary" onClick={() => saveQh.mutate()} disabled={saveQh.isPending}>Save</button>}
        </div>
      </div>
    </div>
  )
}

// ─── Routing ─────────────────────────────────────────────────────────────────
function RoutingPanel({ config, canEdit }: { config: ElaraConfig; canEdit: boolean }) {
  const qc = useQueryClient(); const toast = useToast(); const confirm = useConfirm()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['elara-config'] })
  const routeMap: Record<string, string> = {}
  for (const r of config.routes) if (r.destination_id) routeMap[r.notification_type] = r.destination_id
  const [routes, setRoutes] = useState<Record<string, string>>(routeMap)
  useEffect(() => { const m: Record<string, string> = {}; for (const r of config.routes) if (r.destination_id) m[r.notification_type] = r.destination_id; setRoutes(m) }, [config.routes])

  const saveRoutesM = useMutation({
    mutationFn: () => api.elaraConfig.saveRoutes(NOTIF_TYPES.map(t => ({ notification_type: t.key, destination_id: routes[t.key] || null }))),
    onSuccess: () => { invalidate(); toast.success('Routing saved') }, onError: (e) => toast.error(errMsg(e)),
  })
  const [dForm, setDForm] = useState({ kind: 'slack', label: '', target: '' })
  const createDest = useMutation({ mutationFn: () => api.elaraConfig.createDestination(dForm), onSuccess: () => { invalidate(); setDForm({ kind: 'slack', label: '', target: '' }); toast.success('Destination added') }, onError: (e) => toast.error(errMsg(e)) })
  const delDest = useMutation({ mutationFn: (id: string) => api.elaraConfig.deleteDestination(id), onSuccess: () => { invalidate(); toast.success('Destination removed') }, onError: (e) => toast.error(errMsg(e)) })

  const [rForm, setRForm] = useState({ kind: 'briefing', value: '', label: '' })
  const createRec = useMutation({ mutationFn: () => api.elaraConfig.createRecipient(rForm), onSuccess: () => { invalidate(); setRForm({ kind: 'briefing', value: '', label: '' }); toast.success('Recipient added') }, onError: (e) => toast.error(errMsg(e)) })
  const delRec = useMutation({ mutationFn: (id: string) => api.elaraConfig.deleteRecipient(id), onSuccess: () => { invalidate(); toast.success('Recipient removed') }, onError: (e) => toast.error(errMsg(e)) })

  const recipientRow = (r: ElaraRecipient) => (
    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <span className="badge badge-dim">{r.kind}</span>
      <div style={{ flex: 1, fontSize: 13.5 }}>{r.value}{r.label ? <span style={{ color: 'var(--text-hint)' }}> · {r.label}</span> : null}</div>
      {canEdit && <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Remove recipient?', body: r.value, confirmLabel: 'Remove', danger: true })) delRec.mutate(r.id) }}>Remove</button>}
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="card">
        <div className="section-label">Routing</div>
        {NOTIF_TYPES.map(t => (
          <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, fontSize: 14 }}>{t.label}</div>
            <select value={routes[t.key] ?? ''} disabled={!canEdit} onChange={e => setRoutes({ ...routes, [t.key]: e.target.value })} style={{ flex: '0 1 220px' }}>
              <option value="">default (webhook)</option>
              {config.destinations.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
        ))}
        {canEdit && <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => saveRoutesM.mutate()} disabled={saveRoutesM.isPending}>Save routing</button>}
      </div>

      <div className="card">
        <div className="section-label">Destinations</div>
        {config.destinations.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span className="badge badge-dim">{d.kind}</span>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.label}</div><div className="mono" style={{ fontSize: 11.5, color: 'var(--text-hint)' }}>{d.target}</div></div>
            {canEdit && <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Delete destination?', body: d.label, confirmLabel: 'Delete', danger: true })) delDest.mutate(d.id) }}>Delete</button>}
          </div>
        ))}
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: '0 1 110px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>KIND</label><select value={dForm.kind} onChange={e => setDForm({ ...dForm, kind: e.target.value })}><option value="slack">slack</option><option value="sms">sms</option><option value="email">email</option></select></div>
            <div style={{ flex: '1 1 130px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>LABEL</label><input value={dForm.label} onChange={e => setDForm({ ...dForm, label: e.target.value })} /></div>
            <div style={{ flex: '1 1 150px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>TARGET</label><input value={dForm.target} onChange={e => setDForm({ ...dForm, target: e.target.value })} placeholder="channel id / number" /></div>
            <button className="btn btn-primary" disabled={!dForm.label.trim() || !dForm.target.trim() || createDest.isPending} onClick={() => createDest.mutate()}>Add</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Recipients</div>
        {config.recipients.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet.</div>}
        {config.recipients.map(recipientRow)}
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: '0 1 130px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>KIND</label><select value={rForm.kind} onChange={e => setRForm({ ...rForm, kind: e.target.value })}><option value="briefing">briefing</option><option value="sms">sms (critical)</option></select></div>
            <div style={{ flex: '1 1 160px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>VALUE</label><input value={rForm.value} onChange={e => setRForm({ ...rForm, value: e.target.value })} placeholder="email / +1…" /></div>
            <div style={{ flex: '0 1 120px' }}><label className="mono" style={{ fontSize: 10, color: 'var(--text-hint)' }}>LABEL</label><input value={rForm.label} onChange={e => setRForm({ ...rForm, label: e.target.value })} /></div>
            <button className="btn btn-primary" disabled={!rForm.value.trim() || createRec.isPending} onClick={() => createRec.mutate()}>Add</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shell ───────────────────────────────────────────────────────────────────
export default function ElaraControlsTab({ role }: { role: string }) {
  const canEdit = role === 'owner' || role === 'admin'
  const [tab, setTab] = useState<SubTab>('briefing')
  const { data, isLoading, error } = useQuery({ queryKey: ['elara-config'], queryFn: api.elaraConfig.get })

  const TABS: Array<{ id: SubTab; label: string }> = [
    { id: 'briefing', label: 'Morning briefing' },
    { id: 'jobs', label: 'Scheduled jobs' },
    { id: 'alerts', label: 'Alert rules' },
    { id: 'routing', label: 'Slack routing' },
  ]

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Elara Controls</h1>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>Configure Elara's automation — briefings, schedules, alerts, and routing.</div>

      <div className="subtabs subtab-row">
        {TABS.map(t => <button key={t.id} className={`subtab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {error && <div style={{ color: 'var(--red-text)' }}>{errMsg(error)}</div>}
      {data && tab === 'briefing' && <BriefingPanel config={data} canEdit={canEdit} />}
      {data && tab === 'jobs' && <JobsPanel config={data} canEdit={canEdit} />}
      {data && tab === 'alerts' && <AlertsPanel config={data} canEdit={canEdit} />}
      {data && tab === 'routing' && <RoutingPanel config={data} canEdit={canEdit} />}
    </div>
  )
}
