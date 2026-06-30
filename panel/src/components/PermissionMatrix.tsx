import { PERMISSION_GROUPS } from '../lib/permissions'
import type { Access, Permissions } from '../lib/permissions'

const LEVELS: Access[] = ['none', 'view', 'manage']

function Segmented({ value, onChange, disabled }: { value: Access; onChange: (a: Access) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
      {LEVELS.map(l => {
        const active = value === l
        return (
          <button key={l} disabled={disabled} onClick={() => onChange(l)} style={{
            padding: '4px 10px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit',
            background: active ? (l === 'manage' ? 'var(--accent)' : l === 'view' ? 'var(--bg-elevated)' : 'transparent') : 'transparent',
            color: active ? (l === 'manage' ? '#fff' : 'var(--text-primary)') : 'var(--text-hint)',
            fontWeight: active ? 600 : 400,
          }}>{l}</button>
        )
      })}
    </div>
  )
}

export default function PermissionMatrix({ value, onChange, disabled }: { value: Permissions; onChange: (p: Permissions) => void; disabled?: boolean }) {
  const set = (key: string, level: Access) => onChange({ ...value, [key]: level })
  const setArea = (keys: string[], level: Access) => {
    const next = { ...value }
    for (const k of keys) next[k] = level
    onChange(next)
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {PERMISSION_GROUPS.map(g => {
        const multi = g.keys.length > 1
        return (
          <div key={g.area} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: .5 }}>{g.label}</span>
              {multi
                ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>set all</span>
                    <Segmented value={'none'} disabled={disabled} onChange={(l) => setArea(g.keys.map(k => k.key), l)} />
                  </div>
                : <Segmented value={value[g.keys[0].key] ?? 'none'} disabled={disabled} onChange={(l) => set(g.keys[0].key, l)} />}
            </div>
            {multi && (
              <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                {g.keys.map(k => (
                  <div key={k.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{k.label}</span>
                    <Segmented value={value[k.key] ?? 'none'} disabled={disabled} onChange={(l) => set(k.key, l)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
