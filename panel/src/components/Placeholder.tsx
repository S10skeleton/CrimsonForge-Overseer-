interface Props {
  title: string
  phase?: string
  note?: string
}

// Scaffold for IA sections whose full build lands in a later redesign phase.
// Keeps the route + nav real now so the shell is complete and navigable.
export default function Placeholder({ title, phase, note }: Props) {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        {title}
      </h1>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        {note ?? 'This section is part of the Overseer 2.0 redesign.'}
      </div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 520 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, color: 'var(--text-hint)',
        }}>
          ◌
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Coming soon
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {phase ? `Scheduled for redesign ${phase}.` : 'Scaffolded — implementation pending.'}
          </div>
        </div>
      </div>
    </div>
  )
}
