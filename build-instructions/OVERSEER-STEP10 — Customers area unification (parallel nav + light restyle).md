# OVERSEER STEP 10 — Customers area unification (parallel nav + light restyle)

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Type:** UI/UX refactor — make the CrimsonForge Pro and ForgePilot product areas look and navigate identically, in the light theme, keeping every function. **Isolated to the Customers tabs** (no backend/DB/auth/logic changes). Can be done as a fast-follow right after the merge.

## Why

The Customers area is inconsistent in two ways:
1. **Two nav models.** `ForgePilotTab` is a ~624-line mega-tab with its **own internal sub-tabs** (overview/sessions/insights/invites/waitlist), while CrimsonForge Pro is flat (Shops, Users, etc. are separate `CustomersTab` views). FP is a tab-inside-a-tab; CFP isn't.
2. **Old styling.** The Customers tabs never got the light-theme restyle the rest of the app has — they still use `Orbitron` headers, `.grad` gradient text, and the legacy `.kpi`/`.section-label` classes. Home, Financials, CRM, Settings look modern; Customers looks like the old app.

Goal: one nav model + one light layout shell for both products, **same data and actions as today**, just unified and reskinned.

## ⛔ GUARDRAILS

1. **No backend/route/data changes.** Every view keeps its existing fetches (`api.cfp.*`, `api.fp.*`) and actions (including the FP invite modal, message CRUD, feedback status, shop notes, insights day-range, etc.). This is layout + navigation + styling only.
2. **No auth/permission changes.** The whole Customers area stays gated by the `customers` permission (STEP7). Don't introduce new permission keys.
3. **Leave ForgePulse alone.** It's still just a waitlist — keep `ForgePulseTab` as its single `Waitlist` view, untouched (beyond optionally adopting the shared header for consistency — optional, low priority).
4. **Light system only.** Drop `Orbitron`, `.grad`, and the legacy `.kpi`/`.section-label` usage in these tabs; use the shared primitives below (the same look as `HomeTab`/`FinancialsLayout`).

## 1. Shared layout shell + primitives (`panel/src/tabs/customers/`)

Build small shared components the rest of the area composes from (mirror the existing light style in Home/Financials):
- **`CustomerView`** — page shell: a header row (view title + a product chip + an optional right-aligned actions slot) over a content area. One consistent header for every product/view.
- **`MetricCards`** — the Home/Financials metric-card row (label + value, `--surface`/`--border`, no Orbitron). Replaces the `.kpi-grid`/`.kpi` blocks.
- **`DataCard` + table style** — a white card (`12px` radius, `0.5px` border) wrapping a consistent table (light header row, `--text-muted` labels, status badges). Replaces the bespoke `.card`+`<table>` variants.
- Reuse `useToast`/`useConfirm` and TanStack Query as the other tabs do.

## 2. One flat, parallel sub-nav per product (`CustomersTab.tsx`)

Lift FP's internal sub-tabs up so both products use the same `CustomersTab` view bar. Declared views:

- **CrimsonForge Pro:** `Overview · Accounts · Billing · Messages · Feedback`
- **ForgePilot:** `Overview · Accounts · Sessions · Insights · Invites · Billing · Messages · Feedback`
- **ForgePulse:** `Waitlist` (unchanged)

Where a tab exists for one product and not the other, it simply isn't in that product's bar (no nested nav, no empty tabs). Keep the existing URL routing (`/customers/:product/:view`), last-product persistence, and fallbacks.

## 3. View mapping (keep all functions; restyle + relocate)

- **Overview** (both) — a light dashboard header for the product: the key metrics (`MetricCards`) it already computes (CFP: shops/users/MRR/tickets; FP: active subs/MRR/users/scans). Pull these from the existing stats/billing fetches. (CFP gets a new small Overview; FP's overview metrics move here.)
- **Accounts** (both) — the shops directory with their users/seats. Combine today's `ShopsTab` + `UsersTab` (CFP) and the shops/users portion of `ForgePilotTab` (FP) into one directory view (shops table; users/seats shown per shop or as a second section). Same columns/data/actions (shop notes, etc.) — just unified and restyled. *(If a clean single "Accounts" view is too big in one pass, keep Shops and Users as two adjacent tabs for both products — but make them parallel and restyled. Don't leave FP's versions buried in the mega-tab.)*
- **Sessions / Insights / Invites** (FP only) — lift these out of `ForgePilotTab` into their own views, reskinned. Keep the insights day-range control and the invite modal/flow exactly as they work now (`api.fp.invite`, `invites`, etc.).
- **Billing** (both) — restyle `BillingTab` and `ForgePilotBillingTab` to the shared `MetricCards` + `DataCard` table (they're already near-parallel; just drop Orbitron/`.kpi` and run both through the shell). Keep the pre-launch empty states.
- **Messages** (both) — `MessagesTab` / `ForgePilotMessagesTab` restyled into the shell; keep all CRUD + the owner-gated actions.
- **Feedback** (both) — `FeedbackTab` / `ForgePilotFeedbackTab` restyled; keep status updates.

After this, `ForgePilotTab.tsx` is decomposed into the shared views and can be deleted (or reduced to the Overview view).

## Verify

1. Switch between ForgePilot and CrimsonForge Pro: the sub-nav bar, headers, metric cards, and tables are visually identical (only the data differs). No tab-inside-a-tab anywhere.
2. No `Orbitron` / `.grad` / `.kpi` left in the Customers tabs; they match Home/Financials/CRM styling.
3. Every prior function works: shop notes, FP invite (modal → email/link), resend/revoke invite, insights day-range, message create/edit/delete, feedback status, billing tables + pre-launch states.
4. Deep links (`/customers/forgepilot/sessions`, `/customers/crimsonforge-pro/billing`, etc.) resolve; last-product persists; old redirects still work.
5. ForgePulse still shows just the Waitlist, unaffected.
6. Read-only role: Customers views render read-only (no new permission keys; still gated by `customers`).
7. `npm run build` clean.

## Note

Pure front-end; nothing for the PM to apply (no DB). Safe to do right after the merge.
