export function errMsg(e: unknown): string {
  if (e instanceof Error) { try { return JSON.parse(e.message).error ?? e.message } catch { return e.message } }
  return 'Something went wrong'
}

export function fmtMoney(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n == null) return '—'
  if (opts?.compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

export function prettyStage(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Crimson-family palette for ownership/breakdown charts.
export const CHART_COLORS = ['#C0302A', '#5949AC', '#16a34a', '#3489E6', '#d97706', '#8D1845', '#8f97a3']
