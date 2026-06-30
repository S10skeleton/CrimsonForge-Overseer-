/**
 * Shared light-theme primitives for the Customers area (STEP10).
 * One layout shell + metric/table cards so CrimsonForge Pro and ForgePilot
 * look and navigate identically — same look as HomeTab / FinancialsLayout.
 * Pure presentation: no data fetching, no permission logic.
 */
import type { ReactNode } from 'react'

export type ProductSlug = 'crimsonforge-pro' | 'forgepilot' | 'forgepulse'

export const PRODUCT_META: Record<ProductSlug, { label: string; badge: string }> = {
  'crimsonforge-pro': { label: 'CrimsonForge Pro', badge: 'badge-crimson' },
  'forgepilot':       { label: 'ForgePilot',       badge: 'badge-violet' },
  'forgepulse':       { label: 'ForgePulse',       badge: 'badge-dim' },
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) { try { return JSON.parse(e.message).error ?? e.message } catch { return e.message } }
  return 'Something went wrong'
}

export const fmtMoney = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('en-US').format(n)

/**
 * Page shell shared by every product/view: a header row (view title + product
 * chip + optional right-aligned actions) over the content area.
 */
export function CustomerView({ title, product, actions, children }: {
  title: string
  product?: ProductSlug
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
          {product && <span className={`badge ${PRODUCT_META[product].badge}`}>{PRODUCT_META[product].label}</span>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export interface MetricItem {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: string
}

/** The Home/Financials metric-card row. Replaces bespoke .kpi blocks. */
export function MetricCards({ items, min = 150 }: { items: MetricItem[]; min?: number }) {
  return (
    <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>
      {items.map((m) => (
        <div key={m.label} className="kpi">
          <div className="kpi-label">{m.label}</div>
          <div className="kpi-value" style={m.accent ? { color: m.accent } : undefined}>{m.value}</div>
          {m.sub != null && <div className="kpi-sub">{m.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/**
 * White card wrapping content. `flush` removes padding so a full-width <table>
 * (global th/td styling) sits clean inside, with a padded header row.
 */
export function DataCard({ title, actions, children, flush, style }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
  style?: React.CSSProperties
}) {
  const hasHeader = title != null || actions != null
  return (
    <div className="card" style={{ padding: flush ? 0 : undefined, marginBottom: 18, ...style }}>
      {hasHeader && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          ...(flush ? { padding: '16px 18px 12px' } : { marginBottom: 14 }),
        }}>
          {title != null ? <div className="section-label" style={{ margin: 0 }}>{title}</div> : <span />}
          {actions}
        </div>
      )}
      {flush ? <div className="table-wrap">{children}</div> : children}
    </div>
  )
}

/** Consistent empty/loading/error line inside a card. */
export function StateLine({ children }: { children: ReactNode }) {
  return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '14px 4px' }}>{children}</div>
}
