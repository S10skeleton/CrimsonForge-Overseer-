/**
 * Supabase direct query tool
 * Allows Elara to run arbitrary read-only SQL against the CFP database.
 * SELECT only — all write operations are blocked.
 */

import { createClient } from '@supabase/supabase-js'
import type { ToolResult, AgentTool } from '../types/index.js'

let _supabase: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

// ─── Safety validation ────────────────────────────────────────────────────

const BLOCKED_KEYWORDS = [
  'insert', 'update', 'delete', 'drop', 'truncate', 'alter',
  'create', 'grant', 'revoke', 'execute', 'call', 'do',
]

function validateQuery(sql: string): { valid: boolean; reason?: string } {
  const normalized = sql.toLowerCase().trim()

  if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
    return { valid: false, reason: 'Only SELECT queries are allowed.' }
  }

  for (const keyword of BLOCKED_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i')
    if (pattern.test(normalized)) {
      return { valid: false, reason: `Query contains blocked keyword: ${keyword}` }
    }
  }

  if (normalized.includes(';')) {
    return { valid: false, reason: 'Semicolons are not allowed — one query at a time.' }
  }

  if (sql.length > 2000) {
    return { valid: false, reason: 'Query too long (max 2000 characters).' }
  }

  return { valid: true }
}

// ─── Core query runner ────────────────────────────────────────────────────

async function runQuery(sql: string, description?: string): Promise<ToolResult<{
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  description?: string
}>> {
  const timestamp = new Date().toISOString()
  const empty = { rows: [], rowCount: 0, truncated: false, description }

  const validation = validateQuery(sql)
  if (!validation.valid) {
    return {
      tool: 'query_supabase',
      success: false,
      timestamp,
      data: empty,
      error: validation.reason,
    }
  }

  try {
    const supabase = getSupabase()

    const MAX_ROWS = 100
    const hasLimit = /\blimit\s+\d+/i.test(sql)
    const finalQuery = hasLimit ? sql : `${sql.trimEnd()} LIMIT ${MAX_ROWS}`

    console.log(`[supabase-query] ${description || sql.slice(0, 80)}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('exec_readonly_query', {
      query_text: finalQuery,
    })

    if (error) throw error

    const rows = (data as Record<string, unknown>[]) || []
    const truncated = !hasLimit && rows.length === MAX_ROWS

    console.log(`[supabase-query] ${rows.length} rows${truncated ? ' (truncated at 100)' : ''}`)

    return {
      tool: 'query_supabase',
      success: true,
      timestamp,
      data: { rows, rowCount: rows.length, truncated, description },
    }
  } catch (err) {
    return {
      tool: 'query_supabase',
      success: false,
      timestamp,
      data: empty,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AgentTool definition ─────────────────────────────────────────────────

export const querySupabaseTool: AgentTool = {
  name: 'query_supabase',
  description:
    'Run a read-only SQL SELECT query against the CFP Supabase database. ' +
    'Use for ad-hoc data questions: ticket counts, shop activity trends, user stats, ' +
    'vehicle history, AI session metrics. ' +
    'ONLY SELECT statements are allowed — no INSERT, UPDATE, DELETE, or schema changes. ' +
    'Results are capped at 100 rows. Always include a description of what you are querying. ' +
    'Key tables: shops, tickets, ticket_items, vehicles, customers, profiles, ' +
    'service_time_logs, inspection_items, inspection_shares, messages. ' +
    'All tables have shop_id for multi-tenant isolation. ' +
    'Always confirm intent before querying sensitive tables (customers, profiles).',
  input_schema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description:
          'A valid PostgreSQL SELECT statement. No semicolons. No write operations. Max 2000 chars. ' +
          'Example: "SELECT s.name, COUNT(t.id) as ticket_count FROM shops s LEFT JOIN tickets t ON t.shop_id = s.id GROUP BY s.name ORDER BY ticket_count DESC"',
      },
      description: {
        type: 'string',
        description: 'Plain-language description of what this query is checking. Shown in logs.',
      },
    },
    required: ['sql'],
  },
  execute: async (input) => runQuery(input.sql as string, input.description as string | undefined),
}
