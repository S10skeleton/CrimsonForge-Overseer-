-- ForgeAssist daily session insights — Phase 1 (storage + analysis)
-- One row per fp_sessions row that has been analyzed by the nightly Haiku job.
-- No verbatim chat content stored here — only scores, tags, and short pattern notes.
-- Lives in the ForgePilot Supabase project (oicgyqhtvmslkotjputx).
-- NOTE: Already applied via MCP — this file is version control only.

CREATE TABLE IF NOT EXISTS public.fp_session_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES public.fp_sessions(id) ON DELETE CASCADE,
  shop_id         UUID REFERENCES public.fp_shops(id) ON DELETE SET NULL,
  analyzed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status          TEXT NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success', 'failed', 'skipped')),

  -- Scores 0-5 (nullable for failed/skipped)
  ai_helpfulness    SMALLINT CHECK (ai_helpfulness IS NULL OR (ai_helpfulness BETWEEN 0 AND 5)),
  ai_specificity    SMALLINT CHECK (ai_specificity IS NULL OR (ai_specificity BETWEEN 0 AND 5)),
  tech_frustration  SMALLINT CHECK (tech_frustration IS NULL OR (tech_frustration BETWEEN 0 AND 5)),
  resolution_score  SMALLINT CHECK (resolution_score IS NULL OR (resolution_score BETWEEN 0 AND 5)),

  -- Categorical
  topic_tag       TEXT,
  outcome         TEXT,

  -- Short anonymized observation (1 sentence, ~20 words max)
  pattern_note    TEXT,

  -- AI metadata
  model           TEXT,
  raw_response    JSONB,
  error_message   TEXT,

  UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_fp_session_insights_analyzed_at
  ON public.fp_session_insights (analyzed_at DESC);

CREATE INDEX IF NOT EXISTS idx_fp_session_insights_shop
  ON public.fp_session_insights (shop_id);

CREATE INDEX IF NOT EXISTS idx_fp_session_insights_failed
  ON public.fp_session_insights (status) WHERE status != 'success';

ALTER TABLE public.fp_session_insights ENABLE ROW LEVEL SECURITY;
