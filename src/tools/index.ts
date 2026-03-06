/**
 * Tool registry — all tools available to Elara
 */

import { runUptimeCheck, uptimeTool } from './uptime.js'
import { runSupabaseCheck, supabaseTool } from './supabase.js'
import { runSentryCheck, sentryTool } from './sentry.js'
import { runRailwayCheck, railwayTool } from './railway.js'
import { runEmailCheck, emailTool } from './email.js'
import { githubTool, githubCommitsTool, githubStatusTool } from './github.js'
import { runGmailCheck, gmailTool } from './gmail.js'
import { runCalendarCheck, calendarTool } from './calendar.js'
import { runDriveCheck, driveTool, driveSearchTool, driveReadTool, driveCreateDraftTool } from './drive.js'
import { memoryTools } from './memory.js'

// ─── For Scheduler ────────────────────────────────────────────────────────

export const monitors = {
  uptime: runUptimeCheck,
  supabase: runSupabaseCheck,
  sentry: runSentryCheck,
  railway: runRailwayCheck,
  email: runEmailCheck,
  gmail: runGmailCheck,
  calendar: runCalendarCheck,
  drive: runDriveCheck,
}

// ─── For Elara (AI Agent) ─────────────────────────────────────────────────

export const allAgentTools = [
  // Infrastructure monitoring
  uptimeTool,
  supabaseTool,
  sentryTool,
  railwayTool,
  emailTool,
  // GitHub
  githubCommitsTool,
  githubStatusTool,
  // Google workspace
  gmailTool,
  calendarTool,
  driveTool,
  driveSearchTool,
  driveReadTool,
  driveCreateDraftTool,
  // Memory and learning
  ...memoryTools,
]

export { githubTool } // backwards compat
