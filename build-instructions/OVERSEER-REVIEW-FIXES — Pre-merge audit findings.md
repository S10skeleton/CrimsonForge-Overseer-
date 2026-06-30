# OVERSEER REVIEW FIXES — pre-merge security + correctness audit

**Repo:** `CrimsonForge-Overseer`. **Branch:** `feat/overseer-2-theme-shell`. **Type:** Fixes from a two-reviewer audit before merging to main. Do the **BLOCKER** first.

---

## 🛑 BLOCKER — fix before merge

### 1. 2FA is fully bypassable — the pending `mfaToken` is accepted as a session token
`src/api/routes/auth.ts:143` signs `jwt.sign({ sub, scope: 'mfa-pending' }, secret, { expiresIn: '5m' })` with the **same** `PANEL_JWT_SECRET` as real sessions. `src/api/middleware/auth.ts` (`requireAuth`, ~line 54) does `jwt.verify(token, secret)` and uses `payload.sub` but **never checks `scope`** — so the 5-minute MFA-pending token is a valid Bearer token for every `requireAuth`/`requireArea`/`requireOwner` route, and role is re-loaded from the DB, granting full access **without ever entering a TOTP code**. 2FA provides no protection as written.

**Fix (both halves):**
- In `requireAuth`, **reject** any token whose `scope === 'mfa-pending'` (or, stronger: only accept tokens with an explicit `scope: 'session'`). Return 401.
- Add `scope: 'session'` to the real session tokens (auth.ts:150 password-login, :360 accept-invite, and the `/login/2fa` issuance) so the check can be positive (`payload.scope !== 'session' → 401`). The `/login/2fa` verify already checks `scope === 'mfa-pending'` correctly — only `requireAuth` is missing the guard.

Verify: with 2FA enabled, the password step's `mfaToken` returns 401 on any `/api/...` call; only the token from `/login/2fa` (after a valid code) works.

---

## ⚠️ SHOULD-FIX (before or right after merge)

### 2. `MFA_ENC_KEY` has an insecure hardcoded fallback
`src/lib/totp.ts:38` falls back to a literal dev key (`'overseer-mfa-dev-key-change-me'`) when `MFA_ENC_KEY` is unset — if the env var is ever missing in prod, all TOTP secrets are encrypted under a key that's in the source.
**Fix:** fail-fast at startup — add `MFA_ENC_KEY` to the required-env check in `src/index.ts` and throw if missing; never use the dev default in production.

### 3. PostgREST filter injection in password-reset lookup
`src/api/routes/auth.ts:177` interpolates raw user input into `.or(\`username.eq.${needle},email.eq.${needle}\`)`. Impact is bounded (always 200; email goes to the matched row), but it's untrusted input in a query filter.
**Fix:** validate `needle` against `^[a-z0-9._%+@-]+$` before use, or run two separate `.eq()` lookups instead of string-interpolating `.or()`.

### 4. Churn (`cancelledThisMonth`) filters by subscription *creation* date, not cancellation date
`src/lib/billing.ts:61-64` (and `src/tools/stripe-forgepilot.ts:82-87`) query canceled subs with `created: { gte: startOfMonth }` — Stripe `created` is original creation time, so a sub created earlier and canceled this month is missed; churn undercounts.
**Fix:** fetch recent canceled subs and filter on `sub.canceled_at >= startOfMonth` (Stripe has no `canceled_at` list filter).

### 5. Lead→company convert race (DB guard now added; handler must catch it)
`src/api/routes/crm.ts:241-242` is idempotent only via read-then-insert. **A unique index `uq_crm_companies_source_lead` on `crm_companies(source_lead_id) where source_lead_id is not null` has been applied to the DB** (PM, via MCP) to prevent duplicates. Update the convert handler to **catch the unique-violation on insert** (Postgres code `23505`) and, on conflict, re-select and return the existing company (treat as already-converted) instead of 500ing.

---

## 💡 NICE-TO-HAVE (post-merge backlog)

- **6. Stripe pagination caps** — `subscriptions.list({limit:100})` / `invoices.list({limit:20})` (`billing.ts:45,75`; `stripe-forgepilot.ts:50,90`) silently truncate as FP grows. Switch to `autoPagingToArray({ limit: N })` / loop on `has_more`. (Fine at current scale.)
- **7. MRR uses only `items.data[0]`** (`billing.ts:48-54`, `stripe-forgepilot.ts:55-62`) — drops Additional-Seat line revenue; `planBreakdown` already loops all items, so it's inconsistent. Reduce over all `sub.items.data`.
- **8. 2FA-disable accepts password as a factor** (`auth.ts:466-483`) — a stolen *session* could disable 2FA. Consider requiring a TOTP/recovery code (not password) to disable.
- **9. `must_change_password` enforced client-side only** — temp-password login still returns a full 24h session. Low risk; consider a restricted token until the password is changed.
- **10. Doc-comment drift** — `crm.ts:4` / `financials.ts:4` say "Deletes: requireOwner" but enforcement is the mount-level area `manage` guard (behavior matches the requirement; fix the comments). `admins.ts:3` / `elara-config.ts:2` reference `requireAdmin` where an area guard now applies.
- **11. Login throttle is in-memory, per-IP** (`auth.ts:35`) — fine for single-instance; revisit if the panel ever scales horizontally.

---

## ✅ Audited and clean (for the record)

Route guard coverage (every mutating endpoint guarded; admins + cap-table writes owner-only; CRM/financials writes require the right area at `manage`); `requireAuth` is fail-closed and re-loads status+role+permissions per request (suspended JWT dies immediately); the un-migrated-`permissions` fallback denies non-owners (no over-grant); invites are hashed/expiring/single-use with role+permissions taken from the invite row (no self-escalation to owner); TOTP secret AES-256-GCM at rest + recovery codes hashed and consumed once; no `password_hash`/`totp_secret`/service keys in any response or the panel bundle. Correctness: the **CFP revenue fix is correct** (mutually-exclusive FP vs non-FP, no double-count, briefing still account-wide), runway guards divide-by-zero, ARR=MRR×12, MRR snapshot upsert is unique per day/product, cap-table % excludes planned rows and keeps SAFEs separate, CRM cross-DB writes use the right clients, `elaraConfig` getters all fail-safe to env defaults, and `reloadSchedules()` doesn't leak cron tasks.
