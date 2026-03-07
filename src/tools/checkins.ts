/**
 * Check-in management tools
 * Lets Elara list and update wellness check-ins stored in agent_routines
 */

import { createClient } from '@supabase/supabase-js'
import type { AgentTool, ToolResult } from '../types/index.js'

function getSupabase() {
  return createClient(
    process.env.ELARA_SUPABASE_URL!,
    process.env.ELARA_SUPABASE_KEY!
  )
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface CheckinItem {
  label: string
  window_start_utc: string
  window_end_utc: string
  message: string
  enabled: boolean
  last_fired_at?: string
}

// ─── Core logic ────────────────────────────────────────────────────────────

async function listCheckins(): Promise<CheckinItem[]> {
  const { data: row, error } = await getSupabase()
    .from('agent_routines')
    .select('items')
    .eq('routine_type', 'checkin')
    .single()
  if (error || !row) throw new Error('Could not load check-ins')
  return row.items as CheckinItem[]
}

async function updateCheckin(params: {
  label: string
  window_start_utc?: string
  window_end_utc?: string
  message?: string
  enabled?: boolean
}): Promise<CheckinItem | undefined> {
  const { data: row, error } = await getSupabase()
    .from('agent_routines')
    .select('items')
    .eq('routine_type', 'checkin')
    .single()
  if (error || !row) throw new Error('Could not load check-ins')

  const items = row.items as CheckinItem[]
  const updated = items.map((item) =>
    item.label === params.label
      ? {
          ...item,
          ...(params.window_start_utc && { window_start_utc: params.window_start_utc }),
          ...(params.window_end_utc && { window_end_utc: params.window_end_utc }),
          ...(params.message !== undefined && { message: params.message }),
          ...(params.enabled !== undefined && { enabled: params.enabled }),
        }
      : item
  )

  const { error: updateError } = await getSupabase()
    .from('agent_routines')
    .update({ items: updated, updated_at: new Date().toISOString() })
    .eq('routine_type', 'checkin')
  if (updateError) throw updateError

  return updated.find((i) => i.label === params.label)
}

// ─── AgentTool definitions ─────────────────────────────────────────────────

export const listCheckinsTool: AgentTool = {
  name: 'list_checkins',
  description:
    'List all scheduled wellness check-ins with their current time windows, messages, and enabled status.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const data = await listCheckins()
      return { tool: 'list_checkins', success: true, timestamp: new Date().toISOString(), data }
    } catch (err) {
      return {
        tool: 'list_checkins',
        success: false,
        timestamp: new Date().toISOString(),
        data: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}

export const updateCheckinTool: AgentTool = {
  name: 'update_checkin',
  description:
    "Update a check-in's time window, message, or enabled status. Window times must be in UTC " +
    '(MT = UTC-7 in summer/MDT, UTC-6 in winter/MST). ' +
    'Labels: morning_supplements, afternoon_food, night_supplements. ' +
    "When the user says 'move the supplement check to noon', convert noon MT to UTC and update window_start/end.",
  input_schema: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        enum: ['morning_supplements', 'afternoon_food', 'night_supplements'],
        description: 'Which check-in to update',
      },
      window_start_utc: { type: 'string', description: 'New window start time in HH:MM:00 UTC' },
      window_end_utc: { type: 'string', description: 'New window end time in HH:MM:00 UTC' },
      message: { type: 'string', description: 'New check-in message text' },
      enabled: { type: 'boolean', description: 'Enable or disable this check-in' },
    },
    required: ['label'],
  },
  execute: async (input): Promise<ToolResult> => {
    try {
      const data = await updateCheckin(input as {
        label: string
        window_start_utc?: string
        window_end_utc?: string
        message?: string
        enabled?: boolean
      })
      return { tool: 'update_checkin', success: true, timestamp: new Date().toISOString(), data }
    } catch (err) {
      return {
        tool: 'update_checkin',
        success: false,
        timestamp: new Date().toISOString(),
        data: {},
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}
