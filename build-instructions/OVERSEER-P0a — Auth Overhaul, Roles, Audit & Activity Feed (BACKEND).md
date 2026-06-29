# OVERSEER P0a — Auth Overhaul (named accounts + roles), Audit Log & #cf-activity Feed (BACKEND)

**Repo:** `CrimsonForge-Overseer` (the standalone ops panel — **NOT** ForgePilot).
**Files:** rewrite `src/api/routes/auth.ts`; extend `src/api/middleware/auth.ts`; new `src/api/routes/admins.ts` + mount in `src/api/server.ts`; new `src/lib/overseerDb.ts`, `src/lib/audit.ts`, `src/lib/events.ts`, `src/lib/password.ts`; new `src/notifications/email.ts`; reuse `src/notifications/slack.ts`; new `scripts/create-admin.ts`. DB DDL applied by PM in the **ELARA Supabase** SQL editor (Step 0).
**Type:** Foundation — replaces the shared passcode with real named accounts + role gates + audit + a live Slack activity feed. This is Overseer 2.0 **Phase 0** (backend half).
**Priority:** High — everything in later phases (user control, key minting, CRM, enterprise) sits on this. Nothing privileged ships until this is in.
**Branch:** `feature/overseer-phase0-auth`.

## Why

Today the panel authenticates with **two shared passphrases** (`PANEL_PASSPHRASE` = owner, `PANEL_PASSPHRASE_COFOUNDER` = viewer) → a JWT carrying only `{ role }` (`src/api/routes/auth.ts`, `src/api/middleware/auth.ts`). There are no named users, so **no action is attributable**, there's no password reset, and onboarding Matt means sharing a secret. As the panel grows god-mode powers (reset ForgePilot user passwords, mint API keys, suspend accounts), we need: named accounts, real roles, an audit trail, and a real-time activity feed. This instruction builds that backend substrate.

## ⛔ NON-NEGOTIABLE GUARDRAILS

1. **Overseer-owned data only.** All new tables live in the **ELARA Supabase** project (the same DB that holds the `agent_*` tables — client built from `ELARA_SUPABASE_URL` / `ELARA_SUPABASE_KEY`, see `src/tools/memory.ts`). **Do NOT** put these tables in ForgePilot's DB (`FP_SUPABASE_*`) or the legacy `SUPABASE_*` monitoring client. This is Overseer's own admin data — writing it does **not** violate the repo's "write-never to production" principle (that rule is about *ForgePilot* production data).
2. **Claude Code does NOT run DDL.** Provide the SQL; the PM applies it in the ELARA Supabase SQL editor (same as `schema.sql`). Step 0 below is the handoff.
3. **Secrets are backend-only.** `PANEL_JWT_SECRET`, the ELARA service key, and `RESEND_API_KEY` never reach the panel/browser. No service keys in any response body.
4. **Fail-safe side effects.** Audit writes and event/Slack emits must **never** throw into or block the request that triggered them — wrap in try/catch, log, swallow. A failed audit insert or Slack post must not 500 a login or a password reset.
5. **No user enumeration** on the password-reset path (`/forgot` always returns 200 whether or not the account exists).
6. **Coordinated breaking change (expected, not additive):** the `/api/auth/login` request body changes from `{ passphrase }` to `{ username, password }`. The panel login UI is updated in the paired instruction **OVERSEER-P0b**; these two ship together. Leave the legacy passphrase env vars in place but unused (documented for removal after P0b is verified in prod).

## Step 0 — Database (PM applies in the **ELARA Supabase** SQL editor — Claude Code does NOT touch Supabase)

