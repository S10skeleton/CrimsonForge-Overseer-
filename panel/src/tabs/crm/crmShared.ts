export function errMsg(e: unknown): string {
  if (e instanceof Error) { try { return JSON.parse(e.message).error ?? e.message } catch { return e.message } }
  return 'Something went wrong'
}

export const COMPANY_TYPES = ['investor', 'enterprise', 'partner', 'customer', 'prospect', 'other']
export const PIPELINE_OPTIONS = [
  { key: 'fundraising', label: 'Fundraising' },
  { key: 'enterprise', label: 'Enterprise' },
  { key: 'partnership', label: 'Partnership' },
]

export const TYPE_BADGE: Record<string, string> = {
  investor: 'badge-violet', enterprise: 'badge-crimson', partner: 'badge-green',
  customer: 'badge-cyan', prospect: 'badge-dim', other: 'badge-dim',
}

export function fmtAmount(amount: number | null, currency = 'USD'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export function prettyStage(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
