import * as SecureStore from 'expo-secure-store'

const BASE = process.env.EXPO_PUBLIC_OVERSEER_URL ?? ''
const TOKEN_KEY = 'elara_jwt'

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY)
}

async function headers(): Promise<Record<string, string>> {
  const token = await getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const h = await headers()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...h, ...(options?.headers ?? {}) },
  })
  if (!res.ok) {
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
    status: () =>
      request<{ locked: boolean; secondsRemaining: number }>('/api/auth/status'),
  },

  elara: {
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
      audioUri: string,
      mimeType: string,
      history: Array<{ role: 'user' | 'assistant'; content: string }>
    ): Promise<{ transcript: string; response: string; audioUrl: string }> => {
      const token = await getToken()
      const formData = new FormData()
      formData.append('audio', {
        uri: audioUri,
        type: mimeType,
        name: 'voice.m4a',
      } as any)
      formData.append('history', JSON.stringify(history))

      const res = await fetch(`${BASE}/api/voice/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
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

    upload: async (
      fileUri: string,
      mimeType: string,
      filename: string,
      caption?: string
    ): Promise<{ success: boolean; file: any; elaraNote: string | null }> => {
      const token = await getToken()
      const formData = new FormData()
      formData.append('file', {
        uri: fileUri,
        type: mimeType,
        name: filename,
      } as any)
      if (caption) formData.append('caption', caption)

      const res = await fetch(`${BASE}/api/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
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