```sql
-- ============================================================
-- OVERSEER 2.0 — PHASE 0 (named admins, audit, activity events)
-- Apply in the ELARA Supabase project (same DB as agent_* tables).
-- Idempotent — safe to re-run.
-- ============================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ── overseer_admins ── named panel operators (replaces shared passcodes)
create table if not exists overseer_admins (
  id                     uuid primary key default gen_random_uuid(),
  username               text not null unique,           -- stored lowercase; login is case-insensitive
  email                  text not null unique,
  password_hash          text not null,                  -- bcrypt
  role                   text not null default 'read_only'
                           check (role in ('owner','admin','read_only')),
  status                 text not null default 'active'
                           check (status in ('active','suspended')),
  must_change_password   boolean not null default false,
  reset_token_hash       text,                           -- sha256 of the emailed reset token
  reset_token_expires_at timestamptz,
  last_login_at          timestamptz,
  created_by             uuid references overseer_admins(id),
  created_at             timestamptz not null default now()
);

-- ── overseer_audit ── who did what, when, to whom (privileged actions)
create table if not exists overseer_audit (
  id             bigint generated always as identity primary key,
  actor_admin_id uuid references overseer_admins(id),
  actor_username text,                    -- denormalized snapshot (survives admin deletion)
  action         text not null,           -- 'auth.login','admin.create','password.reset','fp_user.suspend', ...
  target_type    text,                    -- 'admin','fp_user','api_key','enterprise_org', ...
  target_id      text,
  meta           jsonb not null default '{}',
  ip             text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_overseer_audit_created on overseer_audit(created_at desc);
create index if not exists idx_overseer_audit_actor   on overseer_audit(actor_admin_id);
create index if not exists idx_overseer_audit_action  on overseer_audit(action);

-- ── overseer_events ── business activity stream (feeds #cf-activity)
create table if not exists overseer_events (
  id          bigint generated always as identity primary key,
  type        text not null,             -- 'lead.new','fp.signup','payment.success','payment.failed','api_key.minted','fp_user.suspended','enterprise.changed', ...
  title       text not null,
  body        text,
  severity    text not null default 'info'
                check (severity in ('info','success','warning','critical')),
  channel     text,                       -- slack channel id it routed to (snapshot)
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists idx_overseer_events_created on overseer_events(created_at desc);
create index if not exists idx_overseer_events_type    on overseer_events(type);
```

> The PM seeds the first two accounts (Shane = owner, Matt = admin) using `scripts/create-admin.ts` from Step 6 — **no plaintext passwords in SQL or in the repo.**

## Step 1 — Add dependencies

```
npm i bcryptjs
npm i -D @types/bcryptjs
```

`jsonwebtoken` is already present. Use **bcryptjs** (pure-JS, no native build — safest on Railway). Cost factor **12**.

## Step 2 — Overseer DB client + small libs

**`src/lib/overseerDb.ts`** — one shared service client for Overseer-owned tables:

```ts
import { createClient } from '@supabase/supabase-js'

// Overseer's OWN database (admins, audit, events) — same project as agent_* tables.
export const overseerDb = createClient(
  process.env.ELARA_SUPABASE_URL!,
  process.env.ELARA_SUPABASE_KEY!,
  { auth: { persistSession: false } },
)
```

**`src/lib/password.ts`** — `hashPassword(plain): Promise<string>` (bcrypt cost 12), `verifyPassword(plain, hash): Promise<boolean>`, and a password-policy check `assertPasswordStrength(plain)` (min 12 chars; throw a typed error otherwise). Use everywhere passwords are set or checked.

## Step 3 — Audit helper (`src/lib/audit.ts`)

```ts
// audit(req, { action, targetType?, targetId?, meta? }) — fire-and-forget, never throws.
```

- Pulls actor from `req.panelUser` (id + username — see Step 4 for the enriched JWT) and `ip` from `req.headers['x-forwarded-for'] ?? req.socket.remoteAddress`.
- Inserts one `overseer_audit` row via `overseerDb`. Wrap in try/catch; on failure `console.error('[audit]', ...)` and return — **never** propagate.
- Export a constant `AUDIT_ACTIONS` (string union) so call sites use canonical action names.
- For the **security-relevant** subset (`AUDITED_EVENTS` allowlist: `auth.password_reset`, `admin.create`, `admin.role_change`, `admin.suspend`, `admin.password_reset`, plus future `api_key.minted`, `fp_user.suspended`), `audit()` also calls `emitEvent()` (Step 4) so the activity channel doubles as a live audit feed. The allowlist is a single exported array — easy to extend.

## Step 4 — Activity events + Slack feed (`src/lib/events.ts`)

```ts
// emitEvent({ type, title, body?, severity?, meta?, channelId? }) — fire-and-forget, never throws.
```

- Inserts an `overseer_events` row via `overseerDb`.
- Posts to Slack by **reusing the existing** `sendAgentMessage(text, channelId)` from `src/notifications/slack.ts` (do not add a new Slack client). Format a compact line with a severity emoji, the title, and body.
- **Channel routing (configurable, code-driven for Phase 0):** an exported `EVENT_CHANNEL_ROUTES: Record<string, string | undefined>` map (event-type → channel-id env var), falling back to `process.env.SLACK_ACTIVITY_CHANNEL_ID` (the `#cf-activity` channel). Resolution order: explicit `channelId` arg → `EVENT_CHANNEL_ROUTES[type]` → `SLACK_ACTIVITY_CHANNEL_ID`. Store the resolved channel id on the `overseer_events.channel` column. (A DB-backed config table can replace this map in a later phase — leave a `// TODO: move routing to overseer_event_config table` seam.)
- Severity → emoji: info ⚪, success ✅, warning ⚠️, critical 🚨.

