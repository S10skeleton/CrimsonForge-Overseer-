# OVERSEER CRM-Attio — Phase 1b: Gmail + Calendar auto-logging + auto-create contacts

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` after P1a — e.g. `feat/crm-p1b-email-sync`.
**Type:** The headline Attio feature — work email + calendar auto-flow into the CRM, auto-creating contacts/companies and logging real correspondence onto their timeline. **Built conservatively** (a messy inbox must NOT flood the CRM). Backend sync engine + a small settings view. DB applied by PM via MCP.

## v1 vs expansion (important — start simple)

- **v1 (build this now):** reuse the **existing single-account Google OAuth** already in Railway (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`) — the same credential Elara's current Gmail/Calendar tools use — to sync **the one connected account (admin@crimsonforge.pro)**. **No new Google setup required.**
- **Expansion (later):** add **Workspace domain-wide delegation** (a service account) to also sync `matt@` and `shane@` from one credential. Documented at the bottom; do NOT build it in v1.

## ⛔ GUARDRAILS

1. **Conservative ingest — the inbox is messy, do NOT flood the CRM.** See the filter rules in Step 2; they're core, not optional.
2. **Read-only** Google access. Reuse `src/lib/google-auth.ts` (existing OAuth client) — no new auth plumbing for v1.
3. **Overseer DB only**, PM applies DDL. Fail-safe per run (an error never blocks the scheduler).
4. **Don't store full email bodies** (v1). Store light metadata + snippet; fetch the full thread **on demand** from Gmail when the user opens an item (read in-app, minimal stored private content).
5. Backend-first, role-gated (`requireArea('crm.companies','manage')`-level for config; owner for blocklist edits), audited.

## Step 0 — Database (PM applies via MCP; reference)

```sql
create table if not exists crm_sync_accounts (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,         -- admin@crimsonforge.pro (v1)
  method      text not null default 'oauth' check (method in ('oauth','delegation')),
  enabled     boolean not null default true,
  last_sync   timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists crm_sync_blocklist (
  id          uuid primary key default gen_random_uuid(),
  pattern     text not null,                -- domain ('motor.com') or address ('x@y.com')
  reason      text,
  created_at  timestamptz not null default now()
);

create table if not exists crm_sync_seen (
  source      text not null check (source in ('gmail','calendar')),
  external_id text not null,                -- gmail thread id | calendar event id
  activity_id uuid,
  created_at  timestamptz not null default now(),
  primary key (source, external_id)
);
```

Existing `crm_activities` already supports `type in ('email','meeting',...)` and links to contact/company. The full thread is fetched live (not stored); the activity stores subject + snippet + gmail thread id (for the on-demand fetch).

## Step 1 — Google sync lib (`src/lib/googleSync.ts`)

- Reuse the existing OAuth client (`google-auth.ts`) for the connected account. (Leave a `clientFor(account)` seam so the expansion can swap in a delegation/JWT client per mailbox later.)
- Gmail: list threads (`q: newer_than:` for first run capped at ~90 days, then incremental); fetch participants (From/To/Cc), subject, snippet, timestamp, labels, headers.
- Calendar: `events.list` (updatedMin since last sync) → attendees, title, time, location.

## Step 2 — Junk filter (CORE — apply before creating anything)

