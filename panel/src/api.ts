const BASE = import.meta.env.VITE_OVERSEER_URL ?? ''

function getToken(): string | null {
  return localStorage.getItem('panel_token')
}

function headers(): Record<string, string> {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// Centralized 401 handling: an expired/invalid token clears local auth and
// bounces to /login from anywhere. Skipped on the auth endpoints themselves so
// a bad passphrase surfaces its own error instead of a redirect loop.
function handleUnauthorized(path: string) {
  if (path.startsWith('/api/auth/')) return
  // Reason survives the hard location.assign so Login can explain why.
  sessionStorage.setItem('panel_logout_reason', 'expired')
  localStorage.removeItem('panel_token')
  localStorage.removeItem('panel_role')
  localStorage.removeItem('panel_user')
  if (window.location.pathname !== '/login') window.location.assign('/login')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...(options?.headers ?? {}) },
  })
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized(path)
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export interface PanelUser {
  id: string
  username: string
  email: string
  must_change_password: boolean
}

export interface LoginResult {
  token: string
  role: string
  user: PanelUser
}

export interface MfaChallenge { mfaRequired: true; mfaToken: string }
export type LoginResponse = LoginResult | MfaChallenge

export interface Admin {
  id: string
  username: string
  email: string
  role: 'owner' | 'admin' | 'read_only'
  status: 'active' | 'suspended'
  permissions: Record<string, 'none' | 'view' | 'manage'>
  must_change_password: boolean
  last_login_at: string | null
  created_at: string
  created_by: string | null
}

export interface Invite {
  id: string
  email: string
  display_name: string | null
  username: string | null
  role: string
  status: 'invited' | 'accepted' | 'revoked'
  expires_at: string
  created_at: string
  accepted_at: string | null
}

export interface Me { id: string; username: string; role: string; permissions: Record<string, 'none' | 'view' | 'manage'> }

export interface ActivityEvent {
  id: number
  type: string
  title: string
  body: string | null
  severity: 'info' | 'success' | 'warning' | 'critical'
  channel: string | null
  meta: Record<string, unknown>
  created_at: string
}

export interface Page<T> {
  data: T[]
  meta: { next_cursor: number | null }
}

export interface ElaraSchedule { job_key: string; label: string; cron: string; timezone: string | null; enabled: boolean }
export interface ElaraBriefing { sections: Record<string, boolean>; ai_summary: boolean; timezone: string | null }
export interface ElaraAlertRule { rule_key: string; label: string; enabled: boolean; severity: string; sms_enabled: boolean; threshold: Record<string, number> | null; destination_id: string | null }
export interface ElaraDestination { id: string; kind: string; label: string; target: string; enabled: boolean }
export interface ElaraRoute { notification_type: string; destination_id: string | null }
export interface ElaraRecipient { id: string; kind: string; value: string; label: string | null; enabled: boolean }
export interface ElaraQuietHours { enabled: boolean; start_local: string; end_local: string; timezone: string | null; exempt_severities: string[] }
export interface ElaraCustomJob { id: string; name: string; cron: string; timezone: string | null; action_type: string; payload: Record<string, unknown>; enabled: boolean }

export interface ElaraConfig {
  schedules: ElaraSchedule[]
  briefing: ElaraBriefing | null
  alertRules: ElaraAlertRule[]
  destinations: ElaraDestination[]
  routes: ElaraRoute[]
  recipients: ElaraRecipient[]
  quietHours: ElaraQuietHours | null
  customJobs: ElaraCustomJob[]
}

export type CrmFieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'phone' | 'email' | 'url' | 'boolean' | 'currency'
export interface CrmFieldDef {
  id: string; object: 'company' | 'contact' | 'deal'; key: string; label: string
  type: CrmFieldType; options: string[] | null; position: number; archived: boolean; created_at: string
}
export type CrmCustom = Record<string, unknown>
export interface CrmFilter { field: string; op: string; value: unknown }
export interface ViewConfig { columns?: string[]; filters?: CrmFilter[]; sort?: { field: string; dir: 'asc' | 'desc' }; group?: string | null; pageSize?: number }
export interface CrmSavedView { id: string; object: string; name: string; owner: string | null; shared: boolean; is_default: boolean; config: ViewConfig; position: number }
export interface CrmQueryResult { rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }
export interface CrmSyncAccount { email: string; method: string; enabled: boolean; last_sync: string | null; created_at: string }
export interface CrmBlocklistEntry { id: string; pattern: string; reason: string | null; created_at: string }
export interface CrmThreadMessage { id: string; from: string; to: string; date: string; subject: string; body: string }

