-- =============================================================================
-- Migration 144 — Carpentry stage schedule (interactive calendar Pipeline foundation)
-- The single canonical store of each carpentry job's per-STAGE planned dates +
-- inter-stage dependencies. Replaces the coarse `carpentry_job_milestones` model
-- (point events, name-keyed, only frame/lockup/cladding/fitoff) with one draggable
-- block per stage, keyed to the 15-stage taxonomy in carpentryStages.mjs.
--
-- Both surfaces read/write THIS table → two-way sync with no separate layer:
--   • Workforce → Pipeline (calendar) drag a stage block
--   • Carpentry job → Schedule tab edit a stage's dates
-- The dependency ripple reuses scheduleUtils.previewRipple (FS/SS/FF + lag).
--
-- Seeding (auto-layout from start_date + stage durations, backfilled from existing
-- milestone dates) is done in carpentryStageScheduleService.mjs — the canonical_key
-- → stage_key mapping lives in JS (carpentryStages.mjs), not duplicated here.
--
-- Milestones are NOT dropped in this migration (kept one release for rollback); the
-- carpentry UI + Pipeline stop reading them once this ships.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.carpentry_job_stage_schedule (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  carpentry_job_id  uuid          NOT NULL REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE,
  stage_key         text          NOT NULL,                              -- carpentryStages STAGES key (wall_framing, cladding, …)
  planned_start     date,
  planned_end       date,
  actual_start      date,                                               -- mirror of timesheet-observed first/last (optional persist)
  actual_end        date,
  depends_on        jsonb         NOT NULL DEFAULT '[]'::jsonb,          -- [{ stageKey, type:'FS'|'SS'|'FF', lagDays:int }]
  status            text          NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','complete')),
  sort_order        integer       NOT NULL DEFAULT 0,                    -- default = stageOrder; user-reorderable
  locked            boolean       NOT NULL DEFAULT false,               -- pin: ripple will not move a locked stage
  notes             text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (carpentry_job_id, stage_key)
);

ALTER TABLE public.carpentry_job_stage_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON public.carpentry_job_stage_schedule
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS carpentry_stage_sched_job_idx   ON public.carpentry_job_stage_schedule (carpentry_job_id);
CREATE INDEX IF NOT EXISTS carpentry_stage_sched_stage_idx ON public.carpentry_job_stage_schedule (stage_key);

CREATE OR REPLACE FUNCTION public.update_carpentry_stage_schedule_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_carpentry_stage_schedule_updated_at ON public.carpentry_job_stage_schedule;
CREATE TRIGGER trg_carpentry_stage_schedule_updated_at
  BEFORE UPDATE ON public.carpentry_job_stage_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_carpentry_stage_schedule_updated_at();
