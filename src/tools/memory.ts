/**
 * Memory tools
 * Elara's ability to learn, remember, and manage the parking lot.
 * All writes go to Supabase. All reads come from the runtime memory layer.
 */

import { createClient } from '@supabase/supabase-js'
import type { ToolResult, AgentTool } from '../types/index.js'

// ─── Supabase client ──────────────────────────────────────────────────────

function getClient() {
  const url = process.env.ELARA_SUPABASE_URL!
  const key = process.env.ELARA_SUPABASE_KEY!
  return createClient(url, key)
}

// ─── remember() ──────────────────────────────────────────────────────────

export async function remember(
  key: string,
  value: string,
  category: string = 'general'
): Promise<ToolResult> {
  const timestamp = new Date().toISOString()
  try {
    const supabase = getClient()
    const { error } = await supabase
      .from('agent_memory')
      .upsert(
        { key, value, category, last_used: timestamp, learned_at: timestamp },
        { onConflict: 'key' }
      )
    if (error) throw error
    return { tool: 'remember', success: true, timestamp, data: { key, value, category } }
  } catch (err) {
    return {
      tool: 'remember', success: false, timestamp,
      data: {}, error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── park_idea() ─────────────────────────────────────────────────────────

export async function parkIdea(
  item: string,
  context: string = '',
  phaseRelevant: string = 'general',
  priority: 'high' | 'medium' | 'low' = 'medium'
): Promise<ToolResult> {
  const timestamp = new Date().toISOString()
  try {
    const supabase = getClient()
    const { data, error } = await supabase
      .from('agent_parking_lot')
      .insert({
        item,
        context,
        phase_relevant: phaseRelevant,
        priority,
        status: 'parked',
        created_at: timestamp,
      })
      .select('id')
      .single()
    if (error) throw error
    return { tool: 'park_idea', success: true, timestamp, data: { id: data.id, item } }
  } catch (err) {
    return {
      tool: 'park_idea', success: false, timestamp,
      data: {}, error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── list_parking_lot() ───────────────────────────────────────────────────

export async function listParkingLot(
  phaseFilter?: string
): Promise<ToolResult> {
  const timestamp = new Date().toISOString()
  try {
    const supabase = getClient()
    let query = supabase
      .from('agent_parking_lot')
      .select('id, item, context, phase_relevant, priority, created_at')
      .eq('status', 'parked')
      .order('priority', { ascending: false })

    if (phaseFilter) {
      query = query.eq('phase_relevant', phaseFilter)
    }

    const { data, error } = await query
    if (error) throw error
    return { tool: 'list_parking_lot', success: true, timestamp, data: data || [] }
  } catch (err) {
    return {
      tool: 'list_parking_lot', success: false, timestamp,
      data: [], error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── resolve_parking_lot() ────────────────────────────────────────────────

export async function resolveParkingLot(id: string): Promise<ToolResult> {
  const timestamp = new Date().toISOString()
  try {
    const supabase = getClient()
    const { error } = await supabase
      .from('agent_parking_lot')
      .update({ status: 'resolved', resolved_at: timestamp })
      .eq('id', id)
    if (error) throw error
    return { tool: 'resolve_parking_lot', success: true, timestamp, data: { id } }
  } catch (err) {
    return {
      tool: 'resolve_parking_lot', success: false, timestamp,
      data: {}, error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── update_routine() ────────────────────────────────────────────────────

export async function updateRoutine(
  routineType: 'morning_supplements' | 'night_supplements' | 'schedule' | 'nutrition' | 'workout' | 'reminder_level' | 'as_needed_supplements',
  items: Record<string, unknown>,
  notes?: string
): Promise<ToolResult> {
  const timestamp = new Date().toISOString()
  try {
    const supabase = getClient()
    const { error } = await supabase
      .from('agent_routines')
      .upsert(
        { routine_type: routineType, items, notes: notes || null, updated_at: timestamp },
        { onConflict: 'routine_type' }
      )
    if (error) throw error
    return { tool: 'update_routine', success: true, timestamp, data: { routineType, items } }
  } catch (err) {
    return {
      tool: 'update_routine', success: false, timestamp,
      data: {}, error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── add_doc_debt() ──────────────────────────────────────────────────────

export async function addDocDebt(
  feature: string,
  docsToUpdate: string[],
): Promise<ToolResult> {
  const timestamp = new Date().toISOString()
  try {
    const supabase = getClient()
    const { data, error } = await supabase
      .from('agent_doc_debt')
      .insert({
        feature,
        docs_to_update: docsToUpdate,
        shipped_at: timestamp,
        resolved: false,
      })
      .select('id')
      .single()
    if (error) throw error
    return { tool: 'add_doc_debt', success: true, timestamp, data: { id: data.id, feature, docsToUpdate } }
  } catch (err) {
    return {
      tool: 'add_doc_debt', success: false, timestamp,
      data: {}, error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── resolve_doc_debt() ───────────────────────────────────────────────────

export async function resolveDocDebt(id: string): Promise<ToolResult> {
  const timestamp = new Date().toISOString()
  try {
    const supabase = getClient()
    const { error } = await supabase
      .from('agent_doc_debt')
      .update({ resolved: true, resolved_at: timestamp })
      .eq('id', id)
    if (error) throw error
    return { tool: 'resolve_doc_debt', success: true, timestamp, data: { id } }
  } catch (err) {
    return {
      tool: 'resolve_doc_debt', success: false, timestamp,
      data: {}, error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── set_session_flag() ───────────────────────────────────────────────────

export async function setSessionFlag(flag: string): Promise<ToolResult> {
  const timestamp = new Date().toISOString()
  try {
    const supabase = getClient()
    const { error } = await supabase
      .from('agent_session_flags')
      .insert({ flag, active: true, created_at: timestamp })
    if (error) throw error
    return { tool: 'set_session_flag', success: true, timestamp, data: { flag } }
  } catch (err) {
    return {
      tool: 'set_session_flag', success: false, timestamp,
      data: {}, error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definitions ──────────────────────────────────────────────────

export const rememberTool: AgentTool = {
  name: 'remember',
  description: 'Store a fact, preference, or observation about Clutch or the project in persistent memory. Use this when you learn something worth remembering across sessions.',
  input_schema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Short identifier for this fact (e.g. "preferred_response_length")' },
      value: { type: 'string', description: 'The fact or observation to store' },
      category: { type: 'string', description: 'Category: communication, health, work_pattern, stakeholder, project_decision, preference' },
    },
    required: ['key', 'value'],
  },
  execute: async (input) => remember(input.key as string, input.value as string, input.category as string),
}

export const parkIdeaTool: AgentTool = {
  name: 'park_idea',
  description: 'Save a deferred idea, task, or question to the parking lot. Use when something comes up that is not today\'s priority but should not be lost.',
  input_schema: {
    type: 'object',
    properties: {
      item: { type: 'string', description: 'The idea, task, or question to park' },
      context: { type: 'string', description: 'Why this came up and what triggered it' },
      phase_relevant: { type: 'string', description: 'Which roadmap phase this becomes relevant: week8, phase_a, phase_b, phase_c, phase_d, general, investor' },
      priority: { type: 'string', description: 'Priority: high, medium, or low' },
    },
    required: ['item'],
  },
  execute: async (input) => parkIdea(
    input.item as string,
    input.context as string || '',
    input.phase_relevant as string || 'general',
    (input.priority as 'high' | 'medium' | 'low') || 'medium'
  ),
}

export const listParkingLotTool: AgentTool = {
  name: 'list_parking_lot',
  description: 'List all items currently in the parking lot. Optionally filter by phase.',
  input_schema: {
    type: 'object',
    properties: {
      phase_filter: { type: 'string', description: 'Optional: filter by phase (week8, phase_a, phase_b, etc.)' },
    },
    required: [],
  },
  execute: async (input) => listParkingLot(input.phase_filter as string | undefined),
}

export const resolveParkingLotTool: AgentTool = {
  name: 'resolve_parking_lot',
  description: 'Mark a parking lot item as resolved/done.',
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The ID of the parking lot item to resolve' },
    },
    required: ['id'],
  },
  execute: async (input) => resolveParkingLot(input.id as string),
}

export const updateRoutineTool: AgentTool = {
  name: 'update_routine',
  description: 'Update Clutch\'s daily routine in persistent storage. Use when he mentions a change to supplements, schedule, workout, or nutrition.',
  input_schema: {
    type: 'object',
    properties: {
      routine_type: {
        type: 'string',
        description: 'Which routine to update: morning_supplements, night_supplements, schedule, nutrition, workout, reminder_level, as_needed_supplements',
      },
      items: { type: 'object', description: 'The updated routine data as a JSON object' },
      notes: { type: 'string', description: 'Optional notes (e.g. "skipping gym this week — shoulder injury")' },
    },
    required: ['routine_type', 'items'],
  },
  execute: async (input) => updateRoutine(
    input.routine_type as Parameters<typeof updateRoutine>[0],
    input.items as Record<string, unknown>,
    input.notes as string | undefined
  ),
}

export const addDocDebtTool: AgentTool = {
  name: 'add_doc_debt',
  description: 'Log that a feature shipped and certain documents are now stale. Use when a commit lands or Clutch confirms something shipped.',
  input_schema: {
    type: 'object',
    properties: {
      feature: { type: 'string', description: 'Name of the feature that shipped' },
      docs_to_update: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of document names that need updating (e.g. ["Product_Overview.pdf", "30Day_Roadmap.pdf"])',
      },
    },
    required: ['feature', 'docs_to_update'],
  },
  execute: async (input) => addDocDebt(input.feature as string, input.docs_to_update as string[]),
}

export const resolveDocDebtTool: AgentTool = {
  name: 'resolve_doc_debt',
  description: 'Mark a doc debt item as resolved after the document has been updated.',
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The ID of the doc debt item to resolve' },
    },
    required: ['id'],
  },
  execute: async (input) => resolveDocDebt(input.id as string),
}

export const setSessionFlagTool: AgentTool = {
  name: 'set_session_flag',
  description: 'Set a flag that persists to the next session. Use for important context that should carry forward (e.g. "shoulder injury — skip workout reminders this week").',
  input_schema: {
    type: 'object',
    properties: {
      flag: { type: 'string', description: 'The flag text to persist' },
    },
    required: ['flag'],
  },
  execute: async (input) => setSessionFlag(input.flag as string),
}

// ─── All memory tools export ──────────────────────────────────────────────

export const memoryTools: AgentTool[] = [
  rememberTool,
  parkIdeaTool,
  listParkingLotTool,
  resolveParkingLotTool,
  updateRoutineTool,
  addDocDebtTool,
  resolveDocDebtTool,
  setSessionFlagTool,
]
