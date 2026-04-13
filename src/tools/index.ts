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
import { runCalendarCheck, calendarTool, createCalendarEventTool, updateCalendarEventTool, deleteCalendarEventTool } from './calendar.js'
import { runDriveCheck, driveTool, driveSearchTool, driveReadTool, driveCreateDraftTool, readDriveFileTool, copyToWorkspaceTool, writeWorkspaceDocTool, moveToReviewTool } from './drive.js'
import { memoryTools } from './memory.js'
import { listContactsTool, contactsSearchTool } from './contacts.js'
import { sendEmailTool } from './send-email.js'
import { listCheckinsTool, updateCheckinTool } from './checkins.js'
import { runStripeCheck, stripeMetricsTool } from './stripe.js'
import { runNetlifyCheck, netlifyTool } from './netlify.js'
import { querySupabaseTool } from './supabase-query.js'
import { runTwilioCheck, twilioStatsTool, sendSMSTool } from './twilio.js'
import { runResendCheck, resendStatsTool } from './resend.js'
import { runForgePilotSupabaseCheck, forgePilotSupabaseTool } from './supabase-forgepilot.js'
import { runForgePilotStripeCheck, forgePilotStripeTool }     from './stripe-forgepilot.js'
import { runForgePilotUptimeCheck, forgePilotUptimeTool }     from './uptime-forgepilot.js'
import { listIssuesTool, createIssueTool, closeIssueTool } from './github-issues.js'
import { webSearchTool } from './search.js'
import { listKnowledgeTool, updateKnowledgeTool } from './knowledge.js'

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
  twilio: runTwilioCheck,
  stripe: runStripeCheck,
  resend: runResendCheck,
  netlify: runNetlifyCheck,
  fp_supabase: runForgePilotSupabaseCheck,
  fp_stripe:   runForgePilotStripeCheck,
  fp_uptime:   runForgePilotUptimeCheck,
}

// ─── For Elara (AI Agent) ─────────────────────────────────────────────────

export const allAgentTools = [
  // Infrastructure monitoring
  uptimeTool,
  supabaseTool,
  querySupabaseTool,
  sentryTool,
  railwayTool,
  emailTool,
  // GitHub
  githubCommitsTool,
  githubStatusTool,
  // Google workspace
  gmailTool,
  calendarTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  deleteCalendarEventTool,
  driveTool,
  driveSearchTool,
  driveReadTool,
  driveCreateDraftTool,
  readDriveFileTool,
  copyToWorkspaceTool,
  writeWorkspaceDocTool,
  moveToReviewTool,
  // Contacts + outbound email
  listContactsTool,
  contactsSearchTool,
  sendEmailTool,
  // Memory and learning
  ...memoryTools,
  // Check-ins
  listCheckinsTool,
  updateCheckinTool,
  // Revenue
  stripeMetricsTool,
  twilioStatsTool,
  sendSMSTool,
  resendStatsTool,
  // GitHub Issues
  listIssuesTool,
  createIssueTool,
  closeIssueTool,
  // Deploy monitoring
  netlifyTool,
  // ForgePilot monitoring
  forgePilotSupabaseTool,
  forgePilotStripeTool,
  forgePilotUptimeTool,
  // Web search
  webSearchTool,
  // Knowledge management
  listKnowledgeTool,
  updateKnowledgeTool,
]

export { githubTool } // backwards compat
