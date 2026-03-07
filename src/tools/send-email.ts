/**
 * Elara outbound email tool
 * Sends emails via Resend from elara@crimsonforge.pro
 */

import type { AgentTool } from '../types/index.js'

const FROM_ADDRESS = 'Elara <elara@crimsonforge.pro>'

async function sendViaResend(params: {
  to: string
  toName: string
  subject: string
  body: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
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
        from: FROM_ADDRESS,
        to: [`${params.toName} <${params.to}>`],
        subject: params.subject,
        text: params.body,
        reply_to: 'Admin@crimsonforge.pro',
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const err = await res.json() as { message?: string }
      return { success: false, error: err.message || res.statusText }
    }

    const data = await res.json() as { id: string }
    console.log(`[send-email] Sent "${params.subject}" to ${params.to} — id: ${data.id}`)
    return { success: true, messageId: data.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export const sendEmailTool: AgentTool = {
  name: 'send_email',
  description: `Send an email from elara@crimsonforge.pro on Clutch's behalf via Resend.
IMPORTANT: Always use search_contacts first to resolve a name to an email address
unless the full email address is already known.
Always preview the draft and get explicit confirmation before setting preview_only to false.
Can include Google Drive shareable links in the body.`,
  input_schema: {
    type: 'object',
    properties: {
      to_email: {
        type: 'string',
        description: 'Recipient email address (must be a valid email, not a name)',
      },
      to_name: {
        type: 'string',
        description: 'Recipient display name',
      },
      subject: {
        type: 'string',
        description: 'Email subject line',
      },
      body: {
        type: 'string',
        description: 'Email body — plain text. Include Drive links inline if referencing documents.',
      },
      preview_only: {
        type: 'boolean',
        description: 'If true (default), show draft for approval without sending. Set false only after Clutch confirms.',
      },
    },
    required: ['to_email', 'to_name', 'subject', 'body'],
  },
  execute: async (input) => {
    const toEmail = input.to_email as string
    const toName = input.to_name as string
    const subject = input.subject as string
    const body = input.body as string
    const previewOnly = (input.preview_only as boolean) ?? true

    if (previewOnly) {
      return {
        tool: 'send_email',
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          preview: true,
          from: FROM_ADDRESS,
          to: toEmail,
          toName,
          subject,
          body,
          message: 'Draft ready — confirm to send.',
        },
      }
    }

    const result = await sendViaResend({ to: toEmail, toName, subject, body })

    return {
      tool: 'send_email',
      success: result.success,
      timestamp: new Date().toISOString(),
      data: {
        sent: result.success,
        to: toEmail,
        toName,
        subject,
        messageId: result.messageId,
      },
      error: result.error,
    }
  },
}
