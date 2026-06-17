-- ============================================================================
-- 096_auto_project_on_win.sql
-- Data-flow fix (HUB TOWER architecture review, Phase 0): a job must never sit
-- at status='won' without an operations `projects` row. Today the only writer
-- is /api/tender/win-finalize, and its insert is (a) not idempotent and (b)
-- runs AFTER the job is already flipped to 'won' — so any failure, retry, or
-- non-win-finalize path leaves a won job with no project and Operations blind.
--
-- This migration makes "project exists for every won job" a database-level
-- guarantee, independent of which code path sets the status:
--   1. Backfill projects for existing won jobs that have none.
--   2. One-project-per-job unique index (guarded — skips if dupes already exist).
--   3. Trigger that creates a baseline project whenever a job becomes 'won'.
--
-- The trigger creates only a MINIMAL row (job_id, address, status='active').
-- win-finalize still enriches it (accepted_trades, dropbox paths, dates) — now
-- via an idempotent upsert (see module4Routes.mjs).
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill — every existing won job gets a project if it lacks one.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.projects (job_id, address, status)
SELECT j.id,
       COALESCE(NULLIF(btrim(j.address), ''), 'Unknown'),
       'active'
FROM public.jobs j
WHERE j.status = 'won'
  AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.job_id = j.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. One project per job (guarded). If duplicate projects already exist for a
--    job, we do NOT auto-delete operational data — we skip the index and emit a
--    notice so a human can consolidate, then re-run.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE dup_jobs int;
BEGIN
  SELECT count(*) INTO dup_jobs FROM (
    SELECT job_id
    FROM public.projects
    WHERE job_id IS NOT NULL
    GROUP BY job_id
    HAVING count(*) > 1
  ) d;

  IF dup_jobs = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS projects_job_id_uq
      ON public.projects (job_id)
      WHERE job_id IS NOT NULL;
  ELSE
    RAISE NOTICE 'projects_job_id_uq NOT created: % job_id(s) have duplicate project rows. Consolidate them, then re-run this migration.', dup_jobs;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger — baseline project on win, for ANY path that sets status='won'
--    (server route, future Buildexact sync, or a direct frontend update).
--    SECURITY DEFINER so it succeeds regardless of the caller's role/RLS.
--    WHERE NOT EXISTS keeps it idempotent — never a duplicate.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_project_for_won_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'won' THEN
    INSERT INTO public.projects (job_id, address, status)
    SELECT NEW.id,
           COALESCE(NULLIF(btrim(NEW.address), ''), 'Unknown'),
           'active'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.projects WHERE job_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_project_for_won_job ON public.jobs;
CREATE TRIGGER trg_ensure_project_for_won_job
  AFTER INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW
  WHEN (NEW.status = 'won')
  EXECUTE FUNCTION public.ensure_project_for_won_job();

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (run manually after applying)
-- ─────────────────────────────────────────────────────────────────────────────
-- a) No won job without a project:
--    SELECT count(*) FROM public.jobs j
--    WHERE j.status='won' AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.job_id=j.id);
--    Expected: 0.
--
-- b) No duplicate projects per job:
--    SELECT job_id, count(*) FROM public.projects WHERE job_id IS NOT NULL
--    GROUP BY job_id HAVING count(*) > 1;
--    Expected: 0 rows.
