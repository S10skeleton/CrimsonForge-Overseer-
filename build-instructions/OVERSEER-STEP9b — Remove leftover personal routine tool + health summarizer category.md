# OVERSEER STEP 9b — Remove leftover personal-routine tool + health summarizer category

**Repo:** `CrimsonForge-Overseer`. **Branch:** the Overseer 2.0 branch. **Type:** STEP9 cleanup — two personal-Elara leftovers the main STEP9 pass missed. Small. **Do before the PM drops `agent_routines`.**

## Why

STEP9 stripped the personal layer, but two things still reference personal/wellness functionality:

1. **`src/tools/memory.ts`** still defines and registers the `update_routine` Elara tool — `updateRoutine()` (line ~128) upserts to `agent_routines`, `updateRoutineTool` (line ~284, described "Update Clutch's daily routine… supplements, schedule, workout, nutrition"), and it's exported in the tools array (line ~357). This is the **only remaining live reference to `agent_routines`**, and it advertises a personal tool to a now-multi-user Elara.
2. **`src/jobs/summarize.ts`** (line ~126) still lists a `health: supplement/routine/health changes` extraction category, so the summarizer would keep writing personal health facts into `agent_memory`.

## Fix

1. In `src/tools/memory.ts`: delete the `updateRoutine()` function, the `updateRoutineTool` `AgentTool` definition, and its entry in the exported tools array. Remove any now-unused imports/types it leaves behind. (Keep the rest of memory.ts — `remember`, parking-lot, knowledge, doc-debt etc. are business memory and stay.)
2. In `src/jobs/summarize.ts`: remove the `health: supplement/routine/health changes` category from the summarizer's extraction prompt/guidance so it no longer captures personal health/wellness into `agent_memory`. Leave the business categories (decision, project_decision, stakeholder, observation, general).

## Verify

1. `npm run build` clean; `git grep agent_routines src/` returns only `src/db/schema.sql` (the reference definition) — no live code references.
2. Elara's tool list no longer includes `update_routine` (ask her what she can do, or check the registry).
3. The summarizer no longer has a health/wellness category; new auto-summaries write only business categories.

## After this lands

Tell the PM (me) — I'll **drop the `agent_routines` table** (rows already cleared; this removes the last reference). Optionally also delete the `agent_routines` block from `src/db/schema.sql` so the reference doc matches reality.
