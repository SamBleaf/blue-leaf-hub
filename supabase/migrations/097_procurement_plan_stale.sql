-- ============================================================================
-- 097_procurement_plan_stale.sql
-- Data-flow fix (HUB TOWER architecture review, Phase 0): when the schedule
-- changes, the procurement plan's order-by dates can drift silently. This adds
-- a "procurement plan is stale" flag that is set automatically whenever a
-- schedule task's dates/structure change — surfaced in the procurement command
-- centre so a human can refresh the plan. We do NOT auto-regenerate.
--
-- Path-independent: a trigger on schedule_tasks catches every change route
-- (server endpoints, ripple cascade, EOT shift, or a direct frontend edit).
-- The flag only sets when a procurement plan actually exists for the job, so we
-- never raise a false banner before any plan has been generated.
--
-- The flag is cleared when the plan is regenerated (procurementRoutes.mjs).
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Staleness columns on projects (one procurement plan per job/project).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS procurement_plan_stale boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS procurement_plan_stale_since timestamptz;

-- 2. Trigger function — flag the project's plan stale on a schedule change.
--    SECURITY DEFINER so it works regardless of the caller's role/RLS.
CREATE OR REPLACE FUNCTION public.mark_procurement_stale_on_schedule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  jid uuid;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT job_id INTO jid FROM public.projects WHERE id = pid;

  -- Only flag when a procurement plan actually exists for this job.
  IF jid IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.procurement_items WHERE job_id = jid) THEN
    UPDATE public.projects
       SET procurement_plan_stale = true,
           procurement_plan_stale_since = COALESCE(procurement_plan_stale_since, now())
     WHERE id = pid
       AND COALESCE(procurement_plan_stale, false) = false;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Fire only on changes that move dates/structure — not on status ticks etc.
DROP TRIGGER IF EXISTS trg_mark_procurement_stale ON public.schedule_tasks;
CREATE TRIGGER trg_mark_procurement_stale
  AFTER INSERT OR DELETE OR UPDATE OF start_date, end_date, duration_days, depends_on
  ON public.schedule_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_procurement_stale_on_schedule_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (run manually after applying)
-- ─────────────────────────────────────────────────────────────────────────────
-- a) Columns exist:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='projects' AND column_name LIKE 'procurement_plan_stale%';
-- b) Trigger exists:
--    SELECT tgname FROM pg_trigger WHERE tgname='trg_mark_procurement_stale';
