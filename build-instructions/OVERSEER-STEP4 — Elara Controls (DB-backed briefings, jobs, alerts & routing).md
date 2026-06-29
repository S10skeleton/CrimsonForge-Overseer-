# OVERSEER STEP 4 — Elara Controls (DB-backed briefings, jobs, alerts & Slack routing)

**Repo:** `CrimsonForge-Overseer`. **Branch:** continue `feat/overseer-2-theme-shell` (or branch `feat/overseer-2-elara-controls`).
**Files:**
- New: `src/lib/elaraConfig.ts` (cached config loaders), `src/api/routes/elara-config.ts` (mount `/api/elara/config` + briefing actions), `panel/src/tabs/ElaraControlsTab.tsx`.
- Edit: `src/scheduler.ts` (load schedules from DB + `reloadSchedules()` + config-driven briefing/alerts), `src/notifications/slack.ts` (DB-driven destination resolution + SMS recipients), `src/lib/events.ts` (route via DB, replacing the `EVENT_CHANNEL_ROUTES` TODO seam), `src/lib/audit.ts` (add Elara-config audit actions), `panel/src/api.ts` (client methods), `panel/src/App.tsx` (route), the sidebar nav (Elara section).
- DB DDL + seeds applied by the PM (me) via the Supabase MCP on ElaraAssist — Claude Code does **not** run DDL. (The Phase-0 tables are already applied this way.)

**Type:** Foundation feature — moves Elara's automation (briefing timing + content, scheduled jobs, alert rules, Slack routing, recipients, quiet hours, custom jobs) from hardcoded/env into DB-backed config the running process reads, with a panel to manage it. This is **step 4** of the Overseer 2.0 build (`build-instructions/Overseer_2.0_Redesign_Spec.md` §5).
**Priority:** High (the big Elara piece). Depends on P0a (auth/roles/audit/events) — already shipped.

## Why

Today every automation knob is hardcoded or env-only: briefing time = `MORNING_BRIEFING_HOUR`, the briefing's *content* is a fixed monitor set assembled in `scheduler.ts:runMorningBriefing`, alert thresholds are constants surfaced as `thresholdBreached` inside the monitor tools, Slack routing is one env split (`FP_SLACK_CHANNEL_ID` vs the default `SLACK_WEBHOOK_URL`) plus the `EVENT_CHANNEL_ROUTES` in-code map, and critical SMS goes to a single `CLUTCH_PHONE_NUMBER`. There's no way to change any of it without a redeploy. This instruction makes it all controllable from the panel.

## ⛔ NON-NEGOTIABLE GUARDRAILS

1. **Seed-with-current-values; zero behavior change until touched.** Every config table is seeded (by the PM, Step 0) with exactly today's defaults. With seeds in place and no edits, briefings/jobs/alerts/routing behave identically to now.
2. **Fail-safe fallback.** Every config read goes through `elaraConfig.ts` with an in-memory cache **and a fallback to the current env/constant** if the DB read fails or a row is missing. A config-table outage must never stop a briefing or drop an alert — it degrades to today's behavior.
3. **Single process — reload in-process.** `index.ts:main()` runs the scheduler, Slack bot, and API server in one process. A config save that changes schedules/custom jobs calls an exported `reloadSchedules()` directly (re-registers cron tasks); other config saves call `invalidateConfigCache()`. No cross-process pub/sub.
4. **Backend-only + audited.** All config endpoints are behind `requireAdmin` (owner/admin); every mutation calls `audit()`. Service keys never reach the panel. Read-only users can't mutate (UI hides + backend 403).
5. **Additive to the data layer.** New `elara_*` tables only — do **not** alter the `agent_*` tables or change existing monitor-tool behavior beyond reading a threshold override where noted.
6. **Channel-typed but Slack-only now.** `elara_notify_destinations.kind` supports `slack|sms|email`, but only `slack` (and the existing `sms` for critical) are implemented; `email` is a stub that logs "not implemented." Don't build email/SMS-as-general-destination delivery yet.

## Step 0 — Database (PM applies via Supabase MCP on ElaraAssist; provided here for reference)

