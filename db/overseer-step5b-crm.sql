-- ============================================================
-- OVERSEER 2.0 — STEP 5b (CRM: companies, contacts, deals, activities) [REFERENCE]
-- Per build-instructions/OVERSEER-STEP5b. Applied + seeded by the PM via the
-- Supabase MCP on ElaraAssist (ELARA_SUPABASE_*). Claude Code reads/writes rows
-- via overseerDb — never DDL. CRM lives in the Overseer DB; it links to
-- ForgePilot by stored ids (fp_shop_id / fp_customer_id), never by FK.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists crm_companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  type           text not null default 'prospect'
                   check (type in ('investor','enterprise','partner','customer','prospect','other')),
  status         text not null default 'active',
  website        text,
  fp_shop_id     uuid,           -- ForgePilot shop when converted (no FK — cross-DB)
  fp_customer_id text,           -- Stripe customer id when applicable
  source_lead_id uuid,           -- contact_requests.id this company came from
  owner          text,           -- overseer username who owns the relationship
  notes          text,
  tags           text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_companies_type on crm_companies(type);

create table if not exists crm_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references crm_companies(id) on delete cascade,
  name        text not null,
  title       text,
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_crm_contacts_company on crm_contacts(company_id);

create table if not exists crm_deals (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references crm_companies(id) on delete cascade,
  name           text not null,
  pipeline       text not null default 'fundraising'
                   check (pipeline in ('fundraising','enterprise','partnership')),
  stage          text not null,
  amount         numeric,
  currency       text not null default 'USD',
  probability    int,
  status         text not null default 'open' check (status in ('open','won','lost')),
  expected_close date,
  owner          text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_deals_pipeline on crm_deals(pipeline, stage);
create index if not exists idx_crm_deals_company on crm_deals(company_id);

create table if not exists crm_activities (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references crm_companies(id) on delete cascade,
  contact_id  uuid references crm_contacts(id) on delete set null,
  deal_id     uuid references crm_deals(id) on delete set null,
  type        text not null default 'note' check (type in ('call','email','meeting','note','task')),
  subject     text,
  body        text,
  due_at      timestamptz,     -- for type='task'
  done        boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_crm_activities_company on crm_activities(company_id, created_at desc);
