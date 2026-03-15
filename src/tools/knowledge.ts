/**
 * Knowledge tools — let Elara read and update the agent_knowledge table.
 * Changes take effect immediately on the next session (no redeploy needed).
 */

import { createClient } from '@supabase/supabase-js'
import type { AgentTool, ToolResult } from '../types/index.js'

// ─── Client ───────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.ELARA_SUPABASE_URL
  const key = process.env.ELARA_SUPABASE_KEY
  if (!url || !key) throw new Error('ELARA_SUPABASE_URL / ELARA_SUPABASE_KEY not set')
  return createClient(url, key)
}

// ─── List Knowledge ────────────────────────────────────────────────────────

async function listKnowledge(): Promise<ToolResult> {
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('agent_knowledge')
      .select('section_key, label, content, active, updated_at')
      .order('section_key', { ascending: true })

    if (error) throw error

    return {
      tool: 'list_knowledge',
      success: true,
      timestamp: new Date().toISOString(),
      data: data ?? [],
    }
  } catch (err) {
    return {
      tool: 'list_knowledge',
      success: false,
      timestamp: new Date().toISOString(),
      data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export const listKnowledgeTool: AgentTool = {
  name: 'list_knowledge',
  description:
    'List all project knowledge sections in the agent_knowledge table. ' +
    'Shows section keys, titles, content, and whether each section is active.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => listKnowledge(),
}

// ─── Update Knowledge ──────────────────────────────────────────────────────

async function updateKnowledge(
  sectionKey: string,
  content: string,
  label?: string,
): Promise<ToolResult> {
  try {
    const sb = getSupabase()

    const update: Record<string, unknown> = {
      content,
      updated_at: new Date().toISOString(),
    }
    if (label) update.label = label

    const { data, error } = await sb
      .from('agent_knowledge')
      .update(update)
      .eq('section_key', sectionKey)
      .select('section_key, label')
      .single()

    if (error) throw error
    if (!data) throw new Error(`Section '${sectionKey}' not found`)

    return {
      tool: 'update_knowledge',
      success: true,
      timestamp: new Date().toISOString(),
      data: { updated: data.section_key, label: data.label },
    }
  } catch (err) {
    return {
      tool: 'update_knowledge',
      success: false,
      timestamp: new Date().toISOString(),
      data: {},
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export const updateKnowledgeTool: AgentTool = {
  name: 'update_knowledge',
  description:
    'Update a project knowledge section in the agent_knowledge table. ' +
    'Changes take effect immediately — next session Elara will use the new content. ' +
    'Use list_knowledge first to see available section_keys. ' +
    'Always confirm the new content with Clutch before writing.',
  input_schema: {
    type: 'object',
    properties: {
      section_key: {
        type: 'string',
        description: 'The key of the section to update (e.g. "current_status", "roadmap")',
      },
      content: {
        type: 'string',
        description: 'The new content for this section',
      },
      label: {
        type: 'string',
        description: 'Optional: update the section label as well',
      },
    },
    required: ['section_key', 'content'],
  },
  execute: async (input) =>
    updateKnowledge(
      input.section_key as string,
      input.content as string,
      input.label as string | undefined,
    ),
}
