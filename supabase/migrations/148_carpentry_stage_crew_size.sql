-- 148_carpentry_stage_crew_size.sql
-- Per-category crew size on the stage schedule. Each labour category (stage) runs with a
-- different number of people, so its value-based duration must scale to the actual crew:
--   duration (working days) = ceil(labour_sell / team_charge_up_per_day * headcount / crew_size)
-- crew_size defaults to a task-sensible number (CREW_DEFAULTS) at seed, is editable per category
-- in the Schedule tab, and persists through re-auto-layout (like a locked date). Null → use the
-- default. Idempotent.

ALTER TABLE carpentry_job_stage_schedule
  ADD COLUMN IF NOT EXISTS crew_size int;

NOTIFY pgrst, 'reload schema';