## Step 5 — Auth middleware (`src/api/middleware/auth.ts`) — extend, keep back-compat

- Extend `AuthRequest.panelUser` to `{ id: string; username: string; role: 'owner' | 'admin' | 'read_only' }`.
- `requireAuth` — unchanged behavior (verify `PANEL_JWT_SECRET`), but the verified payload now carries `{ sub, username, role }`; set `req.panelUser = { id: payload.sub, username: payload.username, role: payload.role }`.
- **Keep `requireOwner`** (owner only) exactly as the gate name later code already imports.
- **Add `requireRole(...allowed: Role[])`** factory, and two named helpers built on it: `requireAdmin` = `requireRole('owner','admin')` (any write/privileged action), and reuse `requireOwner` for owner-only (admin management, role changes). `read_only` accounts pass `requireAuth` (can GET) but are rejected by `requireAdmin`/`requireOwner` with 403.
- Map the legacy role value: if a JWT still carries `role: 'viewer'` (old tokens mid-rotation), treat it as `read_only`.

## Step 6 — Login, password reset (`src/api/routes/auth.ts`) — rewrite

Replace the passphrase handler. All endpoints audit + (where relevant) emit; all side effects fail-safe.

- **`POST /api/auth/login`** `{ username, password }` → look up `overseer_admins` by `lower(username)` with `status='active'`; `verifyPassword`; on success sign JWT `{ sub: id, username, role }` (keep `expiresIn: '7d'`), update `last_login_at`, `audit(req,{action:'auth.login'})`, return `{ token, role, user: { id, username, email, must_change_password } }`. On failure return the existing generic `401 { error: 'Incorrect username or password' }` (no distinction between bad user vs bad password). **Constant-time-ish:** always run a bcrypt compare against a dummy hash when the user isn't found, to avoid timing leaks.
- **`POST /api/auth/forgot`** `{ usernameOrEmail }` → **always 200** `{ ok: true }`. If a matching active account exists: generate a 32-byte URL-safe token, store its sha256 in `reset_token_hash` + `reset_token_expires_at = now()+30min`, and email the reset link via `sendEmail` (Step 7). `audit(req,{action:'auth.password_reset_requested'})`.
- **`POST /api/auth/reset`** `{ token, newPassword }` → look up by sha256(token) where `reset_token_expires_at > now()`; `assertPasswordStrength`; set new `password_hash`, clear `reset_token_*`, set `must_change_password=false`; `audit + emitEvent (auth.password_reset)`. Generic 400 on invalid/expired token.
- **`POST /api/auth/change-password`** (requires `requireAuth`) `{ currentPassword, newPassword }` → verify current, set new, clear `must_change_password`. Lets a `must_change_password` user self-clear after a temp password.

### Step 6.1 — Preserve the brute-force lockout (the panel already depends on it)

The current `Login.tsx` calls **`GET /api/auth/status`** and reads `{ locked, secondsRemaining, attemptsLeft }`, and `/login` failures may return `{ locked, secondsRemaining }` / `{ attemptsLeft }`. Preserve this contract so the existing lockout UX keeps working with username/password:

- Track failed attempts per **IP + username** (in-memory map is fine for a single Railway instance; note the limitation). After N=5 failures → lock for 15 min.
- `GET /api/auth/status` returns `{ locked: boolean, secondsRemaining?: number }` for the caller's IP.
- On a failed `/login`, include `attemptsLeft` (or `locked` + `secondsRemaining` once locked) alongside the generic error. A successful login clears the counter.
- This throttling is the Phase-0 stand-in for 2FA (which the plan lists as optional/later). Leave a `// TODO: 2FA for owner/admin` seam.

## Step 7 — Email sender (`src/notifications/email.ts`)

- `sendEmail({ to, subject, html, text })` via the **Resend HTTP API** (`POST https://api.resend.com/emails`, `Authorization: Bearer ${RESEND_API_KEY}`, native `fetch`). From address: `process.env.OVERSEER_FROM_EMAIL` (e.g. `ops@crimsonforge.pro`).
- ⚠️ **Confirm `RESEND_API_KEY` exists** in the Overseer Railway env (Elara already sends email, so a Resend key likely exists — reuse it). **If it is not available**, still ship `/forgot` + `/reset` (token generation works), and add the owner-only fallback in Step 8 (`set-temp-password`) so resets are never blocked on email. Flag this in the PR description.

## Step 8 — Admin management routes (`src/api/routes/admins.ts`, mount at `/api/admins`)

Owner-only mutations (`requireOwner`); list/read allowed for `requireAdmin`. All audited; account-changing actions emit events.

