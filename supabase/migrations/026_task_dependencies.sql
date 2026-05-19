-- Sprint 3: Typed dependency relationships with lag, task types, zone tags, procurement lead times
ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS task_dependencies JSONB    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS zone              text,
  ADD COLUMN IF NOT EXISTS lead_time_days   integer;

-- task_type already exists as text; values now: build | procurement | approval | inspection | milestone
-- depends_on kept for legacy DependencyMap dashed-arrow rendering
