/**
 * Prompt assembler
 * Combines all 5 layers into the final system prompt for Elara.
 */

import { IDENTITY_PROMPT } from './identity.js'
import { FOUNDER_PROMPT } from './founder.js'
import { PROJECT_PROMPT } from './project.js'
import { RULES_PROMPT } from './rules.js'
import { loadRuntimeMemory, buildMemoryPrompt } from './memory.js'
import type { MorningBriefing } from '../../types/index.js'

// ─── Assembler ────────────────────────────────────────────────────────────

export async function buildSystemPrompt(recentBriefing?: MorningBriefing): Promise<string> {
  // Load runtime memory fresh each session
  const memory = await loadRuntimeMemory()
  const memoryPrompt = buildMemoryPrompt(memory)

  const briefingContext = recentBriefing
    ? `\n─── MOST RECENT BRIEFING ─────────────────────────────────────────────────────────\n` +
      `Timestamp: ${recentBriefing.timestamp}\n` +
      `Overall status: ${recentBriefing.overallStatus}\n` +
      `Active shops (24h): ${recentBriefing.supabase?.data?.activeShopsLast24h ?? 'unknown'}\n` +
      `Tickets created (24h): ${recentBriefing.supabase?.data?.ticketsCreatedLast24h ?? 'unknown'}\n` +
      `New Sentry issues: ${recentBriefing.sentry?.data?.newIssueCount ?? 'unknown'}\n`
    : ''

  return [
    IDENTITY_PROMPT,
    FOUNDER_PROMPT,
    PROJECT_PROMPT,
    RULES_PROMPT,
    memoryPrompt,
    briefingContext,
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ─── Sync version (for when async isn't available) ────────────────────────

export function buildSystemPromptSync(): string {
  return [
    IDENTITY_PROMPT,
    FOUNDER_PROMPT,
    PROJECT_PROMPT,
    RULES_PROMPT,
  ].join('\n\n')
}
