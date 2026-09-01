-- 196_job_consents.sql — Consultants→Won redesign · CW-1 (the SA consent spine)
-- Consent facts are JOB-level (Sam's decision): the job exists from PTSA-signed, and Ops/Finance/
-- Portal all read from it. One row per job tracks the three SA consents in statutory order —
-- Planning Consent (lodged at Consultants entry, pre-contract) → Building Consent (private certifier
-- or council, lodged in Won after design-lock) → Development Approval (final; no build before it).
-- PlanSA has NO lodgement API (verified), so this is TRACK-AND-PROMPT: reference numbers + operator
-- status + a pre-lodgement checklist + deep-links, never an integration. Additive + idempotent.
-- Apply manually in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.job_consents (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                        uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  -- Planning Consent (land use / Planning & Design Code) — lodged at Consultants entry, pre-contract
  planning_consent_status       text,          -- not_started | lodged | under_assessment | granted | refused
  planning_consent_ref          text,
  planning_consent_lodged_at    date,
  -- Building Consent (Building Rules / NCC) — council OR private certifier; lodged in Won post-lock
  building_consent_route        text,          -- council | private_certifier
  building_consent_status       text,
  building_consent_ref          text,
  building_consent_lodged_at    date,
  -- Development Approval (the final authorisation; you cannot build until it is granted)
  development_approval_status   text,
  development_approval_number   text,
  development_approval_at        date,
  -- PlanSA context + the pre-lodgement document checklist (the Building Consent pack)
  dap_application_number        text,
  prelodgement_checklist        jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_notes                 text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_consents_job_id_idx ON public.job_consents (job_id);

-- RLS — mirror mig 185: permissive auth_users + RESTRICTIVE deny_clients (staff-only). Ships locked
-- (a portal client's JWT resolves to zero rows). Passes scripts/rls-coverage-audit.sql.
ALTER TABLE public.job_consents ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='job_consents' AND policyname='auth_users') THEN
    CREATE POLICY "auth_users" ON public.job_consents FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='job_consents' AND policyname='deny_clients') THEN
    CREATE POLICY deny_clients ON public.job_consents AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
