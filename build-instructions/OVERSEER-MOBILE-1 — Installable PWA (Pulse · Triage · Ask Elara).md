# OVERSEER MOBILE-1 — installable PWA companion (Pulse · Triage · Ask Elara)

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Branch:** off `main` — e.g. `feat/mobile-pwa`.
**Type:** A phone-first **PWA** companion to Overseer for on-the-go triage + key stats. **Same codebase, same API, same auth** — not a separate app, not a separate deploy. Just for Clutch/Matt for now (rides existing Overseer logins; no public access). Backend touch is minimal (one small triage endpoint). No DB.

## Vision / scope (decided with Clutch)

This is **not** the desktop panel shrunk down — it's a lean, purpose-built mobile shell answering "what needs me right now?" Three tabs:
1. **Pulse** — glanceable business + system stats.
2. **Triage** — what's red right now, with the ability to act.
3. **Ask Elara** — the mobile centerpiece: chat that reads CRM+ops and proposes actions you approve from your phone.

**v1 explicitly EXCLUDES** (stays desktop, or is v2): Quo texting, CRM tables/detail, Financials deep views, Cap table, Customers admin, SuperAdmin. **Push notifications: NOT in v1** — alerts already hit Slack (which has its own push). (Quo texting + native/web push are the documented v2.)

## ⛔ Guardrails
1. **Reuse, don't fork.** Same `api.ts`, same auth/session (the 24h session + trusted-device from #13 means mobile won't nag for logins; cookies work in an installed PWA). Same light theme tokens. Reuse existing data hooks/endpoints wherever they exist.
2. **Desktop is untouched.** The mobile shell renders only on small screens / installed standalone mode; the existing desktop panel layout stays exactly as-is.
3. **Same role gating** as the panel (owner/admin). No new permission keys; permission-gated data stays gated (e.g. a read-only user sees only what they can see).
4. Additive; don't regress the visual layer (logo, hero, bubble) or auth.

## Step 1 — PWA plumbing
- Add **`vite-plugin-pwa`** (manifest + service worker, auto-update). 
- **Manifest:** `name: "Overseer"`, `short_name: "Overseer"`, `display: "standalone"`, `orientation: "portrait"`, `theme_color: #C0302A`, `background_color: #F4F5F7`, icons 192/512 (+ maskable) from the **Overseer logo** (`overseer-logo` / the favicon set already produced). 
- **Service worker:** precache the app shell; **network-first for `/api/*`** (data must be fresh — never serve stale stats from cache). Offline fallback = a simple "you're offline" screen, not stale numbers.
- Installable to home screen on iOS + Android from the same URL.

## Step 2 — Mobile shell (`panel/src/mobile/`)
- A `MobileShell` that activates when viewport is small (≤ ~768px) **or** `display-mode: standalone`. Desktop renders the existing layout unchanged.
- **Bottom tab bar** (thumb-reachable): **Pulse · Triage · Elara** (3 icons + labels), Overseer crimson accent for active. Routes e.g. `/m/pulse`, `/m/triage`, `/m/elara` (or a mobile layout switch — your call, but keep desktop routes intact).
- Mobile-friendly **login** reuse (same `/login`, trusted-device applies → first TOTP then 3-day password-only on that phone). Big tap targets, no horizontal scroll.
- Light theme, large touch targets, pull-to-refresh on data screens.

## Step 3 — Pulse tab (stats, read-only)
Glanceable cards (reuse existing endpoints — `home`/`financials`/`status`/`stripe`/`sentry` data the panel + briefing already compute; don't invent new metrics):
- **MRR / ARR**, **active subs** (+/- this month), **failed payments (open)**.
- **New signups** today / this month.
- **System status** — frontend / API / Supabase up·down·degraded (from the uptime/health data).
- **New Sentry errors** (24h) + **unresolved** count.
- **Open leads** count.
Big numbers, tap a card → minimal detail. Pull-to-refresh. (These mirror the Home/Financials/System screens — reuse those queries.)

## Step 4 — Triage tab (act on what's red)
- A single **"what needs attention now" feed**: down services, payment failures, new Sentry issues, silent shops, DMARC failures, anything the health-check/briefing already flags.
- **Backend:** the scheduler currently computes alerts and pushes to Slack but there's no GET feed. Add a small **`GET /api/mobile/triage`** (owner/admin) that returns the current red/amber items by running the same lightweight checks (uptime + railway + recent Sentry + open payment failures + silent shops) OR reads the latest stored `agent_briefings` + live health — return a normalized list `{severity, title, detail, source, actionUrl?}`. Fail-safe (never 500; partial results OK).
- Each item: tap → detail + actions: **"Ask Elara about this"** (deep-link into the Elara tab pre-filled) and, where relevant, a link out (Sentry/Stripe/Railway). Show the latest **morning briefing** at the top as a summary card.

## Step 5 — Ask Elara tab (the centerpiece)
- Full-screen mobile chat on **`POST /api/elara/chat`** (already built), with the **proposal/approval cards** (Approve / Edit / Cancel) so risky actions can be approved from the phone — same safety model as desktop.
- Elara's boss-lady avatar; suggested prompts tuned for mobile triage ("What needs me today?", "Anything broken?", "Summarize this morning's briefing", "Who haven't we followed up with?").
- Deep-link target for Triage's "Ask Elara about this" (opens with the item as context via `pageContext`).

## Verify
1. Installs to a phone home screen (iOS + Android) from the Overseer URL; opens standalone with the Overseer icon + crimson theme.
2. On a phone, you get the 3-tab mobile shell; on desktop, the normal panel is unchanged.
3. Pulse shows live MRR/subs/signups/system/errors/leads (fresh from API, pull-to-refresh works); Triage lists current red items + the latest briefing; Elara chat works incl. approving a proposed action from the phone.
4. Login uses trusted-device (no TOTP nag within 3 days on that phone). Role gating respected. Offline shows a clean fallback, never stale numbers.
5. `npm run build` clean; desktop visual layer (logo/hero/bubble) intact.

## Hand-off (PM — Clutch)
- **No DB.** No new env. One small backend endpoint (`/api/mobile/triage`). Reuses existing icons/auth.
- After deploy: open the Overseer URL on your phone → "Add to Home Screen" → you've got the app.
- **v2 backlog (documented, not built):** Quo texting from mobile, native/web **push** notifications, optional Expo native wrapper if you later want Face ID + richer push.
