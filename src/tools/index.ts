/**
 * Tool registry
 * Exports all tools for scheduler and AI agent use
 */

import { runUptimeCheck, uptimeTool } from './uptime.js'
import { runSupabaseCheck, supabaseTool } from './supabase.js'
import { runSentryCheck, sentryTool } from './sentry.js'
import { runRailwayCheck, railwayTool } from './railway.js'
import { runEmailCheck, emailTool } from './email.js'
import { githubTool } from './github.js'

// ─── For Scheduler Use ────────────────────────────────────────────────────

export const monitors = {
  uptime: runUptimeCheck,
  supabase: runSupabaseCheck,
  sentry: runSentryCheck,
  railway: runRailwayCheck,
  email: runEmailCheck,
}

// ─── For Future AI Agent Use ──────────────────────────────────────────────

export const allAgentTools = [
  uptimeTool,
  supabaseTool,
  sentryTool,
  railwayTool,
  emailTool,
  githubTool,
]
