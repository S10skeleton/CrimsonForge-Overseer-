import { useState, useEffect } from 'react'
import { api } from '../api'
import { format } from 'date-fns'

const MODELS = [
  { value: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6  (recommended)' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { value: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5  (faster, cheaper)' },
]

const TOKEN_OPTIONS = [256, 512, 768, 1024, 1536, 2048, 3072, 4096]

export default function AIConfigTab() {
  const [rows, setRows]                 = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null)
  const [dirty, setDirty]               = useState(false)

  const [model, setModel]               = useState('claude-sonnet-4-5-20250929')
  const [maxTokens, setMaxTokens]       = useState(1024)
  const [promptSuffix, setPromptSuffix] = useState('')

  const [origModel, setOrigModel]       = useState('')
  const [origTokens, setOrigTokens]     = useState(0)
  const [origSuffix, setOrigSuffix]     = useState('')

  useEffect(() => { load() }, [])

  useEffect(() => {
    setDirty(
      model !== origModel ||
      maxTokens !== origTokens ||
      promptSuffix !== origSuffix
    )
  }, [model, maxTokens, promptSuffix, origModel, origTokens, origSuffix])

  const load = async () => {
    setLoading(true)
    try {
      const { rows: r, config } = await api.cfp.aiConfig()
      setRows(r)
      const m  = config.model        || 'claude-sonnet-4-5-20250929'
      const mt = parseInt(config.max_tokens || '1024') || 1024
      const ps = config.system_prompt_suffix || ''
      setModel(m);         setOrigModel(m)
      setMaxTokens(mt);    setOrigTokens(mt)
      setPromptSuffix(ps); setOrigSuffix(ps)
    } catch (e: any) {
      showToast(e.message ?? 'Failed to load config', false)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.cfp.updateAiConfig([
        { config_key: 'model',                config_value: model },
        { config_key: 'max_tokens',           config_value: String(maxTokens) },
        { config_key: 'system_prompt_suffix', config_value: promptSuffix },
      ])
      setOrigModel(model)
      setOrigTokens(maxTokens)
      setOrigSuffix(promptSuffix)
      setDirty(false)
      showToast('Config saved — live on next message', true)
      const { rows: r } = await api.cfp.aiConfig()
      setRows(r)
    } catch (e: any) {
      showToast(e.message ?? 'Save failed', false)
    } finally {
      setSaving(false)
    }
  }

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const lastUpdated  = rows.find(r => r.config_key === 'model')?.updated_at
  const suffixTokens = Math.ceil(promptSuffix.length / 4)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 4 }} className="grad">
            FORGE AI CONFIG
          </h1>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>
            Controls Forge Assist (Diagnostic AI) across all shops. Changes are live on the next message — no deploy needed.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {dirty && (
            <span style={{ fontSize: 12, color: 'var(--yellow)', fontFamily: 'Share Tech Mono' }}>
              ● unsaved changes
            </span>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading || !dirty}>
            {saving ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 20,
          border: `1px solid ${toast.ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
          background: toast.ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
          fontSize: 13, color: toast.ok ? 'var(--green)' : 'var(--red)',
        }}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--dim)', padding: '40px 0', textAlign: 'center' }}>Loading config...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>

          {/* Card 1 — Model Settings */}
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18 }}>Model Settings</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              <div>
                <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--dim)', marginBottom: 6 }}>Model</label>
                <select value={model} onChange={e => setModel(e.target.value)}>
                  {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
                  {model.includes('sonnet-4-6') && <span style={{ color: 'var(--green)' }}>✦ Latest Sonnet — best reasoning, ~800ms</span>}
                  {model.includes('sonnet-4-5') && <span style={{ color: 'var(--accent)' }}>Sonnet 4.5 — strong diagnostic reasoning, ~700ms</span>}
                  {model.includes('haiku')      && <span style={{ color: 'var(--yellow)' }}>⚡ Haiku — fastest, lower cost. Use for high-volume only.</span>}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--dim)', marginBottom: 6 }}>Max Tokens (Response Length)</label>
                <select value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))}>
                  {TOKEN_OPTIONS.map(t => (
                    <option key={t} value={t}>
                      {t}{t === 1024 ? ' (default)' : t <= 512 ? ' — brief' : t >= 2048 ? ' — detailed' : ''}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--dim)', lineHeight: 1.5 }}>
                  {maxTokens <= 512  && '⚡ Short — may truncate diagnostic steps'}
                  {maxTokens > 512  && maxTokens <= 1024 && '✓ Balanced — good for most conversations'}
                  {maxTokens > 1024 && maxTokens <= 2048 && 'Detailed — full diagnostic writeups'}
                  {maxTokens > 2048 && '📄 Long-form — comprehensive reports'}
                </div>
                <div style={{
                  marginTop: 10, padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
                  fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono',
                }}>
                  Est. cost per message: ~${((maxTokens / 1000) * 0.003).toFixed(4)}
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 18, padding: '10px 14px', borderRadius: 6,
              border: '1px solid rgba(234,179,8,.2)', background: 'rgba(234,179,8,.05)',
              fontSize: 12, color: 'var(--yellow)', lineHeight: 1.5,
            }}>
              <strong>Note:</strong> Temperature is not currently read by the Forge Assist chat route.
              It runs at the model default. Temperature control will be wired in a future update.
            </div>
          </div>

          {/* Card 2 — Prompt Addendum */}
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>System Prompt Addendum</div>
            <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 14, lineHeight: 1.5 }}>
              Appended to the base Forge Assist system prompt for every AI chat across all shops.
              Use for platform-wide behavior tweaks, beta instructions, or scope adjustments.
            </div>

            <div style={{
              padding: '10px 14px', borderRadius: 6, marginBottom: 16,
              border: '1px solid rgba(234,179,8,.25)', background: 'rgba(234,179,8,.06)',
              fontSize: 12, color: 'var(--yellow)', lineHeight: 1.5,
            }}>
              The base system prompt (Forge Assist identity, diagnostic scope, tool definitions) is managed in
              the CFP codebase and cannot be edited here. This addendum is injected after the base prompt
              under the heading <span className="mono" style={{ fontSize: 11 }}>ADDITIONAL INSTRUCTIONS</span>.
            </div>

            <textarea
              value={promptSuffix}
              onChange={e => setPromptSuffix(e.target.value.slice(0, 2000))}
              rows={8}
              placeholder="e.g. During the closed beta period, remind technicians that Forge Assist is in testing and encourage them to flag any unusual responses..."
              style={{ fontFamily: 'Share Tech Mono', fontSize: 12, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--dim)', marginTop: 6, fontFamily: 'Share Tech Mono' }}>
              <span>≈ {suffixTokens} tokens</span>
              <span style={{ color: promptSuffix.length > 1800 ? 'var(--yellow)' : 'var(--dim)' }}>
                {promptSuffix.length} / 2000 chars
              </span>
            </div>

            {/* Live preview */}
            {promptSuffix.trim() && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--dim)', marginBottom: 8 }}>
                  Preview — injected into system prompt as:
                </div>
                <div style={{
                  background: 'var(--bg-dark)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '12px 14px',
                  fontFamily: 'Share Tech Mono', fontSize: 12, lineHeight: 1.6,
                }}>
                  <span style={{ color: 'var(--accent)', opacity: .5 }}>... [base system prompt] ...</span>
                  <br /><br />
                  <span style={{ color: 'var(--secondary)' }}>{'=== ADDITIONAL INSTRUCTIONS ==='}</span>
                  <br />
                  <span style={{ color: 'var(--text)' }}>{promptSuffix.trim()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Card 3 — Current live config */}
          <div className="card" style={{ background: 'rgba(255,255,255,.02)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--dim)', fontWeight: 700, marginBottom: 14 }}>
              Current Live Config
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'model',                label: 'Model',           value: MODELS.find(m => m.value === origModel)?.label ?? origModel || '—' },
                { key: 'max_tokens',           label: 'Max Tokens',      value: origTokens ? String(origTokens) : '—' },
                { key: 'system_prompt_suffix', label: 'Prompt Addendum', value: origSuffix ? `${origSuffix.slice(0, 80)}${origSuffix.length > 80 ? '...' : ''}` : '(none)' },
              ].map(item => (
                <div key={item.key} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', width: 200, flexShrink: 0 }}>{item.key}</span>
                  <span style={{ fontSize: 13, color: item.key === 'system_prompt_suffix' && !origSuffix ? 'var(--dim)' : 'var(--text)' }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
            {lastUpdated && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono' }}>
                Last saved: {format(new Date(lastUpdated), 'MMM d, yyyy · h:mm a')}
              </div>
            )}
          </div>

          {/* Save footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading || !dirty} style={{ minWidth: 140 }}>
              {saving ? 'Saving...' : 'Save Config'}
            </button>
            {dirty && (
              <button className="btn btn-ghost" onClick={() => { setModel(origModel); setMaxTokens(origTokens); setPromptSuffix(origSuffix) }}>
                Discard Changes
              </button>
            )}
            {toast && (
              <span style={{ fontSize: 13, fontWeight: 700, color: toast.ok ? 'var(--green)' : 'var(--red)' }}>
                {toast.ok ? '✓' : '✗'} {toast.msg}
              </span>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
