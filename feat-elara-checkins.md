# Feature: Elara Dynamic Check-ins (with randomized time windows)

## Overview
Scheduled wellness check-ins (food, supplements) that post to Slack DM.
Each check-in has a time window (e.g. 10:45–11:15) and fires at a random
minute within that window each day — so it never feels like clockwork.

Schedule is stored in `agent_routines` in Elara Supabase. Elara can update
times, windows, and subjects via natural conversation. No redeploy needed.

---

## How the time window works

Instead of a fixed cron like `0 17 * * *`, the scheduler runs a single
"dispatcher" cron every minute. Each minute it checks the routines table for
any check-in whose window contains the current time AND hasn't fired today.
It uses a `last_fired_at` column to prevent double-firing.

This gives natural variation without complex cron math.

---

## Step 1 — Update `agent_routines` schema in Elara Supabase

Run this SQL in the Elara Supabase project:

```sql
-- Add window columns and last_fired_at if not already present
ALTER TABLE agent_routines
  ADD COLUMN IF NOT EXISTS window_start_utc TIME,   -- e.g. '17:45:00' (10:45 AM MT in UTC)
  ADD COLUMN IF NOT EXISTS window_end_utc   TIME,   -- e.g. '18:15:00' (11:15 AM MT in UTC)
  ADD COLUMN IF NOT EXISTS last_fired_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata         JSONB DEFAULT '{}';

-- Seed the three default check-ins
-- Times in UTC (MT = UTC-6 in winter / UTC-7 in summer, currently MDT = UTC-6)
-- 11:00 AM MT = 17:00 UTC, window 10:45-11:15 MT = 16:45-17:15 UTC
-- 2:00 PM MT  = 20:00 UTC, window 1:45-2:15 PM MT = 19:45-20:15 UTC
-- 10:00 PM MT = 04:00 UTC, window 9:45-10:15 PM MT = 03:45-04:15 UTC

DELETE FROM agent_routines WHERE routine_type = 'checkin';

INSERT INTO agent_routines (routine_type, label, window_start_utc, window_end_utc, message, enabled, metadata)
VALUES
  (
    'checkin',
    'morning_supplements',
    '16:45:00',
    '17:15:00',
    'Hey — have you eaten and taken your morning stack? CoQ10, B Complex, L-Theanine, PQQ, K2+D3.',
    true,
    '{"category": "supplements", "stack": "morning"}'
  ),
  (
    'checkin',
    'afternoon_food',
    '19:45:00',
    '20:15:00',
    'Food check — have you eaten in the last few hours? Don''t skip meals.',
    true,
    '{"category": "food"}'
  ),
  (
    'checkin',
    'night_supplements',
    '03:45:00',
    '04:15:00',
    'Night stack — Omega-3, Magnesium Glycinate, multivitamin. Have you taken them?',
    true,
    '{"category": "supplements", "stack": "night"}'
  );
```

---

## Step 2 — Create `src/jobs/checkins.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { WebClient } from '@slack/web-api'

const supabase = createClient(
  process.env.ELARA_SUPABASE_URL!,
  process.env.ELARA_SUPABASE_KEY!
)

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

// Your Slack user ID — Elara DMs this directly
const FOUNDER_SLACK_USER_ID = process.env.SLACK_FOUNDER_USER_ID!

function randomMinuteInWindow(windowStart: string, windowEnd: string): boolean {
  const now = new Date()
  const currentUTC = now.getUTCHours() * 60 + now.getUTCMinutes()

  const [startH, startM] = windowStart.split(':').map(Number)
  const [endH, endM] = windowEnd.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  // Handle windows that cross midnight (e.g. night check-in 03:45–04:15 UTC)
  if (startMinutes > endMinutes) {
    return currentUTC >= startMinutes || currentUTC <= endMinutes
  }

  return currentUTC >= startMinutes && currentUTC <= endMinutes
}

function firedToday(lastFiredAt: string | null): boolean {
  if (!lastFiredAt) return false
  const last = new Date(lastFiredAt)
  const now = new Date()
  return (
    last.getUTCFullYear() === now.getUTCFullYear() &&
    last.getUTCMonth() === now.getUTCMonth() &&
    last.getUTCDate() === now.getUTCDate()
  )
}

