import { useState, useEffect } from 'react'
import { api } from '../api'
import { formatDistanceToNow } from 'date-fns'

type ServiceStatus = 'green' | 'yellow' | 'red' | 'unknown'

type ServiceRow = {
  name: string
  status: ServiceStatus
  detail: string
  ms?: number | null
}

function parseStatus(result: any): ServiceStatus {
  if (!result || !result.success) return 'red'
  if (result.data?.status === 'down') return 'red'
  if (result.data?.status === 'degraded') return 'yellow'
  return 'green'
}

export default function SystemTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.status.get()
      setData(res)
      setLastChecked(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const services: ServiceRow[] = data ? [
    {
      name: 'CFP Frontend (Netlify)',
      status: parseStatus(data.netlify),
      detail: data.netlify?.data?.state ?? 'checking...',
    },
    {
      name: 'CFP API (Railway)',
      status: parseStatus(data.railway),
      detail: data.railway?.data?.status ?? 'checking...',
    },
    {
      name: 'CFP Supabase',
      status: parseStatus(data.supabase),
      detail: data.supabase?.success ? 'connected' : data.supabase?.error ?? 'error',
    },
    {
      name: 'crimsonforge.pro (Uptime)',
      status: (() => {
        const entries = data.uptime?.data as any[]
        if (!entries?.length) return 'unknown' as ServiceStatus
        if (entries.some((e: any) => e.status === 'down')) return 'red' as ServiceStatus
        if (entries.some((e: any) => e.status === 'degraded')) return 'yellow' as ServiceStatus
        return 'green' as ServiceStatus
      })(),
      detail: (() => {
        const entries = data.uptime?.data as any[]
        const main = entries?.find((e: any) => e.url?.includes('crimsonforge'))
        return main ? `${main.responseMs ?? '?'}ms` : 'checking...'
      })(),
      ms: (() => {
        const entries = data.uptime?.data as any[]
        return entries?.find((e: any) => e.url?.includes('crimsonforge'))?.responseMs ?? null
      })(),
    },
    {
      name: 'Stripe',
      status: parseStatus(data.stripe),
      detail: data.stripe?.data?.hasWebhookIssues ? 'webhook issues' : 'healthy',
    },
    {
      name: 'Twilio SMS',
      status: parseStatus(data.twilio),
      detail: data.twilio?.data?.pendingVerification ? 'EIN verification pending' : (data.twilio?.data?.status ?? 'checking...'),
    },
    {
      name: 'Resend Email',
      status: parseStatus(data.resend),
      detail: data.resend?.data?.domainStatus ?? 'checking...',
    },
    {
      name: 'Sentry',
      status: parseStatus(data.sentry),
      detail: data.sentry?.data?.unresolvedCount != null
        ? `${data.sentry.data.unresolvedCount} unresolved`
        : 'checking...',
    },
    {
      name: 'Elara (Overseer)',
      status: 'green',
      detail: 'online',
    },
  ] : []

  const dotClass = (s: string) =>
    s === 'green' ? 'dot dot-green' : s === 'red' ? 'dot dot-red' : s === 'yellow' ? 'dot dot-yellow' : 'dot dot-dim'

  const allGreen = services.length > 0 && services.every(s => s.status === 'green')
  const hasRed = services.some(s => s.status === 'red')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 4 }} className="grad">
            SYSTEM STATUS
          </h1>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>
            {lastChecked
              ? `Last checked ${formatDistanceToNow(lastChecked, { addSuffix: true })}`
              : 'Loading...'}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Checking...' : '↻ Refresh'}
        </button>
      </div>

      {!loading && services.length > 0 && (
        <div style={{
          padding: '14px 20px', borderRadius: 10, marginBottom: 24,
          border: `1px solid ${allGreen ? 'rgba(34,197,94,.3)' : hasRed ? 'rgba(239,68,68,.3)' : 'rgba(234,179,8,.3)'}`,
          background: allGreen ? 'rgba(34,197,94,.06)' : hasRed ? 'rgba(239,68,68,.06)' : 'rgba(234,179,8,.06)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span className={`dot ${allGreen ? 'dot-green' : hasRed ? 'dot-red' : 'dot-yellow'}`} style={{ width: 12, height: 12 }} />
          <span style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
            {allGreen ? 'ALL SYSTEMS OPERATIONAL' : hasRed ? 'DEGRADED — ACTION REQUIRED' : 'PARTIAL DEGRADATION'}
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--dim)', padding: '40px 0', textAlign: 'center' }}>Running health checks...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {services.map((svc, i) => (
            <div key={svc.name} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 20px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              <span className={dotClass(svc.status)} />
              <span style={{ flex: 1, fontWeight: 600 }}>{svc.name}</span>
              <span style={{ fontSize: 13, color: 'var(--dim)', fontFamily: 'Share Tech Mono', marginRight: 8 }}>
                {svc.detail}
              </span>
              <span className={`badge badge-${svc.status === 'green' ? 'green' : svc.status === 'red' ? 'red' : svc.status === 'yellow' ? 'yellow' : 'dim'}`}>
                {svc.status === 'green' ? 'OK' : svc.status === 'red' ? 'DOWN' : svc.status === 'yellow' ? 'WARN' : '?'}
              </span>
            </div>
          ))}
        </div>
      )}

      {data?.stripe?.data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 24 }}>
          {[
            { label: 'MRR', value: `$${data.stripe.data.mrr?.toLocaleString() ?? 0}`, color: 'var(--green)' },
            { label: 'Active Subs', value: data.stripe.data.activeSubscriptions ?? 0, color: 'var(--accent)' },
            { label: 'Payment Failures', value: data.stripe.data.paymentFailures?.length ?? 0, color: data.stripe.data.hasPaymentFailures ? 'var(--red)' : 'var(--dim)' },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color: k.color, fontSize: '1.6rem' }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