Eight tables in the ELARA DB (`ELARA_SUPABASE_*`). The PM will apply + seed; Claude Code reads/writes rows via `overseerDb`, never DDL.

```sql
-- schedules for built-in + custom jobs
create table if not exists elara_schedules (
  job_key    text primary key,              -- 'morning_briefing','fp_insights','health_check','checkins_summarize'
  label      text not null,
  cron       text not null,                 -- node-cron expr
  timezone   text,                          -- null → process TIMEZONE
  enabled    boolean not null default true,
  is_custom  boolean not null default false,
  updated_at timestamptz not null default now()
);

-- which sections the morning briefing includes + AI toggle (single active row)
create table if not exists elara_briefing_config (
  id            int primary key default 1 check (id = 1),
  sections      jsonb not null default '{}',  -- { system_health:true, sentry:true, stripe_revenue:true, payment_failures:true, new_signups:true, feedback:true, gmail:false, calendar:false, forgepilot:true }
  ai_summary    boolean not null default true,
  timezone      text,
  updated_at    timestamptz not null default now()
);

-- alert rules
create table if not exists elara_notify_destinations (
  id       uuid primary key default gen_random_uuid(),
  kind     text not null check (kind in ('slack','sms','email')),
  label    text not null,
  target   text not null,                   -- slack channel id | phone | email | 'webhook'
  enabled  boolean not null default true
);
create table if not exists elara_notify_routes (
  notification_type text primary key,       -- 'briefing','health_alert','fp_alert','activity','new_subscriber',...
  destination_id    uuid references elara_notify_destinations(id)
);
create table if not exists elara_alert_rules (
  rule_key       text primary key,          -- 'service_down','payment_failure','sms_failure','email_bounce','new_subscriber','new_shop','forgepulse_signup','sentry_new'
  label          text not null,
  enabled        boolean not null default true,
  severity       text not null default 'warning' check (severity in ('info','warning','critical')),
  sms_enabled    boolean not null default false,
  threshold      jsonb,                     -- e.g. {"rate":0.05}; null = rule has no numeric threshold
  destination_id uuid references elara_notify_destinations(id),  -- null → route by notification_type
  updated_at     timestamptz not null default now()
);

-- recipients (briefing + critical SMS)
create table if not exists elara_recipients (
  id       uuid primary key default gen_random_uuid(),
  kind     text not null check (kind in ('briefing','sms')),
  value    text not null,                   -- email or E.164 number
  label    text,
  enabled  boolean not null default true
);

-- user-defined recurring Elara tasks
create table if not exists elara_custom_jobs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cron        text not null,
  timezone    text,
  action_type text not null check (action_type in ('slack_message','agent_prompt')),
  payload     jsonb not null default '{}',  -- { text } or { prompt, destination_id }
  enabled     boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- do-not-disturb window (single active row)
create table if not exists elara_quiet_hours (
  id                int primary key default 1 check (id = 1),
  enabled           boolean not null default false,
  start_local       time not null default '21:00',
  end_local         time not null default '07:00',
  timezone          text,
  exempt_severities text[] not null default '{critical}'
);
```

