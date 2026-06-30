-- ============================================================
-- OVERSEER 2.0 — STEP 8 (Two-factor auth / TOTP) [REFERENCE]
-- Per OVERSEER-STEP8. PM applies via Supabase MCP on ElaraAssist.
-- Also set MFA_ENC_KEY (32-byte random) in the backend env.
-- ============================================================

alter table overseer_admins
  add column if not exists totp_secret    text,                              -- AES-256-GCM encrypted at rest; null until enrolled
  add column if not exists totp_enabled   boolean not null default false,
  add column if not exists recovery_codes text[] not null default '{}';      -- sha256 hashes, consumed on use
