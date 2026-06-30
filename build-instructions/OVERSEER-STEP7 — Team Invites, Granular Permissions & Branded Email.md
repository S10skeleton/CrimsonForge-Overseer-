# OVERSEER STEP 7 — Team invites, granular per-area permissions & branded email

**Repo:** `CrimsonForge-Overseer`. **Branch:** the Overseer 2.0 branch (or `feat/overseer-2-team`).
**Files:** new `src/notifications/emailTemplates.ts` (branded HTML); edit `src/notifications/email.ts` (use templates); edit `src/api/routes/admins.ts` (invite create/list/resend/revoke) + `src/api/routes/auth.ts` (accept-invite, `/me`); edit `src/api/middleware/auth.ts` (load permissions + status per request; `requireArea()`); apply `requireArea` across feature routes; new `panel/src/pages/AcceptInvite.tsx`; edit `panel/src/tabs/AdminsTab.tsx` (invite form + permission matrix + pending invites), `panel/src/api.ts`, `App.tsx` (route + nav gating). DB applied by PM via Supabase MCP on **ElaraAssist**.
**Type:** Team management — turn the single-owner panel into a real multi-operator control surface with least-privilege access. Extends P0a.
**Priority:** High — needed before onboarding Matt / future hires.

## Why

Today: three coarse roles (owner / admin / read_only), and "add admin" emails a **temp password**. Clutch wants to invite teammates by email, **pick exactly which areas each can access**, and have them **set their own password from a link** — in a **branded** email. This adds a per-area permission model, a proper invite→accept flow, and branded transactional email. It also closes a security gap: today a suspended admin's existing 7-day JWT keeps working because `requireAuth` never re-checks the DB.

## ⛔ GUARDRAILS

1. **Owner-only administration.** Inviting, revoking, changing roles/permissions, and suspending stay `requireOwner`. A non-owner can never grant access (even with `settings: manage`).
2. **Least privilege + server-enforced.** Per-area permissions gate the backend via `requireArea()`; the panel hiding a nav item is convenience only. Never trust the client.
3. **Permissions + status checked per request.** `requireAuth` loads the admin's current `status` + `permissions` from the DB each request (single PK select, like ForgePilot's profile load). A `suspended` admin is rejected immediately; permission changes take effect without waiting for token expiry.
4. **No password over email.** Invites carry a one-time set-password link (hashed token, short expiry). The invitee chooses the password; no temp password is generated for invited accounts.
5. **Overseer DB only**, PM applies DDL. Fail-safe email (never throws into the request).

## Permission model

Areas (match the nav): `home`, `elara`, `crm`, `customers`, `enterprise`, `financials`, `captable`, `system`, `settings`.
Access levels per area: `none` | `view` | `manage` (manage ⊇ view).

Role presets populate `permissions` but `permissions` is the source of truth at enforcement time:
- **owner** — `manage` everything + administration (implicit; not grantable to others).
- **admin** — `manage` all feature areas; `settings` = `view` (can see settings but not manage admins).
- **read_only** — `view` everything.
- **custom** — owner sets each area individually (the matrix in the invite form).

`settings: manage` (administration) is reserved to `owner` regardless of the matrix.

## Step 0 — Database (PM applies via Supabase MCP on ElaraAssist; reference)

```sql
-- Per-area permissions on each admin (source of truth at enforcement)
alter table overseer_admins
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Pending invitations (account is created on accept)
create table if not exists overseer_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  display_name text,
  username     text,                 -- optional preset; else derived/chosen on accept
  role         text not null default 'custom' check (role in ('owner','admin','read_only','custom')),
  permissions  jsonb not null default '{}'::jsonb,
  token_hash   text not null,        -- sha256 of the emailed token
  expires_at   timestamptz not null,
  status       text not null default 'invited' check (status in ('invited','accepted','revoked')),
  invited_by   uuid references overseer_admins(id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);
create index if not exists idx_overseer_invites_status on overseer_invites(status);
```

> Backfill: I'll set existing accounts' `permissions` to the full set for `owner`/`admin` and view-all for `read_only` so nothing loses access on rollout.

## Step 1 — Branded email (`src/notifications/emailTemplates.ts`)

A small set of branded HTML builders used by `email.ts` callers:

- `inviteEmail({ name, inviterName, acceptUrl, expiresHours })` and `resetEmail({ name, resetUrl })` → return `{ subject, html, text }`.
- Branding: Crimson Forge wordmark/logo (absolute URL via `BRAND_LOGO_URL`, fallback to the marketing site logo), crimson header bar (`#C0302A`), white card on light gray, a single primary button ("Set your password" / "Reset password"), plain-text fallback, and a small footer ("Crimson Forge Overseer · if you weren't expecting this, ignore it"). Inline CSS only (email clients). Keep it simple and on-brand.
- Update `admins.ts` / `auth.ts` callers to use these instead of ad-hoc strings.