- `GET /api/admins` (`requireAdmin`) — list (never return `password_hash` / `reset_token_*`).
- `POST /api/admins` (`requireOwner`) `{ username, email, role }` → create with a generated temp password (`must_change_password=true`); email an invite/temp-password via `sendEmail`, or return the temp password **once** in the response if email is unavailable. `audit + emitEvent (admin.create)`.
- `PATCH /api/admins/:id` (`requireOwner`) — change `role` / `status` / `email`. Block the **last active owner** from being demoted or suspended (return 409). `audit + emitEvent (admin.role_change | admin.suspend)`.
- `POST /api/admins/:id/reset-password` (`requireOwner`) — owner-triggered reset: set a temp password + `must_change_password=true`, email it (or return once). `audit + emitEvent (admin.password_reset)`.
- Mount in `src/api/server.ts`: `app.use('/api/admins', adminsRouter)` (one additive line next to the existing `app.use('/api/auth', authRouter)`).

### Step 8.1 — Read endpoints for the activity feed + audit log (the panel's Activity tab consumes these)

Add a small `src/api/routes/activity.ts` (mount `app.use('/api/activity', activityRouter)`), both `requireAdmin`, keyset-paginated (`?limit` default 50, `?cursor` = last seen `id`, return `{ data, meta: { next_cursor } }`):

- `GET /api/activity` — `overseer_events` newest-first, optional `?type=` filter.
- `GET /api/activity/audit` — `overseer_audit` newest-first, optional `?action=` / `?actor=` filters.

Never expose `password_hash` / `reset_token_*` (audit `meta` should never contain them — enforce at the `audit()` call sites).

## Step 9 — Seed script (`scripts/create-admin.ts`, run with `tsx`)

CLI to create or reset an admin without plaintext touching the DB by hand:

```
npx tsx scripts/create-admin.ts --username shane --email shane@crimsonforge.pro --role owner
npx tsx scripts/create-admin.ts --username matt  --email matt@crimsonforge.pro  --role admin
```

- Prompts for a password (hidden input) or accepts `--password`; `assertPasswordStrength`; `hashPassword`; upsert into `overseer_admins`. If the username exists, update the hash (this is also the manual "reset Matt's password" tool). Reuses `src/lib/overseerDb.ts` + `src/lib/password.ts`. PM runs this once locally to seed Shane (owner) + Matt (admin).

## Step 10 — Env additions (document in README / `.env.example`)

- `SLACK_ACTIVITY_CHANNEL_ID` — the `#cf-activity` channel id (create the channel, invite the existing Slack bot).
- `RESEND_API_KEY`, `OVERSEER_FROM_EMAIL` — for reset/invite email (confirm key already present from Elara's email use).
- `PANEL_RESET_URL_BASE` — panel origin for the reset link (e.g. `https://overseer.crimsonforge.pro`).
- Existing `PANEL_JWT_SECRET` reused. `PANEL_PASSPHRASE` / `PANEL_PASSPHRASE_COFOUNDER` are now **unused** — keep set until P0b is verified in prod, then remove.

## Verify (do all before marking done)

1. `npm run build` (tsc strict) passes; `npm run lint` clean.
2. Seed an owner via `scripts/create-admin.ts`; `POST /api/auth/login` with right/wrong password returns 200+token / generic 401. JWT payload contains `sub`, `username`, `role`.
3. A `read_only` token: passes a `GET` behind `requireAuth`, gets **403** on a `requireAdmin` route; an `admin` token passes `requireAdmin` but gets **403** on a `requireOwner` route.
4. `/forgot` returns 200 for both real and nonexistent accounts (no enumeration); a valid emailed token resets via `/reset`; an expired/garbage token is rejected.
5. A successful login writes one `overseer_audit` row; a password reset writes an audit row **and** posts a line to `#cf-activity`; `overseer_events.channel` shows the resolved channel id.
6. **Fail-safe proof:** temporarily point `ELARA_SUPABASE_KEY` / `SLACK_ACTIVITY_CHANNEL_ID` at bad values → login + reset still succeed (audit/Slack failures are logged, not thrown). Revert.
7. Last-owner guard: attempting to demote/suspend the only active owner returns 409.
8. Confirm no endpoint ever returns `password_hash`, `reset_token_*`, or any service key.

## Hand-off note for the PM (Clutch)

- Apply Step 0 SQL in the **ELARA** Supabase project.
- Create `#cf-activity`, invite the Slack bot, set `SLACK_ACTIVITY_CHANNEL_ID`.
- Confirm `RESEND_API_KEY` (tell me if absent — we ship the owner-only temp-password fallback).
- Run `scripts/create-admin.ts` for Shane (owner) + Matt (admin).
- This pairs with **OVERSEER-P0b** (panel login + admin UI) — deploy backend, then panel, together.
