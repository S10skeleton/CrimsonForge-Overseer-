# OVERSEER CRM-Attio — P1b EXPANSION: whole-domain Gmail + Calendar sync (domain-wide delegation)

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` after P1b is merged — e.g. `feat/crm-p1b-domain-delegation`.
**Type:** Activates the `clientFor(account)` seam P1b already left in place so the CRM sync engine can read **multiple domain mailboxes** (`matt@`, `shane@`) in addition to `admin@`, from a single Google **service-account credential** with domain-wide delegation. **Everything else is unchanged** — same junk filter, same engine, same blocklist (MOTOR + the personal addresses), same panel. This is purely "add more mailboxes through a second auth path." DB rows applied by PM (me) via MCP.

## Why

P1b v1 syncs only the one OAuth-connected account (`admin@crimsonforge.pro`). Clutch has set up a Google Workspace **service account with domain-wide delegation**, which lets one credential impersonate any mailbox in `crimsonforge.pro` with read-only scopes. This expansion wires that in so `matt@` and `shane@` flow into the CRM the same way `admin@` already does.

## ⛔ GUARDRAILS

1. **Additive only.** Do NOT touch the existing OAuth path. `admin@` keeps syncing exactly as it does today via `GOOGLE_REFRESH_TOKEN`. This adds a parallel client builder for `method='delegation'` accounts.
2. **Read-only scopes only** — `gmail.readonly` + `calendar.readonly`. No write/modify/send scopes anywhere.
3. **The junk filter, blocklist, dedup (`crm_sync_seen`), on-demand thread fetch, and fail-safe-per-account behavior from P1b all apply unchanged.** A new mailbox does not get a looser filter.
4. **Per-account isolation + fail-safe.** One mailbox erroring (bad impersonation, revoked scope) must never block the others or the scheduler. Log and continue.
5. **Overseer DB only**, PM applies the `crm_sync_accounts` rows. No schema change — `crm_sync_accounts` already has `method ('oauth'|'delegation')` and `email` from P1b.

## Step 1 — Delegation client in the `clientFor(account)` seam (`src/lib/googleSync.ts`)

P1b left `clientFor(account)` as the single place that returns a Google API client for a given `crm_sync_accounts` row. Implement the `delegation` branch:

- `method === 'oauth'` → return the existing OAuth client (unchanged — what `admin@` uses).
- `method === 'delegation'` → build a **JWT / impersonation client**:
  - Credentials from env: `GOOGLE_SA_CLIENT_EMAIL` + `GOOGLE_SA_PRIVATE_KEY` (handle `\n`-escaped newlines in the key string).
  - Scopes: `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/calendar.readonly`.
  - **Subject / `impersonate` = the row's `email`** (the mailbox to read, e.g. `matt@crimsonforge.pro`).
  - Use the `googleapis` JWT auth (`new google.auth.JWT({ email, key, scopes, subject })`) or `google-auth-library`'s impersonation — whichever the repo already pulls in. Don't add a heavy new dependency if `googleapis` is already present.
- If `GOOGLE_SA_CLIENT_EMAIL`/`GOOGLE_SA_PRIVATE_KEY` are missing, `delegation` accounts are **skipped with a clear logged warning** (don't crash; `admin@` still syncs). Same graceful-degrade posture as the rest of the system.

Everything downstream (list threads/events, participants, filter, upsert, log, `last_sync`) already iterates `crm_sync_accounts` and calls `clientFor()` — so once this branch returns a working client, the new mailboxes sync with zero other changes.

## Step 2 — Validate the env on startup (light)

In the existing env-check (or where Google env is read), if any `delegation` account exists but the two SA vars are absent, log a single clear warning at startup (e.g. `"crm-sync: delegation accounts configured but GOOGLE_SA_* not set — skipping matt@/shane@"`). Do not hard-exit — `admin@` must keep working.

## Step 3 — Panel (tiny)

The Settings → Connected inboxes view (P1b Step 5) already lists `crm_sync_accounts` with enabled-toggle + last-sync. No new UI needed — `matt@`/`shane@` will simply appear as additional rows (showing `method: delegation`) once seeded. Just confirm the list renders the `method` column/label so it's clear which path each mailbox uses.

## Verify

1. With `GOOGLE_SA_*` set and `matt@`/`shane@` seeded as `delegation` accounts, a sync run reads all three mailboxes; real two-way external threads from each become contacts + `email` activities (subject to the **same** P1b filter).
2. MOTOR + the blocklisted personal addresses are still excluded across **all** mailboxes.
3. Removing/blanking the SA env vars → `admin@` still syncs, `matt@`/`shane@` are skipped with a logged warning, nothing crashes.
4. One mailbox failing (e.g. impersonation not authorized) does not block the others; `last_sync` advances independently per account.
5. No write scopes requested anywhere; `npm run build` + lint clean.

## Hand-off for the PM (Clutch)

**You (Google + Railway):**
- In Google Admin → Security → API controls → **Domain-wide delegation**, confirm the service account's client ID is authorized for exactly: `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/calendar.readonly`.
- Add to Railway: `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` (**generate a fresh key — this doubles as the rotation of the previously-exposed key**), `GOOGLE_WORKSPACE_DOMAIN=crimsonforge.pro`.

**Me (DB, when the code's deployed):**
- Insert `crm_sync_accounts` rows: `('matt@crimsonforge.pro','delegation',true)` and `('shane@crimsonforge.pro','delegation',true)`.
- Confirm `admin@` row stays `method='oauth'`.

No schema change. Safe to merge anytime; dormant until the SA env vars + the two rows are in.
