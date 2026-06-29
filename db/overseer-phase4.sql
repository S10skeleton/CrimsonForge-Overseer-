-- ============================================================
-- OVERSEER 2.0 — STEP 4 (Elara Controls config tables)  [REFERENCE]
-- Authoritative schema per build-instructions/OVERSEER-STEP4.
-- The PM applies these tables + seeds via the Supabase MCP on ElaraAssist
-- (ELARA_SUPABASE_*). Claude Code reads/writes ROWS via overseerDb — never DDL.
--
-- Seeds (PM applies = today's behavior):
--   elara_schedules: morning_briefing '0 8 * * *', fp_insights '0 5 * * *',
--     health_check '*/15 * * * *', checkins_summarize '* * * * *' (all enabled)
--   elara_briefing_config(id=1): all sections true, ai_summary true
--   elara_notify_destinations: slack default(webhook), #cf-activity, #forgepilot-ops, sms clutch
--   elara_notify_routes: briefing→default, health_alert→default, fp_alert→#forgepilot-ops,
--     activity→#cf-activity, new_subscriber→default
--   elara_alert_rules: the 8 rules at current severities/thresholds
--   elara_recipients: sms = CLUTCH_PHONE_NUMBER
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists elara_schedules (
  job_key    text primary key,              -- 'morning_briefing','fp_insights','health_check','checkins_summarize'
  label      text not null,
  cron       text not null,                 -- node-cron expr
  timezone   text,                          -- null → process TIMEZONE
  enabled    boolean not null default true,
  is_custom  boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists elara_briefing_config (
  id         int primary key default 1 check (id = 1),
  sections   jsonb not null default '{}',   -- { system_health, sentry, stripe_revenue, payment_failures, new_signups, feedback, gmail, calendar, forgepilot }
  ai_summary boolean not null default true,
  timezone   text,
  updated_at timestamptz not null default now()
);

create table if not exists elara_notify_destinations (
  id      uuid primary key default gen_random_uuid(),
  kind    text not null check (kind in ('slack','sms','email')),
  label   text not null,
  target  text not null,                    -- slack channel id | phone | email | 'webhook'
  enabled boolean not null default true
);

create table if not exists elara_notify_routes (
  notification_type text primary key,       -- 'briefing','health_alert','fp_alert','activity','new_subscriber',...
  destination_id    uuid references elara_notify_destinations(id)
);

create table if not exists elara_alert_rules (
  rule_key       text primary key,          -- 'service_down','payment_failure','sms_failure','email_bounce','new_subscriber','new_shop','forgepulse_signup','sentry_new'
  label          text not null,
  enabled        boolean not null default true,
  severity       text not null default 'warning' check (severity in ('info','warning','critical')),
  sms_enabled    boolean not null default false,
  threshold      jsonb,                     -- e.g. {"rate":0.05}; null = no numeric threshold
  destination_id uuid references elara_notify_destinations(id),  -- null → route by notification_type
  updated_at     timestamptz not null default now()
);

create table if not exists elara_recipients (
  id      uuid primary key default gen_random_uuid(),
  kind    text not null check (kind in ('briefing','sms')),
  value   text not null,                    -- email or E.164 number
  label   text,
  enabled boolean not null default true
);

create table if not exists elara_custom_jobs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cron        text not null,
  timezone    text,
  action_type text not null check (action_type in ('slack_message','agent_prompt')),
  payload     jsonb not null default '{}',  -- { text } or { prompt, destination_id }
  enabled     boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists elara_quiet_hours (
  id                int primary key default 1 check (id = 1),
  enabled           boolean not null default false,
  start_local       time not null default '21:00',
  end_local         time not null default '07:00',
  timezone          text,
  exempt_severities text[] not null default '{critical}'
);