export interface CrmCompany {
  id: string; name: string; type: string; status: string; website: string | null
  fp_shop_id: string | null; fp_customer_id: string | null; source_lead_id: string | null
  owner: string | null; notes: string | null; tags: string[]; custom?: CrmCustom; created_at: string; updated_at: string
}
export interface CrmContact { id: string; company_id: string; name: string; title: string | null; email: string | null; phone: string | null; is_primary: boolean; notes: string | null; sms_opt_in?: boolean; custom?: CrmCustom; created_at: string }
export interface CrmDeal {
  id: string; company_id: string; company_name?: string | null; name: string; pipeline: string; stage: string
  amount: number | null; currency: string; probability: number | null; status: string; expected_close: string | null
  owner: string | null; notes: string | null; custom?: CrmCustom; created_at: string; updated_at: string
}
export interface CrmActivity { id: string; company_id: string; contact_id: string | null; deal_id: string | null; type: string; subject: string | null; body: string | null; due_at: string | null; done: boolean; created_by: string | null; created_at: string }
export interface CrmPipeline { pipeline: string; stages: Array<{ stage: string; deals: CrmDeal[] }> }
export interface CompanyDetail { company: CrmCompany; contacts: CrmContact[]; deals: CrmDeal[]; activities: CrmActivity[] }

export interface QuoInbox { id: string; number: string; name?: string; label?: string; enabled?: boolean }
export interface QuoThread { participant: string; lastText: string; lastAt: string; direction: string; count: number }
export interface QuoMessage { id: string; from: string; to: string[]; direction: 'incoming' | 'outgoing'; text?: string; body?: string; createdAt: string }
export interface QuoCall { id: string; from: string; to: string; direction: 'incoming' | 'outgoing'; status?: string; duration?: number; createdAt: string }
export interface QuoScheduled { id: string; to_number: string; body: string; send_at: string; status: string; created_by: string | null; created_at: string }

export interface Revenue { mrr: number; arr: number; activeSubs: number; newThisMonth: number; churnedThisMonth: number; failedPaymentsCount: number; failedPaymentsAmount: number; planBreakdown: { solo: number; shop: number } }
export interface MrrPoint { snapshot_date: string; mrr: number; arr: number; active_subs: number; new_subs: number; churned_subs: number }
export interface FinEntry { id: string; month: string; type: string; category: string | null; label: string | null; amount: number; notes: string | null; created_by: string | null; created_at: string }
export interface Runway { cashOnHand: number | null; avgMonthlyBurn: number | null; runwayMonths: number | null }
export interface RaiseProgress { target: number; committed: number; byStage: Array<{ stage: string; count: number; amount: number }>; deals: Array<{ id: string; name: string; company_id: string; stage: string; amount: number | null; status: string }> }

export interface CapSecurity { id: string; holder_name: string; holder_type: string; security_class: string; crm_company_id: string | null; shares: number | null; pct: number | null; issued: boolean; notes: string | null; computedPct?: number | null }
export interface CapSafe { id: string; investor_name: string; crm_company_id: string | null; instrument_type: string; amount: number; valuation_cap: number | null; discount_pct: number | null; mfn: boolean; pro_rata: boolean; date_signed: string | null; status: string; notes: string | null }
export interface CapSummary { totalIssuedShares: number; holders: CapSecurity[]; optionPoolReserved: number; fullyDilutedShares: number; outstandingSafes: { count: number; total: number; list: CapSafe[] } }
export interface CapInvestor { id: string; name: string; type: string; owner: string | null; safes: CapSafe[]; outstandingTotal: number }

