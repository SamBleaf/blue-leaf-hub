-- 116_carpentry_crew_overrides.sql
-- D2: per-job crew-size overrides for the schedule auto-layout. The company defaults live in code
-- (CREW_DEFAULTS in carpentryScheduleUtils.mjs); this lets a specific job tune crew per labour stream
-- (e.g. a tight site runs a 4-person framing crew), which scales the auto-laid-out build durations.
--
-- DOWN:
--   ALTER TABLE public.carpentry_jobs DROP COLUMN IF EXISTS crew_size_overrides;

ALTER TABLE public.carpentry_jobs
  ADD COLUMN IF NOT EXISTS crew_size_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
