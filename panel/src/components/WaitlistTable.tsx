import { useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'

export interface WaitlistEntry {
  id: string
  email: string
  name: string | null
  shop_name: string | null
  role: string | null
  vehicles_per_month: number | null
  comment: string | null
  source: string | null
  created_at: string
}

interface Props {
  entries: WaitlistEntry[]
  loading: boolean
  /** Used for CSV download filename, e.g. "forgepulse" or "forgepilot" */
  product: string
}

function sourceLabel(source: string | null): string {
  if (!source) return 'Unknown'
  if (source === 'marketing_site')       return 'Marketing Site'
  if (source === 'marketing_forgepilot') return 'Marketing ForgePilot'
  if (source === 'marketing_forgepulse') return 'Marketing ForgePulse'
  return source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCSV(entries: WaitlistEntry[], product: string) {
  const headers = ['email', 'name', 'shop_name', 'role', 'vehicles_per_month', 'comment', 'source', 'created_at']
  const lines = [headers.join(',')]
  for (const e of entries) {
    lines.push([
      csvEscape(e.email),
      csvEscape(e.name),
      csvEscape(e.shop_name),
      csvEscape(e.role),
      csvEscape(e.vehicles_per_month),
      csvEscape(e.comment),
      csvEscape(e.source),
      csvEscape(e.created_at),
    ].join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = format(new Date(), 'yyyyMMdd-HHmm')
  a.download = `${product}-waitlist-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function WaitlistTable({ entries, loading, product }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Source breakdown
  const sourceCounts: Record<string, number> = {}
  for (const e of entries) {
    const key = e.source ?? 'unknown'
    sourceCounts[key] = (sourceCounts[key] ?? 0) + 1
  }

  if (loading) {
    return <div style={{ color: 'var(--dim)', padding: '40px 0', textAlign: 'center', fontSize: 13 }}>Loading...</div>
  }

  if (entries.length === 0) {
    return (
      <div style={{
        border: '1px solid var(--border)', borderRadius: 14,
        padding: '48px 32px', textAlign: 'center', background: 'rgba(255,255,255,.02)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>{'◎'}</div>
        <div style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: 'var(--dim)', marginBottom: 10 }}>
          WAITLIST EMPTY
        </div>
        <div style={{ color: 'var(--dim)', fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.7 }}>
          No signups yet. Once the marketing form goes live and people join, they'll appear here in real time.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Source breakdown chips */}
      {Object.keys(sourceCounts).length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(sourceCounts).map(([src, count]) => (
            <div key={src} style={{
              padding: '6px 14px', borderRadius: 20,
              border: '1px solid var(--border)',
              background: 'rgba(74,204,254,.06)',
              fontSize: 12, color: 'var(--cyan)',
              fontFamily: 'Share Tech Mono',
            }}>
              {sourceLabel(src)} &middot; {count}
            </div>
          ))}
        </div>
      )}

      {/* Header row with export */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div className="section-label">
          WAITLIST &mdash; {entries.length} signup{entries.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => downloadCSV(entries, product)}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: '1px solid var(--cyan)',
            color: 'var(--cyan)',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            cursor: 'pointer',
            fontFamily: 'Share Tech Mono',
          }}
        >
          EXPORT CSV
        </button>
      </div>

      {/* List */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {entries.map((e, i) => {
          const isOpen = !!expanded[e.id]
          const hasComment = !!e.comment && e.comment.trim().length > 0
          const meta: string[] = []
          if (e.shop_name) meta.push(e.shop_name)
          if (e.role) meta.push(e.role)
          if (e.vehicles_per_month != null) meta.push(`${e.vehicles_per_month}/mo`)

          return (
            <div key={e.id} style={{
              padding: '12px 16px',
              borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: 13,
            }}>
              {/* Top row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 12,
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {e.name || <span style={{ color: 'var(--dim)', fontStyle: 'italic' }}>no name</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'Share Tech Mono', marginTop: 2 }}>
                    {e.email}
                    {meta.length > 0 && <span> &middot; {meta.join(' · ')}</span>}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--cyan)', fontFamily: 'Share Tech Mono',
                  padding: '2px 8px', borderRadius: 4,
                  border: '1px solid rgba(74,204,254,.2)',
                  background: 'rgba(74,204,254,.06)',
                  whiteSpace: 'nowrap',
                }}>
                  {sourceLabel(e.source)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div>{format(new Date(e.created_at), 'MMM d, yyyy')}</div>
                  <div style={{ marginTop: 2 }}>
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </div>
                </div>
              </div>

              {/* Comment row — truncated 1 line, click to expand */}
              {hasComment && (
                <div
                  onClick={() => setExpanded(s => ({ ...s, [e.id]: !s[e.id] }))}
                  style={{
                    marginTop: 8,
                    paddingLeft: 12,
                    borderLeft: '2px solid var(--border)',
                    color: 'var(--dim)',
                    fontSize: 12,
                    fontStyle: 'italic',
                    cursor: 'pointer',
                    whiteSpace: isOpen ? 'pre-wrap' : 'nowrap',
                    overflow: isOpen ? 'visible' : 'hidden',
                    textOverflow: isOpen ? 'clip' : 'ellipsis',
                    lineHeight: 1.5,
                  }}
                  title={isOpen ? 'Click to collapse' : 'Click to expand'}
                >
                  &ldquo;{e.comment}&rdquo;
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
