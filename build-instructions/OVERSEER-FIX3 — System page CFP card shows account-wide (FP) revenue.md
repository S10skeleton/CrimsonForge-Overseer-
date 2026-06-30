# OVERSEER FIX3 — System page: CrimsonForge Pro card shows ForgePilot's revenue

**Repo:** `CrimsonForge-Overseer`. **Type:** Data-accuracy bug. **Branch:** the Overseer 2.0 branch.
**Files:** `src/lib/billing.ts` (add a CFP-scoped count) + the System data source (`src/api/routes/status.ts` or wherever the `stripe` monitor feeds the page) and/or `panel/src/tabs/SystemTab.tsx`.

## Bug

On Platform → System, the **CrimsonForge Pro** card shows `MRR $195 / Active Subs 1` — identical to the ForgePilot card right below it. CFP has **no** subscriptions of its own; those are ForgePilot's.

## Root cause

There's one shared Stripe account. The FP card filters to FP product IDs via `isFPSub` (`lib/billing.ts`), but the CFP card is fed by the generic `tools/stripe.ts` monitor, which lists **all** active subscriptions **unfiltered** (`subscriptions.list({status:'active'})` → MRR over everything). Today the account's only paid subs are FP's, so the "CFP" total == the FP total. The generic monitor is account-wide, not CFP-scoped.

## Fix — scope the CFP card to non-FP subscriptions (mirror how FP is scoped)

1. In `src/lib/billing.ts`, add a `cfpBilling()` (sibling to the FP `billing()`), computing MRR / active subs / new / cancelled / payment-failures over subscriptions where **`!isFPSub(sub)`** (i.e. everything that isn't a ForgePilot product). Same return shape as the FP one.
   - This makes CFP correctly show **$0 / 0** today, and real CFP revenue once CFP has its own paid subscriptions.
   - **Note for later precision:** when CFP gets its own Stripe products, define `CFP_PRODUCT_IDS` and filter to those positively (like FP does) instead of "everything non-FP" — leave a `// TODO: CFP_PRODUCT_IDS once CFP billing exists` seam.
2. Feed the **System page's CFP card** from `cfpBilling()` instead of the generic `stripe` monitor. (The FP card already uses the FP-filtered data; this makes the two symmetric.)
3. **Leave `tools/stripe.ts` as-is** for the morning briefing — it's the account-wide Stripe *health* monitor (payment failures, webhook health) and should stay account-wide. Only the System page's *CFP revenue card* changes its source.

### Minimal alternative (if you prefer a one-liner over a new function)

Both `data.stripe` (account-wide) and `fpStripe` (FP-only) are already available on the System page, so the CFP card can show the difference: `cfpMrr = data.stripe.mrr − fpStripe.mrr`, `cfpSubs = activeSubscriptions − fpActiveSubscriptions`. Correct today (195−195=0, 1−1=0). The `cfpBilling()` approach above is cleaner/more robust; this is the quick version.

## Verify

1. System page: CrimsonForge Pro shows **MRR $0 / Active Subs 0** (its real figures); ForgePilot still shows $195 / 1.
2. The Financials tab (which already uses FP-scoped + per-product logic) is unaffected.
3. The morning briefing's overall Stripe health (payment failures, webhooks) is unchanged.
4. If a real non-FP (CFP) subscription is created in Stripe, it appears on the CFP card and not the FP card.
