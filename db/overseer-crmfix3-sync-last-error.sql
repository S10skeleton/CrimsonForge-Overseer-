-- ============================================================
-- OVERSEER CRM-FIX3 — optional sync error surfacing [REFERENCE]
-- Per "OVERSEER-CRM-FIX3 — Inbox sync last_sync + honest status".
-- PM applies via Supabase MCP on ElaraAssist (ELARA project). OPTIONAL — the
-- code writes last_error best-effort and degrades silently if the column is
-- absent, so the core fix (last_sync always advancing) works without this.
--
-- With this column, the Inboxes row shows a ⚠️ with the last Gmail/Calendar
-- error string (or null on a clean run) so the next issue is self-diagnosing.
-- ============================================================

alter table crm_sync_accounts
  add column if not exists last_error text;