**Seeds (PM applies, = today's behavior):** `elara_schedules` ← morning_briefing `0 8 * * *`, fp_insights `0 5 * * *`, health_check `*/15 * * * *`, checkins_summarize `* * * * *` (all enabled). `elara_briefing_config` ← every section the current `runMorningBriefing` produces = true, `ai_summary=true`. `elara_notify_destinations` ← slack `default`(webhook), slack `#cf-activity`(`SLACK_ACTIVITY_CHANNEL_ID`), slack `#forgepilot-ops`(`FP_SLACK_CHANNEL_ID`), sms `clutch`(`CLUTCH_PHONE_NUMBER`). `elara_notify_routes` ← briefing→default, health_alert→default, fp_alert→#forgepilot-ops, activity→#cf-activity, new_subscriber→default. `elara_alert_rules` ← the eight rules at their current severities/thresholds (service_down critical+sms, sms_failure {rate:0.05}, email_bounce {rate:0.03}, etc.). `elara_recipients` ← sms = `CLUTCH_PHONE_NUMBER`.

> Tell me (PM) when the code is ready and I'll apply Step 0 + seeds via MCP, reading the current env values so the seeds match production exactly.

## Step 1 — Config layer (`src/lib/elaraConfig.ts`)

Cached, fail-safe getters over `overseerDb`, each falling back to today's env/const on error/missing row:

- `getSchedules()`, `getCustomJobs()`, `getBriefingConfig()`, `getAlertRule(key)`, `getDestinations()`, `getRoute(type)`, `getRecipients(kind)`, `getQuietHours()`.
- In-memory cache with a short TTL (e.g. 60s) **plus** `invalidateConfigCache()` for immediate refresh after a PUT.
- Each getter documents its fallback (e.g. `getBriefingConfig` → all-sections-on + ai-on; `getRecipients('sms')` → `[CLUTCH_PHONE_NUMBER]`).

## Step 2 — Scheduler reads the DB + `reloadSchedules()` (`src/scheduler.ts`)

- Replace the hardcoded `cron.schedule(...)` calls in `startScheduler()` with a load from `getSchedules()` + `getCustomJobs()`. Keep registered tasks in a `Map<job_key, ScheduledTask>` so they can be `.stop()`ed and replaced.
- Map built-in `job_key`s to existing fns: `morning_briefing→runMorningBriefing`, `fp_insights→runInsightAnalysis`, `health_check→runSilentHealthCheck`, `checkins_summarize→`(the checkin+summarize tick). Disabled rows → don't register. Respect per-row `timezone` (fallback to `TIMEZONE`).
- Custom jobs → a generic `runCustomJob(job)`: `slack_message` posts `payload.text` to its destination; `agent_prompt` runs `payload.prompt` through the existing `generateAIBriefing`/agent path and posts the result.
- Export `reloadSchedules()`: re-read DB, diff against the Map, stop/replace/add. Startup calls it once.
- Keep the current functions as fallbacks if the schedules table is empty/unreadable (so a bad DB never leaves the process with no jobs).

## Step 3 — Config-driven briefing (`runMorningBriefing`)

- Read `getBriefingConfig()`. Gate each section's monitor + its briefing contribution on `sections[key]` (e.g. skip Gmail/Calendar fetch when off). Pass only enabled sections into `generateAIBriefing`; honor `ai_summary=false` → send the structured briefing instead of the AI one.
- No behavior change when all sections on + ai on (the seed).

## Step 4 — Config-driven alerts, routing, recipients, quiet hours

- **Alert rules:** before sending any alert, resolve its `rule_key` via `getAlertRule`. If `!enabled` → skip. Apply `severity` override; `sms_enabled` controls the SMS (replacing the hardcoded `severity==='critical'` rule, though service_down keeps sms by seed). Where a tool exposes a tunable threshold (twilio failure rate, resend bounce rate), pass the rule's `threshold` override down (additive param; default = today's constant).
- **Routing:** add `resolveDestination(notification_type)` in `slack.ts` using `getRoute` + `getDestinations`. Replace: `sendAlert` default-channel use, the `sendAlertToChannel(FP_SLACK_CHANNEL_ID,…)` calls, and the `EVENT_CHANNEL_ROUTES` map in `events.ts` (wire `emitEvent` through the same resolver — this is the TODO seam already left there). `kind:'slack'` posts to the channel (or webhook for `target:'webhook'`); `email` → log "not implemented."
- **Recipients/SMS:** `sendSMSAlert` sends to every `getRecipients('sms')` entry (fallback `CLUTCH_PHONE_NUMBER`).
- **Quiet hours:** `getQuietHours()`; if enabled and `now` (in its tz) is inside the window and the alert's severity ∉ `exempt_severities`, suppress the send and note it (v1 = suppress; the next morning briefing still reflects state). Full hold-and-replay can come later — flag it, don't build it.

## Step 5 — API (`src/api/routes/elara-config.ts`, mount `app.use('/api/elara/config', …)`)

