# OVERSEER STEP 5a — Customers consolidation (product-filtered view)

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Branch:** continue `feat/overseer-2-theme-shell` (or `feat/overseer-2-customers`).
**Files:** new `panel/src/tabs/CustomersTab.tsx` (shell); edit `panel/src/App.tsx` + the sidebar nav; reuse the existing product tab components as sub-views. **No backend changes** (the `cfp.*` / `fp.*` routes already serve every sub-view).
**Type:** Panel reorg — collapse the per-product tabs into one **Customers** area with a product filter, per the redesign spec §3/§4. Low-risk: it re-mounts existing, working components under a new shell; it does not touch data fetching or the backend.
**Priority:** Medium (foundation for the IA; precedes/parallels the CRM in 5b).

## Why

Today the sidebar carries product-grouped tabs with Billing/Messages/Feedback **duplicated** across CrimsonForge Pro and ForgePilot (and ForgePulse as a lone waitlist). The redesign organizes by function: a single **Customers** section where **product is a filter**, not three separate trees. This consolidates ~10 tabs into one area and stops the duplication from multiplying as products grow.

## ⛔ GUARDRAILS

1. **Reuse, don't rewrite.** Mount the existing tab components (`ShopsTab`, `UsersTab`, `BillingTab`, `MessagesTab`, `FeedbackTab`, `ForgePilotTab`, `ForgePilotBillingTab`, `ForgePilotMessagesTab`, `ForgePilotFeedbackTab`, `ForgePulseTab`) as-is inside the new shell. This is a navigation/layout change, not a data change. Keep their `role` props and behavior.
2. **No backend edits.** Every sub-view already has its route (`cfp.*` for CrimsonForge Pro, `fp.*` for ForgePilot, `cfp.forgePulseWaitlist` / `cfp.forgePilotWaitlist` for waitlists). Don't add or merge endpoints.
3. **Light theme + router/query conventions** from steps 1–3 (NavLink active states, `var(--accent)` etc.). No regressions to the existing tabs' internals.
4. **Don't move Forge AI or Leads here.** `AIConfigTab` (Forge AI) stays under **Elara**; **Leads** belongs to **CRM** (step 5b). Customers = operational customer data only.

## What to build

A `CustomersTab` shell with two levels of switching:

- **Product switcher** (top): `CrimsonForge Pro` · `ForgePilot` · `ForgePulse`. Persist the last choice (localStorage) so it survives reloads.
- **Sub-nav** (adapts per product, since they aren't symmetric):
  - **CrimsonForge Pro** → Shops & users · Billing · Messages · Feedback  → `ShopsTab` / `UsersTab` / `BillingTab` / `MessagesTab` / `FeedbackTab`.
  - **ForgePilot** → Shops & users · Billing · Sessions · Messages · Feedback · Invites · Insights → `ForgePilotTab` (overview/shops+users), `ForgePilotBillingTab`, (sessions/insights live in `ForgePilotTab` today — keep wherever they currently render), `ForgePilotMessagesTab`, `ForgePilotFeedbackTab`, plus the existing invites UI. Keep the current component boundaries; just group them under the ForgePilot sub-nav.
  - **ForgePulse** → Waitlist → `ForgePulseTab`.
- Default product = ForgePilot (the launch priority, matching today's landing emphasis), default sub-view = the first in its list.

## Routing (react-router)

- Route `/customers` → `CustomersTab`, with nested `/customers/:product/:view` (e.g. `/customers/forgepilot/billing`) so deep links and back/forward work. Reading `:product`/`:view` drives the switchers; unknown values fall back to defaults.
- Replace the old top-level routes (`/shops`, `/users`, `/billing`, `/messages`, `/feedback`, `/forgepilot`, `/fp-billing`, `/fp-messages`, `/fp-feedback`, `/forgepulse`) — either remove them or redirect to the matching `/customers/...` path so any saved links don't 404.
- Sidebar: one **Customers** entry under the Customers section (replacing the per-product groups). Keep Home, Elara, CRM (5b), Platform (System/Enterprise/Financials), Settings per the spec.

## Verify

1. Panel builds; `/customers` renders with the product switcher; each product shows its correct sub-nav and each sub-view renders the same data it did as a standalone tab.
2. Deep link `/customers/crimsonforge-pro/feedback` (or your slug) lands directly on that view; back/forward navigate sub-views; last product persists across reload.
3. Old paths (`/shops`, `/fp-billing`, …) redirect (or are gone) with no 404s.
4. Read-only role: the sub-views keep their existing read-only behavior (no new mutations introduced here).
5. Forge AI is still under Elara; Leads is untouched (still its own tab until 5b moves it to CRM).

## Notes for 5b

Leads (`contact_requests`) stays where it is until **5b** folds it into the CRM as the inbound funnel. Don't delete `LeadsTab` here.
