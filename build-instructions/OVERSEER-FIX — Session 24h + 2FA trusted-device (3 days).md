# OVERSEER FIX — Longer session (24h) + 2FA only every 3 days (trusted device)

**Repo:** `CrimsonForge-Overseer`. **Branch:** off `main` — e.g. `fix/session-and-2fa-cadence`.
**Type:** Auth UX — re-login is happening ~every 3h and 2FA is required on **every** login. Target: a full **24h session**, and **TOTP only every 3 days** per device (password-only logins in between). Backend (auth) + a panel default. Keep it secure — this is a deliberate, documented tradeoff for a founder/admin panel.

## What's actually happening (root cause)

- The session JWT is **already 24h** (`auth.ts`: `expiresIn: '24h'`). That's not the limiter.
- The **idle-logout timer** is what bounces you early — `panel/src/lib/useIdleLogout.ts` (`DEFAULT_IDLE_MIN = Number(VITE_IDLE_LOGOUT_MIN) || 45`). After N minutes of no interaction it logs you out, and since `totp_enabled`, the next login forces TOTP again.
- 2FA: on every login with `totp_enabled`, `auth.ts` returns `{ mfaRequired: true, mfaToken }` (5-min) and you must enter a TOTP code to get the 24h session. There is **no "remember this device."**

## Part A — Make the effective session ~24h

1. **Keep the session token at 24h** (make it env-tunable): `expiresIn` = `SESSION_TTL_HOURS` (default `24`).
2. **Stop the idle timer from undercutting it.** Raise the idle-logout default so it no longer forces re-login inside the 24h window:
   - In `useIdleLogout.ts`, change the default from `45` to a value that matches the session — set `DEFAULT_IDLE_MIN = Number(import.meta.env.VITE_IDLE_LOGOUT_MIN) || 1440` (24h), so by default idle ≈ the token life and the 24h token is the real cap.
   - Keep the `VITE_IDLE_LOGOUT_MIN=0` escape hatch (disable idle entirely) documented.
   - (No Netlify env change required after this — the code default alone fixes the 3h logouts. Clutch can still override via the env later if he wants a shorter idle.)

**Result:** one login lasts a full day; the idle warning no longer fires mid-session.

## Part B — 2FA only every 3 days (trusted-device)

Add a signed **trusted-device** token so a device that has passed TOTP once doesn't need it again for `TRUSTED_DEVICE_DAYS` (default **3**).

1. **On successful TOTP verification** (the step that exchanges the 5-min `mfa-pending` token + the TOTP code for the 24h `session` token): also issue a **trusted-device cookie**:
   - `cf_trusted` = signed JWT `{ sub: adminId, scope: 'trusted-device', tdv: <admin.trusted_device_version> }`, `expiresIn` = `${TRUSTED_DEVICE_DAYS}d`.
   - Cookie flags: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` = 3 days. Sign with `PANEL_JWT_SECRET` (same secret as sessions).
2. **On `POST /login`**, after the password check, when `admin.totp_enabled`:
   - If the request carries a **valid** `cf_trusted` cookie for **this admin** (verify signature, `scope==='trusted-device'`, `sub===admin.id`, and `tdv===admin.trusted_device_version`) → **skip TOTP**: issue the 24h `session` token directly (same as a non-2FA login).
   - Else → behave as today: return `{ mfaRequired: true, mfaToken }`.
3. **Invalidation (important):** add an integer `trusted_device_version` to the admin record (default 0). Bump it (→ all trusted devices for that admin instantly invalid, forcing TOTP again) whenever:
   - the admin **resets/re-enrolls 2FA**, or **resets their password**, or
   - an owner uses the existing **"reset 2FA"** admin action, or
   - (optional) the admin clicks a new **"Sign out all devices / forget trusted devices"** button in Security.
   *(PM applies the `trusted_device_version` column via MCP — see hand-off.)*
4. **Recovery-code logins do NOT set a trusted device** (only a real TOTP success does), so a recovery login stays one-time.
5. Make `TRUSTED_DEVICE_DAYS` an env (default 3) so the window is tunable.

### Security notes (keep it honest)
- This is a deliberate convenience tradeoff: within the 3-day window a stolen *unlocked, logged-out* laptop with the cookie could log in with password only. Mitigated by: httpOnly+Secure cookie, the `trusted_device_version` kill-switch on any 2FA/password reset, and the still-required password. Acceptable for an internal founder/admin panel; document it in `auth.ts`.
- The 2FA-bypass fix stays intact: `requireAuth` still rejects `scope:'mfa-pending'`; trusted-device tokens use their own `scope:'trusted-device'` and are **only** honored at the login step, never accepted as a session.

## Verify

1. Log in, pass TOTP → you get a 24h session AND a `cf_trusted` cookie. Stay idle 1h → **not** logged out (idle ≈ 24h now).
2. Log out / let the 24h session lapse, log back in within 3 days on the same browser → **password only, no TOTP**.
3. After 3 days (or in a different browser / incognito) → TOTP required again.
4. Reset password or reset 2FA → next login requires TOTP again even within 3 days (version bumped).
5. Recovery-code login does not create a trusted device. `requireAuth` still rejects mfa-pending and trusted-device scopes as sessions. `npm run build` + lint clean both sides.

## Hand-off (PM — Clutch)

- **DB (me):** add `trusted_device_version int not null default 0` to `overseer_admins` — I'll apply via MCP when the code's in.
- **Env (optional):** `SESSION_TTL_HOURS=24`, `TRUSTED_DEVICE_DAYS=3` (both have safe code defaults; no action needed unless you want to change them). No Netlify env change required — the idle default is fixed in code.
