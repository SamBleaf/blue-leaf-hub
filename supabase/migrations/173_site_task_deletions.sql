-- 173_site_task_deletions.sql
-- Audit log for task "deletes". A task delete in this app is a SOFT delete (site_tasks.status set to
-- 'wont_do' — the row is kept, so it's recoverable), reachable from the two DELETE routes and the
-- office/worker PATCH routes. This records who did it, when, from where, and a full snapshot — so a
-- "disappearing" task can be traced and restored. Additive + idempotent; nothing else is affected.

CREATE TABLE IF NOT EXISTS public.site_task_deletions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_task_id      uuid,                 -- the task (still exists as wont_do; kept for restore)
  title             text,
  category          text,
  task_audience     text,
  prior_status      text,                 -- status BEFORE the delete (for restore)
  carpentry_job_id  uuid,
  project_id        uuid,
  charge_up_job_id  uuid,
  assigned_to       uuid,
  snapshot          jsonb,                -- full site_tasks row at delete time
  deleted_by        uuid,                 -- app actor (auth user id for office, employee id for worker)
  deleted_by_label  text,                 -- email / name for readability
  source            text,                 -- which route/context did the delete
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_task_deletions_task_idx ON public.site_task_deletions (site_task_id);
CREATE INDEX IF NOT EXISTS site_task_deletions_job_idx  ON public.site_task_deletions (carpentry_job_id);
CREATE INDEX IF NOT EXISTS site_task_deletions_time_idx ON public.site_task_deletions (created_at DESC);

ALTER TABLE public.site_task_deletions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'site_task_deletions' AND policyname = 'auth_users') THEN
    CREATE POLICY "auth_users" ON public.site_task_deletions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
