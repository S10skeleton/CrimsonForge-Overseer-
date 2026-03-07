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

// ─── Core logic ────────────────────────────────────────────────────────────

async function listCheckins(): Promise<unknown[]> {
  const { data, error } = await getSupabase()
    .from('agent_routines')
    .select('id, label, window_start_utc, window_end_utc, message, enabled, last_fired_at, metadata')
    .eq('type', 'checkin')
    .order('window_start_utc')
  if (error) throw error
  return data ?? []
}

async function updateCheckin(params: {
  label: string
  window_start_utc?: string
  window_end_utc?: string
  message?: string
  enabled?: boolean
}): Promise<unknown> {
  const { label, ...updates } = params
  const { data, error } = await getSupabase()
    .from('agent_routines')
    .update(updates)
    .eq('label', label)
    .eq('type', 'checkin')
    .select()
    .single()
  if (error) throw error
  return data
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