export async function runCheckinDispatcher(): Promise<void> {
  const { data: routines, error } = await supabase
    .from('agent_routines')
    .select('*')
    .eq('routine_type', 'checkin')
    .eq('enabled', true)

  if (error || !routines) return

  for (const routine of routines) {
    // Skip if already fired today
    if (firedToday(routine.last_fired_at)) continue

    // Check if we're inside the time window
    if (!randomMinuteInWindow(routine.window_start_utc, routine.window_end_utc)) continue

    // Random chance within window — only fire ~1 in N times per minute
    // This spreads the exact fire time across the window naturally
    const windowMinutes =
      Math.abs(
        (parseInt(routine.window_end_utc.split(':')[0]) * 60 +
          parseInt(routine.window_end_utc.split(':')[1])) -
        (parseInt(routine.window_start_utc.split(':')[0]) * 60 +
          parseInt(routine.window_start_utc.split(':')[1]))
      ) || 30

    // ~1/windowMinutes chance per minute = fires once across the window on average
    if (Math.random() > 1 / windowMinutes) continue

    // Open DM and send message
    try {
      const dm = await slack.conversations.open({ users: FOUNDER_SLACK_USER_ID })
      const channelId = (dm as any).channel?.id
      if (!channelId) continue

      await slack.chat.postMessage({
        channel: channelId,
        text: routine.message,
      })

      // Mark as fired today
      await supabase
        .from('agent_routines')
        .update({ last_fired_at: new Date().toISOString() })
        .eq('id', routine.id)

      console.log(`✅ [CHECKIN] Fired: ${routine.label}`)
    } catch (err) {
      console.error(`❌ [CHECKIN] Failed to send ${routine.label}:`, err)
    }
  }
}
```

---

## Step 3 — Add env var

In Railway (Elara service), add:

```
SLACK_FOUNDER_USER_ID=<your Slack user ID>
```

To find your Slack user ID: In Slack, click your name → View profile → More → Copy member ID.

---

## Step 4 — Wire into the scheduler in `src/jobs/scheduler.ts` (or wherever cron runs)

Add a per-minute cron alongside the existing 15-minute and daily ones:

```typescript
import { runCheckinDispatcher } from './checkins.js'

// Runs every minute — lightweight, just checks DB and time windows
cron.schedule('* * * * *', async () => {
  await runCheckinDispatcher()
})
```

---

## Step 5 — Add `manage_checkins` tool so Elara can update them

In `src/tools/checkins.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.ELARA_SUPABASE_URL!,
  process.env.ELARA_SUPABASE_KEY!
)

export async function listCheckins() {
  const { data } = await supabase
    .from('agent_routines')
    .select('*')
    .eq('routine_type', 'checkin')
    .order('window_start_utc')
  return data
}

export async function updateCheckin(params: {
  label: string
  window_start_utc?: string  // "HH:MM:00" in UTC
  window_end_utc?: string
  message?: string
  enabled?: boolean
}) {
  const { label, ...updates } = params
  const { data, error } = await supabase
    .from('agent_routines')
    .update(updates)
    .eq('label', label)
    .eq('routine_type', 'checkin')
    .select()
    .single()
  if (error) throw error
  return data
}
```

Register in tools array:

```typescript
{
  name: 'list_checkins',
  description: 'List all scheduled check-ins with their current times and messages.',
  input_schema: { type: 'object', properties: {} },
},
{
  name: 'update_checkin',
  description: `Update a check-in's time window, message, or enabled status. 
    Window times must be in UTC (MT is UTC-6 in winter, UTC-7 in summer).
    Labels: morning_supplements, afternoon_food, night_supplements.
    When user says "move the supplement check to noon", convert noon MT to UTC and update window_start/end.`,
  input_schema: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        enum: ['morning_supplements', 'afternoon_food', 'night_supplements'],
      },
      window_start_utc: { type: 'string', description: 'HH:MM:00 in UTC' },
      window_end_utc:   { type: 'string', description: 'HH:MM:00 in UTC' },
      message:          { type: 'string', description: 'New check-in message text' },
      enabled:          { type: 'boolean', description: 'Enable or disable this check-in' },
    },
    required: ['label'],
  },
},
```

Wire in `agent/index.ts`:

```typescript
case 'list_checkins':
  result = await listCheckins()
  break
case 'update_checkin':
  result = await updateCheckin(toolInput)
  break
```

---

## Step 6 — Update Elara's rules prompt

In `src/agent/prompts/rules.ts`, add:

```
CHECK-INS:
- Elara sends wellness check-ins to Shane via Slack DM on a randomized schedule
- Check-ins fire once per day within a 30-minute window (not at an exact time)
- Shane can say "move the supplement check to noon" or "change the evening check
  message" and Elara updates the DB directly — takes effect tomorrow
- Shane can say "pause check-ins" or "disable afternoon food check" to toggle enabled
- Elara does NOT nag — one message per window, no follow-up if unanswered
- If Shane is actively chatting, Elara can work the check-in into conversation
  naturally instead of sending a separate DM (use judgment)
- UTC conversion: MT (Denver) = UTC-7 in summer (MDT), UTC-6 in winter (MST)
```

---

## Example conversations after deploy

```
Shane:  "Move the morning supplements check to noon"
Elara:  [updates window_start to 17:45 UTC, window_end to 18:15 UTC]
        "Done — morning supplements check will now fire somewhere between 
        11:45 AM and 12:15 PM. Takes effect tomorrow."

Shane:  "Change the afternoon food message to just say 'eat something'"
Elara:  [updates message]
        "Updated. Afternoon check will now just say 'eat something'."

Shane:  "Turn off the night supplements check this week"
Elara:  [sets enabled: false]
        "Night stack check is paused. Just say 'turn it back on' when you 
        want it running again."
```

---

## Build and deploy

```bash
npm run build
git add src/jobs/checkins.ts src/jobs/scheduler.ts src/tools/checkins.ts \
        src/agent/index.ts src/agent/prompts/rules.ts
git commit -m "feat: add randomized wellness check-ins with Elara-managed schedule"
git push
```

Don't forget to add `SLACK_FOUNDER_USER_ID` to Railway env vars before deploying.
