/**
 * Contact requests monitoring tool
 * Queries contact_requests table for recent support inquiries
 */

import { createClient } from '@supabase/supabase-js'
import type { ToolResult, EmailData, AgentTool } from '../types/index.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function runEmailCheck(): Promise<ToolResult<EmailData>> {
  try {
    // Count contact requests from last 7 days that haven't been actioned
    const { count: recentContacts, error: contactError } = await supabase
      .from('contact_requests')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (contactError) throw new Error(contactError.message)

    return {
      tool: 'email',
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        status: 'healthy',
        unreadCount: recentContacts || 0,
        lastCheckAt: new Date().toISOString(),
      },
    }
  } catch (err) {
    return {
      tool: 'email',
      success: false,
      timestamp: new Date().toISOString(),
      data: {
        status: 'unknown',
        unreadCount: 0,
        lastCheckAt: new Date().toISOString(),
      },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const emailTool: AgentTool = {
  name: 'check_email',
  description: 'Checks contact_requests table for recent support inquiries.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runEmailCheck(),
}
