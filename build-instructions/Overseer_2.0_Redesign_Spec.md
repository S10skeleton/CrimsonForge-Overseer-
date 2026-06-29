# Overseer 2.0 — UI/UX Redesign Spec

**Prepared for:** Clutch (Shane Beaman), Crimson Forge Inc.
**Repo:** `CrimsonForge-Overseer` → `panel/` (React 19 + Vite) and `src/` (Express API + Elara).
**Status:** Design approved in review (2026-06-29). This is the reference for the build; instruction files for Claude Code come after, one piece at a time.
**Scope of this doc:** the full visual + information-architecture overhaul (light mode), and the Elara Controls surface. Auth/roles/audit backend is specified separately in `Instructions for Claude Code/OVERSEER-P0a`; its panel pieces are folded into the Settings section here.

---

## 1. Goals

1. **Match the product family.** Default to light mode using ForgePilot web's *exact* palette so Overseer reads as the same product, not a separate sci-fi console.
2. **Organize by function, not product.** Today's nav is grouped by product (CFP / ForgePilot / ForgePulse) with Billing/Messages/Feedback duplicated 3×. Reorganize around what you *do* (Home, CRM, Customers, Enterprise, Financials, System) so new capabilities have a home.
3. **Land on the business, not the monitor.** Home is a control-panel dashboard (revenue, leads, runway, live activity), not the health view.
4. **Make Elara's automation controllable.** A real UI for briefings, schedules, alerts, and Slack routing — moving today's hardcoded/env config into DB-backed settings.
5. **Keep Elara's identity.** The orb/personality survives as Elara's section accent; the surrounding chrome goes clean and on-brand.

---

## 2. Visual system — light theme (ForgePilot parity)

Adopt ForgePilot web's `[data-theme="light"]` tokens verbatim (from `frontend/src/index.css`). Overseer's panel currently uses bespoke dark vars (`--bg-dark`, `--dim`, `--crimson`, etc.) and Orbitron/Share Tech Mono/Rajdhani fonts; replace the theme layer, keep the component structure.

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#f4f5f7` | page background |
| `--bg-surface` | `#ffffff` | cards, sidebar, top bar |
| `--bg-elevated` | `#eef0f3` | subtle fills, track backgrounds |
| `--bg-input` | `#ffffff` | inputs |
| `--border` | `#d8dde5` | hairlines |
| `--border-focus` | `#aab0bb` | focus/hover |
| `--text-primary` | `#1a1d23` | headings, body |
| `--text-muted` | `#565d6b` | secondary |
| `--text-hint` | `#8f97a3` | labels, captions |
| `--accent` / `--accent-hover` | `#C0302A` / `#a82520` | crimson — primary actions, active nav |
| `--green` | `#16a34a` | success/up |
| `--red-text` | `#dc2626` | danger |
| Elara accent | `#5949AC` (violet, from the brand gradient) | Elara section identity only |

