-- 172_job_documents_charge_up.sql
-- Per-site PLANS for BLB Charge Up.
-- A charge-up site (charge_up_jobs, mig 145) already owns its own tasks + diary (mig 151); this lets it
-- own its own plans too — so each site behaves like a normal job within the charge-up job. job_documents
-- (mig 069) holds plans keyed by job_id / carpentry_job_id; add charge_up_job_id so a plan document can
-- belong to a site instead. Nullable + ON DELETE CASCADE (deleting a site removes its plans). Additive
-- + idempotent — existing plan rows and readers are untouched (charge_up_job_id stays NULL for them).

ALTER TABLE public.job_documents
  ADD COLUMN IF NOT EXISTS charge_up_job_id uuid
  REFERENCES public.charge_up_jobs (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS job_documents_charge_up_idx
  ON public.job_documents (charge_up_job_id) WHERE charge_up_job_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
