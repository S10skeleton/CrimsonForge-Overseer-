-- ============================================================
-- OVERSEER 2.0 — PHASE 4 (Elara Controls config tables)
-- Apply in the ELARA Supabase project (same DB as agent_* / overseer_* tables).
-- Idempotent — safe to re-run.
--
-- ADDITIVE + SAFE: tables start EMPTY. The backend computes effective config
-- by merging today's env/constants with any DB override row, so behavior is
-- unchanged until a control is actually saved from the panel.
-- ============================================================

create extension if not exists pgcrypto;

-- ── elara_briefing_config ── single active row: which sections, AI summary, time
create table if not exists elara_briefing_config (
  id                  uuid primary key default gen_random_uuid(),
  sections            jsonb not null default '{}',   -- { sectionKey: boolean }
  ai_summary_enabled  boolean,                        -- null = use default (true)
  time_hour           int,                            -- 0–23; null = use env MORNING_BRIEFING_HOUR
  timezone            text,                           -- null = use env TIMEZONE
  active              boolean not null default true,
  updated_at          timestamptz not null default now()
);

-- ── elara_schedules ── built-in recurring jobs (enable/disable + timing)
create table if not exists elara_schedules (
  job_key      text primary key,         -- 'morning_briefing','fp_insights','health_check','checkins','summarize'
  cron_or_time text,                      -- 'HH:MM' or a cron expression; null = use code default
  timezone     text,
  enabled      boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- ── elara_custom_jobs ── user-defined recurring Elara tasks
create table if not exists elara_custom_jobs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  schedule    text not null,              -- cron expression
  prompt      text,                       -- what Elara should do
  enabled     boolean not null default true,
  last_run_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ── elara_notify_destinations ── channel-typed routing targets
create table if not exists elara_notify_destinations (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'slack' check (kind in ('slack','sms','email')),
  target     text not null,               -- slack channel id / phone number / email
  label      text,
  created_at timestamptz not null default now()
);

-- ── elara_notify_routes ── notification_type → destination
create table if not exists elara_notify_routes (
  notification_type text primary key,     -- 'briefing','health_alert','fp_alert','activity','new_subscriber', ...
  destination_id    uuid references elara_notify_destinations(id) on delete set null,
  updated_at        timestamptz not null default now()
);

-- ── elara_alert_rules ── per-rule enable / threshold / severity / sms / destination
create table if not exists elara_alert_rules (
  rule_key       text primary key,        -- 'service_down','payment_failure','sms_fail_rate','email_bounce_rate', ...
  enabled        boolean not null default true,
  threshold      jsonb,                   -- e.g. { "pct": 5 }
  severity       text,                    -- 'info'|'warning'|'critical'
  sms_enabled    boolean not null default false,
  destination_id uuid references elara_notify_destinations(id) on delete set null,
  updated_at     timestamptz not null default now()
);

-- ── elara_recipients ── briefing recipients + critical-SMS numbers
create table if not exists elara_recipients (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('briefing','sms_critical')),
  value      text not null,               -- email or E.164 number
  label      text,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── elara_quiet_hours ── single row do-not-disturb window
create table if not exists elara_quiet_hours (
  id                uuid primary key default gen_random_uuid(),
  enabled           boolean not null default false,
  start_min         int,                  -- minutes from midnight (local tz)
  end_min           int,
  timezone          text,
  exempt_severities jsonb not null default '["critical"]',  -- always paged through quiet hours
  updated_at        timestamptz not null default now()
);
