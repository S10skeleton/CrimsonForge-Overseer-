# OVERSEER STEP 6a — Financials (revenue, burn, runway, raise & cap table)

**Repo:** `CrimsonForge-Overseer`. **Branch:** continue the Overseer 2.0 branch (or `feat/overseer-2-financials`).
**Files:** new `src/api/routes/financials.ts` (mount `/api/financials`), new `src/jobs/mrr-snapshot.ts` + a `mrr_snapshot` built-in schedule, edits to `src/scheduler.ts` (register it) + `src/lib/elaraConfig.ts` (add the built-in default), new `panel/src/tabs/FinancialsTab.tsx`, edits to `panel/src/api.ts` + the Financials nav route, add a charts lib. DB tables + cap-table seed applied by the PM (me) via Supabase MCP on **ElaraAssist**.
**Type:** Step 6a of the Overseer 2.0 build — the financial tracker (redesign spec §4/§4-Phase-4). Independent of the Enterprise half (6b), which is gated on the ForgePilot EA-track backend.
**Priority:** High — the numbers you're asked for constantly (MRR/ARR, runway, raise).

## Why

Revenue is computed live from Stripe (`/api/fp/billing` → MRR, active subs, new/cancelled this month, plan breakdown, payment failures), but it's only ever "right now" — **no history is stored**, so there's no real trend (Home currently shows net subscriber movement as a stand-in). There's also no place for burn/runway or the raise/cap table. This adds: a Financials surface over the existing revenue data, **MRR snapshots** so trends become real, manual burn/runway tracking, and a raise/cap-table view wired to the CRM fundraising deals.

## ⛔ GUARDRAILS

1. **Reuse the live revenue logic; don't duplicate Stripe plumbing.** Pull MRR/subs/failures from the existing `/api/fp/billing` (and `cfp` billing) paths or their underlying functions. Combined/per-product revenue = compose those, don't re-implement Stripe queries.
2. **New tables in the Overseer DB (ElaraAssist `ELARA_SUPABASE_*`)** only — `financial_mrr_snapshots`, `financial_entries`, `cap_table_entries`. PM applies DDL; Claude Code reads/writes rows via `overseerDb`.
3. **MRR snapshot job is additive + fail-safe** and registers through the step-4 schedule system (`elara_schedules` + `reloadSchedules()`), not a new hardcoded cron. A snapshot failure must never crash the scheduler.
4. **Backend-only, role-gated, audited.** `/api/financials` reads = `requireAdmin`; manual-entry writes = `requireAdmin`; deletes = `requireOwner`. Mutations `audit()`ed (`financial.entry_*`, `cap_table.*`). Stripe secret stays backend-only.
5. **Light theme + query conventions** from steps 1–5.

## Step 0 — Database (PM applies via Supabase MCP on ElaraAssist; reference DDL)

```sql
-- Point-in-time MRR/subscriber snapshots (enables real trends; backfill impossible — starts now)
create table if not exists financial_mrr_snapshots (
  id           bigint generated always as identity primary key,
  snapshot_date date not null,
  product      text not null default 'forgepilot',  -- 'forgepilot' | 'crimsonforge_pro' | 'all'
  mrr          numeric not null default 0,
  arr          numeric not null default 0,
  active_subs  int not null default 0,
  new_subs     int not null default 0,
  churned_subs int not null default 0,
  created_at   timestamptz not null default now(),
  unique (snapshot_date, product)
);
create index if not exists idx_mrr_snap_date on financial_mrr_snapshots(snapshot_date desc);

-- Manual financial entries (burn/expenses/income/cash balance) — CSV import optional
create table if not exists financial_entries (
  id         uuid primary key default gen_random_uuid(),
  month      date not null,                 -- first of month
  type       text not null check (type in ('expense','income','cash_balance')),
  category   text,                          -- e.g. 'payroll','infra','saas','legal','misc'
  label      text,
  amount     numeric not null,
  notes      text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_fin_entries_month on financial_entries(month desc);

-- Cap table (lightweight)
create table if not exists cap_table_entries (
  id         uuid primary key default gen_random_uuid(),
  holder     text not null,
  type       text not null default 'common' check (type in ('common','preferred','option','safe','note')),
  shares     numeric,
  pct        numeric,
  issued     boolean not null default true,  -- false = planned/reserved, not issued
  notes      text,
  updated_at timestamptz not null default now()
);
```

**Cap-table seed (PM applies, from current cap table):** Shane Beaman — common, `9,000,000` shares, `100%`, issued. Matt — planned (issued=false, note "planned, not issued"). Quick Tech — planned (issued=false). The $750K pre-A SAFE @ $5M cap is tracked as raise progress via CRM deals (below), not as issued equity.

## Step 1 — MRR snapshot job (`src/jobs/mrr-snapshot.ts` + scheduler)