A thread/event is ingested only if it passes ALL of these:
1. **You participated outbound** — the synced account **sent at least one message** in the thread (skip pure-inbound newsletters/cold email). For calendar, the account is organizer or accepted attendee.
2. **Gmail Primary category only** — skip `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, `CATEGORY_UPDATES`, `CATEGORY_FORUMS`.
3. **Not automated/bulk** — skip senders matching `no-?reply@`, `mailer-daemon`, `bounce`, `notifications@`, and any message carrying a `List-Unsubscribe` / `Precedence: bulk` header.
4. **Not blocklisted** — skip any participant whose domain/address matches `crm_sync_blocklist` (see Step 4 — **MOTOR seeded here**).
5. **External human** — at least one participant is external (domain ≠ `crm_workspace`/crimsonforge.pro); never create contacts for internal `@crimsonforge.pro` addresses.

Only after passing: **upsert `crm_contacts`** (match by email; create if new), **upsert `crm_companies`** by email domain (skip free-mail domains gmail.com/outlook.com/etc. → contact only, no company), and **log one `crm_activities`** row (`type:'email'|'meeting'`, subject, snippet, thread id), guarded by `crm_sync_seen`. Conservative by design — better to under-capture.

## Step 3 — Sync engine (`src/jobs/crm-sync.ts`, scheduled)

Register a built-in schedule `crm_email_sync` (~every 20 min) via the STEP4 schedule system (shows in Elara Controls → Scheduled jobs; PM seeds the `elara_schedules` row). For each enabled `crm_sync_accounts` row: pull new threads/events since `last_sync`, run the Step-2 filter, upsert/log, advance `last_sync`. Fail-safe per account.

## Step 4 — Blocklist + MOTOR

- Seed `crm_sync_blocklist` with the confirmed entries so none ever become a CRM contact/activity (Clutch still gets all these emails in Gmail normally; toggleable later by removing an entry):
  - `motor.com` (domain) — Clutch controls MOTOR's good/bad-news flow manually
  - `alicia.sokolowski@gmail.com` — personal
  - `steve.fishguy@gmail.com` (+ `steve.fisher@gmail.com` if that variant is also his) — Steve Fisher, personal/advisor
  - `samkory@gmail.com` — Sam Kory, personal/advisor
  - `wfwanano@gmail.com` — Wayne Fisher, personal/advisor
  - (NOTE: `7573433032s@gmail.com` is **Matt** — do NOT block; it's internal anyway.)
- The blocklist is editable in the settings view (Step 5).

## Step 5 — Panel: Connected inbox + on-demand thread + timeline

- **Settings → Connected inboxes** (owner/admin): the synced account(s) with enabled toggle + last-sync time; the **blocklist** editor (add/remove domains/addresses); category/automated-sender filter toggles. Audited.
- **Contact/company timeline** (from 5b): shows the auto-logged `email`/`meeting` items (sender, subject, snippet, time, "via Gmail/Calendar" tag). **Clicking an email fetches the full thread live from Gmail and shows it in-app** — full body is NOT stored in our DB.

## Verify

1. Sync admin@ → only **real two-way** threads with **external** people appear as contacts + `email` activities; newsletters/promos/automated/inbound-only are skipped; internal-only threads skipped; gmail.com senders → contact, no company.
2. **MOTOR is excluded** — no MOTOR contact or activity is ever created while its domain is in the blocklist.
3. Clicking an email opens the full thread (fetched live); no full bodies in the DB.
4. Re-running doesn't duplicate (`crm_sync_seen`); `last_sync` advances; one account erroring doesn't block the job.
5. `crm_email_sync` shows in Elara Controls → Scheduled jobs; blocklist + toggles editable + audited. `npm run build` clean.

## Hand-off for the PM (Clutch)

- **No new Google work for v1** — uses the existing OAuth (admin@). I apply Step 0 tables, seed `crm_sync_accounts` (admin@, oauth), the `crm_email_sync` schedule row, and the **MOTOR blocklist** entry via MCP when the code's in (I'll confirm MOTOR's exact domain first).
- Heads-up: your Railway `GOOGLE_CALENDER_ID` is misspelled vs the code's `GOOGLE_CALENDAR_ID` — verify/rename so calendar reads work.

## Expansion (later, NOT v1) — multi-inbox via domain-wide delegation

To also sync `matt@`/`shane@` from one credential: create a GCP **service account** with **domain-wide delegation**, authorize read-only `gmail.readonly` + `calendar.readonly` for the client ID in Google Admin, set `GOOGLE_SA_CLIENT_EMAIL`/`GOOGLE_SA_PRIVATE_KEY`/`GOOGLE_WORKSPACE_DOMAIN`, and add those mailboxes as `crm_sync_accounts` rows with `method='delegation'`. The `clientFor(account)` seam from Step 1 swaps in the JWT/impersonation client. Everything else (filter, engine, panel) is unchanged.
