# Overseer 2.0 — Merge & Deploy Checklist

Branch `feat/overseer-2-theme-shell` (audit fixes @ `401faab`). Work top-down.

## 1. Code to land before merge (recommended — both small)
- [ ] **STEP9** — remove the personal/wellness Elara layer (founder prompt + check-in job; Elara → team ops assistant).
- [ ] **FIX4** — route the morning briefing through its configured destination (so it goes to #all-crimson-forge, not the old webhook).
- [ ] (Optional, can defer) audit nice-to-haves: #6 Stripe pagination, #8 2FA-disable factor, #9 server-side `must_change` gate, #11 throttle scaling.

## 2. Working-tree hygiene (do before staging anything)
- [ ] `git checkout -- .` to discard the OneDrive-corrupted/truncated working-tree copies — **do not commit them**.
- [ ] Confirm `git status` is clean and on the right HEAD.

## 3. Railway env vars (set BEFORE deploying this commit)
- [ ] ★ `MFA_ENC_KEY` (32-byte random) — **backend won't boot without it**
- [ ] ★ `PANEL_JWT_SECRET` — also required at boot now (likely already set)
- [ ] `PANEL_RESET_URL_BASE` = the **prod panel URL** (makes invite/reset links work off-localhost — fixes the phone issue)
- [ ] `RESEND_API_KEY` + `OVERSEER_FROM_EMAIL` (invite/reset email)
- [ ] `BRAND_LOGO_URL` (invite email logo)
- [ ] `SLACK_ACTIVITY_CHANNEL_ID` (legacy default; routing is now DB-driven, but harmless to keep)

## 4. Slack
- [ ] Add the Overseer bot as a **member** of **#all-crimson-forge** and **#elara-assist** (routed posts need membership; the old webhook didn't).

## 5. Database (PM = me — already done)
- [x] All migrations applied to ElaraAssist (Phase 0 → Step 8); CRM/financials/cap-table tables + seeds; permissions backfill; Slack routing seed; `source_lead_id` unique index; personal data cleared (agent_routines + health memory).
- [ ] After STEP9 lands: I drop the `agent_routines` table and rename the `elara_schedules` row `checkins_summarize` → `summarize`.

## 6. Merge + deploy + smoke test
- [ ] Merge `feat/overseer-2-theme-shell` → `main`.
- [ ] Deploy; confirm the backend **boots** (env present).
- [ ] Smoke test on prod: login + **2FA** enroll/login; **invite** a teammate (link now works off-device); **read-only** account sees only permitted tabs; **Financials / CRM / Cap table** populate; **"Send now"** briefing lands in **#all-crimson-forge**; a health alert lands in **#elara-assist**; System CFP card shows **$0/0**; your role reads **SuperAdmin**.

## 7. Post-merge
- [ ] Backlog: audit #6/#8/#9/#11 if wanted.
- [ ] Roadmap: **Elara ask-anything** first (she reads CRM/financials/cap table), then sessions/backups, investor-update generator, ⌘K search, CRM tasks/reminders.
- [ ] 6b Enterprise: gated on the ForgePilot EA-track (FP-EA0 written; FP-EA1 to write) in the other repo.
