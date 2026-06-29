# Build instructions — Overseer 2.0

Hand-off specs and Claude Code instruction files for the Overseer 2.0 overhaul.
Master copy of record lives in the planning workspace:
`…\Claude\Projects\Crimson Forge\Overseer 2.0 and Enterprise Auth\Build Workspace\`
(also linked to this repo via `.claude/settings.json` → `additionalDirectories`).

## Contents

- **`Overseer_2.0_Redesign_Spec.md`** — the reference. Light-theme tokens (ForgePilot parity), the function-based information architecture, page-by-page layout, the Elara Controls model + config tables, and the build sequence.
- **`OVERSEER-P0a — Auth Overhaul, Roles, Audit & Activity Feed (BACKEND).md`** — named accounts + roles + `overseer_audit` + `#cf-activity` feed + password reset. Backend half.
- **`OVERSEER-P0b — Panel Plumbing, Login & Admin UI (FRONTEND).md`** — react-router + TanStack Query + confirm/toast + login + Admins/Activity tabs. Panel half. NOTE: the redesign spec supersedes P0b's *styling* (light theme + new nav); reuse its plumbing.

## Build order (spec §8)

1. Theme + shell (light palette, new sidebar/IA, router/query/confirm/toast, restyled login)
2. Auth backend (P0a) + Settings (named accounts/roles/audit) + activity feed + `#cf-activity`
3. Home dashboard
4. Elara Controls + config tables
5. Customers consolidation + CRM
6. Enterprise + Financials

Each step: backend endpoints first, then panel, then Elara tool where it fits. Everything privileged is backend-only + audited.

> The ForgePilot enterprise instruction (`FP-EA0`) is **not** here — it targets the ForgePilot repo, not Overseer. It lives in the Build Workspace.
