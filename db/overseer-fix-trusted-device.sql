-- ============================================================
-- OVERSEER FIX — Trusted-device cadence (2FA every 3 days) [REFERENCE]
-- Per "OVERSEER-FIX — Session 24h + 2FA trusted-device (3 days)".
-- PM applies via Supabase MCP on ElaraAssist (ELARA project).
--
-- trusted_device_version is the kill-switch: bumping it invalidates every
-- cf_trusted cookie for that admin at once (forcing TOTP again). The backend
-- bumps it on any 2FA re-enroll/disable, password change/reset, owner reset-2FA,
-- and the "Forget trusted devices" button. Rollout-safe: the code treats a
-- missing column as version 0, so login keeps working until this is applied.
-- ============================================================

alter table overseer_admins
  add column if not exists trusted_device_version integer not null default 0;
