import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'

// ─── Types ──────────────────────────────────────────────────────────────

type ServiceStatus = 'green' | 'yellow' | 'red' | 'unknown'

interface ServiceRow {
  name: string
  status: ServiceStatus
  detail: string
}

interface ProductSection {
  id: 'cfp' | 'fp' | 'pulse'
  label: string
  subtitle: string
  accent: string
  services: ServiceRow[]
  kpis?: { label: string; value: string | number; color: string }[]
  note?: string          // Special text instead of services (ForgePulse)
  overall: ServiceStatus
}

// ─── Helpers ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<ServiceStatus, string> = {
  green:   'var(--green)',
  yellow:  'var(--yellow)',
  red:     'var(--red)',
  unknown: 'var(--dim)',
}

function parseBool(result: any): ServiceStatus {
  if (!result || !result.success) return 'red'
  if (result.data?.status === 'down') return 'red'
  if (result.data?.status === 'degraded') return 'yellow'
  return 'green'
}

function parseFPConnection(result: any): ServiceStatus {
  if (!result || !result.success) return 'red'
  const s = result.data?.connectionStatus
  if (s === 'down') return 'red'
  if (s === 'degraded') return 'yellow'
  if (s === 'healthy') return 'green'
  return 'unknown'
}

function parseFPUptime(pair: any): ServiceStatus {
  if (!pair) return 'unknown'
  if (pair.status === 'down') return 'red'
  if (pair.status === 'degraded') return 'yellow'
  if (pair.status === 'healthy') return 'green'
  return 'unknown'
}

function aggregate(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.length === 0) return 'unknown'
  if (statuses.some(s => s === 'red')) return 'red'
  if (statuses.some(s => s === 'yellow')) return 'yellow'
  if (statuses.every(s => s === 'green')) return 'green'
  return 'yellow'
}

