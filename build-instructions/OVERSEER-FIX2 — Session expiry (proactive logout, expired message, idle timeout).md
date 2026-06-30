# OVERSEER FIX2 — Session expiry: proactive logout, "session expired" message, optional idle timeout

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Type:** Auth/session UX + light security. **Branch:** the Overseer 2.0 branch.
**Files:** `panel/src/api.ts` (set an expiry reason on 401), `panel/src/App.tsx` (proactive `exp` check on mount), `panel/src/pages/Login.tsx` (show the reason), optional new `panel/src/lib/useIdleLogout.ts`. Optional backend: `src/api/routes/auth.ts` (shorten token TTL).

## Why

Pre-overhaul, an expired token left the panel "logged in" but every fetch silently failed → empty screens until a manual log out/in. The redesign already added central 401 handling (`api.ts:handleUnauthorized` clears auth + redirects to `/login`), which fixes the trap. This adds the missing polish: detect expiry *before* the first failed call (no empty flash), tell the user *why* they're back at login, and optionally auto-logout on inactivity.

## 1. Proactive expiry detection (`App.tsx`)

- The token is a JWT with an `exp` claim (already decoded by `getRoleFromToken`). Add `isExpired(token)`: decode, compare `exp*1000` to `Date.now()` (with a small skew). 
- On mount, if `stored` token is missing **or** `isExpired` → treat as logged out: clear `panel_token`/`panel_role`/`panel_user` and don't set `token` (so the app renders `/login` immediately, no Panel render + bounce).
- Optional: a lightweight interval (e.g. every 60s) that re-checks `isExpired` while the app is open and logs out if the token lapses mid-session.

## 2. "Session expired" message (`api.ts` + `Login.tsx`)

- In `handleUnauthorized` (and the `App.tsx` proactive path), before redirecting, set a flag: `sessionStorage.setItem('panel_logout_reason', 'expired')` (sessionStorage survives the hard `location.assign` that drops in-memory toast state).
- In `Login.tsx` on mount, read `panel_logout_reason`; if `'expired'`, show a small inline notice / `toast.info('Your session expired — please sign in again.')`, then clear the flag. (Don't show it on a normal first visit / manual logout.)
- Distinguish manual logout (no message) from expiry (message): `handleLogout` should NOT set the reason flag.

## 3. Optional — idle auto-logout (`useIdleLogout.ts`)

- A hook used inside the authenticated shell: reset a timer on `mousemove`/`keydown`/`click`/`scroll`; after `IDLE_LIMIT` (default 45 min, configurable) call `onLogout()` with reason `'idle'` (Login shows "Signed out for inactivity").
- Show a 1-minute **warning** modal before logging out ("Still there? You'll be signed out in 60s") with a "Stay signed in" button that resets the timer.
- Make the limit easy to change (a constant or `VITE_IDLE_LOGOUT_MIN`). Default on, but trivial to disable.

## 4. Optional — shorten the session token (`auth.ts`)

- The session JWT is currently `expiresIn: '7d'`. For a panel with production god-mode, consider **24h** (or 12h) so a leaked/forgotten token doesn't live a week. With proactive expiry + the message above, the shorter TTL is low-friction. (Leave as a one-line change + a note; pick the value with Clutch.)

## Verify

1. Let a token expire (or hand-edit `exp`): reload → land straight on `/login` with "session expired" (no empty Panel flash).
2. A live 401 mid-session (e.g. token revoked) → cleared + redirected with the same message.
3. Manual "Sign out" → login screen with **no** expiry message.
4. Idle for the limit → warning modal → auto-logout with the inactivity message; clicking "Stay signed in" cancels it.
5. Normal active use is never interrupted; reload with a valid token stays logged in.

## Note

Pairs with `OVERSEER-FIX` (the `must_change_password` redirect) — both are small session/login-flow fixes and can ship together.
