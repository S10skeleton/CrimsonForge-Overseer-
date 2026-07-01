# OVERSEER CRM-FIX3 — inbox sync: persist last_sync + honest status badge

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` — e.g. `fix/crm-sync-lastsync`.
**Type:** bug fix. The Inboxes page shows all accounts "Syncing / last sync: never" for days even though the sync is clearly running (it creates contacts/activities). Two causes — fix both. Backend + a panel label. No DB (one optional column).

## Root causes
1. **`last_sync` never persists.** `src/jobs/crm-sync.ts › syncAccount()` writes `last_sync` on its **final line (~130)**, after the Gmail **and** Calendar steps. If the Calendar step (or anything after the Gmail upserts) throws, the function bails *after* creating contacts but *before* saving `last_sync`. The per-account catch in the caller swallows it → `last_sync` stays null. Side effect: with `last_sync` null, `sinceMs` falls back to **now − 90 days every run** (line ~98), so it re-scans 90 days each time — a driver of the duplicate records.
   - **Likely trigger:** the Calendar read fails — `calendar.readonly` may not be authorized on the domain-wide delegation (only `gmail.readonly` was), and/or the `GOOGLE_CALENDER_ID` env typo (code reads `GOOGLE_CALENDAR_ID`). Gmail succeeds, Calendar throws.
2. **The status badge is fake.** `panel/src/tabs/crm/InboxesView.tsx` (~L59) renders `enabled ? 'Syncing' : 'Paused'` — it always says "Syncing" for any enabled account, implying perpetual in-progress. It should reflect reality.

## Fix 1 — make the sync resilient + always advance last_sync (`crm-sync.ts`)
- In `syncAccount()`, wrap the **Gmail** block and the **Calendar** block in **independent try/catch** — one failing must not abort the other or skip `last_sync`. Log the specific error per source (so the Calendar scope/ID issue shows up in logs).
- **Always advance `last_sync`** at the end (a `finally`, or straight-line after both wrapped blocks) whenever the account was reached — even if Calendar failed. Advancing on a partial (Gmail-only) success is correct: it stops the 90-day re-scan and reflects that we did sync. **Check the update's `error`** and log it (currently unchecked).
- Net: `last_sync` populates every run; a Calendar outage degrades to "Gmail-only" instead of silently wedging the whole account.

## Fix 2 — honest status (`InboxesView.tsx`)
Replace the `enabled ? 'Syncing' : 'Paused'` badge with a real status derived from `enabled` + `last_sync`:
- `!enabled` → **Paused** (dim)
- `enabled && last_sync == null` → **Pending** (amber) — "hasn't completed a sync yet"
- `enabled && last_sync` recent (≤ ~90 min) → **Synced** (green)
- `enabled && last_sync` stale (> a few hours) → **Active** (green/dim) — the "last sync … ago" column tells the age
(Keep the existing "last sync … ago / never" column.)

## Optional (nice) — surface sync errors
Add a `last_error text` column to `crm_sync_accounts` (PM applies), have `syncAccount` write the Calendar/Gmail error string (or null on clean run), and show a small ⚠️ with the message in the Inboxes row. Makes the next issue self-diagnosing. Skip if you want to keep it lean.

## Verify
1. After a sync cycle, **LAST SYNC shows a timestamp** (not "never") for each enabled account, and updates each run.
2. If Calendar is failing, Gmail sync still logs contacts AND `last_sync` still advances; the specific Calendar error is in the logs (so Clutch can confirm/authorize `calendar.readonly` + fix the `GOOGLE_CALENDER_ID` typo).
3. Status badge reads Pending → Synced/Active appropriately; Paused when disabled. No more permanent "Syncing".
4. Re-runs no longer re-scan the full 90 days once `last_sync` is set (fewer dupes). `npm run build` clean.

## Hand-off (PM — Clutch)
- **Also check the delegation scopes + env:** confirm `calendar.readonly` is authorized for the service account's client ID in Google Admin (alongside `gmail.readonly`), and rename the Railway `GOOGLE_CALENDER_ID` → `GOOGLE_CALENDAR_ID` (or set the code's expected name). If Calendar isn't authorized, the fix will make it degrade gracefully, but you'll want calendar meetings logged eventually.
- No required DB (optional `last_error` column only if you want the ⚠️ surfacing).
