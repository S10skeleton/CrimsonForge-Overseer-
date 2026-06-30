# OVERSEER SUPERADMIN-2 — consolidate owner-only controls + "sign out everywhere"

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` after #14 — e.g. `feat/superadmin-consolidate`.
**Type:** Make SuperAdmin the single owner-only control center. (1) Move **Admins & Roles** into it (owner-only). (2) Add a **"Sign out everywhere / forget all trusted devices"** kill-switch. Blocklist already lives here from #14. Backend + panel. One small DB column (PM applies).

Scope decisions (from Clutch): move **Admins & Roles** in; **add** the sign-out-everywhere control. Leave **Integrations, Audit Log, Financials** where they are.

## ⛔ Guardrails
1. **Owner-only** for everything in SuperAdmin (route + nav + backend). Reuse the existing `role === 'owner'` pattern; no new permission keys.
2. **Self-service stays put:** the **Security** tab (a user's own 2FA enroll + password change + the per-user "Forget trusted devices" from #13) remains available to all roles under Settings. Only the *org/owner* controls move.
3. Additive; don't regress #13 (trusted-device) or #14 (blocklist).

## Part 1 — SuperAdmin becomes a multi-section area

Turn `/superadmin` into an owner-only area with **sub-tabs** (same `subtabs` pattern as CRM), one SuperAdmin entry in the sidebar:
- **Blocklist** — the existing #14 blocklist editor (move the current SuperAdminView content under this sub-tab).
- **Admins & Roles** — see Part 2.
- **Sessions & Devices** — see Part 3.

Keep the single **SUPERADMIN** nav group → one "SuperAdmin" leaf (owner-only) that lands on the area; sub-tabs switch sections.

## Part 2 — Move Admins & Roles into SuperAdmin (owner-only)

- **Nav (`panel/src/pages/Panel.tsx`):** remove the `Admins & Roles` leaf from the **Settings** section (`/settings/admins`, currently `adminOnly`). It now lives as the **Admins & Roles** sub-tab inside SuperAdmin.
- **Route (`App.tsx`):** gate the Admins & Roles view **owner-only** (redirect/`Not available` for non-owners). If you keep the `/settings/admins` path, add an owner guard; preferably mount it at `/superadmin/admins`. Add a redirect from the old path so bookmarks resolve.
- **Backend (`src/api/routes/admins.ts`):** ensure **all** `/api/admins` routes (list + invite + update + delete + reset + resend/revoke invite) require `role === 'owner'`. Today some are owner-gated and the list may be admin-visible — tighten the whole router to owner-only now that it's an owner surface. (The invitee accept flow on `/api/auth/*` stays public — that's how teammates accept.)
- Net: admins (Matt) no longer see Admins & Roles at all; only Clutch manages teammates.

## Part 3 — "Sign out everywhere / forget all trusted devices" (owner kill-switch)

Goal: if a device is lost/compromised, the owner can instantly (a) invalidate active 24h sessions and (b) force 2FA again — for one account or everyone.

**True session revocation (stateless JWTs need a version check):**
1. **DB (PM applies):** add `session_version integer not null default 0` to `overseer_admins`. (Pairs with the existing `trusted_device_version`.)
2. **Issue:** include `sv: admin.session_version` in the **session** JWT claims (the 24h `scope:'session'` token, at every sign point).
3. **Verify:** in `requireAuth`, after loading the admin (it already reads the admin row per request for status/role/permissions), reject the token if `payload.sv !== admin.session_version` (treat as expired → 401, normal re-login). This makes bumping `session_version` an instant org-side logout.

**The control (SuperAdmin → Sessions & Devices, owner-only, audited):**
- Per admin in a list: **"Sign out everywhere"** → bump that admin's `session_version` **and** `trusted_device_version` (kills their sessions + forgets their trusted devices → full re-auth incl. TOTP). Confirm dialog.
- A global **"Sign out ALL users"** → bump both versions for every admin. Strong confirm.
- Audited (`admin.signout_all` / `admin.force_logout` with target).
- The per-user **"Forget trusted devices"** in Security (from #13) stays as-is (self-service, only bumps `trusted_device_version`).

## Verify
1. Owner: SuperAdmin shows three sub-tabs — Blocklist, Admins & Roles, Sessions & Devices — all working; managing teammates happens here.
2. Admin (Matt): no Admins & Roles anywhere; `/superadmin*` and `/api/admins*` both 403/redirect; still has Settings → Security for his own 2FA/password.
3. "Sign out everywhere" on an account → that user's open session is rejected on next request (must log in again) **and** their next login requires TOTP (trusted devices forgotten). "Sign out ALL" does it for everyone.
4. Old `/settings/admins` redirects into SuperAdmin. #13 trusted-device + #14 blocklist still work. `npm run build` + lint clean both sides.

## Hand-off (PM — Clutch)
- **DB (me):** `alter table overseer_admins add column if not exists session_version integer not null default 0;` — I'll apply via MCP when the code's in. Rollout-safe (tokens issued before the column simply have `sv` undefined → treat undefined as 0 so existing sessions stay valid until the first bump).
- No new env.