All `requireAdmin`, all mutations `audit()`ed (add `elara.schedule_update`, `elara.briefing_update`, `elara.alert_update`, `elara.routing_update`, `elara.recipients_update`, `elara.quiet_hours_update`, `elara.custom_job_*` to `AUDIT_ACTIONS`). Follow the `{ data }` / `{ data, meta }` envelope used by `activity.ts`.

- `GET /api/elara/config` → all config in one payload (schedules, briefing, alert rules, destinations, routes, recipients, quiet hours, custom jobs).
- `PUT /api/elara/config/schedules/:job_key`, `PUT /api/elara/config/briefing`, `PUT /api/elara/config/alerts/:rule_key`, `PUT /api/elara/config/routes`, `POST|PUT|DELETE /api/elara/config/destinations[/:id]`, `POST|PUT|DELETE /api/elara/config/recipients[/:id]`, `PUT /api/elara/config/quiet-hours`, `POST|PUT|DELETE /api/elara/config/custom-jobs[/:id]`.
- After any schedule/custom-job write → `reloadSchedules()`; after any write → `invalidateConfigCache()`.
- **Briefing actions:** `POST /api/elara/briefing/preview` → build the briefing text **without sending** (return it); `POST /api/elara/briefing/send-now` → run `runMorningBriefing()` on demand. Both `requireAdmin` + audited (`elara.briefing_preview` / `elara.briefing_send_now`).

## Step 6 — Panel (`panel/src/tabs/ElaraControlsTab.tsx`, route under Elara)

Match the established tab conventions (`AdminsTab.tsx`): `useQuery(['elara-config'], api.elaraConfig.get)`, `useMutation` per section with `invalidateQueries`, `useToast`, `useConfirm` for destructive bits (delete destination/recipient/custom job), light-theme tokens (`var(--accent)` crimson, `var(--bg-surface)`, `var(--border)`, Elara identity `var(--elara)`). Four panels per the redesign mockup:

1. **Morning briefing** — time/timezone, section checklist, AI-summary toggle, **"Send now"** + **"Preview"** (preview shows the returned text in a modal).
2. **Scheduled jobs** — enable/timezone/cron per built-in; **"Add custom job"** (name, cron, action_type, payload) with edit/delete.
3. **Alert rules** — per rule: enabled, severity, SMS, threshold (where present), destination; plus a **Quiet hours** sub-card (enable, window, exempt severities).
4. **Slack routing & recipients** — per notification-type → destination dropdown; manage destinations (label/kind/target); manage briefing recipients + critical-SMS numbers.

Add `api.elaraConfig.*` methods to `panel/src/api.ts`; add the route + Elara-section nav entry in `App.tsx`/sidebar. Read-only role: panels render read-only (mutations hidden; backend enforces).

## Verify

1. Backend builds (tsc strict) + lint clean; app boots and (with seeds applied) logs the same scheduled jobs as today.
2. With seeds + no edits: morning briefing content, alert routing, and SMS target are byte-for-byte today's behavior. Temporarily break `ELARA_SUPABASE_KEY` → scheduler still registers jobs and alerts still fire via env fallback (fail-safe proven), then revert.
3. Change briefing time in the panel → `reloadSchedules()` re-registers; confirm the cron fires at the new time (or assert the registered task list reflects it). Toggle a section off → "Preview" shows it omitted.
4. Disable an alert rule → that alert no longer sends; flip a route's destination → the next alert lands in the new channel; `overseer_events.channel` reflects it.
5. Add a custom job (e.g. a slack_message every minute for the test) → it posts; delete it → it stops.
6. Quiet hours on + window now + non-critical alert → suppressed; critical → still sends.
7. Every config mutation writes an `overseer_audit` row; "Send now" posts a briefing on demand.
8. Read-only login sees the controls read-only and gets 403 on a PUT.

## Hand-off for the PM (Clutch)

- When the code's ready, tell me — I apply Step 0 tables + seeds via the Supabase MCP on ElaraAssist, reading current env values so seeds == production.
- Confirm `SLACK_ACTIVITY_CHANNEL_ID` (for `#cf-activity`) and that the Slack bot is in each routed channel.
- After this, the only Elara automation still in env is the secrets (tokens/keys) — all the *behavior* is in the panel.
