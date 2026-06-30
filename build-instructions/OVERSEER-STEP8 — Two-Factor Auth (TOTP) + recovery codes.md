# OVERSEER STEP 8 — Two-factor auth (TOTP) + recovery codes

**Repo:** `CrimsonForge-Overseer`. **Branch:** the Overseer 2.0 branch (after Step 7).
**Files:** edit `src/api/routes/auth.ts` (two-step login + 2FA enroll/verify/disable), `src/api/middleware/auth.ts` (unchanged contract; optional `mfa` claim), new `src/lib/totp.ts` (wrapper), `panel/src/pages/Login.tsx` (code step), new `panel/src/tabs/SecuritySettings` or a section in Admins/Settings (enroll/disable + recovery codes). DB applied by PM via Supabase MCP.
**Type:** Security — second factor for a panel with production god-mode. P0a left the seam (`// TODO: 2FA`).
**Priority:** High (security).

## Why

Password alone protects a panel that can reset users, mint keys, and see all revenue/cap-table data. Add **TOTP** (RFC 6238) — the open standard every authenticator app supports (Duo Mobile, Authy, Google Authenticator, 1Password). Vendor-neutral, free, and forward-compatible with the planned Crimson Forge **companion app**, which can later act as the authenticator or add push-approval without changing this design.

## ⛔ GUARDRAILS

1. **TOTP standard only** — `otpauth://totp/...` secrets; no proprietary/push system now. Keep it interoperable so any authenticator (and the future companion app) works.
2. **Secret is sensitive** — store the TOTP secret **encrypted at rest** (app-level AES-256-GCM with `MFA_ENC_KEY`, or pgcrypto). Never return the raw secret after enrollment; never log it. Recovery codes stored **hashed** (sha256), shown once.
3. **Fail-safe + owner recovery** — if an admin loses their device, recovery codes work; an **owner** can reset another admin's 2FA (audited). Don't lock the company out: document that at least one owner keeps recovery codes.
4. **Backend-enforced** — the password step never returns a full session when 2FA is enabled; only the verified code step does. Audited (`auth.2fa_enabled/disabled/failed`, `auth.login` carries `mfa:true`).

## Step 0 — Database (PM applies via Supabase MCP)

```sql
alter table overseer_admins
  add column if not exists totp_secret      text,        -- encrypted at rest; null until enrolled
  add column if not exists totp_enabled     boolean not null default false,
  add column if not exists recovery_codes   text[] not null default '{}';  -- sha256 hashes, consumed on use
```

(Optional later: an org-level `require_2fa_for_admins` setting. Not in this build.)

## Step 1 — TOTP lib (`src/lib/totp.ts`)

- Add `otplib` (+ `qrcode` for the enrollment image). Wrapper: `generateSecret()`, `otpauthUrl({ secret, account, issuer:'Crimson Forge Overseer' })`, `verifyToken(secret, token)` (allow ±1 step skew), `encryptSecret/decryptSecret` (AES-256-GCM via `MFA_ENC_KEY`), `genRecoveryCodes()` → `{ plain[], hashes[] }`.

## Step 2 — Enrollment API (all `requireAuth`, self-service for the logged-in admin)

- `POST /api/auth/2fa/setup` → generate a pending secret, return `{ otpauthUrl, qrDataUrl }` (store the pending secret server-side, e.g. encrypted in a short-lived field/cache; do NOT enable yet).
- `POST /api/auth/2fa/verify` `{ code }` → verify against the pending secret; on success persist `totp_secret` (encrypted) + `totp_enabled=true`, generate + return recovery codes **once** (store hashes), `audit('auth.2fa_enabled')`.
- `POST /api/auth/2fa/disable` `{ code | recoveryCode | password }` → verify, clear secret/enabled/recovery, `audit('auth.2fa_disabled')`.
- `POST /api/admins/:id/reset-2fa` (`requireOwner`) → owner clears another admin's 2FA (device-lost recovery), audited + event.

## Step 3 — Two-step login (`src/api/routes/auth.ts`)

- `POST /api/auth/login` `{ username, password }`: verify password as today. If the account has `totp_enabled`, **do not** issue the session JWT — instead return `{ mfaRequired: true, mfaToken }` where `mfaToken` is a short-lived (≈5 min) signed token bound to the user id + "pending-mfa" scope (not a session).
- `POST /api/auth/login/2fa` `{ mfaToken, code }`: verify `mfaToken`, then `verifyToken(secret, code)` **or** consume a matching recovery-code hash; on success issue the normal 7-day session JWT (with `mfa:true`), update `last_login_at`, `audit('auth.login', { mfa:true })`. Apply the existing brute-force throttle to the code step too.
- Accounts without 2FA log in exactly as today (single step).

## Step 4 — Panel

- **Login:** after a successful password submit that returns `mfaRequired`, show a 6-digit code field (numeric, autofocus) + "use a recovery code" toggle → calls `/login/2fa`. Keep the existing lockout UX.
- **Security settings** (a card in Settings or the admin's own profile): "Two-factor authentication" — when off, an **Enable** flow (call setup → show QR + manual key → enter code → show recovery codes once with a copy/download); when on, show status + **Disable** and **Regenerate recovery codes**. Owners get a **Reset 2FA** action on other admins in the Admins tab.
- Light theme; `useToast`/`useConfirm`.

## Verify

1. Enroll: scan the QR in any authenticator (test with Google Authenticator / Duo Mobile / Authy) → codes verify; recovery codes shown once.
2. Log out / in: password step returns `mfaRequired`; correct code → in; wrong code → rejected + throttled; a recovery code works once then is consumed.
3. Owner resets a locked-out admin's 2FA; that admin can re-enroll.
4. Secret is never returned after enrollment and never appears in logs/responses; recovery codes stored only as hashes.
5. Non-2FA accounts unaffected; all 2FA events audited.

## Hand-off for the PM (Clutch)

- I apply Step 0 columns via MCP when the code's in.
- Set `MFA_ENC_KEY` (32-byte random) in the backend env. Keep one owner's recovery codes somewhere safe (company lockout insurance).
- Companion-app note: the same `otpauth` secret your authenticator scans can be consumed by the future Crimson Forge app; push-approval is a clean v2 on top of this, no redesign needed.
