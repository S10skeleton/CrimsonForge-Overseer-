export default function ForgePulseTab() {
  return (
    <div>
      <h1
        style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 22, letterSpacing: 4, marginBottom: 8 }}
        className="grad"
      >
        FORGEPULSE
      </h1>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 40 }}>
        AutoVault &middot; Vehicle history &amp; ownership intelligence
      </div>

      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '48px 32px',
        textAlign: 'center',
        background: 'rgba(255,255,255,.02)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>&#9678;</div>
        <div style={{
          fontFamily: 'Orbitron',
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: 3,
          color: 'var(--dim)',
          marginBottom: 10,
        }}>
          COMING SOON
        </div>
        <div style={{ color: 'var(--dim)', fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.7 }}>
          ForgePulse monitoring will appear here once the product launches.
          Infrastructure, billing, and user metrics will follow the same
          pattern as ForgePilot.
        </div>
      </div>
    </div>
  )
}
