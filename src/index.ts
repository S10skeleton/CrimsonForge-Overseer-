/**
 * Entry point for Crimson Forge Ops
 * Validates environment and starts the scheduler + Slack bot
 */

import { createServer } from 'http'
import { startScheduler } from './scheduler.js'
import { startSlackBot } from './slack-bot.js'

// ─── Environment Validation ────────────────────────────────────────────────

function validateEnvironment(): void {
  const required = [
    'SLACK_WEBHOOK_URL',
    'FRONTEND_URL',
    'API_HEALTH_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SENTRY_AUTH_TOKEN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'RAILWAY_API_TOKEN',
    'CF_PROJECT_ID',
    'CF_SERVICE_ID',
  ]

  const optional = [
    'ANTHROPIC_API_KEY',
    'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN',
    'ELARA_SUPABASE_URL',
    'ELARA_SUPABASE_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_CALENDAR_ID',
    'GOOGLE_DRIVE_FOLDER_ID',
  ]

  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    console.error('\u274C Missing required environment variables:')
    missing.forEach((key) => console.error(`   - ${key}`))
    process.exit(1)
  }

  const missingOptional = optional.filter((key) => !process.env[key])
  if (missingOptional.length > 0) {
    console.log('\u2139\uFE0F  Optional features not configured:')
    missingOptional.forEach((key) => console.log(`   - ${key}`))
  }

  console.log('\u2705 Environment validated.')
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\uD83D\uDE80 Crimson Forge Ops \u2014 Starting...')

  validateEnvironment()

  // Start the cron scheduler (health checks + morning briefing)
  startScheduler()

  // Start the two-way Slack bot (optional — only if tokens are configured)
  await startSlackBot()

  // Minimal HTTP server for Railway health checks
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000
  createServer((_, res) => {
    res.writeHead(200)
    res.end('OK')
  }).listen(port, () => {
    console.log(`[health] Listening on port ${port}`)
  })

  console.log('\u2705 Crimson Forge Ops is running.')
}

process.on('unhandledRejection', (reason) => {
  console.error('\u274C Unhandled rejection:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('\u274C Uncaught exception:', err)
  process.exit(1)
})

main().catch((err) => {
  console.error('\u274C Failed to start:', err)
  process.exit(1)
})
