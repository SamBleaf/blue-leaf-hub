-- =============================================================================
-- Migration 145 — BLB Charge Up sub-jobs (site-level charge-up tracking)
-- "BLB Charge Up" is a permanent carpentry_jobs category (reference 'BL-CHARGEUP').
-- It holds many small "sites" where ad-hoc chargeable work is done. Workers pick a
-- site when logging hours; cost lands on the category but HOURS track per site + per
-- person → a ready-to-invoice charge-out $ per site.
--
--   • charge_up_jobs               — the lightweight sites (NOT full carpentry jobs)
--   • timesheet_entries.charge_up_job_id — which site an hour belongs to (clone of mig 141)
--
-- Idempotent (CREATE/ADD ... IF NOT EXISTS) — safe to re-run. Additive; the timesheet
-- CHECK enums + existing columns are untouched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.charge_up_jobs (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  carpentry_job_id  uuid          NOT NULL REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE,  -- the BL-CHARGEUP parent
  site_label        text          NOT NULL,                         -- the location workers pick
  address           text,                                           -- finer address / info shown in the PWA
  notes             text,
  status            text          NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sort_order        integer       NOT NULL DEFAULT 0,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.charge_up_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'charge_up_jobs' AND policyname = 'auth_users') THEN
    CREATE POLICY "auth_users" ON public.charge_up_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS charge_up_jobs_parent_idx ON public.charge_up_jobs (carpentry_job_id);
CREATE INDEX IF NOT EXISTS charge_up_jobs_status_idx ON public.charge_up_jobs (status);

CREATE OR REPLACE FUNCTION public.update_charge_up_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_charge_up_jobs_updated_at ON public.charge_up_jobs;
CREATE TRIGGER trg_charge_up_jobs_updated_at
  BEFORE UPDATE ON public.charge_up_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_charge_up_jobs_updated_at();

-- The per-entry site tag — clone of migration 141 (budget_line_item_id). Nullable +
-- ON DELETE SET NULL so untagged / archived-site hours roll up to the category.
ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS charge_up_job_id uuid
  REFERENCES public.charge_up_jobs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS timesheet_entries_charge_up_idx
  ON public.timesheet_entries (charge_up_job_id);

NOTIFY pgrst, 'reload schema';
