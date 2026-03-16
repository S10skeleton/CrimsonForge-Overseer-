import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'

type ServiceStatus = 'green' | 'yellow' | 'red' | 'unknown'
type ServiceRow = { name: string; status: ServiceStatus; detail: string; category: string }

function parseStatus(result: any): ServiceStatus {
  if (!result || !result.success) return 'red'
  if (result.data?.status === 'down') return 'red'
  if (result.data?.status === 'degraded') return 'yellow'
  return 'green'
}

const STATUS_COLOR: Record<ServiceStatus, string> = {
  green:   'var(--green)',
  yellow:  'var(--yellow)',
  red:     'var(--red)',
  unknown: 'var(--dim)',
}

export default function SystemTab() {
  const [data, setData]           = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [clock, setClock]         = useState('')
  const [scanKey, setScanKey]     = useState(0)

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
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC'), 1000)
    return () => clearInterval(t)
  }, [])

  const services: ServiceRow[] = data ? [
    { name: 'CFP Frontend',       status: parseStatus(data.netlify),  detail: data.netlify?.data?.state ?? '—',             category: 'infra' },
    { name: 'CFP API',            status: parseStatus(data.railway),  detail: data.railway?.data?.status ?? '—',            category: 'infra' },
    { name: 'CFP Supabase',       status: parseStatus(data.supabase), detail: data.supabase?.success ? 'connected' : 'error', category: 'infra' },
    { name: 'Uptime Monitor',     status: (() => {
        const e = data.uptime?.data as any[]
        if (!e?.length) return 'unknown' as ServiceStatus
        if (e.some((x: any) => x.status === 'down')) return 'red' as ServiceStatus
        if (e.some((x: any) => x.status === 'degraded')) return 'yellow' as ServiceStatus
        return 'green' as ServiceStatus
      })(),
      detail: (() => {
        const e = data.uptime?.data as any[]
        const m = e?.find((x: any) => x.url?.includes('crimsonforge'))
        return m ? `${m.responseMs ?? '?'}ms` : '—'
      })(),
      category: 'infra',
    },
    { name: 'Stripe',             status: parseStatus(data.stripe),   detail: data.stripe?.data?.hasWebhookIssues ? 'webhook warn' : 'healthy', category: 'services' },
    { name: 'Twilio SMS',         status: parseStatus(data.twilio),   detail: data.twilio?.data?.pendingVerification ? 'EIN pending' : 'healthy', category: 'services' },
    { name: 'Resend Email',       status: parseStatus(data.resend),   detail: data.resend?.data?.domainStatus ?? '—',       category: 'services' },
    { name: 'Sentry',             status: parseStatus(data.sentry),   detail: `${data.sentry?.data?.unresolvedCount ?? 0} unresolved`, category: 'services' },
    { name: 'Elara (Overseer)',   status: 'green',                    detail: 'online',                                      category: 'elara' },
  ] : []

  const allGreen = services.length > 0 && services.every(s => s.status === 'green')
  const hasRed   = services.some(s => s.status === 'red')
  const overallStatus = allGreen ? 'green' : hasRed ? 'red' : 'yellow'
  const overallLabel  = allGreen ? 'ALL SYSTEMS OPERATIONAL' : hasRed ? 'DEGRADED — ACTION REQUIRED' : 'PARTIAL DEGRADATION'

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 4 }} className="grad">
            SYSTEM STATUS
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

      {/* Overall status banner */}
      {!loading && services.length > 0 && (
        <div style={{
          padding: '14px 20px', borderRadius: 10, marginBottom: 24,
          border: `1px solid ${STATUS_COLOR[overallStatus]}44`,
          background: `${STATUS_COLOR[overallStatus]}0d`,
          display: 'flex', alignItems: 'center', gap: 14,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Scan line animation after refresh */}
          <div key={scanKey} style={{
            position: 'absolute', left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, transparent, ${STATUS_COLOR[overallStatus]}60, transparent)`,
            animation: 'scan 1.2s ease forwards',
            pointerEvents: 'none',
          }} />
          <span className={`dot dot-${overallStatus}`} style={{ width: 12, height: 12 }} />
          <span style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 12, letterSpacing: 2.5, color: STATUS_COLOR[overallStatus] }}>
            {overallLabel}
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--dim)', padding: '60px 0', textAlign: 'center', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>
          RUNNING HEALTH CHECKS...
        </div>
      ) : (
        <>
          {/* Service grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginBottom: 24 }}>
            {services.map((svc) => (
              <div key={svc.name} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${svc.status === 'green' ? 'var(--border)' : `${STATUS_COLOR[svc.status]}33`}`,
                borderRadius: 8, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'border-color .3s',
              }}>
                {/* Hex-shaped status indicator */}
                <div style={{
                  width: 32, height: 32, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  <svg width="32" height="32" viewBox="0 0 32 32">
                    <polygon
                      points="16,2 28,9 28,23 16,30 4,23 4,9"
                      fill={`${STATUS_COLOR[svc.status]}18`}
                      stroke={STATUS_COLOR[svc.status]}
                      strokeWidth="1"
                      opacity=".8"
                    />
                  </svg>
                  <div style={{
                    position: 'absolute', width: 7, height: 7, borderRadius: '50%',
                    background: STATUS_COLOR[svc.status],
                    boxShadow: `0 0 8px ${STATUS_COLOR[svc.status]}`,
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{svc.name}</div>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {svc.detail}
                  </div>
                </div>
                <span className={`badge badge-${svc.status === 'unknown' ? 'dim' : svc.status}`} style={{ flexShrink: 0, fontSize: 10 }}>
                  {svc.status === 'green' ? 'OK' : svc.status === 'red' ? 'DOWN' : svc.status === 'yellow' ? 'WARN' : '?'}
                </span>
              </div>
            ))}
          </div>

          {/* Elara status card */}
          <div style={{
            background: 'rgba(89,73,172,.06)',
            border: '1px solid rgba(89,73,172,.2)',
            borderRadius: 10, padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: 20,
            animation: 'breathe 4s ease-in-out infinite',
            marginBottom: 24,
          }}>
            {/* Mini orb */}
            <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
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
                AI Ops Intelligence — all systems nominal
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', animation: 'pulse-ring 2.5s infinite' }} />
              <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--green)', letterSpacing: 1 }}>ONLINE</span>
            </div>
          </div>

          {/* Stripe KPIs */}
          {data?.stripe?.data && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {[
                { label: 'MRR',              value: `$${data.stripe.data.mrr?.toLocaleString() ?? 0}`, color: 'var(--green)' },
                { label: 'Active Subs',      value: data.stripe.data.activeSubscriptions ?? 0,          color: 'var(--cyan)' },
                { label: 'Payment Failures', value: data.stripe.data.paymentFailures?.length ?? 0,      color: data.stripe.data.hasPaymentFailures ? 'var(--red)' : 'var(--dim)' },
              ].map(k => (
                <div key={k.label} className="kpi">
                  <div className="kpi-label">{k.label}</div>
                  <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
