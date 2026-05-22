import { useState, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'

export interface InsightRow {
  id: string
  session_id: string
  shop_id: string | null
  analyzed_at: string
  status: 'success' | 'failed' | 'skipped'
  ai_helpfulness:   number | null
  ai_specificity:   number | null
  tech_frustration: number | null
  resolution_score: number | null
  topic_tag:        string | null
  outcome:          string | null
  pattern_note:     string | null
  session: {
    year: string | null
    make: string | null
    model: string | null
    last_dtc: string | null
    message_count: number | null
    created_at: string
  } | null
}

interface Props {
  insights: InsightRow[]
  loading: boolean
  daysFilter: number
  onDaysFilterChange: (days: number) => void
}

const RANGE_OPTIONS: { value: number; label: string }[] = [
  { value: 7,   label: '7 DAYS'   },
  { value: 30,  label: '30 DAYS'  },
  { value: 90,  label: '90 DAYS'  },
  { value: 365, label: '1 YEAR'   },
]

function avg(values: (number | null)[]): number | null {
  const filtered = values.filter((v): v is number => typeof v === 'number')
  if (filtered.length === 0) return null
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length
}

function scoreColor(score: number | null, kind: 'higher_better' | 'lower_better' = 'higher_better'): string {
  if (score === null) return 'var(--dim)'
  if (kind === 'higher_better') {
    if (score >= 4)   return 'var(--green)'
    if (score >= 2.5) return 'var(--yellow)'
    return 'var(--red)'
  }
  // lower_better (friction)
  if (score <= 1)   return 'var(--green)'
  if (score <= 2.5) return 'var(--yellow)'
  return 'var(--red)'
}

function outcomeColor(outcome: string | null): string {
  if (!outcome) return 'var(--dim)'
  if (outcome === 'resolved' || outcome === 'ongoing') return 'var(--green)'
  if (outcome === 'one-shot') return 'var(--cyan)'
  if (outcome === 'abandoned') return 'var(--red)'
  if (outcome === 'escalated') return 'var(--yellow)'
  return 'var(--dim)'
}

export default function InsightsPanel({ insights, loading, daysFilter, onDaysFilterChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [sortBy,   setSortBy]   = useState<'recent' | 'worst' | 'best'>('recent')

  const stats = useMemo(() => {
    if (insights.length === 0) return null
    return {
      n: insights.length,
      avgHelp:    avg(insights.map(i => i.ai_helpfulness)),
      avgSpec:    avg(insights.map(i => i.ai_specificity)),
      avgFrust:   avg(insights.map(i => i.tech_frustration)),
      avgResolve: avg(insights.map(i => i.resolution_score)),
    }
  }, [insights])

  const topicBreakdown = useMemo(() => {
    const buckets: Record<string, InsightRow[]> = {}
    for (const i of insights) {
      const t = i.topic_tag ?? 'untagged'
      if (!buckets[t]) buckets[t] = []
      buckets[t].push(i)
    }
    return Object.entries(buckets)
      .map(([topic, rows]) => ({
        topic,
        n: rows.length,
        avgHelp:  avg(rows.map(r => r.ai_helpfulness)),
        avgFrust: avg(rows.map(r => r.tech_frustration)),
      }))
      .sort((a, b) => b.n - a.n)
  }, [insights])

  const sortedRows = useMemo(() => {
    const copy = [...insights]
    if (sortBy === 'worst') {
      copy.sort((a, b) => {
        const fA = a.tech_frustration ?? 0
        const fB = b.tech_frustration ?? 0
        if (fB !== fA) return fB - fA
        return (a.ai_helpfulness ?? 5) - (b.ai_helpfulness ?? 5)
      })
    } else if (sortBy === 'best') {
      copy.sort((a, b) => (b.ai_helpfulness ?? 0) - (a.ai_helpfulness ?? 0))
    } else {
      copy.sort((a, b) => new Date(b.analyzed_at).getTime() - new Date(a.analyzed_at).getTime())
    }
    return copy
  }, [insights, sortBy])

  const maxTopicCount = Math.max(1, ...topicBreakdown.map(t => t.n))

  return (
    <div>
      {/* Range filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono', letterSpacing: 1.5 }}>
          RANGE:
        </div>
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onDaysFilterChange(opt.value)}
            style={{
              background: daysFilter === opt.value ? 'rgba(74,204,254,.12)' : 'transparent',
              border: `1px solid ${daysFilter === opt.value ? 'var(--cyan)' : 'var(--border)'}`,
              color: daysFilter === opt.value ? 'var(--cyan)' : 'var(--dim)',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: 'pointer',
              fontFamily: 'Share Tech Mono',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        <div className="kpi">
          <div className="kpi-label">Analyzed</div>
          <div className="kpi-value" style={{ color: 'var(--cyan)' }}>
            {loading ? '—' : (stats?.n ?? 0)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg Helpfulness</div>
          <div className="kpi-value" style={{ color: scoreColor(stats?.avgHelp ?? null, 'higher_better') }}>
            {loading || !stats?.avgHelp ? '—' : stats.avgHelp.toFixed(1)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg Friction</div>
          <div className="kpi-value" style={{ color: scoreColor(stats?.avgFrust ?? null, 'lower_better') }}>
            {loading || stats?.avgFrust == null ? '—' : stats.avgFrust.toFixed(1)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg Resolution</div>
          <div className="kpi-value" style={{ color: scoreColor(stats?.avgResolve ?? null, 'higher_better') }}>
            {loading || !stats?.avgResolve ? '—' : stats.avgResolve.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Topic breakdown */}
      {topicBreakdown.length > 0 && !loading && (
        <div style={{ marginBottom: 28 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>BY TOPIC</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {topicBreakdown.map((t, i) => (
              <div key={t.topic} style={{
                display: 'grid',
                gridTemplateColumns: '120px 50px 1fr 90px 90px',
                gap: 12,
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom: i < topicBreakdown.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 13,
              }}>
                <div style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 }}>
                  {t.topic}
                </div>
                <div style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono' }}>
                  {t.n}
                </div>
                <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(t.n / maxTopicCount) * 100}%`,
                    height: '100%',
                    background: scoreColor(t.avgHelp, 'higher_better'),
                  }} />
                </div>
                <div style={{ fontSize: 11, color: scoreColor(t.avgHelp, 'higher_better'), fontFamily: 'Share Tech Mono', textAlign: 'right' }}>
                  help {t.avgHelp?.toFixed(1) ?? '—'}
                </div>
                <div style={{ fontSize: 11, color: scoreColor(t.avgFrust, 'lower_better'), fontFamily: 'Share Tech Mono', textAlign: 'right' }}>
                  frust {t.avgFrust?.toFixed(1) ?? '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent insights */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="section-label">SESSIONS &mdash; {insights.length}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(['recent', 'worst', 'best'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              style={{
                background: sortBy === s ? 'rgba(74,204,254,.12)' : 'transparent',
                border: `1px solid ${sortBy === s ? 'var(--cyan)' : 'var(--border)'}`,
                color: sortBy === s ? 'var(--cyan)' : 'var(--dim)',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: 'pointer',
                fontFamily: 'Share Tech Mono',
              }}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--dim)', padding: '40px 0', textAlign: 'center', fontSize: 13 }}>
          Loading&hellip;
        </div>
      ) : insights.length === 0 ? (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 14,
          padding: '48px 32px', textAlign: 'center', background: 'rgba(255,255,255,.02)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>{'◎'}</div>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: 'var(--dim)', marginBottom: 10 }}>
            NO INSIGHTS YET
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.7 }}>
            No analyzed sessions in this range. Either the nightly job hasn't run yet, all sessions were too short to analyze, or the backfill endpoint hasn't been called.
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {sortedRows.map((row, i) => {
            const isOpen = !!expanded[row.id]
            const vehicle = [row.session?.year, row.session?.make, row.session?.model].filter(Boolean).join(' ') || 'Unknown vehicle'
            const dtc = row.session?.last_dtc || (row.topic_tag === 'codes' ? 'no DTC' : null)
            return (
              <div key={row.id} style={{
                borderBottom: i < sortedRows.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                {/* Top row (clickable) */}
                <div
                  onClick={() => setExpanded(s => ({ ...s, [row.id]: !s[row.id] }))}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto auto',
                    gap: 12,
                    padding: '12px 16px',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{vehicle}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono', marginTop: 2 }}>
                      {row.topic_tag ?? 'untagged'}
                      {dtc && <span> &middot; {dtc}</span>}
                      {row.session?.message_count != null && <span> &middot; {row.session.message_count} msgs</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'Share Tech Mono', color: scoreColor(row.ai_helpfulness, 'higher_better') }}>
                    help {row.ai_helpfulness ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'Share Tech Mono', color: scoreColor(row.tech_frustration, 'lower_better') }}>
                    frust {row.tech_frustration ?? '—'}
                  </div>
                  <div style={{
                    fontSize: 10, fontFamily: 'Share Tech Mono',
                    color: outcomeColor(row.outcome),
                    padding: '2px 8px', borderRadius: 4,
                    border: `1px solid ${outcomeColor(row.outcome)}33`,
                    whiteSpace: 'nowrap',
                  }}>
                    {row.outcome ?? 'unknown'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatDistanceToNow(new Date(row.analyzed_at), { addSuffix: true })}
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{
                    padding: '12px 16px 16px',
                    background: 'rgba(255,255,255,.02)',
                    borderTop: '1px solid var(--border)',
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 12,
                      marginBottom: 12,
                      fontFamily: 'Share Tech Mono',
                      fontSize: 11,
                    }}>
                      <div>
                        <div style={{ color: 'var(--dim)' }}>Helpfulness</div>
                        <div style={{ color: scoreColor(row.ai_helpfulness, 'higher_better'), fontSize: 16, fontWeight: 700 }}>
                          {row.ai_helpfulness ?? '—'}<span style={{ fontSize: 11, opacity: .5 }}>/5</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--dim)' }}>Specificity</div>
                        <div style={{ color: scoreColor(row.ai_specificity, 'higher_better'), fontSize: 16, fontWeight: 700 }}>
                          {row.ai_specificity ?? '—'}<span style={{ fontSize: 11, opacity: .5 }}>/5</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--dim)' }}>Friction</div>
                        <div style={{ color: scoreColor(row.tech_frustration, 'lower_better'), fontSize: 16, fontWeight: 700 }}>
                          {row.tech_frustration ?? '—'}<span style={{ fontSize: 11, opacity: .5 }}>/5</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--dim)' }}>Resolution</div>
                        <div style={{ color: scoreColor(row.resolution_score, 'higher_better'), fontSize: 16, fontWeight: 700 }}>
                          {row.resolution_score ?? '—'}<span style={{ fontSize: 11, opacity: .5 }}>/5</span>
                        </div>
                      </div>
                    </div>
                    {row.pattern_note && (
                      <div style={{
                        paddingLeft: 12, borderLeft: '2px solid var(--cyan)',
                        color: 'var(--dim)', fontSize: 12, fontStyle: 'italic',
                        lineHeight: 1.6,
                      }}>
                        {row.pattern_note}
                      </div>
                    )}
                    <div style={{
                      marginTop: 10, fontSize: 10, color: 'var(--dim)',
                      fontFamily: 'Share Tech Mono', opacity: .6,
                    }}>
                      session_id: {row.session_id}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
