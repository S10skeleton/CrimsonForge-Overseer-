# OVERSEER FIX — Force `must_change_password` redirect at the shell level

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Type:** Small bug fix. **Branch:** the Overseer 2.0 branch.
**Files:** `panel/src/App.tsx` (route guard). Possibly `panel/src/pages/Login.tsx` (remove the now-redundant inline navigate).

## Problem

`ResetPassword.tsx` correctly supports a logged-in "change" mode (current + new password). But the only thing that routes a `must_change_password` user there is the inline `navigate('/reset')` in `Login.handleSubmit` — which (a) races the `/login` route's `token ? <Navigate to="/" />` redirect that fires the moment `onLogin` sets the token, so the user often lands on `/home` instead, and (b) doesn't survive a page reload (a stored token renders the Panel directly, skipping the check). Net: the forced-reset prompt never appears.

## Fix — enforce it where the session is evaluated, not just at login

In `App.tsx`, read the stored `panel_user` and, when the user is authenticated **and** `must_change_password` is true, force `/reset` for everything except the `/reset` route itself.

1. Track `mustChange` in state alongside `token`/`role`: on `handleLogin(result)` set it from `result.user?.must_change_password`; on mount, hydrate from `localStorage.getItem('panel_user')` (parse → `must_change_password`); clear on logout.
2. In the protected shell (the `path="/"` route element, or a small `<RequireAuth>` wrapper), if `token && mustChange`, render `<Navigate to="/reset" replace />`. The top-level `/reset` route stays reachable so the change form renders. After a successful change, `ResetPassword` already navigates to `/home`; also clear the stored `must_change_password` flag there (update `panel_user` in localStorage to `must_change_password:false`) so the guard releases without a re-login.
3. Remove the now-redundant `if (result.user?.must_change_password) navigate('/reset')` branch in `Login.tsx` (the shell guard handles it), or leave it — harmless once the guard exists.

## Verify

1. Log in with a `must_change_password` account → land on the "Set a new password" form (not Home), even on a hard reload while logged in.
2. Set a new password → redirected to Home, and reloading does NOT bounce back to `/reset` (flag cleared locally; backend already cleared it).
3. A normal account (no flag) logs in straight to Home as before.
4. The email-reset flow (`/reset?token=…`) is unaffected.