**Type & form:** switch the panel to a clean system sans (matching ForgePilot) for all UI; retire Orbitron/Share Tech Mono from chrome (Elara's section may keep a subtle mono/orbitron touch as personality). Flat surfaces, 0.5–1px borders, ~8px control radius / 12px card radius, no gradients or glows. A **light default + (optional later) dark toggle** is acceptable but not in scope now.

**Login:** restyle to the light theme; keep a tasteful nod to the Elara orb. (Login also changes functionally under P0a: username/password instead of passphrase.)

---

## 3. Information architecture (new nav)

Sidebar (light, crimson active state, sectioned). Lands on **Home**.

- **Home** — business dashboard (see §4).
- **Elara** — assistant chat + memory/knowledge + **Elara Controls** (see §5). Violet identity accent; live "online" dot.
- **CRM**
  - Leads · Pipeline · Contacts (Companies fold into Contacts/【detail】)
- **Customers** *(product becomes a filter, not separate sections)*
  - Shops &amp; users · Billing · Messages · Feedback — each with a product filter (CrimsonForge Pro / ForgePilot / ForgePulse).
- **Platform**
  - Enterprise (org accounts, seats, API keys, usage) · Financials (MRR/ARR, burn, runway, cap table) · System (health/uptime/Sentry/Railway + ForgePulse status).
- **Settings** — named accounts, roles, audit log, integrations (see §6).

### Old tab → new home (nothing lost)

| Today | New home |
|---|---|
| System | Platform › System |
| ForgePulse | Platform › System (status) |
| Shops, Users | Customers › Shops &amp; users |
| Billing, Messages, Feedback (CFP) | Customers › Billing/Messages/Feedback (filter = CrimsonForge Pro) |
| ForgePilot, FP Billing, FP Messages, FP Feedback | Customers (filter = ForgePilot) |
| Leads | CRM › Leads |
| Forge AI (AIConfig), Elara | Elara |
| — (new) | Home, CRM › Pipeline/Contacts, Platform › Enterprise/Financials, Settings, Elara Controls |

---

## 4. Home dashboard

Landing page. Cards (light, flat):

- **Metric row:** MRR (with trend), New signups (this week), Open leads (+ hot count), Runway (months at current burn). Pulls from Stripe + FP Supabase + CRM + Financials.
- **Activity feed:** the in-app twin of the `#cf-activity` Slack channel — payments, signups, new leads, key mints, suspensions, Elara briefings — newest first, severity-colored. (Backed by the `overseer_events` stream from P0a.)
- **Pipeline snapshot:** deal counts by stage (Investors / Enterprise / Beta partners) with progress bars → deep-links to CRM.
- (Later) Elara briefing summary card + open alerts.

---

## 5. Elara Controls (the automation surface)

**Why it's net-new work:** today everything is hardcoded or env-driven — briefing time = `MORNING_BRIEFING_HOUR`, briefing *content* = a fixed monitor set assembled in `scheduler.ts:runMorningBriefing`, alert thresholds are constants (5% SMS, 3% bounce…), and Slack routing is a single env split (`FP_SLACK_CHANNEL_ID` vs the default webhook). The UI moves this into DB-backed settings the scheduler + notifier read at runtime. **Additive + safe:** seed every table with today's exact values as defaults, so behavior is unchanged until a control is touched; if a settings read fails, fall back to the current env/constant.

### Panels

1. **Morning briefing** — time + timezone; checklist of sections to include (System health, Sentry, Stripe revenue, payment failures, new signups, feedback, Gmail digest, Calendar, ForgePilot section); AI-written-summary toggle. **+ "Send briefing now" with a preview** (trigger on demand, see what it'll contain before 8am).
2. **Scheduled jobs** — enable/disable + timing for each built-in job (morning briefing, FP insights, health check, wellness check-ins, summarization). **+ "Add custom job/reminder"** — a user-defined recurring Elara task (e.g. "every Monday, summarize the week").
3. **Alert rules** — per rule: enabled, threshold (where applicable), severity, SMS on/off, destination. Built-ins: service down (critical, SMS), payment failure, SMS-fail >5%, email-bounce >3%, new subscriber, new shop, ForgePulse signup. **+ Quiet hours / snooze** — a do-not-disturb window where non-critical alerts hold until morning; criticals always page.
4. **Slack routing** — each notification type → a channel (briefing, health alerts, ForgePilot alerts, activity feed `#cf-activity`, new-subscriber, etc.). **Recipients/SMS:** manage briefing recipients and the critical-SMS numbers (today a single hardcoded number).

### Backend config model (ELARA / `ElaraAssist` Supabase — additive)

- `elara_schedules` — `job_key, cron_or_time, timezone, enabled`. Seeds: `morning_briefing 08:00`, `fp_insights 05:00`, `health_check */15m`, `checkins`, `summarize`.
- `elara_briefing_config` — included sections (jsonb), `ai_summary_enabled`, `timezone`. One active row.
- `elara_alert_rules` — `rule_key, enabled, threshold (jsonb), severity, sms_enabled, destination_id`.
- `elara_notify_destinations` — **channel-typed** routing: `id, kind ('slack'|'sms'|'email'…), target (channel id / number / address), label`. **Slack implemented now**, but the `kind` column means email/SMS/other can slot in later without a rewrite.
- `elara_notify_routes` — `notification_type → destination_id`.
- `elara_recipients` — briefing recipients + critical-SMS numbers.
- `elara_custom_jobs` — `name, schedule, prompt/action, enabled` for user-defined Elara tasks.
- `elara_quiet_hours` — window + which severities are exempt.

`scheduler.ts`, the briefing builder, `notifications/slack.ts`, and `lib/alert-state.ts` read these (with env/constant fallback). Backend-endpoints-first: each control = a secured Overseer endpoint that both the panel and (optionally) an Elara tool call.

---

## 6. Settings / Admin (ties to P0a)

- **Named accounts &amp; roles** — `overseer_admins`, owner/admin/read-only, add/suspend/reset (owner-gated). UI per `OVERSEER-P0b` Admins tab, restyled to light.
- **Audit log** — `overseer_audit` viewer; **Activity** is the business-event twin on Home.
- **Integrations** — status + config for Slack, Gmail, Calendar, Twilio, Resend, Stripe, Railway, Sentry, Netlify (read-only health now; deeper config later).
- **Role-aware UI** — read-only hides mutate actions; backend still enforces (client gate is convenience only).

---

## 7. Stack/plumbing (panel)

Per `OVERSEER-P0b`: react-router (deep links per route), TanStack Query (server-state/caching), shared `<ConfirmDialog>` + toast. The redesign supersedes P0b's *styling* (light theme, new nav) but reuses its plumbing + Admins/Activity tabs.

---

## 8. Proposed build sequence (one piece at a time)

1. **Theme + shell** — swap to the light ForgePilot palette, new sidebar/IA scaffold, router + query + confirm/toast, restyled login. (Visual foundation; no behavior change to tabs yet.)
2. **Auth backend (P0a)** + Settings (named accounts/roles/audit) + Activity feed + `#cf-activity`. (Named accounts for you + Matt; the substrate for hiring.)
3. **Home dashboard** (metrics + activity + pipeline snapshot).
4. **Elara Controls** + the config tables (briefings, jobs, alerts, routing, + the four extras).
5. **Customers consolidation** (product filter) + **CRM** build-out.
6. **Enterprise + Financials** (Enterprise leans on the EA-track backend).

Each step: backend endpoints first, then panel, then Elara tool where it fits. Everything privileged is backend-only + audited.

---

## Open/decided

- ✅ Light theme = ForgePilot palette exactly. ✅ Function-based IA. ✅ Land on Home. ✅ Customers + product-filter. ✅ Elara Controls with send-now/preview, recipients/SMS, custom jobs, quiet hours. ✅ Slack-first routing, channel-typed schema for later.
- To decide at build time: exact Home metric definitions/sources; CRM field model (folds into the broader CRM phase); whether a dark toggle is worth keeping.
