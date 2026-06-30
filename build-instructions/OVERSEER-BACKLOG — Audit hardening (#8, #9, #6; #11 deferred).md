# OVERSEER BACKLOG — audit hardening (#8, #9, #6)

**Repo:** `CrimsonForge-Overseer`. **Branch:** the Overseer 2.0 branch. **Type:** Security/correctness hardening — the audit's nice-to-haves, to ship the merge as the polished version. Small, independent changes.

## #8 (security) — 2FA-disable must require a code, not a password

`src/api/routes/auth.ts:469` `POST /2fa/disable` currently accepts `{ code | recoveryCode | password }`. Allowing `password` means a stolen **session** (not just the device) can turn 2FA off — defeating its purpose against session theft.

**Fix:** remove `password` as a disable factor. Require a valid current **TOTP `code`** OR a **`recoveryCode`** (consume it). Reject with 400 if neither is valid. (Owner `reset-2fa` on *another* admin stays as the lost-device escape hatch.)

## #9 (security) — enforce `must_change_password` on the server, not just the client

The panel redirects a `must_change_password` user to `/reset`, but the temp-password login still returns a full 24h session, so that user could call mutating APIs directly without changing the password.

**Fix (defense-in-depth):**
- In `src/api/middleware/auth.ts` `requireAuth`, add `must_change_password` to the `.select('status, role, permissions')` (and the rollout-safety fallback select), and expose it on `req.panelUser` (e.g. `mustChange`).
- Block the session while `mustChange` is true: for **mutating** requests (POST/PATCH/DELETE) return `403 { error: 'password_change_required' }`, **except** the allow-list `POST /api/auth/change-password`, `POST /api/auth/logout` (if any), and `GET /api/auth/me`. Reads (GET) can stay allowed so the panel renders. (This is belt-and-suspenders with the existing client redirect.)

## #6 (correctness, latent) — Stripe pagination caps

`src/lib/billing.ts:45,65,77` and `src/tools/stripe-forgepilot.ts` (active subs `limit:100`, canceled `limit:100`, open invoices `limit:20`) silently truncate once the account exceeds those counts — MRR, sub counts, and payment-failure detection would under-report as FP grows.

**Fix:** replace the single `.list({ limit: N })` calls with auto-pagination — `await stripe.subscriptions.list({ status, ... }).autoPagingToArray({ limit: 1000 })` (and likewise for invoices) — so all rows are counted. Keep a sane upper bound. Apply consistently in both `billing.ts` and `stripe-forgepilot.ts`.

## #11 (deferred — do NOT build now)

The login brute-force throttle is an in-memory per-IP `Map` (`auth.ts:35`), correct only on a single instance. A proper fix needs a shared store (e.g. Redis) and is **overkill for the current single-Railway-instance founder panel**. Leave the in-code note; revisit only if/when Overseer scales horizontally. No change in this pass.

## Verify

1. 2FA disable: a valid TOTP code or recovery code disables; a correct **password alone** is now rejected.
2. A `must_change_password` account: GET pages load, but any POST/PATCH/DELETE (other than change-password) returns 403 until the password is changed; after changing, normal access resumes.
3. Billing endpoints return correct totals with >100 subscriptions / >20 open invoices in a test account (or confirm `autoPagingToArray` is used). No regression at current scale.
4. `npm run build` clean; no behavior change for normal (non-must-change, 2FA-code) flows.
