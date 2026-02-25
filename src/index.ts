/**
 * Entry point for Crimson Forge Ops
 * Validates environment and starts the scheduler
 */

import { startScheduler } from './scheduler.js'

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
    'RAILWAY_PROJECT_ID',
    'RAILWAY_SERVICE_ID',
  ]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:')
    missing.forEach((key) => console.error(`   - ${key}`))
    console.error('\nPlease set all required variables in .env or Railway environment.')
    process.exit(1)
  }

  console.log('✅ All required environment variables are set.')
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🚀 Crimson Forge Ops — Starting...')

  // Validate environment
  validateEnvironment()

  // Start the scheduler
  startScheduler()

  console.log('✅ Crimson Forge Ops is running.')
  console.log('   Monitoring tasks scheduled. Press Ctrl+C to exit.')
}

// ─── Error Handling ───────────────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err)
  process.exit(1)
})

// ─── Run ──────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('❌ Failed to start:', err)
  process.exit(1)
})
