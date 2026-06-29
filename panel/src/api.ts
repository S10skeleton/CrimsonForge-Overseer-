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

export const api = {
  auth: {
    login: (passphrase: string) =>
      request<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }),
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