export interface HomeSummary {
  signupsThisWeek: number | null
  leads: { open: number | null; hot: number | null; total: number | null }
  runway: { available: boolean }
  pipeline: { available: boolean }
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    loginMfa: (mfaToken: string, code: string) =>
      request<LoginResult>('/api/auth/login/2fa', { method: 'POST', body: JSON.stringify({ mfaToken, code }) }),
    twofa: {
      status: () => request<{ enabled: boolean }>('/api/auth/2fa/status'),
      setup: () => request<{ otpauthUrl: string; qrDataUrl: string }>('/api/auth/2fa/setup', { method: 'POST' }),
      verify: (code: string) => request<{ ok: boolean; recoveryCodes: string[] }>('/api/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
      disable: (p: { code?: string; recoveryCode?: string }) => request<{ ok: boolean }>('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify(p) }),
      regenerate: (code: string) => request<{ ok: boolean; recoveryCodes: string[] }>('/api/auth/2fa/recovery/regenerate', { method: 'POST', body: JSON.stringify({ code }) }),
    },
    forgot: (usernameOrEmail: string) =>
      request<{ ok: boolean }>('/api/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ usernameOrEmail }),
      }),
    reset: (token: string, newPassword: string) =>
      request<{ ok: boolean }>('/api/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    status: () => request<{ locked: boolean; secondsRemaining?: number }>('/api/auth/status'),
    acceptInvite: (token: string, username: string, password: string) =>
      request<LoginResult>('/api/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, username, password }) }),
    me: () => request<Me>('/api/auth/me'),
  },

  admins: {
    list: () => request<Admin[]>('/api/admins'),
    create: (payload: { username: string; email: string; role: string }) =>
      request<{ admin: Admin; emailed: boolean; tempPassword?: string }>('/api/admins', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<{ role: string; status: string; email: string; permissions: Record<string, string> }>) =>
      request<{ admin: Admin }>(`/api/admins/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    resetPassword: (id: string) =>
      request<{ ok: boolean; emailed: boolean; tempPassword?: string }>(`/api/admins/${id}/reset-password`, {
        method: 'POST',
      }),
    invite: (payload: { email: string; displayName?: string; username?: string; role: string; permissions: Record<string, string> }) =>
      request<{ invite: Invite; emailed: boolean; acceptUrl?: string }>('/api/admins/invite', { method: 'POST', body: JSON.stringify(payload) }),
    invites: () => request<Invite[]>('/api/admins/invites'),
    resendInvite: (id: string) => request<{ ok: boolean; emailed: boolean; acceptUrl?: string }>(`/api/admins/invites/${id}/resend`, { method: 'POST' }),
    revokeInvite: (id: string) => request<{ ok: boolean }>(`/api/admins/invites/${id}/revoke`, { method: 'POST' }),
    reset2fa: (id: string) => request<{ ok: boolean }>(`/api/admins/${id}/reset-2fa`, { method: 'POST' }),
  },

  home: {
    summary: () => request<HomeSummary>('/api/home/summary'),
  },

  financials: {
    revenue: () => request<{ data: Revenue }>('/api/financials/revenue').then(r => r.data),
    mrrHistory: (months = 12) => request<{ data: MrrPoint[] }>(`/api/financials/mrr-history?months=${months}`).then(r => r.data),
    entries: (params?: { type?: string; from?: string; to?: string }) => {
      const p = new URLSearchParams()
      if (params?.type) p.set('type', params.type)
      if (params?.from) p.set('from', params.from)
      if (params?.to) p.set('to', params.to)
      const qs = p.toString()
      return request<{ data: FinEntry[] }>(`/api/financials/entries${qs ? `?${qs}` : ''}`).then(r => r.data)
    },
    createEntry: (e: { month: string; type: string; category?: string; label?: string; amount: number; notes?: string }) =>
      request<{ data: FinEntry }>('/api/financials/entries', { method: 'POST', body: JSON.stringify(e) }),
    updateEntry: (id: string, e: Partial<FinEntry>) => request(`/api/financials/entries/${id}`, { method: 'PATCH', body: JSON.stringify(e) }),
    deleteEntry: (id: string) => request(`/api/financials/entries/${id}`, { method: 'DELETE' }),
    runway: () => request<{ data: Runway }>('/api/financials/runway').then(r => r.data),
    raise: () => request<{ data: RaiseProgress }>('/api/financials/raise').then(r => r.data),
  },

  captable: {
    securities: () => request<{ data: CapSecurity[] }>('/api/captable/securities').then(r => r.data),
    createSecurity: (s: Partial<CapSecurity> & { holder_name: string }) => request<{ data: CapSecurity }>('/api/captable/securities', { method: 'POST', body: JSON.stringify(s) }),
    updateSecurity: (id: string, s: Partial<CapSecurity>) => request(`/api/captable/securities/${id}`, { method: 'PATCH', body: JSON.stringify(s) }),
    deleteSecurity: (id: string) => request(`/api/captable/securities/${id}`, { method: 'DELETE' }),
    safes: (status?: string) => request<{ data: CapSafe[] }>(`/api/captable/safes${status ? `?status=${status}` : ''}`).then(r => r.data),
    createSafe: (s: Partial<CapSafe> & { investor_name: string; amount: number }) => request<{ data: CapSafe }>('/api/captable/safes', { method: 'POST', body: JSON.stringify(s) }),
    updateSafe: (id: string, s: Partial<CapSafe>) => request(`/api/captable/safes/${id}`, { method: 'PATCH', body: JSON.stringify(s) }),
    deleteSafe: (id: string) => request(`/api/captable/safes/${id}`, { method: 'DELETE' }),
    summary: () => request<{ data: CapSummary }>('/api/captable/summary').then(r => r.data),
    investors: () => request<{ data: CapInvestor[] }>('/api/captable/investors').then(r => r.data),
  },

  crm: {
    companies: (params?: { type?: string; q?: string; tag?: string; limit?: number; cursor?: string | null }) => {
      const p = new URLSearchParams()
      if (params?.type) p.set('type', params.type)
      if (params?.q) p.set('q', params.q)
      if (params?.tag) p.set('tag', params.tag)
      if (params?.limit) p.set('limit', String(params.limit))
      if (params?.cursor) p.set('cursor', params.cursor)
      const qs = p.toString()
      return request<{ data: CrmCompany[]; meta: { next_cursor: string | null } }>(`/api/crm/companies${qs ? `?${qs}` : ''}`)
    },
    company: (id: string) => request<{ data: CompanyDetail }>(`/api/crm/companies/${id}`).then(r => r.data),
    createCompany: (c: Partial<CrmCompany>) => request<{ data: CrmCompany }>('/api/crm/companies', { method: 'POST', body: JSON.stringify(c) }).then(r => r.data),
    updateCompany: (id: string, c: Partial<CrmCompany>) => request(`/api/crm/companies/${id}`, { method: 'PATCH', body: JSON.stringify(c) }),
    deleteCompany: (id: string) => request(`/api/crm/companies/${id}`, { method: 'DELETE' }),

    createContact: (c: Partial<CrmContact> & { company_id: string; name: string }) => request<{ data: CrmContact }>('/api/crm/contacts', { method: 'POST', body: JSON.stringify(c) }),
    updateContact: (id: string, c: Partial<CrmContact>) => request(`/api/crm/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(c) }),
    deleteContact: (id: string) => request(`/api/crm/contacts/${id}`, { method: 'DELETE' }),

    deals: (params?: { pipeline?: string; status?: string }) => {
      const p = new URLSearchParams()
      if (params?.pipeline) p.set('pipeline', params.pipeline)
      if (params?.status) p.set('status', params.status)
      const qs = p.toString()
      return request<{ data: CrmDeal[] }>(`/api/crm/deals${qs ? `?${qs}` : ''}`).then(r => r.data)
    },
    pipeline: (pipeline: string) => request<{ data: CrmPipeline }>(`/api/crm/deals/pipeline/${pipeline}`).then(r => r.data),
    createDeal: (d: Partial<CrmDeal> & { company_id: string; name: string }) => request<{ data: CrmDeal }>('/api/crm/deals', { method: 'POST', body: JSON.stringify(d) }),
    updateDeal: (id: string, d: Partial<CrmDeal>) => request(`/api/crm/deals/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteDeal: (id: string) => request(`/api/crm/deals/${id}`, { method: 'DELETE' }),

    activities: (params: { company_id?: string; contact_id?: string; deal_id?: string }) => {
      const p = new URLSearchParams()
      if (params.company_id) p.set('company_id', params.company_id)
      if (params.contact_id) p.set('contact_id', params.contact_id)
      if (params.deal_id) p.set('deal_id', params.deal_id)
      return request<{ data: CrmActivity[] }>(`/api/crm/activities?${p.toString()}`).then(r => r.data)
    },
    createActivity: (a: Partial<CrmActivity> & { company_id: string }) => request<{ data: CrmActivity }>('/api/crm/activities', { method: 'POST', body: JSON.stringify(a) }),
    updateActivity: (id: string, a: Partial<CrmActivity>) => request(`/api/crm/activities/${id}`, { method: 'PATCH', body: JSON.stringify(a) }),
    deleteActivity: (id: string) => request(`/api/crm/activities/${id}`, { method: 'DELETE' }),

    convertLead: (id: string, body: { type?: string; pipeline?: string; dealName?: string; amount?: number }) =>
      request<{ data: { company: CrmCompany; alreadyConverted?: boolean } }>(`/api/crm/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.data),

    // Custom field definitions (Attio-style attributes)
    fields: (object?: 'company' | 'contact' | 'deal', all?: boolean) => {
      const p = new URLSearchParams()
      if (object) p.set('object', object)
      if (all) p.set('all', '1')
      const qs = p.toString()
      return request<{ data: CrmFieldDef[] }>(`/api/crm/fields${qs ? `?${qs}` : ''}`).then(r => r.data)
    },
    createField: (f: { object: string; key: string; label: string; type: string; options?: string[] | null; position?: number }) =>
      request<{ data: CrmFieldDef }>('/api/crm/fields', { method: 'POST', body: JSON.stringify(f) }).then(r => r.data),
    updateField: (id: string, f: Partial<Pick<CrmFieldDef, 'label' | 'options' | 'position' | 'archived'>>) =>
      request<{ data: CrmFieldDef }>(`/api/crm/fields/${id}`, { method: 'PATCH', body: JSON.stringify(f) }).then(r => r.data),
    deleteField: (id: string) => request(`/api/crm/fields/${id}`, { method: 'DELETE' }),

    // Connected inboxes (Gmail/Calendar sync, P1b)
    syncAccounts: () => request<{ data: CrmSyncAccount[]; configured: boolean; domain: string }>('/api/crm/sync/accounts'),
    addSyncAccount: (m: { email: string; method?: string }) => request<{ data: CrmSyncAccount }>('/api/crm/sync/accounts', { method: 'POST', body: JSON.stringify(m) }).then(r => r.data),
    updateSyncAccount: (email: string, m: { enabled: boolean }) => request(`/api/crm/sync/accounts/${encodeURIComponent(email)}`, { method: 'PATCH', body: JSON.stringify(m) }),
    removeSyncAccount: (email: string) => request(`/api/crm/sync/accounts/${encodeURIComponent(email)}`, { method: 'DELETE' }),
    blocklist: () => request<{ data: CrmBlocklistEntry[] }>('/api/crm/sync/blocklist').then(r => r.data),
    addBlock: (b: { pattern: string; reason?: string }) => request<{ data: CrmBlocklistEntry }>('/api/crm/sync/blocklist', { method: 'POST', body: JSON.stringify(b) }).then(r => r.data),
    removeBlock: (id: string) => request(`/api/crm/sync/blocklist/${id}`, { method: 'DELETE' }),
    thread: (activityId: string) => request<{ data: { subject: string; messages: CrmThreadMessage[] } }>(`/api/crm/sync/thread?activity_id=${encodeURIComponent(activityId)}`).then(r => r.data),

    // Table grid + saved views (P3)
    query: (object: string, body: { filters?: CrmFilter[]; sort?: { field: string; dir: 'asc' | 'desc' }; page?: number; pageSize?: number }) =>
      request<CrmQueryResult>(`/api/crm/${object}/query`, { method: 'POST', body: JSON.stringify(body) }),
    views: (object: string) => request<{ data: CrmSavedView[] }>(`/api/crm/views?object=${object}`).then(r => r.data),
    createView: (v: { object: string; name: string; shared?: boolean; is_default?: boolean; config: ViewConfig }) =>
      request<{ data: CrmSavedView }>('/api/crm/views', { method: 'POST', body: JSON.stringify(v) }).then(r => r.data),
    updateView: (id: string, v: Partial<{ name: string; shared: boolean; is_default: boolean; config: ViewConfig; position: number }>) =>
      request<{ data: CrmSavedView }>(`/api/crm/views/${id}`, { method: 'PATCH', body: JSON.stringify(v) }).then(r => r.data),
    deleteView: (id: string) => request(`/api/crm/views/${id}`, { method: 'DELETE' }),
  },

  quo: {
    config: () => request<{ configured: boolean; scheduledEnabled: boolean }>('/api/quo/config'),
    inboxes: () => request<{ data: QuoInbox[]; configured: boolean }>('/api/quo/inboxes'),
    conversations: (phoneNumberId: string) => request<{ data: QuoThread[] }>(`/api/quo/conversations?phoneNumberId=${encodeURIComponent(phoneNumberId)}`).then(r => r.data),
    thread: (phoneNumberId: string, participant: string) => request<{ data: QuoMessage[] }>(`/api/quo/thread?phoneNumberId=${encodeURIComponent(phoneNumberId)}&participant=${encodeURIComponent(participant)}`).then(r => r.data),
    calls: (phoneNumberId: string) => request<{ data: QuoCall[] }>(`/api/quo/calls?phoneNumberId=${encodeURIComponent(phoneNumberId)}`).then(r => r.data),
    callTranscript: (id: string) => request<{ data: unknown }>(`/api/quo/calls/${id}/transcript`).then(r => r.data),
    callSummary: (id: string) => request<{ data: unknown }>(`/api/quo/calls/${id}/summary`).then(r => r.data),
    send: (p: { from: string; to: string; content: string }) => request<{ data: QuoMessage }>('/api/quo/send', { method: 'POST', body: JSON.stringify(p) }).then(r => r.data),
    backfill: () => request<{ data: { messages: number; calls: number } }>('/api/quo/backfill', { method: 'POST' }).then(r => r.data),
    scheduled: () => request<{ data: QuoScheduled[]; enabled: boolean }>('/api/quo/scheduled'),
    schedule: (p: { to_number: string; body: string; send_at: string }) => request<{ data: QuoScheduled }>('/api/quo/scheduled', { method: 'POST', body: JSON.stringify(p) }).then(r => r.data),
    cancelScheduled: (id: string) => request(`/api/quo/scheduled/${id}`, { method: 'DELETE' }),
  },

  elaraConfig: {
    get: () => request<{ data: ElaraConfig }>('/api/elara/config').then(r => r.data),
    saveBriefing: (patch: Partial<{ sections: Record<string, boolean>; ai_summary: boolean; timezone: string | null }>) =>
      request('/api/elara/config/briefing', { method: 'PUT', body: JSON.stringify(patch) }),
    saveSchedule: (jobKey: string, patch: Partial<{ cron: string; timezone: string | null; enabled: boolean }>) =>
      request(`/api/elara/config/schedules/${jobKey}`, { method: 'PUT', body: JSON.stringify(patch) }),
    saveAlert: (ruleKey: string, patch: Partial<{ enabled: boolean; severity: string; sms_enabled: boolean; threshold: Record<string, number> | null; destination_id: string | null }>) =>
      request(`/api/elara/config/alerts/${ruleKey}`, { method: 'PUT', body: JSON.stringify(patch) }),
    saveRoutes: (routes: ElaraRoute[]) =>
      request('/api/elara/config/routes', { method: 'PUT', body: JSON.stringify({ routes }) }),
    createDestination: (d: { kind: string; label: string; target: string; enabled?: boolean }) =>
      request<{ data: ElaraDestination }>('/api/elara/config/destinations', { method: 'POST', body: JSON.stringify(d) }),
    updateDestination: (id: string, d: Partial<{ kind: string; label: string; target: string; enabled: boolean }>) =>
      request(`/api/elara/config/destinations/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deleteDestination: (id: string) =>
      request(`/api/elara/config/destinations/${id}`, { method: 'DELETE' }),
    createRecipient: (r: { kind: string; value: string; label?: string; enabled?: boolean }) =>
      request<{ data: ElaraRecipient }>('/api/elara/config/recipients', { method: 'POST', body: JSON.stringify(r) }),
    deleteRecipient: (id: string) =>
      request(`/api/elara/config/recipients/${id}`, { method: 'DELETE' }),
    saveQuietHours: (q: Partial<ElaraQuietHours>) =>
      request('/api/elara/config/quiet-hours', { method: 'PUT', body: JSON.stringify(q) }),
    createCustomJob: (j: { name: string; cron: string; timezone?: string | null; action_type: string; payload: Record<string, unknown>; enabled?: boolean }) =>
      request<{ data: ElaraCustomJob }>('/api/elara/config/custom-jobs', { method: 'POST', body: JSON.stringify(j) }),
    updateCustomJob: (id: string, j: Partial<{ enabled: boolean; cron: string; name: string; payload: Record<string, unknown> }>) =>
      request(`/api/elara/config/custom-jobs/${id}`, { method: 'PUT', body: JSON.stringify(j) }),
    deleteCustomJob: (id: string) =>
      request(`/api/elara/config/custom-jobs/${id}`, { method: 'DELETE' }),
    previewBriefing: () => request<{ data: { text: string } }>('/api/elara/config/briefing/preview', { method: 'POST' }).then(r => r.data),
    sendBriefingNow: () => request<{ data: { ok: boolean } }>('/api/elara/config/briefing/send-now', { method: 'POST' }).then(r => r.data),
  },

  activity: {
    events: (params?: { limit?: number; cursor?: number | null; type?: string }) => {
      const q = new URLSearchParams()
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.cursor != null) q.set('cursor', String(params.cursor))
      if (params?.type) q.set('type', params.type)
      const qs = q.toString()
      return request<Page<ActivityEvent>>(`/api/activity${qs ? `?${qs}` : ''}`)
    },
    audit: (params?: { limit?: number; cursor?: number | null; action?: string; actor?: string }) => {
      const q = new URLSearchParams()
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.cursor != null) q.set('cursor', String(params.cursor))
      if (params?.action) q.set('action', params.action)
      if (params?.actor) q.set('actor', params.actor)
      const qs = q.toString()
      return request<Page<Record<string, unknown>>>(`/api/activity/audit${qs ? `?${qs}` : ''}`)
    },
  },

  status: {
    get: () => request<any>('/api/status'),
  },

  cfp: {
    shops: () => request<any[]>('/api/cfp/shops'),
    users: () => request<any[]>('/api/cfp/users'),
    stats: () => request<any>('/api/cfp/stats'),
    billingEvents: () => request<any[]>('/api/cfp/billing-events'),
    leads: () => request<any[]>('/api/cfp/leads'),
    updateLead: (id: string, updates: Record<string, unknown>) =>
      request<any>(`/api/cfp/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    deleteLead: (id: string) =>
      request<any>(`/api/cfp/leads/${id}`, { method: 'DELETE' }),
    feedback: () => request<any[]>('/api/cfp/feedback'),
    updateFeedback: (id: string, status: string) =>
      request<any>(`/api/cfp/feedback/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    saveShopNotes: (shopId: string, notes: string) =>
      request<any>(`/api/cfp/shops/${shopId}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ founder_notes: notes }),
      }),
    messages: () => request<any[]>('/api/cfp/messages'),
    createMessage: (payload: { title: string; body: string; type: string; active: boolean; expires_at?: string | null }) =>
      request<any>('/api/cfp/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateMessage: (id: string, payload: Partial<{ title: string; body: string; type: string; active: boolean; expires_at: string | null }>) =>
      request<any>(`/api/cfp/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteMessage: (id: string) =>
      request<any>(`/api/cfp/messages/${id}`, {
        method: 'DELETE',
      }),
    forgePulseWaitlist: () => request<any[]>('/api/cfp/forgepulse-waitlist'),
    forgePilotWaitlist: () => request<any[]>('/api/cfp/forgepilot-waitlist'),
    aiConfig: () =>
      request<{ rows: any[]; config: Record<string, string> }>('/api/cfp/ai-config'),
    updateAiConfig: (updates: Array<{ config_key: string; config_value: string }>) =>
      request<{ success: boolean; updated: string[] }>('/api/cfp/ai-config', {
        method: 'PATCH',
        body: JSON.stringify({ updates }),
      }),
  },

  fp: {
    stats:    () => request<any>('/api/fp/stats'),
    users:    () => request<any[]>('/api/fp/users'),
    shops:    () => request<any[]>('/api/fp/shops'),
    sessions: () => request<any[]>('/api/fp/sessions'),
    insights: (days: number = 7) => request<any[]>(`/api/fp/insights?days=${days}`),
    billing:  () => request<any>('/api/fp/billing'),
    messages:       () => request<any[]>('/api/fp/messages'),
    createMessage:  (payload: { title: string; body: string; type: string; active: boolean; expires_at?: string | null }) =>
      request<any>('/api/fp/messages', { method: 'POST', body: JSON.stringify(payload) }),
    updateMessage:  (id: string, payload: Record<string, unknown>) =>
      request<any>(`/api/fp/messages/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteMessage:  (id: string) =>
      request<any>(`/api/fp/messages/${id}`, { method: 'DELETE' }),
    feedback: () => request<any[]>('/api/fp/feedback'),
    updateFeedback: (id: string, status: string) =>
      request<any>(`/api/fp/feedback/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    invite: (payload: { email: string; full_name?: string; role: 'owner' | 'tech' | 'advisor'; notes?: string }) =>
      request<{ success: boolean; invite: any; auth_user_id: string | null }>('/api/fp/invite', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    invites: () => request<any[]>('/api/fp/invites'),
    resendInvite: (id: string) =>
      request<{ success: boolean }>(`/api/fp/invites/${id}/resend`, { method: 'POST' }),
    revokeInvite: (id: string) =>
      request<{ success: boolean }>(`/api/fp/invites/${id}`, { method: 'DELETE' }),
  },

  elara: {
    memory: () => request<any[]>('/api/elara/memory'),
    knowledge: () => request<any[]>('/api/elara/knowledge'),
    updateKnowledge: (key: string, content: string, label?: string) =>
      request<any>(`/api/elara/knowledge/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ content, label }),
      }),
    parkingLot: () => request<any[]>('/api/elara/parking-lot'),
    resolveParkingLot: (id: string) =>
      request<any>(`/api/elara/parking-lot/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      }),
    briefings: () => request<any[]>('/api/elara/briefings'),
    tools: () => request<any[]>('/api/elara/tools'),
    docDebt: () => request<any[]>('/api/elara/doc-debt'),
    chat: (message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
      request<{ response: string }>('/api/elara/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history }),
      }),
  },

  voice: {
    speak: (text: string) =>
      request<{ audioUrl: string }>('/api/voice/speak', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),

    message: async (
      audioBlob: Blob,
      history: Array<{ role: 'user' | 'assistant'; content: string }>
    ): Promise<{ transcript: string; response: string; audioUrl?: string }> => {
      const token = getToken()
      const formData = new FormData()
      formData.append('audio', audioBlob, 'voice.webm')
      formData.append('history', JSON.stringify(history))

      const res = await fetch(`${BASE}/api/voice/message`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
  },

  files: {
    list: () => request<{ workspace: any[]; recent: any[] }>('/api/files/list'),

    upload: async (file: File, caption?: string): Promise<{ success: boolean; file: any; elaraNote: string | null }> => {
      const token = getToken()
      const formData = new FormData()
      formData.append('file', file)
      if (caption) formData.append('caption', caption)
      const res = await fetch(`${BASE}/api/files/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },

    getLink: (fileId: string) =>
      request<{ name: string; mimeType: string; downloadUrl: string; filename: string }>(`/api/files/${fileId}/link`),

    ask: (fileId: string, question: string) =>
      request<{ response: string }>('/api/files/ask', {
        method: 'POST',
        body: JSON.stringify({ fileId, question }),
      }),
  },
}
