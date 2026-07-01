# OVERSEER CRM-P4a — collapse CRM nav to one entry + real timestamps

**Repo:** `CrimsonForge-Overseer` → `panel/`. **Type:** small IA + display polish. No backend, no DB. Quick win.

## Why
1. **Double navigation.** The sidebar has a **CRM group** with `Leads / Pipeline / Companies` (`panel/src/pages/Panel.tsx`), but the CRM page (`CrmLayout`) has its own tab bar with `Leads / Pipeline / Companies / Table / Phone / Inboxes`. The sidebar duplicates a *subset* of the tabs and hides Table/Phone/Inboxes — inconsistent, and the source of the "not laid out right" feel.
2. **Activities show only relative time.** `CompanyDetail.tsx` (~L181) renders `formatDistanceToNow(created_at)` ("2 days ago") but no actual date/time. Clutch wants the real timestamp.

## Change 1 — one "CRM" sidebar entry
- In `Panel.tsx`, replace the CRM group's three leaves (`/crm/leads`, `/crm/pipeline`, `/crm/companies`) with a **single** leaf: `{ to: '/crm', label: 'CRM', glyph: '◇' }`. Keep the `CRM` section header.
- Show it if the user can view **any** CRM area (any of `crm.leads` / `crm.pipeline` / `crm.companies` / `crm.phone`). `/crm` already redirects to the first allowed tab, and `CrmLayout`'s tab bar owns all sub-navigation (Leads/Pipeline/Companies/Table/Phone/Inboxes) — so nothing is lost, the tabs just become the single source of CRM sub-nav.
- (Leave the ELARA, Customers, Platform, Settings, SuperAdmin groups as they are.)

## Change 2 — absolute date + time on activities
- Wherever an activity/message renders its time, show the **absolute timestamp** — e.g. `Jul 1, 2026 · 9:14 AM` (`date-fns` `format(new Date(a.created_at), 'MMM d, yyyy · h:mm a')`). Keep the relative "2 days ago" as a secondary/hint or a `title=` tooltip if you like, but the real date/time must be visible.
  - Apply in `CompanyDetail.tsx` timeline (~L181), the new **ContactDetail** timeline (P4b), and any Phone/Inbox message list that shows only relative/no time.
- `crm_activities` uses **`created_at`** (there is no `occurred_at`) — use `created_at`.

## Verify
1. Sidebar shows a single **CRM** entry; clicking lands on the CRM page and every sub-area (Leads/Pipeline/Companies/Table/Phone/Inboxes) is reachable via the in-page tabs. No hidden areas, no duplicate nav.
2. Every logged email/call/note shows an explicit date + time, not just "2 days ago".
3. Permission-gated users still only see the tabs they're allowed (CrmLayout already handles this). `npm run build` clean.
