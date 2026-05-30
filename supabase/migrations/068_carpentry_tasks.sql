-- 068_carpentry_tasks.sql
-- Allow site_tasks to be linked to carpentry_jobs in addition to (or instead of) projects.
-- Makes project_id nullable so a task can belong to either a project OR a carpentry job.

-- 1. Drop the NOT NULL constraint on project_id
ALTER TABLE public.site_tasks
  ALTER COLUMN project_id DROP NOT NULL;

-- 2. Add carpentry_job_id FK column
ALTER TABLE public.site_tasks
  ADD COLUMN IF NOT EXISTS carpentry_job_id uuid
    REFERENCES public.carpentry_jobs(id) ON DELETE CASCADE;

-- 3. Index for efficient lookups by carpentry job
CREATE INDEX IF NOT EXISTS idx_site_tasks_carpentry_job
  ON public.site_tasks (carpentry_job_id)
  WHERE carpentry_job_id IS NOT NULL;
