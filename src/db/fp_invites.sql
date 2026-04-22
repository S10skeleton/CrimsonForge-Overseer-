-- ForgePilot platform-level invites (founder-initiated, user onboarding)
-- NOT to be confused with fp_shop_invites (6-digit codes for shop owners adding techs)
-- NOTE: This table lives in the ForgePilot Supabase project (oicgyqhtvmslkotjputx),
-- NOT in the Overseer project. Already applied via MCP — this file is version control only.

CREATE TABLE IF NOT EXISTS public.fp_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  full_name       TEXT,
  role            TEXT NOT NULL CHECK (role IN ('owner', 'tech', 'advisor')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'activated', 'revoked')),
  invited_by      TEXT,
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at    TIMESTAMPTZ,
  last_active_at  TIMESTAMPTZ,
  auth_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fp_invites_email_idx     ON public.fp_invites (email);
CREATE INDEX IF NOT EXISTS fp_invites_status_idx    ON public.fp_invites (status);
CREATE INDEX IF NOT EXISTS fp_invites_auth_user_idx ON public.fp_invites (auth_user_id);

COMMENT ON TABLE  public.fp_invites IS 'Platform-level user onboarding invites. Managed by Overseer backend via service role. Distinct from fp_shop_invites (shop-owner tech/advisor 6-digit codes).';
COMMENT ON COLUMN public.fp_invites.role IS 'owner | tech | advisor — matches fp_users.shop_role check constraint';

-- Trigger: when a user confirms their email (email_confirmed_at becomes non-null),
-- mark their fp_invites row as activated. SECURITY DEFINER + pinned search_path.
CREATE OR REPLACE FUNCTION public.mark_fp_invite_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.fp_invites
    SET status       = 'activated',
        activated_at = NOW(),
        updated_at   = NOW()
    WHERE auth_user_id = NEW.id
      AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fp_invites_activation_trigger ON auth.users;
CREATE TRIGGER fp_invites_activation_trigger
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_fp_invite_activated();

-- RLS: service-role-only access. No policies = only service_role bypasses RLS.
ALTER TABLE public.fp_invites ENABLE ROW LEVEL SECURITY;
