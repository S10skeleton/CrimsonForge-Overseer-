# OVERSEER STEP 9 — Strip the personal-assistant layer (Elara becomes team ops only)

**Repo:** `CrimsonForge-Overseer`. **Branch:** the Overseer 2.0 branch. **Type:** Scope change — Overseer is now multi-user, so Elara must drop Clutch's personal/wellness layer (no more "take your supplements" reminders, no ADHD coaching aimed at one person). A separate personal assistant will be built later.

## ⛔ Keep vs remove

- **REMOVE:** the founder/personal prompt layer, the wellness **check-in dispatcher** + its tool, and the personal `agent_routines` data.
- **KEEP (these are business, not personal):** conversation **summarization** (`jobs/summarize.ts` → writes to `agent_memory`), the **calendar** tool (feeds the briefing), business memory/knowledge/parking-lot, and all monitoring/CRM/financial tooling.

## 1. Remove the founder/personal prompt layer

- Delete `src/agent/prompts/founder.ts` and remove `FOUNDER_PROMPT` from the assembler in `src/agent/prompts/index.ts` (drop it from the returned array).
- Audit `src/agent/prompts/identity.ts` and `src/agent/prompts/rules.ts` and **strip anything personal/single-user**: references to Clutch's health/ADHD/autism, "superpower frame," hyperfocus/task-paralysis protocols, supplements, wellness, reminders, and any second-person coaching aimed at one founder. Reframe Elara's identity as **the Crimson Forge team's operations assistant** — she serves multiple operators (owner + admins), answers about the business (monitoring, CRM, financials, cap table, shops/users), and stays professional and neutral. No personal-life content.
- Result: Elara's system prompt = identity (team ops) + project/knowledge + rules + business memory + recent briefing. No founder layer.

## 2. Remove the wellness check-in dispatcher

- Delete `src/jobs/checkins.ts` and `src/tools/checkins.ts`.
- In `src/scheduler.ts`: remove the `runCheckinDispatcher` import and its call (it currently runs alongside summarization every minute).
- In `src/tools/index.ts`: remove the check-ins tool from the registry/exports.
- Remove any check-in references in `src/agent` tool lists.

## 3. Reduce the shared schedule to summarization-only

The `checkins_summarize` built-in currently runs **both** the (now-removed) check-in dispatcher and the (kept) summarization dispatcher every minute.

- In `src/lib/elaraConfig.ts` `defaultSchedules()`: rename the built-in `job_key` `checkins_summarize` → **`summarize`**, label **"Conversation summarization"**, cron unchanged (`* * * * *`).
- In `src/scheduler.ts`'s job map: map `summarize` → `runSummarizationDispatcher` only (no check-in call).
- **PM (me) will update the `elara_schedules` DB row** `checkins_summarize` → `summarize` via MCP so the live config matches. (Until then the fail-safe default covers it.)

## 4. Database (PM handles via MCP — for your awareness)

- `agent_routines` rows already cleared (personal data gone); I'll **drop the `agent_routines` table** once this lands and nothing references it.
- The single personal `health` memory was deleted; business memories (project decisions, stakeholders) are untouched.

## Verify

1. App builds; scheduler logs a `summarize` job (no check-in dispatcher), and no wellness DMs fire.
2. Elara's system prompt contains no founder/health/ADHD/wellness content — ask her "who are you?" and she describes herself as the team's ops assistant, not Clutch's personal assistant.
3. Summarization still works (conversations still distill into `agent_memory`); calendar still feeds the briefing.
4. No dangling imports/exports to the deleted `checkins` files; `npm run build` is clean.

## Note

A dedicated **personal assistant** is a separate future project (Clutch's own thing) — don't fold any of this back into Overseer.
