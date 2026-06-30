-- ============================================================
-- OVERSEER SUPERADMIN-2 — org-side session revocation [REFERENCE]
-- Per "OVERSEER-SUPERADMIN-2 — Consolidate owner controls + sign-out-everywhere".
-- PM applies via Supabase MCP on ElaraAssist (ELARA project).
--
-- session_version is stamped into the session JWT as `sv`; requireAuth rejects
-- a token whose sv != the admin's current value. Bumping it (SuperAdmin →
-- Sessions & Devices "Sign out everywhere" / "Sign out all users") instantly
-- invalidates active 24h sessions. Pairs with trusted_device_version (#13),
-- which the same controls bump to force TOTP again.
--
-- Rollout-safe: tokens minted before this column have sv undefined → treated as
-- 0, so existing sessions stay valid until the first real bump.
-- ============================================================

alter table overseer_admins
  add column if not exists session_version integer not null default 0;
