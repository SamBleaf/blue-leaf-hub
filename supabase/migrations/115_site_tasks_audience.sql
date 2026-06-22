-- 115_site_tasks_audience.sql
-- D3: distinguish worker tasks from supervisor/QC tasks (e.g. "order flashings", "book frame
-- inspection") so the carpentry diary + field app can show "Tasks for workers" and "Tasks for
-- supervisors" separately. Defaults to 'worker' so all existing tasks keep their meaning.
--
-- DOWN:
--   ALTER TABLE public.site_tasks DROP COLUMN IF EXISTS task_audience;

ALTER TABLE public.site_tasks
  ADD COLUMN IF NOT EXISTS task_audience text NOT NULL DEFAULT 'worker'
    CHECK (task_audience IN ('worker', 'supervisor'));
