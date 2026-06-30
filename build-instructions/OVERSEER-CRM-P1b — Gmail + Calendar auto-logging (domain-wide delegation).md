# OVERSEER CRM-Attio — Phase 1b: Gmail + Calendar auto-logging + auto-create contacts

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main`, after P1a — e.g. `feat/crm-p1b-email-sync`.
**Type:** The headline Attio feature — your and Matt's work email + calendar auto-flow into the CRM, auto-creating contacts/companies and logging every thread/meeting onto their timeline. Backend sync engine + a small settings view. DB applied by PM via MCP.

## Why

Clutch's #1 Attio feature: never hand-enter a contact — Attio watched your inbox/calendar, created People/Companies from whoever you corresponded with, and logged the history. We replicate that for the `@crimsonforge.pro` Workspace.

## Approach: Google Workspace domain-wide delegation (not per-user OAuth)

All users are on one Workspace (`crimsonforge.pro`). A **service account with domain-wide delegation** can impersonate any domain user and read their mail/calendar — authorized once by the Workspace admin (Shane). This is separate from the existing `GOOGLE_REFRESH_TOKEN` (a single user OAuth token, used by Elara's current Google tools — leave it as-is).

### Google Cloud / Workspace setup (PM/Clutch prerequisite — Shane, as Workspace admin)
1. In Google Cloud, create (or reuse) a **service account**; enable **domain-wide delegation**; create a JSON key.
2. In Google **Admin console → Security → API controls → Domain-wide delegation**, authorize the service account's **client ID** for **read-only** scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
3. Provide to the Overseer backend env: `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, and `GOOGLE_WORKSPACE_DOMAIN=crimsonforge.pro`.

Read-only only — we ingest, never send or modify.

## Step 0 — Database (PM applies via MCP; reference)

```sql
-- Which mailboxes to ingest (start: Admin@, Matt@; add Shane@ later)
create table if not exists crm_sync_mailboxes (
  email       text primary key,            -- e.g. admin@crimsonforge.pro
  label       text,
  enabled     boolean not null default true,
  last_sync   timestamptz,
  created_at  timestamptz not null default now()
);

-- Dedup ledger so a thread/event logs once even across multiple synced mailboxes
create table if not exists crm_sync_seen (
  source      text not null check (source in ('gmail','calendar')),
  external_id text not null,                -- gmail thread/message id | calendar event id
  activity_id uuid,                          -- the crm_activities row created
  created_at  timestamptz not null default now(),
  primary key (source, external_id)
);
```

Existing `crm_activities` already supports `type in ('call','email','meeting','note','task')` — use `email`/`meeting`. (P1a added `custom`; not required here.)

## Step 1 — Google sync lib (`src/lib/googleSync.ts`)

- Build a JWT auth client from the service account that **impersonates** a given `subject` mailbox (`google-auth-library` JWT with `subject: mailbox`). One helper `clientFor(mailbox)` → Gmail + Calendar clients.
- `gmail.users.threads.list` (incremental via `historyId`/`q: newer_than:Nd` for first run) → for each thread, extract participants (From/To/Cc), subject, snippet, timestamp.
- `calendar.events.list` (updatedMin since last sync) → attendees, title, time, location.

## Step 2 — Sync engine (`src/jobs/crm-sync.ts`, registered as a schedule)

Add a built-in schedule `crm_email_sync` (e.g. every 20 min) via the STEP4 schedule system (so it shows in Elara Controls → Scheduled jobs; PM seeds the `elara_schedules` row). Per enabled mailbox:
1. Impersonate the mailbox; pull new Gmail threads + Calendar events since `last_sync`.
2. For each **external** participant (email domain ≠ `crm_workspace` domain): **upsert `crm_contacts`** (match by email; create if new) and **upsert `crm_companies`** by email domain (skip free-mail domains like gmail.com/outlook.com → contact only, no company). **Never** create contacts for internal `@crimsonforge.pro` addresses.
3. **Log an activity:** insert one `crm_activities` row (`type:'email'` or `'meeting'`, subject, body=snippet/summary, linked `contact_id` + `company_id`) — guarded by `crm_sync_seen` so it's logged once.
4. Update `crm_sync_mailboxes.last_sync`. Fail-safe per mailbox (one mailbox erroring never blocks others; log + continue).

Keep it conservative: only log threads that involve at least one external party (skip purely-internal mail), and cap history on first run (e.g. last 90 days) to avoid a flood.

## Step 3 — Panel: "Connected inboxes" + richer timeline

- A small **Settings (or CRM) → Connected inboxes** view (owner/admin): list `crm_sync_mailboxes` with enabled toggle + last-sync time; add/remove a mailbox (must be a domain user). Audited.
- The contact/company **activity timeline** (from 5b) now shows the auto-logged `email`/`meeting` items (sender, subject, time, "via Gmail/Calendar" tag). No new timeline UI needed beyond rendering these types nicely.

## Step 4 — (privacy/scope notes — bake in, don't skip)

- Read-only scopes; only **business correspondence with external parties** is logged (internal-only threads skipped). 
- Logged items are visible to CRM-permitted admins — fine for shared work email, but note it in the Connected-inboxes view ("emails with external contacts are logged to the CRM").
- A mailbox can be disabled anytime (stops ingest; existing logged activities remain).

## Verify

1. After setup, enabling `admin@crimsonforge.pro` → within a sync cycle, recent external email threads appear as `email` activities on the right contacts; unknown senders auto-create a contact (+ company by domain); internal-only threads are skipped; `gmail.com` senders create a contact but no company.
2. Calendar meetings with external attendees log as `meeting` activities linked to those contacts.
3. Re-running the sync doesn't duplicate (dedup via `crm_sync_seen`); `last_sync` advances.
4. Disabling a mailbox stops new ingest; one mailbox failing doesn't stop the others.
5. `crm_email_sync` shows in Elara Controls → Scheduled jobs (enable/disable/cron). All config changes audited. `npm run build` clean.

## Hand-off for the PM (Clutch)

- Do the Google Cloud service-account + domain-wide-delegation setup (Workspace admin) and add `GOOGLE_SA_CLIENT_EMAIL` / `GOOGLE_SA_PRIVATE_KEY` / `GOOGLE_WORKSPACE_DOMAIN` to Railway.
- I'll apply Step 0 tables + seed `crm_sync_mailboxes` (admin@, matt@; shane@ disabled until you start using it) + the `crm_email_sync` schedule row via MCP when the code's in.
- After this: **P2 (Quo calls/texts → timelines)**, then **P3 (table/saved views)**, then **Elara viewing**.