- `runMrrSnapshot()`: read today's MRR/subs (FP + CFP + combined) from the existing billing logic; upsert one `financial_mrr_snapshots` row per product for `snapshot_date = today` (unique on date+product, so re-runs overwrite). Fail-safe (log + return on error).
- Register as a **built-in schedule**: add `mrr_snapshot` to `defaultSchedules()` in `elaraConfig.ts` (default cron `55 23 * * *` — end of day, process timezone) and map `job_key 'mrr_snapshot' → runMrrSnapshot` in `scheduler.ts`'s job map so it shows up in Elara Controls › Scheduled jobs and reloads with the rest. PM adds the seed row to `elara_schedules` (or it falls back to the default).

## Step 2 — API (`src/api/routes/financials.ts`, mount `/api/financials`)

All `requireAdmin` (deletes `requireOwner`), `{ data }`/`{ data, meta }` envelope, audited:

- `GET /api/financials/revenue` — current MRR, ARR (= MRR×12), active subs, new/churned this month, plan breakdown, payment failures — composed from FP + CFP billing (per-product + combined). (Read-through to the existing logic.)
- `GET /api/financials/mrr-history?months=12` — series from `financial_mrr_snapshots` for the trend chart.
- `GET|POST|PATCH|DELETE /api/financials/entries` — manual burn/expense/income/cash entries (filter `?type`, `?from`/`?to`).
- `GET /api/financials/runway` — compute: latest `cash_balance` entry ÷ trailing avg net monthly burn (expenses − income over last N months); return `{ cashOnHand, avgMonthlyBurn, runwayMonths }`. Degrade gracefully (nulls) when no entries exist.
- `GET /api/financials/raise` — raise progress from CRM fundraising deals: total committed (sum of open/won `pipeline='fundraising'` deal amounts), by stage; surfaces Carnopoly etc. (read `crm_deals`).
- `GET|POST|PATCH|DELETE /api/financials/cap-table` — `cap_table_entries`.

## Step 3 — Panel (`panel/src/tabs/FinancialsTab.tsx`, route `/financials`)

Add a charts lib — **Recharts** (`npm i recharts`; React-friendly, declarative). If it fights the React 19 peer dep, fall back to `chart.js` + `react-chartjs-2`. Match light tokens (`var(--accent)` crimson lines/bars, `var(--border)` grids).

Sections (TanStack Query per source, each loads/degrades independently):

1. **Revenue** — metric cards (MRR, ARR, active subs, new/churned, failed payments $) + an **MRR trend line chart** (from `mrr-history`; show "collecting data — trend starts now" empty state until snapshots accumulate) + plan/product breakdown (bar or split cards).
2. **Burn & runway** — runway headline ("X months of cash"), cash-on-hand, avg monthly burn; a table of manual `entries` with add/edit/delete (month, type, category, label, amount) + optional CSV paste-import. `<ConfirmDialog>` on delete.
3. **Raise & cap table** — raise progress (committed vs $750K target, by stage, pulling Carnopoly/etc. from the CRM) + a cap-table table (holder, type, shares, %, issued/planned badge) with add/edit (owner-gated).

Add `api.financials.*` to `panel/src/api.ts`; add the Financials nav entry (Platform section).

## Verify

1. Backend builds; `/api/financials/revenue` matches today's `/api/fp/billing` numbers; read-only role gets 403 on writes.
2. `mrr_snapshot` appears in Elara Controls › Scheduled jobs (enable/disable/cron editable) and writes one row per product per day; re-running the same day overwrites (no dupes).
3. MRR trend chart renders from snapshots (empty-state until ≥2 days exist); ARR = MRR×12.
4. Add expense + cash_balance entries → runway computes (cash ÷ avg burn) and updates; deleting an entry confirms + recomputes.
5. Raise section reflects the CRM fundraising deals (Carnopoly $750K @ diligence shows as committed/in-progress; Babb closed_lost excluded from "committed"); cap table shows Shane 9M/100% issued + planned rows.
6. All mutations write `overseer_audit` rows.

## Hand-off for the PM (Clutch)

- I apply Step 0 tables + the cap-table seed via MCP once the code's in.
- After ~a month of snapshots, the Home dashboard's MRR card can switch from "net subscriber movement" to a real month-over-month trend (small follow-up to HomeTab).

## Note on 6b (Enterprise)

6b (the enterprise-account console: orgs, seats, API keys, usage) needs the **ForgePilot EA-track backend** — `FP-EA0` (org model + entitlement resolver, already written, in this folder) and `FP-EA1` (provisioning API). Those target the **ForgePilot** repo. Hand `FP-EA0` to that repo when ready; I'll write `FP-EA1` next so the Overseer enterprise console (6b) has real org/key/usage data to govern.
