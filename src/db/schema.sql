-- ============================================================
-- ELARA MEMORY SCHEMA
-- Run this in your Supabase SQL editor once.
-- These tables persist Elara's learning and context.
-- ============================================================

-- ── agent_memory ─────────────────────────────────────────────
-- Key/value facts Elara learns over time
-- Examples: communication preferences, work patterns, decisions

CREATE TABLE IF NOT EXISTS agent_memory (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'general',
  -- Categories: communication, health, work_pattern, stakeholder,
  --             project_decision, preference, observation
  confidence   FLOAT DEFAULT 1.0,
  learned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_category ON agent_memory(category);
CREATE INDEX IF NOT EXISTS idx_memory_last_used ON agent_memory(last_used DESC);

-- ── agent_parking_lot ─────────────────────────────────────────
-- Deferred ideas, tasks, and questions — nothing gets lost

CREATE TABLE IF NOT EXISTS agent_parking_lot (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item           TEXT NOT NULL,
  context        TEXT DEFAULT '',
  phase_relevant TEXT DEFAULT 'general',
  -- Values: week8, phase_a, phase_b, phase_c, phase_d, investor, general
  priority       TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status         TEXT DEFAULT 'parked' CHECK (status IN ('parked', 'resolved', 'snoozed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  snoozed_until  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_parking_status ON agent_parking_lot(status);
CREATE INDEX IF NOT EXISTS idx_parking_phase ON agent_parking_lot(phase_relevant);
CREATE INDEX IF NOT EXISTS idx_parking_priority ON agent_parking_lot(priority);

-- ── agent_doc_debt ────────────────────────────────────────────
-- Tracks features that shipped but whose docs haven't been updated

CREATE TABLE IF NOT EXISTS agent_doc_debt (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature         TEXT NOT NULL,
  docs_to_update  TEXT[] NOT NULL DEFAULT '{}',
  shipped_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved        BOOLEAN DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  draft_doc_url   TEXT  -- link to Elara's draft if she created one
);

CREATE INDEX IF NOT EXISTS idx_doc_debt_resolved ON agent_doc_debt(resolved);
CREATE INDEX IF NOT EXISTS idx_doc_debt_shipped ON agent_doc_debt(shipped_at DESC);

-- ── agent_session_flags ───────────────────────────────────────
-- Short-lived context flags that carry forward between sessions
-- Examples: "shoulder injury — skip workout reminders this week"

CREATE TABLE IF NOT EXISTS agent_session_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag        TEXT NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ  -- null = until manually cleared
);

CREATE INDEX IF NOT EXISTS idx_flags_active ON agent_session_flags(active);

-- ── Helper view: active parking lot by phase ──────────────────

CREATE OR REPLACE VIEW parking_lot_by_phase AS
SELECT
  phase_relevant,
  priority,
  item,
  context,
  created_at
FROM agent_parking_lot
WHERE status = 'parked'
ORDER BY
  CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
  created_at DESC;

-- ── Helper view: unresolved doc debt ─────────────────────────

CREATE OR REPLACE VIEW open_doc_debt AS
SELECT
  id,
  feature,
  docs_to_update,
  shipped_at,
  EXTRACT(DAY FROM now() - shipped_at)::INT AS days_pending
FROM agent_doc_debt
WHERE resolved = false
ORDER BY shipped_at DESC;
