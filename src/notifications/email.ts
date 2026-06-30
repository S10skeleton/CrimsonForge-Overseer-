/**
 * Transactional email for Overseer (password reset / admin invite) via Resend.
 * From address: OVERSEER_FROM_EMAIL (e.g. ops@crimsonforge.pro).
 * Returns a result object — callers decide how to handle failure (never throws).
 */

interface SendEmailInput {
  to: string
  subject: string
  html?: string
  text?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.OVERSEER_FROM_EMAIL || 'ops@crimsonforge.pro'

  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Crimson Forge Ops <${from}>`,
        to: [input.to],
        subject: input.subject,
        ...(input.html ? { html: input.html } : {}),
        ...(input.text ? { text: input.text } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string }
      return { success: false, error: err.message || res.statusText }
    }

    const data = (await res.json()) as { id: string }
    return { success: true, messageId: data.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
