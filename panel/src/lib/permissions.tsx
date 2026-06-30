import { createContext, useContext } from 'react'

export type Access = 'none' | 'view' | 'manage'
export type Permissions = Record<string, Access>

// Matrix groups (mirror the nav). CRM + Financials expand into sub-tabs.
export const PERMISSION_GROUPS: Array<{ area: string; label: string; keys: Array<{ key: string; label: string }> }> = [
  { area: 'home',       label: 'Home',       keys: [{ key: 'home', label: 'Home' }] },
  { area: 'elara',      label: 'Elara',      keys: [{ key: 'elara', label: 'Elara (assistant, controls, Forge AI)' }] },
  { area: 'crm',        label: 'CRM',        keys: [{ key: 'crm.leads', label: 'Leads' }, { key: 'crm.pipeline', label: 'Pipeline' }, { key: 'crm.companies', label: 'Companies' }] },
  { area: 'customers',  label: 'Customers',  keys: [{ key: 'customers', label: 'Customers' }] },
  { area: 'financials', label: 'Financials', keys: [{ key: 'financials.revenue', label: 'Revenue' }, { key: 'financials.runway', label: 'Burn & runway' }, { key: 'financials.raise', label: 'Raise' }, { key: 'financials.captable', label: 'Cap table' }] },
  { area: 'system',     label: 'System',     keys: [{ key: 'system', label: 'System' }] },
  { area: 'settings',   label: 'Settings',   keys: [{ key: 'settings', label: 'Settings (audit, activity, integrations)' }] },
]

export const ALL_KEYS = PERMISSION_GROUPS.flatMap(g => g.keys.map(k => k.key))

export function presetPermissions(role: string): Permissions {
  const all = (level: Access) => Object.fromEntries(ALL_KEYS.map(k => [k, level])) as Permissions
  if (role === 'owner') return all('manage')
  if (role === 'admin') { const p = all('manage'); p['settings'] = 'view'; return p }
  if (role === 'read_only') return all('view')
  return {} // custom
}

export function resolveAccess(perms: Permissions | undefined, key: string, level: 'view' | 'manage'): boolean {
  const p = perms ?? {}
  let access = p[key]
  if (access === undefined && key.includes('.')) access = p[key.split('.')[0]]
  return level === 'view' ? access === 'view' || access === 'manage' : access === 'manage'
}

export function canView(perms: Permissions, role: string, key: string): boolean {
  return role === 'owner' || resolveAccess(perms, key, 'view')
}
export function canManage(perms: Permissions, role: string, key: string): boolean {
  return role === 'owner' || resolveAccess(perms, key, 'manage')
}
/** An area nav entry is visible if its key or any of its leaves is viewable. */
export function canViewArea(perms: Permissions, role: string, area: string): boolean {
  if (role === 'owner') return true
  const g = PERMISSION_GROUPS.find(x => x.area === area)
  if (!g) return canView(perms, role, area)
  return g.keys.some(k => canView(perms, role, k.key))
}

interface PermCtx { permissions: Permissions; role: string }
const Ctx = createContext<PermCtx>({ permissions: {}, role: 'read_only' })
export const PermissionsProvider = Ctx.Provider
export function usePermissions(): PermCtx { return useContext(Ctx) }
