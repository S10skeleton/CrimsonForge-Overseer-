-- ============================================================
-- OVERSEER 2.0 — PHASE 0 (named admins, audit, activity events)
-- Apply in the ELARA Supabase project (same DB as agent_* tables).
-- Idempotent — safe to re-run. Claude Code does NOT apply this; the PM runs it
-- in the ELARA Supabase SQL editor.
-- ============================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ── overseer_admins ── named panel operators (replaces shared passcodes)
create table if not exists overseer_admins (
  id                     uuid primary key default gen_random_uuid(),
  username               text not null unique,           -- stored lowercase; login is case-insensitive
  email                  text not null unique,
  password_hash          text not null,                  -- bcrypt
  role                   text not null default 'read_only'
                           check (role in ('owner','admin','read_only')),
  status                 text not null default 'active'
                           check (status in ('active','suspended')),
  must_change_password   boolean not null default false,
  reset_token_hash       text,                           -- sha256 of the emailed reset token
  reset_token_expires_at timestamptz,
  last_login_at          timestamptz,
  created_by             uuid references overseer_admins(id),
  created_at             timestamptz not null default now()
);

-- ── overseer_audit ── who did what, when, to whom (privileged actions)
create table if not exists overseer_audit (
  id             bigint generated always as identity primary key,
  actor_admin_id uuid references overseer_admins(id),
  actor_username text,                    -- denormalized snapshot (survives admin deletion)
  action         text not null,           -- 'auth.login','admin.create','password.reset','fp_user.suspend', ...
  target_type    text,                    -- 'admin','fp_user','api_key','enterprise_org', ...
  target_id      text,
  meta           jsonb not null default '{}',
  ip             text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_overseer_audit_created on overseer_audit(created_at desc);
create index if not exists idx_overseer_audit_actor   on overseer_audit(actor_admin_id);
create index if not exists idx_overseer_audit_action  on overseer_audit(action);

-- ── overseer_events ── business activity stream (feeds #cf-activity)
create table if not exists overseer_events (
  id          bigint generated always as identity primary key,
  type        text not null,             -- 'lead.new','fp.signup','payment.success','payment.failed','api_key.minted','fp_user.suspended','enterprise.changed', ...
  title       text not null,
  body        text,
  severity    text not null default 'info'
                check (severity in ('info','success','warning','critical')),
  channel     text,                       -- slack channel id it routed to (snapshot)
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists idx_overseer_events_created on overseer_events(created_at desc);
create index if not exists idx_overseer_events_type    on overseer_events(type);
