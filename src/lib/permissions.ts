/**
 * Per-area permission model (STEP7). A flat map of key → access level
 * ('none' | 'view' | 'manage', manage ⊇ view). Keys are top-level areas or
 * 'area.subtab' leaves mirroring the nav. The stored map on overseer_admins is
 * the source of truth; role presets just populate it.
 */

export type Access = 'none' | 'view' | 'manage'
export type Permissions = Record<string, Access>

// Canonical keys (mirror the nav). Leaves where a tab has sub-views.
export const PERMISSION_KEYS = [
  'home',
  'elara',
  'crm.leads', 'crm.pipeline', 'crm.companies', 'crm.phone',
  'customers',
  'enterprise',
  'financials.revenue', 'financials.runway', 'financials.raise', 'financials.captable',
  'system',
  'settings',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

const FEATURE_KEYS = PERMISSION_KEYS.filter(k => k !== 'settings')

/** Role → default permission map. The stored map remains authoritative. */
export function presetPermissions(role: string): Permissions {
  const all = (level: Access) => Object.fromEntries(PERMISSION_KEYS.map(k => [k, level])) as Permissions
  switch (role) {
    case 'owner':
      return all('manage')
    case 'admin': {
      const p = Object.fromEntries(FEATURE_KEYS.map(k => [k, 'manage'])) as Permissions
      p['settings'] = 'view'
      return p
    }
    case 'read_only':
      return all('view')
    default: // 'custom'
      return {}
  }
}

const meets = (have: Access | undefined, need: 'view' | 'manage'): boolean =>
  need === 'view' ? have === 'view' || have === 'manage' : have === 'manage'

/**
 * Does this permission map satisfy `key` at `level`? A leaf ('area.subtab')
 * that's unset falls back to its parent area key.
 */
export function resolveAccess(permissions: Permissions | undefined, key: string, level: 'view' | 'manage'): boolean {
  const perms = permissions ?? {}
  let access = perms[key]
  if (access === undefined && key.includes('.')) access = perms[key.split('.')[0]]
  return meets(access, level)
}
