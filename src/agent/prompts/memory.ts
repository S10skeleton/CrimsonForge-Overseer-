/**
 * LAYER 5 — RUNTIME MEMORY
 * Loaded fresh from Supabase at the start of each session.
 * This layer grows over time as Elara learns.
 */

import { createClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────

interface MemoryEntry {
  key: string
  value: string
  category: string
}

interface ParkingLotItem {
  id: string
  item: string
  context: string
  phase_relevant: string
  priority: 'high' | 'medium' | 'low'
  created_at: string
}

interface DocDebtItem {
  id: string
  feature: string
  docs_to_update: string[]
  shipped_at: string
}

interface RuntimeMemory {
  facts: MemoryEntry[]
  parkingLot: ParkingLotItem[]
  docDebt: DocDebtItem[]
  sessionFlags: string[]
}

// ─── Memory Loader ────────────────────────────────────────────────────────

export async function loadRuntimeMemory(): Promise<RuntimeMemory> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  const empty: RuntimeMemory = {
    facts: [],
    parkingLot: [],
    docDebt: [],
    sessionFlags: [],
  }

  if (!url || !key) return empty

  try {
    const supabase = createClient(url, key)

    const [factsRes, parkingRes, debtRes, flagsRes] = await Promise.allSettled([
      supabase
        .from('agent_memory')
        .select('key, value, category')
        .order('last_used', { ascending: false })
        .limit(20),

      supabase
        .from('agent_parking_lot')
        .select('id, item, context, phase_relevant, priority, created_at')
        .eq('status', 'parked')
        .order('priority', { ascending: false })
        .limit(15),

      supabase
        .from('agent_doc_debt')
        .select('id, feature, docs_to_update, shipped_at')
        .eq('resolved', false)
        .order('shipped_at', { ascending: false })
        .limit(10),

      supabase
        .from('agent_session_flags')
        .select('flag')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    return {
      facts: factsRes.status === 'fulfilled' ? (factsRes.value.data || []) : [],
      parkingLot: parkingRes.status === 'fulfilled' ? (parkingRes.value.data || []) : [],
      docDebt: debtRes.status === 'fulfilled' ? (debtRes.value.data || []) : [],
      sessionFlags: flagsRes.status === 'fulfilled'
        ? (flagsRes.value.data || []).map((f: { flag: string }) => f.flag)
        : [],
    }
  } catch (err) {
    console.error('[MEMORY] Failed to load runtime memory:', err)
    return empty
  }
}

// ─── Memory Prompt Builder ────────────────────────────────────────────────

export function buildMemoryPrompt(memory: RuntimeMemory): string {
  if (
    memory.facts.length === 0 &&
    memory.parkingLot.length === 0 &&
    memory.docDebt.length === 0 &&
    memory.sessionFlags.length === 0
  ) {
    return ''
  }

  let prompt = '\n─── RUNTIME MEMORY (loaded this session) ────────────────────────────────────────\n'

  if (memory.sessionFlags.length > 0) {
    prompt += '\nACTIVE FLAGS FROM PREVIOUS SESSIONS:\n'
    memory.sessionFlags.forEach(f => {
      prompt += `  • ${f}\n`
    })
  }

  if (memory.facts.length > 0) {
    prompt += '\nLEARNED FACTS ABOUT CLUTCH:\n'
    memory.facts.forEach(f => {
      prompt += `  [${f.category}] ${f.key}: ${f.value}\n`
    })
  }

  if (memory.docDebt.length > 0) {
    prompt += '\nUNRESOLVED DOC DEBT (features shipped, docs not updated):\n'
    memory.docDebt.forEach(d => {
      prompt += `  • ${d.feature} (shipped ${new Date(d.shipped_at).toLocaleDateString()})\n`
      prompt += `    Stale docs: ${d.docs_to_update.join(', ')}\n`
    })
  }

  if (memory.parkingLot.length > 0) {
    prompt += '\nPARKING LOT (deferred ideas — surface when relevant):\n'
    memory.parkingLot.forEach(p => {
      prompt += `  [${p.priority.toUpperCase()} / ${p.phase_relevant}] ${p.item}\n`
      if (p.context) prompt += `    Context: ${p.context}\n`
    })
  }

  return prompt
}
