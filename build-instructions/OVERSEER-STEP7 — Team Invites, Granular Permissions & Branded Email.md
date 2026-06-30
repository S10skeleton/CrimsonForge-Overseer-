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

## Permission model — area + sub-tab granularity

Permissions are a flat map of **keys → access level** (`none` | `view` | `manage`, where `manage ⊇ view`). A key is either a top-level **area** or an **area.subtab** leaf, so access can be set per nav tab — e.g. a leads person can have CRM Leads without seeing investor companies or the cap table.

Canonical keys (mirror the nav):

| Area | Keys (leaf where the tab has sub-views) |
|---|---|
| Home | `home` |
| Elara | `elara` (covers Assistant / Controls / Forge AI) |
| **CRM** | `crm.leads`, `crm.pipeline`, `crm.companies` |
| Customers | `customers` |
| Enterprise | `enterprise` (future 6b) |
| **Financials** | `financials.revenue`, `financials.runway`, `financials.raise`, `financials.captable` |
| System | `system` |
| Settings | `settings` |

> The previously-listed standalone `captable` area folds into `financials.captable` (Cap table is a Financials sub-view per 6c). "Investor status" sensitivity is covered by gating `crm.companies` (investor companies/deals) + `financials.raise` + `financials.captable` independently of `crm.leads`.

**Resolution at enforcement:** `requireArea(key, level)` checks `permissions[key]`; if a leaf key is unset, fall back to its parent area key (`permissions['financials']`) if present; owner always passes. So an owner can grant a whole area at once (set `financials`) **or** drill into leaves (set `financials.raise: none` while `financials.revenue: view`).

Role presets populate `permissions` but the stored map is the source of truth:
- **owner** — `manage` everything + administration (implicit; not grantable to others).
- **admin** — `manage` all feature keys; `settings` = `view`.
- **read_only** — `view` everything.
- **custom** — owner sets each key individually (the matrix, with CRM and Financials expandable into their sub-tabs).

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
- Add `requireArea(key, level: 'view'|'manage')`: owner always passes; otherwise check `permissions[key]`, and if `key` is a leaf (`area.subtab`) that's unset, fall back to `permissions[area]`. Meets-or-exceeds the level → pass, else 403. Keep `requireOwner` (administration) and `requireAdmin` (legacy; = owner/admin) for compatibility.

## Step 3 — Apply `requireArea` to feature routes (leaf-level)

Map each route to its key (reads → `view`, writes → `manage`). Apply as the second guard after `requireAuth`; don't change response shapes.
- **CRM:** the Leads list (`cfp.leads` read) + `POST /api/crm/leads/:id/convert` → `crm.leads`; `crm` deals routes → `crm.pipeline`; `crm` companies/contacts/activities → `crm.companies`.
- **Financials:** `/api/financials/revenue` + `/mrr-history` → `financials.revenue`; `/api/financials/entries` + `/runway` → `financials.runway`; `/api/financials/raise` → `financials.raise`; `/api/captable/*` → `financials.captable`.
- **Other:** `elara/config.*` → `elara`; `home.*` → `home`; `cfp.*`/`fp.*` (Customers) → `customers`; `activity`/`audit` read → `settings`; enterprise (6b) → `enterprise`; `system`/`status` → `system`; **`admins.*` stays `requireOwner`**.

## Step 4 — Invite + accept API

- `POST /api/admins/invite` (`requireOwner`) `{ email, displayName, username?, role, permissions }` → create `overseer_invites` (token + 72h expiry); send the **branded invite email** with `acceptUrl = PANEL_RESET_URL_BASE/accept?token=…`. `audit('admin.invite')` + `emitEvent`.
- `GET /api/admins/invites` (`requireAdmin`) → pending/recent invites (never expose `token_hash`).
- `POST /api/admins/invites/:id/resend` (`requireOwner`) → new token + re-email. `POST /api/admins/invites/:id/revoke` (`requireOwner`) → status `revoked`.
- `POST /api/auth/accept-invite` (public) `{ token, username?, password }` → validate token (status `invited`, not expired); `assertPasswordStrength`; create the `overseer_admins` row (`status:'active'`, `must_change_password:false`, role + permissions from the invite); mark invite `accepted`; return a session token (auto-login) or 200 → redirect to `/login`. Username: use the invite's preset or let the invitee choose (unique check). `audit('admin.invite_accepted')`.
- `GET /api/auth/me` (`requireAuth`) → `{ id, username, role, permissions }` so the panel can refresh permissions without a full re-login.

## Step 5 — Panel

- **AdminsTab → "Invite teammate":** form with email, display name, optional username, a **role preset** dropdown (Owner/Admin/Read-only/Custom), and a **permission matrix** of keys × `none/view/manage` that auto-fills from the preset and is editable when Custom. The matrix is grouped by area; **CRM** (Leads / Pipeline / Companies) and **Financials** (Revenue / Runway / Raise / Cap table) **expand into their sub-tabs** so each can be set independently (an area-level row sets all its children at once, with a quick "set whole area" control). Submit → invite sent (toast). A **Pending invites** table (email, role, sent, expires) with Resend / Revoke (confirm). Keep existing edit/suspend/reset on active admins; add a per-admin **permissions editor** (same matrix) for owners.
- **AcceptInvite page** (`/accept?token=…`, public): branded set-password screen (username if not preset, password + confirm, min 12). On success → logged in / sent to login.
- **Nav + route gating:** read `permissions` (from login result / `GET /me`) and hide nav **tabs** the user can't `view` — at the sub-tab level (e.g. hide the Cap table or Raise tab within Financials, or Companies within CRM, while keeping Leads). If every sub-tab of an area is hidden, hide the whole area. Guard routes with a client check that mirrors `requireArea` (backend still enforces). Limited users land on the first tab they can see.

## Verify

1. Owner invites a **leads-only** teammate (Custom: `crm.leads: manage`, everything else `none`) → branded email + set-password link; invitee lands seeing **only CRM › Leads** — no Pipeline, no Companies, no Financials/Cap table tab anywhere.
2. That user gets 403 (API) on `crm.companies`, `financials.raise`, and `/api/captable/*`; those tabs/areas don't render in nav (Cap table + investor status are invisible to them).
3. Owner changes the user's `crm.leads` to `view` → on their next request (or after `/me` refresh) they can no longer mutate leads — no re-login needed. Setting `financials: view` at the area level grants all Financials sub-tabs via the parent fallback.
4. Owner suspends the user → their existing token is rejected on the next request (per-request status check).
5. Invite expiry + revoke both block acceptance; resend issues a fresh link.
6. Existing owner/admin/read_only accounts keep full prior access after the permissions backfill; administration stays owner-only.
7. All invite/permission/suspend actions write `overseer_audit` rows and post to the activity feed.

## Hand-off for the PM (Clutch)

- I apply Step 0 (the `permissions` column + `overseer_invites`) and backfill existing accounts' permissions via MCP when the code's in.
- Confirm `RESEND_API_KEY`, `OVERSEER_FROM_EMAIL`, `PANEL_RESET_URL_BASE`, and set `BRAND_LOGO_URL` to a public Crimson Forge logo for the email.
