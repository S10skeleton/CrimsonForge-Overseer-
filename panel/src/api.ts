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

export interface Admin {
  id: string
  username: string
  email: string
  role: 'owner' | 'admin' | 'read_only'
  status: 'active' | 'suspended'
  must_change_password: boolean
  last_login_at: string | null
  created_at: string
  created_by: string | null
}

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

export interface HomeSummary {
  signupsThisWeek: number | null
  leads: { open: number | null; hot: number | null; total: number | null }
  runway: { available: boolean }
  pipeline: { available: boolean }
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<LoginResult>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
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
  },

  admins: {
    list: () => request<Admin[]>('/api/admins'),
    create: (payload: { username: string; email: string; role: string }) =>
      request<{ admin: Admin; emailed: boolean; tempPassword?: string }>('/api/admins', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<{ role: string; status: string; email: string }>) =>
      request<{ admin: Admin }>(`/api/admins/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    resetPassword: (id: string) =>
      request<{ ok: boolean; emailed: boolean; tempPassword?: string }>(`/api/admins/${id}/reset-password`, {
        method: 'POST',
      }),
  },

  home: {
    summary: () => request<HomeSummary>('/api/home/summary'),
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
    checkins: () => request<any[]>('/api/elara/checkins'),
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
