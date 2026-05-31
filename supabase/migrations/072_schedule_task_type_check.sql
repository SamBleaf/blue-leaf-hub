-- =============================================================================
-- 072_schedule_task_type_check.sql — widen schedule_tasks.task_type CHECK
--
-- Migration 014 constrained task_type to ('standard','milestone','procurement'),
-- but the AI schedule generator (scheduleGenerate.mjs) writes 'build','approval',
-- 'inspection' — so the whole generated batch insert was rejected and AI schedule
-- generation could not insert tasks (audit C6). Widen the CHECK to the full set the
-- code actually uses. Additive/safe; existing rows already satisfy it.
-- =============================================================================

ALTER TABLE public.schedule_tasks
  DROP CONSTRAINT IF EXISTS schedule_tasks_task_type_check;

ALTER TABLE public.schedule_tasks
  ADD CONSTRAINT schedule_tasks_task_type_check
  CHECK (task_type IN ('standard','milestone','procurement','build','approval','inspection'));
