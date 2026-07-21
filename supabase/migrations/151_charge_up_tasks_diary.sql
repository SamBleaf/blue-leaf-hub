-- =============================================================================
-- Migration 151 — BLB Charge Up sites can carry their own tasks + site diary
-- A charge-up site (charge_up_jobs, mig 145) is a lightweight tag, not a carpentry_jobs
-- row, so it can't use the job-keyed site_tasks / carpentry_site_diary directly. This adds
-- a charge_up_job_id tag to BOTH tables so a site reuses the SAME tables + components as a
-- real carpentry job — scoped to the site.
--
-- Ownership: a charge-up task/diary is owned by the SITE alone (project_id/carpentry_job_id
-- stay NULL), so it NEVER matches a parent-job reader (worker PWA task list, job Tasks/Diary
-- tabs, earned-value rollup) — no leak, no reader changes. site_tasks' one-owner XOR is
-- widened to a 3-way (exactly one of project / carpentry job / charge-up site); the diary's
-- job_id NOT NULL is dropped so a charge-up diary needs no parent job.
-- ON DELETE CASCADE: deleting a site removes its tasks/diary. Additive + idempotent.
-- =============================================================================

ALTER TABLE public.site_tasks
  ADD COLUMN IF NOT EXISTS charge_up_job_id uuid
  REFERENCES public.charge_up_jobs (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS site_tasks_charge_up_idx
  ON public.site_tasks (charge_up_job_id) WHERE charge_up_job_id IS NOT NULL;

-- Widen the one-owner rule (mig 107 was project XOR carpentry_job) to include the charge-up
-- site — exactly one owner. DROP-then-ADD is re-runnable. NOT VALID so legacy rows don't block.
ALTER TABLE public.site_tasks DROP CONSTRAINT IF EXISTS site_tasks_one_owner;
ALTER TABLE public.site_tasks
  ADD CONSTRAINT site_tasks_one_owner
  CHECK (num_nonnulls(project_id, carpentry_job_id, charge_up_job_id) = 1) NOT VALID;

ALTER TABLE public.carpentry_site_diary
  ADD COLUMN IF NOT EXISTS charge_up_job_id uuid
  REFERENCES public.charge_up_jobs (id) ON DELETE CASCADE;

-- A charge-up diary entry is owned by the site, not a parent job → job_id becomes optional.
ALTER TABLE public.carpentry_site_diary ALTER COLUMN job_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS carpentry_site_diary_charge_up_idx
  ON public.carpentry_site_diary (charge_up_job_id) WHERE charge_up_job_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