## Step 2 — Middleware (`src/api/middleware/auth.ts`)

- `requireAuth`: after JWT verify, load `{ status, role, permissions }` from `overseer_admins` by id (single select). If `status !== 'active'` → 401. Set `req.panelUser = { id, username, role, permissions }`. (Fail-safe: on DB error, reject rather than open.)
- Add `requireArea(area, level: 'view'|'manage')`: owner always passes; otherwise check `permissions[area]` meets the level. 403 otherwise. Keep `requireOwner` (administration) and `requireAdmin` (legacy; = owner/admin) for compatibility.

## Step 3 — Apply `requireArea` to feature routes

Map each route family to an area (reads → `view`, writes → `manage`):
- `crm.*` → `crm`; `financials.*` → `financials`; `captable.*` → `captable`; `elara/config.*` → `elara`; `home.*` → `home`; `cfp.*` / `fp.*` (Customers) → `customers`; `activity`/`audit` read → `settings:view`; **`admins.*` stays `requireOwner`**; enterprise (future 6b) → `enterprise`; system/status → `system`.
- Apply as the second guard after `requireAuth`. Don't change response shapes.

## Step 4 — Invite + accept API

- `POST /api/admins/invite` (`requireOwner`) `{ email, displayName, username?, role, permissions }` → create `overseer_invites` (token + 72h expiry); send the **branded invite email** with `acceptUrl = PANEL_RESET_URL_BASE/accept?token=…`. `audit('admin.invite')` + `emitEvent`.
- `GET /api/admins/invites` (`requireAdmin`) → pending/recent invites (never expose `token_hash`).
- `POST /api/admins/invites/:id/resend` (`requireOwner`) → new token + re-email. `POST /api/admins/invites/:id/revoke` (`requireOwner`) → status `revoked`.
- `POST /api/auth/accept-invite` (public) `{ token, username?, password }` → validate token (status `invited`, not expired); `assertPasswordStrength`; create the `overseer_admins` row (`status:'active'`, `must_change_password:false`, role + permissions from the invite); mark invite `accepted`; return a session token (auto-login) or 200 → redirect to `/login`. Username: use the invite's preset or let the invitee choose (unique check). `audit('admin.invite_accepted')`.
- `GET /api/auth/me` (`requireAuth`) → `{ id, username, role, permissions }` so the panel can refresh permissions without a full re-login.

## Step 5 — Panel

- **AdminsTab → "Invite teammate":** form with email, display name, optional username, a **role preset** dropdown (Owner/Admin/Read-only/Custom), and a **permission matrix** (areas × none/view/manage) that auto-fills from the preset and is editable when Custom. Submit → invite sent (toast). A **Pending invites** table (email, role, sent, expires) with Resend / Revoke (confirm). Keep existing edit/suspend/reset on active admins; add a per-admin **permissions editor** (same matrix) for owners.
- **AcceptInvite page** (`/accept?token=…`, public): branded set-password screen (username if not preset, password + confirm, min 12). On success → logged in / sent to login.
- **Nav + route gating:** read `permissions` (from login result / `GET /me`) and hide nav areas the user can't `view`; guard routes with a client check that mirrors `requireArea` (backend still enforces). Read-only/limited users land on the first area they can see.

## Verify

1. Owner invites a teammate with Custom perms (e.g. `crm: manage`, `financials: view`, everything else `none`) → branded email arrives with a working set-password link; invitee sets a password and lands in the panel seeing only CRM + Financials.
2. That user gets 403 (API) on a `financials` write and on any `captable`/`customers` route; the hidden areas don't appear in nav.
3. Owner changes the user's `crm` to `view` → on their next request (or after `/me` refresh) they can no longer mutate CRM — no re-login needed.
4. Owner suspends the user → their existing token is rejected on the next request (per-request status check).
5. Invite expiry + revoke both block acceptance; resend issues a fresh link.
6. Existing owner/admin/read_only accounts keep full prior access after the permissions backfill; administration stays owner-only.
7. All invite/permission/suspend actions write `overseer_audit` rows and post to the activity feed.

## Hand-off for the PM (Clutch)

- I apply Step 0 (the `permissions` column + `overseer_invites`) and backfill existing accounts' permissions via MCP when the code's in.
- Confirm `RESEND_API_KEY`, `OVERSEER_FROM_EMAIL`, `PANEL_RESET_URL_BASE`, and set `BRAND_LOGO_URL` to a public Crimson Forge logo for the email.
