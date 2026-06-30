/**
 * Seed / reset an Overseer admin account without plaintext touching the DB.
 *
 *   npx tsx scripts/create-admin.ts --username shane --email shane@crimsonforge.pro --role owner
 *   npx tsx scripts/create-admin.ts --username matt  --email matt@crimsonforge.pro  --role admin
 *
 * Prompts for a password (hidden) unless --password is given. If the username
 * already exists, its password (and email/role) are updated — this doubles as
 * the manual "reset Matt's password" tool. Requires ELARA_SUPABASE_URL/KEY.
 */

import * as readline from 'node:readline'

// Load .env if present (Node ≥20.6) — script is run locally by the PM.
try {
  ;(process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.()
} catch {
  /* no .env file — rely on ambient env */
}

import { overseerDb } from '../src/lib/overseerDb.js'
import { hashPassword, assertPasswordStrength, PasswordPolicyError } from '../src/lib/password.js'

type Role = 'owner' | 'admin' | 'read_only'
const ROLES: Role[] = ['owner', 'admin', 'read_only']

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[key] = next
        i++
      } else {
        out[key] = 'true'
      }
    }
  }
  return out
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const stdout = process.stdout as NodeJS.WriteStream & { _writeToOutput?: (s: string) => void }
    let first = true
    stdout._writeToOutput = (s: string) => {
      if (first) {
        process.stdout.write(s) // show the question once
        first = false
      } else if (s.includes('\n') || s.includes('\r')) {
        process.stdout.write(s)
      }
      // swallow keystroke echo otherwise
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

async function main(): Promise<void> {
  if (!process.env.ELARA_SUPABASE_URL || !process.env.ELARA_SUPABASE_KEY) {
    console.error('✗ ELARA_SUPABASE_URL / ELARA_SUPABASE_KEY must be set (check .env).')
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const username = String(args.username ?? '').toLowerCase().trim()
  const email = String(args.email ?? '').toLowerCase().trim()
  const role = (args.role ?? 'read_only') as Role

  if (!username || !email) {
    console.error('Usage: tsx scripts/create-admin.ts --username <u> --email <e> --role <owner|admin|read_only> [--password <p>]')
    process.exit(1)
  }
  if (!ROLES.includes(role)) {
    console.error(`✗ Invalid role "${role}". Must be one of: ${ROLES.join(', ')}`)
    process.exit(1)
  }

  let password = args.password
  if (!password) {
    password = await promptHidden(`Password for ${username} (min 12 chars): `)
  }

  try {
    assertPasswordStrength(password)
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      console.error(`✗ ${err.message}`)
      process.exit(1)
    }
    throw err
  }

  const password_hash = await hashPassword(password)

  const { error } = await overseerDb
    .from('overseer_admins')
    .upsert(
      { username, email, role, password_hash, status: 'active', must_change_password: false },
      { onConflict: 'username' },
    )

  if (error) {
    console.error('✗ Failed to upsert admin:', error.message)
    process.exit(1)
  }

  console.log(`✓ Admin "${username}" (${role}) saved.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('✗ Unexpected error:', err)
  process.exit(1)
})
