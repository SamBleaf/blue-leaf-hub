-- Schedule: dynamic phases/categories, concurrency, hold details, critical path

ALTER TABLE public.schedule_tasks DROP CONSTRAINT IF EXISTS schedule_tasks_phase_check;

ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS can_run_concurrent_with jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_time_weeks integer,
  ADD COLUMN IF NOT EXISTS hold_point_description text,
  ADD COLUMN IF NOT EXISTS is_critical_path boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hold_notify boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schedule_tasks.phase IS 'Category key (slug) or legacy enum value; no longer restricted to fixed CHECK list.';
COMMENT ON COLUMN public.schedule_tasks.depends_on IS 'UUID[] predecessor task ids (hard dependencies).';
COMMENT ON COLUMN public.schedule_tasks.can_run_concurrent_with IS 'JSON array of task UUID strings that may overlap in time with this task.';
COMMENT ON COLUMN public.schedule_tasks.lead_time_weeks IS 'Procurement / lead time in weeks before work starts (ordering reminder).';
COMMENT ON COLUMN public.schedule_tasks.hold_point_description IS 'Inspection / hold point detail when is_hold_point is true.';
COMMENT ON COLUMN public.schedule_tasks.is_critical_path IS 'True when task lies on computed critical path (delay delays project end).';
COMMENT ON COLUMN public.schedule_tasks.hold_notify IS 'When true, flag this hold point on the schedule (e.g. ai_flag or UI badge).';
