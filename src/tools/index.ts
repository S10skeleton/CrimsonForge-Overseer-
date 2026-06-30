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
import { proposable } from '../agent/propose.js'
import { crmReadTools } from './crm.js'
import { crmLogNoteTool, crmRiskyActionTools, quoSendSmsTool } from './crm-actions.js'

// Human-readable proposal summaries for the CRM action tools (Ask-Elara cards).
function crmActionSummary(name: string, i: Record<string, unknown>): string {
  switch (name) {
    case 'crm_create_company': return `🏢 Create company “${i.name}”`
    case 'crm_create_contact': return `👤 Create contact “${i.name}”`
    case 'crm_create_deal': return `💼 Create deal “${i.name}”`
    case 'crm_update_deal': return `✏️ Update deal${i.stage ? ` → ${i.stage}` : ''}${i.status ? ` (${i.status})` : ''}${i.amount != null ? ` $${i.amount}` : ''}`
    case 'crm_update_contact': return `✏️ Update contact`
    case 'crm_update_company': return `✏️ Update company`
    case 'crm_delete_company': return `🗑️ Delete company ${i.id}`
    case 'crm_delete_contact': return `🗑️ Delete contact ${i.id}`
    case 'crm_delete_deal': return `🗑️ Delete deal ${i.id}`
    default: return name
  }
}

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
  proposable(createCalendarEventTool, (i) => `📅 Create event “${i.summary ?? i.title}”`, ['summary', 'start', 'end']),
  proposable(updateCalendarEventTool, (i) => `📅 Update calendar event ${i.eventId ?? ''}`),
  proposable(deleteCalendarEventTool, (i) => `🗑️ Delete calendar event ${i.eventId ?? ''}`),
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
  proposable(sendEmailTool, (i) => `✉️ Email ${i.to}: ${i.subject ?? ''}`, ['subject', 'body']),
  // Memory and learning
  ...memoryTools,
  // Revenue
  stripeMetricsTool,
  twilioStatsTool,
  proposable(sendSMSTool, (i) => `📱 SMS ${i.to}: “${i.body ?? i.message ?? ''}”`, ['body', 'message']),
  resendStatsTool,
  // GitHub Issues
  listIssuesTool,
  proposable(createIssueTool, (i) => `🐙 Create GitHub issue: ${i.title ?? ''}`, ['title', 'body']),
  proposable(closeIssueTool, (i) => `🐙 Close GitHub issue #${i.number ?? i.issue_number ?? ''}`),
  // CRM — reads (auto), internal note (auto), risky actions (proposals)
  ...crmReadTools,
  crmLogNoteTool,
  quoSendSmsTool,
  ...crmRiskyActionTools.map((t) => proposable(t, (i) => crmActionSummary(t.name, i))),
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
