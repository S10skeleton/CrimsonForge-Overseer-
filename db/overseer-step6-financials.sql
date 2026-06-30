-- ============================================================
-- OVERSEER 2.0 — STEP 6a + 6c (Financials + Cap table) [REFERENCE]
-- Per OVERSEER-STEP6a / STEP6c. PM applies + seeds via Supabase MCP on
-- ElaraAssist (ELARA_SUPABASE_*). Claude Code reads/writes rows via overseerDb.
--
-- NOTE: 6c SUPERSEDES 6a's lightweight cap_table_entries — that table is NOT
-- created here; use cap_table_securities + cap_table_safes instead. If a prior
-- pass created cap_table_entries, the PM drops it (seed-only, no data lost).
-- ============================================================

create extension if not exists pgcrypto;

-- ── Point-in-time MRR/subscriber snapshots (trends start now; no backfill) ───
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

-- ── Manual financial entries (burn/expenses/income/cash balance) ─────────────
create table if not exists financial_entries (
  id         uuid primary key default gen_random_uuid(),
  month      date not null,                 -- first of month
  type       text not null check (type in ('expense','income','cash_balance')),
  category   text,                          -- 'payroll','infra','saas','legal','misc'
  label      text,
  amount     numeric not null,
  notes      text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_fin_entries_month on financial_entries(month desc);

-- ── Cap table: equity holders (6c) ───────────────────────────────────────────
-- Seed: Shane Beaman (founder, common, 9,000,000, 100%, issued);
--       Matt (employee, option, planned/issued=false); Quick Tech (other, planned).
create table if not exists cap_table_securities (
  id             uuid primary key default gen_random_uuid(),
  holder_name    text not null,
  holder_type    text not null default 'investor'
                   check (holder_type in ('founder','investor','employee','option_pool','other')),
  security_class text not null default 'common'
                   check (security_class in ('common','preferred','option')),
  crm_company_id uuid,            -- link to crm_companies for investor holders (no FK — cross-table)
  shares         numeric,
  pct            numeric,         -- ownership % (issued basis)
  issued         boolean not null default true,   -- false = planned/reserved
  notes          text,
  updated_at     timestamptz not null default now()
);

-- ── Cap table: SAFEs & convertible notes (6c — terms only, no conversion) ────
create table if not exists cap_table_safes (
  id              uuid primary key default gen_random_uuid(),
  investor_name   text not null,
  crm_company_id  uuid,           -- link to the CRM investor company
  instrument_type text not null default 'safe' check (instrument_type in ('safe','convertible_note')),
  amount          numeric not null,
  valuation_cap   numeric,
  discount_pct    numeric,
  mfn             boolean not null default false,
  pro_rata        boolean not null default false,
  date_signed     date,
  status          text not null default 'outstanding'
                    check (status in ('outstanding','converted','cancelled')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_safes_status on cap_table_safes(status);
