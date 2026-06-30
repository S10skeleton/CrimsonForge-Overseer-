# OVERSEER ELARA — Team rhythm (daily team nudges)

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` after the CRM stack merges (needs CRM deals for priorities) — e.g. `feat/elara-team-rhythm`. **Type:** Elara capability — a few scheduled, Elara-composed team messages per day that set priorities and nudge the team to keep Elara current. Replaces the removed personal wellness cadence with a *team-productivity* one. Mostly reuses the STEP4 scheduler + routing + agent.

## Why

Clutch wants Elara to post a daily rhythm to the team: a morning kickoff with today's priorities, and a couple of nudges to log activity so Elara's data (and her answers/briefings) stay fresh. The machinery exists (STEP4 scheduled jobs + `agent_prompt` + Slack routing + quiet hours) — this wires up specific, data-driven team posts.

## ⛔ GUARDRAILS

1. **Specific, not naggy.** Every message pulls *real* context (today's calendar, actual deals/follow-ups) — never generic "remember to work." If there's nothing real to say, keep it to a one-liner, not filler.
2. **Start lean.** Default **2 on** (kickoff + EOD), midday/afternoon **off** by default — easy to enable. Better to add than to get muted.
3. **Weekdays + quiet-hours aware.** Skip weekends by default; respect `elara_quiet_hours`. All times tunable in Elara Controls.
4. **Elara's voice**, brief, to the team channel only. Reuses existing infra — no new auth.

## Step 0 — Database (PM applies via MCP; reference)

```sql
-- single-row config (channel + workdays + per-slot prompt intent override)
create table if not exists team_rhythm_config (
  id            int primary key default 1 check (id = 1),
  weekdays_only boolean not null default true,
  kickoff_intent text,   -- optional prompt-intent overrides; null = code default
  midday_intent  text,
  eod_intent     text
);
```
Routing: add a `team_rhythm` entry to `elara_notify_routes` → **#all-crimson-forge** (`C0AGZTSA3TL`). Timing/on-off lives in `elara_schedules` (rows seeded by PM). No other new tables.

## Step 1 — Built-in jobs (`src/scheduler.ts` + `elaraConfig.ts`)

Add three built-in `job_key`s to the schedule map + defaults:
- `team_kickoff` — default `0 8 * * *`, **enabled**
- `team_midday` — default `30 12 * * *`, **disabled** by default
- `team_eod` — default `30 17 * * *`, **enabled**

Each is fail-safe; on a weekend (if `weekdays_only`) or during quiet hours, it logs + skips.

## Step 2 — Context + compose (`src/jobs/team-rhythm.ts`)

Each job gathers real context, then has Elara (`agent_prompt`/`generateAIBriefing`-style) compose a short message:
- **Kickoff (8am):** today's **calendar** events (existing Google calendar access) + **priorities** = open CRM deals needing attention (e.g. stale: open deal with no activity in N days, or `expected_close` near) + name **one focus**. → "Morning team 👋 Today: [meetings/calls]. Priorities: [follow up with Carnopoly — quiet 5d]. Focus: [X]."
- **Midday (12:30, default off):** nudge to **log the morning** — "Quick log: calls, texts, deal moves, anything shipped — keeps Elara current. Anything blocking?"
- **EOD (5:30):** wrap — prompt for **wins + numbers** + **tomorrow's calendar** on-deck. (This overlaps Matt's existing "Today's numbers" email — fold that habit in here.)

Compose with Elara so it's specific and varied; fall back to a clean template if the AI call fails. Post via the `team_rhythm` route (Step 0) to #all-crimson-forge.

## Step 3 — Panel

The three jobs appear in **Elara Controls → Scheduled jobs** (toggle/retime like any schedule). Add a small **Team rhythm** card (optional) to edit `weekdays_only` + the per-slot intent overrides. Owner/admin gated, audited.

## Verify

1. Kickoff posts a morning message to #all-crimson-forge with today's real calendar + a real priority pulled from CRM deals; EOD posts the wrap with tomorrow's calendar. Midday is off until enabled.
2. Weekend / quiet-hours → skipped. Times editable in Elara Controls; toggling a slot on/off works (reload picks it up).
3. If the AI compose fails, a clean template still posts. Messages are specific (real data), not filler.
4. `npm run build` clean.

## Hand-off / sequencing
- Build **after the CRM stack merges** (so deals exist for priorities); calendar works already. Gets richer once **CRM tasks/reminders** land (real task list in the kickoff) — fine to ship the calendar+deals version first.
- I'll apply `team_rhythm_config`, the `team_rhythm` route → #all-crimson-forge, and seed the three `elara_schedules` rows (kickoff+eod on, midday off) via MCP when the code's in.
