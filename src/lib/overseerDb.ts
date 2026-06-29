/**
 * Overseer's OWN database client (named admins, audit, activity events).
 * Same Supabase project as the agent_* tables (ELARA_SUPABASE_*).
 *
 * NOTE: this is Overseer-owned admin data — NOT ForgePilot production data.
 * Do not point this at FP_SUPABASE_* or the legacy SUPABASE_* monitoring client.
 */

import { createClient } from '@supabase/supabase-js'

export const overseerDb = createClient(
  process.env.ELARA_SUPABASE_URL!,
  process.env.ELARA_SUPABASE_KEY!,
  { auth: { persistSession: false } },
)
