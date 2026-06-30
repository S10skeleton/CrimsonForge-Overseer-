# OVERSEER TWEAK — remove the redundant ForgePulse item from the Platform nav

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Type:** tiny nav cleanup. No backend, no DB.

## Why

The sidebar **Platform** group has a standalone **ForgePulse** item (`panel/src/pages/Panel.tsx`, the `platform` section: `{ to: '/forgepulse', label: 'ForgePulse', glyph: '◎', permKey: 'customers' }`). But ForgePulse is a **customer product**, not platform infrastructure — and it's already reachable inside the **Customers** area (`CustomersTab` includes a `forgepulse` product → `/customers/forgepulse`, Waitlist). So the Platform item is a redundant shortcut that lands on the Customers view. Platform should stay infra-only (Enterprise / Financials / System).

## Change

1. **`panel/src/pages/Panel.tsx`** — delete the `ForgePulse` leaf from the `platform` section's `items` array. Leave Enterprise, Financials, System as-is. (ForgePulse remains available under **Customers → ForgePulse**.)
2. **`panel/src/App.tsx`** — the old `/forgepulse` route should not 404 for bookmarks: change it to a redirect — `<Route path="/forgepulse" element={<Navigate to="/customers/forgepulse" replace />} />`. (If a `/forgepulse` standalone route/component existed only for this nav item and is now unused, the redirect replaces it.)

## Verify

1. Platform group shows only Enterprise, Financials, System — no ForgePulse.
2. ForgePulse is still reachable via Customers → ForgePulse (Waitlist).
3. Visiting `/forgepulse` directly redirects to `/customers/forgepulse` (no dead link).
4. `npm run build` clean.