function statusLabel(s: ServiceStatus): string {
  if (s === 'green')  return 'OK'
  if (s === 'red')    return 'DOWN'
  if (s === 'yellow') return 'WARN'
  return '?'
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function SystemTab() {
  const [data, setData]               = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [clock, setClock]             = useState('')
  const [scanKey, setScanKey]         = useState(0)

  // Manual collapse overrides. `undefined` = use smart default.
  const [collapsedOverride, setCollapsedOverride] =
    useState<Record<string, boolean | undefined>>({})

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.status.get()
      setData(res)
      setLastChecked(new Date())
      setScanKey(k => k + 1)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Auto-refresh every 60s (status is the landing page now)
  useEffect(() => {
    const t = setInterval(() => { load() }, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC'), 1000)
    return () => clearInterval(t)
  }, [])

  // ─── Build product sections ───────────────────────────────────────────

  const sections: ProductSection[] = data ? buildSections(data) : []
  const overall = aggregate(sections.map(s => s.overall))
  const overallLabel =
    overall === 'green' ? 'ALL SYSTEMS OPERATIONAL'
    : overall === 'red' ? 'DEGRADED — ACTION REQUIRED'
    : overall === 'yellow' ? 'PARTIAL DEGRADATION'
    : 'STATUS UNKNOWN'

  function isCollapsed(section: ProductSection): boolean {
    const ovr = collapsedOverride[section.id]
    if (ovr !== undefined) return ovr
    // Smart default: CFP collapses when all-green (signal-only philosophy);
    // FP + Pulse stay expanded.
    if (section.id === 'cfp' && section.overall === 'green') return true
    return false
  }

  function toggleCollapse(id: string, current: boolean) {
    setCollapsedOverride(prev => ({ ...prev, [id]: !current }))
  }

  return (
    <div>
      {/* ─── Page header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 4 }} className="grad">
            FLEET STATUS
          </h1>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--dim)' }}>
            {clock}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {lastChecked && (
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--dim)' }}>
              {formatDistanceToNow(lastChecked, { addSuffix: true })}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? '...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* ─── Overall banner + per-product fleet badges ───────────────── */}
      {!loading && sections.length > 0 && (
        <>
          <div style={{
            padding: '14px 20px', borderRadius: 10, marginBottom: 14,
            border: `1px solid ${STATUS_COLOR[overall]}44`,
            background: `${STATUS_COLOR[overall]}0d`,
            display: 'flex', alignItems: 'center', gap: 14,
            position: 'relative', overflow: 'hidden',
          }}>
            <div key={scanKey} style={{
              position: 'absolute', left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, transparent, ${STATUS_COLOR[overall]}60, transparent)`,
              animation: 'scan 1.2s ease forwards', pointerEvents: 'none',
            }} />
            <span className={`dot dot-${overall === 'unknown' ? 'dim' : overall}`} style={{ width: 12, height: 12 }} />
            <span style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 12, letterSpacing: 2.5, color: STATUS_COLOR[overall] }}>
              {overallLabel}
            </span>
          </div>

          {/* Per-product badge strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${sections.length}, 1fr)`,
            gap: 10, marginBottom: 24,
          }}>
            {sections.map(section => (
              <FleetBadge
                key={section.id}
                section={section}
                onClick={() => {
                  const el = document.getElementById(`section-${section.id}`)
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              />
            ))}
          </div>
        </>
      )}

      {loading && !data ? (
        <div style={{ color: 'var(--dim)', padding: '60px 0', textAlign: 'center', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>
          RUNNING HEALTH CHECKS...
        </div>
      ) : (
        <>
          {/* ─── Elara (global, above products) ─────────────────────── */}
          <ElaraCard />

          {/* ─── Product sections ───────────────────────────────────── */}
          {sections.map(section => (
            <ProductSectionBlock
              key={section.id}
              section={section}
              collapsed={isCollapsed(section)}
              onToggle={() => toggleCollapse(section.id, isCollapsed(section))}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────

function FleetBadge({ section, onClick }: { section: ProductSection; onClick: () => void }) {
  const color = STATUS_COLOR[section.overall]
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', cursor: 'pointer',
        background: `${color}08`,
        border: `1px solid ${color}33`,
        borderRadius: 10, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'all .2s',
      }}
    >
      {/* Accent bar */}
      <div style={{ width: 4, height: 34, borderRadius: 2, background: section.accent, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>
          {section.label}
        </div>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--dim)' }}>
          {section.subtitle}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: color, boxShadow: `0 0 10px ${color}`,
        }} />
        <span style={{
          fontFamily: 'Share Tech Mono', fontSize: 9, letterSpacing: 1,
          color,
        }}>
          {statusLabel(section.overall)}
        </span>
      </div>
    </button>
  )
}

function ProductSectionBlock({
  section, collapsed, onToggle,
}: {
  section: ProductSection; collapsed: boolean; onToggle: () => void
}) {
  const color = STATUS_COLOR[section.overall]

  return (
    <div
      id={`section-${section.id}`}
      style={{
        marginBottom: 20,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${section.accent}`,
        borderRadius: 10,
        background: 'rgba(255,255,255,.01)',
        overflow: 'hidden',
      }}
    >
      {/* Section header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, boxShadow: `0 0 8px ${color}`,
          flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Orbitron', fontWeight: 700, fontSize: 13, letterSpacing: 2.5,
            color: section.accent,
          }}>
            {section.label}
          </div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>
            {section.subtitle}
          </div>
        </div>
        <span className={`badge badge-${section.overall === 'unknown' ? 'dim' : section.overall}`} style={{ fontSize: 10 }}>
          {statusLabel(section.overall)}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--dimmer)',
          transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
          transition: 'transform .2s',
          display: 'inline-block', width: 12,
        }}>
          {'▶'}
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: '14px 18px 18px' }}>
          {/* Services grid */}
          {section.services.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10, marginBottom: section.kpis ? 16 : 0,
            }}>
              {section.services.map(svc => (
                <ServiceCard key={svc.name} svc={svc} />
              ))}
            </div>
          )}

          {/* Placeholder note (ForgePulse) */}
          {section.note && (
            <div style={{
              padding: '20px 18px', borderRadius: 8,
              border: '1px dashed var(--border)',
              background: 'rgba(255,255,255,.02)',
              color: 'var(--dim)', fontSize: 12, lineHeight: 1.7,
              fontFamily: 'Share Tech Mono',
              marginBottom: section.kpis ? 16 : 0,
            }}>
              {section.note}
            </div>
          )}

          {/* KPIs */}
          {section.kpis && section.kpis.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${section.kpis.length}, 1fr)`,
              gap: 12,
            }}>
              {section.kpis.map(k => (
                <div key={k.label} className="kpi">
                  <div className="kpi-label">{k.label}</div>
                  <div className="kpi-value" style={{ color: k.color, fontSize: '1.4rem' }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ServiceCard({ svc }: { svc: ServiceRow }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${svc.status === 'green' ? 'var(--border)' : `${STATUS_COLOR[svc.status]}33`}`,
      borderRadius: 8, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      transition: 'border-color .3s',
    }}>
      <div style={{
        width: 28, height: 28, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <svg width="28" height="28" viewBox="0 0 32 32">
          <polygon
            points="16,2 28,9 28,23 16,30 4,23 4,9"
            fill={`${STATUS_COLOR[svc.status]}18`}
            stroke={STATUS_COLOR[svc.status]}
            strokeWidth="1"
            opacity=".8"
          />
        </svg>
        <div style={{
          position: 'absolute', width: 6, height: 6, borderRadius: '50%',
          background: STATUS_COLOR[svc.status],
          boxShadow: `0 0 8px ${STATUS_COLOR[svc.status]}`,
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{svc.name}</div>
        <div style={{
          fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {svc.detail}
        </div>
      </div>
      <span className={`badge badge-${svc.status === 'unknown' ? 'dim' : svc.status}`} style={{ flexShrink: 0, fontSize: 9 }}>
        {statusLabel(svc.status)}
      </span>
    </div>
  )
}

function ElaraCard() {
  return (
    <div style={{
      background: 'rgba(89,73,172,.06)',
      border: '1px solid rgba(89,73,172,.2)',
      borderRadius: 10, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 18,
      animation: 'breathe 4s ease-in-out infinite',
      marginBottom: 22,
    }}>
      <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '1px dashed rgba(89,73,172,.3)', animation: 'orbit-cw 10s linear infinite' }} />
        <div className="orb-ring ring-1" style={{ inset: 0,  borderWidth: 1.5 }} />
        <div className="orb-ring ring-2" style={{ inset: 10, borderWidth: 1 }} />
        <div className="ring-core" style={{ inset: 18 }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 12, letterSpacing: 3, marginBottom: 3 }} className="grad">
          ELARA
        </div>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--dim)' }}>
          AI Ops Intelligence &mdash; overseer online
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', animation: 'pulse-ring 2.5s infinite' }} />
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--green)', letterSpacing: 1 }}>ONLINE</span>
      </div>
    </div>
  )
}

// ─── Section builders ───────────────────────────────────────────────────

function buildSections(data: any): ProductSection[] {
  return [
    buildCFPSection(data),
    buildFPSection(data),
    buildPulseSection(data),
  ]
}

function buildCFPSection(data: any): ProductSection {
  const uptimeEntries = (data.uptime?.data ?? []) as any[]
  const uptimeStatus: ServiceStatus = (() => {
    if (!uptimeEntries.length) return 'unknown'
    if (uptimeEntries.some(x => x.status === 'down')) return 'red'
    if (uptimeEntries.some(x => x.status === 'degraded')) return 'yellow'
    return 'green'
  })()
  const uptimeDetail = (() => {
    const m = uptimeEntries.find(x => x.url?.includes('crimsonforge'))
    return m ? `${m.responseMs ?? '?'}ms` : '—'
  })()

  const services: ServiceRow[] = [
    { name: 'CFP Frontend', status: parseBool(data.netlify),  detail: data.netlify?.data?.state ?? '—' },
    { name: 'CFP API',      status: parseBool(data.railway),  detail: data.railway?.data?.status ?? '—' },
    { name: 'CFP Supabase', status: parseBool(data.supabase), detail: data.supabase?.success ? 'connected' : 'error' },
    { name: 'Uptime Monitor', status: uptimeStatus,           detail: uptimeDetail },
    { name: 'Stripe',       status: parseBool(data.stripe),   detail: data.stripe?.data?.hasWebhookIssues ? 'webhook warn' : 'healthy' },
    { name: 'Twilio SMS',   status: parseBool(data.twilio),   detail: data.twilio?.data?.pendingVerification ? 'EIN pending' : 'healthy' },
    { name: 'Resend Email', status: parseBool(data.resend),   detail: data.resend?.data?.domainStatus ?? '—' },
    { name: 'Sentry',       status: parseBool(data.sentry),   detail: `${data.sentry?.data?.unresolvedCount ?? 0} unresolved` },
  ]

  const kpis = data?.stripe?.data ? [
    { label: 'MRR',              value: `$${(data.stripe.data.mrr ?? 0).toLocaleString()}`, color: 'var(--green)' },
    { label: 'Active Subs',      value: data.stripe.data.activeSubscriptions ?? 0,          color: 'var(--cyan)' },
    { label: 'Payment Failures', value: data.stripe.data.paymentFailures?.length ?? 0,      color: data.stripe.data.hasPaymentFailures ? 'var(--red)' : 'var(--dim)' },
  ] : []

  return {
    id: 'cfp',
    label: 'CRIMSONFORGE PRO',
    subtitle: 'Auto shop SaaS platform',
    accent: '#EA1823',
    services,
    kpis,
    overall: aggregate(services.map(s => s.status)),
  }
}

function buildFPSection(data: any): ProductSection {
  const fpSup = data.fp_supabase
  const fpStripe = data.fp_stripe
  const fpUp = data.fp_uptime

  const frontendStatus = parseFPUptime(fpUp?.data?.frontend)
  const apiStatus      = parseFPUptime(fpUp?.data?.api)
  const dbStatus       = parseFPConnection(fpSup)

  // Stripe: green if configured; red if error. (Pre-launch, 0 subs is expected and not a warning.)
  const stripeStatus: ServiceStatus = fpStripe?.success ? 'green' : 'red'

  const frontendDetail = fpUp?.data?.frontend?.responseMs != null
    ? `${fpUp.data.frontend.responseMs}ms`
    : (fpUp?.error ? fpUp.error.slice(0, 40) : '—')
  const apiDetail = fpUp?.data?.api?.responseMs != null
    ? `${fpUp.data.api.responseMs}ms`
    : (fpUp?.error ? fpUp.error.slice(0, 40) : '—')

  const services: ServiceRow[] = [
    { name: 'FP Frontend',   status: frontendStatus, detail: frontendDetail },
    { name: 'FP API',        status: apiStatus,      detail: apiDetail },
    { name: 'FP Supabase',   status: dbStatus,       detail: fpSup?.success ? 'connected' : (fpSup?.error?.slice(0, 40) ?? 'error') },
    { name: 'FP Stripe',     status: stripeStatus,   detail: fpStripe?.success
        ? `${fpStripe.data?.activeSubscriptions ?? 0} active subs`
        : (fpStripe?.error?.slice(0, 40) ?? 'error') },
  ]

  const kpis = [
    { label: 'Users',          value: fpSup?.data?.totalUsers ?? 0,                color: 'var(--cyan)' },
    { label: 'Active Subs',    value: fpStripe?.data?.activeSubscriptions ?? 0,    color: 'var(--cyan)' },
    { label: 'MRR',            value: `$${(fpStripe?.data?.mrr ?? 0).toLocaleString()}`, color: 'var(--green)' },
    { label: 'Scans / 24h',    value: fpSup?.data?.sessionSummary?.obdScansLast24h ?? 0, color: 'var(--violet)' },
  ]

  return {
    id: 'fp',
    label: 'FORGEPILOT',
    subtitle: 'AI diagnostic tool · OBD2 scanning',
    accent: '#4ACCFE',
    services,
    kpis,
    overall: aggregate(services.map(s => s.status)),
  }
}

function buildPulseSection(data: any): ProductSection {
  const count = data.pulse?.waitlistCount
  const note =
    'ForgePulse / AutoVault is in pre-build. No production infrastructure ' +
    'deployed yet. Monitoring will come online once the first service ships. ' +
    (count != null
      ? `Waitlist is live on the marketing site — ${count} signup${count === 1 ? '' : 's'} so far.`
      : 'Waitlist count unavailable.')

  return {
    id: 'pulse',
    label: 'FORGEPULSE',
    subtitle: 'AutoVault · Vehicle history & ownership',
    accent: '#8D1845',
    services: [],
    note,
    kpis: count != null ? [
      { label: 'Waitlist', value: count, color: 'var(--violet)' },
      { label: 'Status',   value: 'PRE-BUILD', color: 'var(--yellow)' },
    ] : [
      { label: 'Status', value: 'PRE-BUILD', color: 'var(--yellow)' },
    ],
    // Pre-build is not a failure state — report 'unknown' so aggregate fleet
    // health is not dragged down by an unbuilt product.
    overall: 'unknown',
  }
}
