-- Buildexact deep integration: estimate status, schedule hints, and project metrics
-- Run after 014_schedule_templates.sql.

ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS buildexact_estimate_id text,
  ADD COLUMN IF NOT EXISTS buildexact_job_id text,
  ADD COLUMN IF NOT EXISTS buildexact_status text,
  ADD COLUMN IF NOT EXISTS buildexact_synced_at timestamptz;

ALTER TABLE public.buildexact_estimates
  ADD COLUMN IF NOT EXISTS schedule_hints jsonb,
  ADD COLUMN IF NOT EXISTS cost_metrics jsonb,
  ADD COLUMN IF NOT EXISTS buildexact_job_id text,
  ADD COLUMN IF NOT EXISTS buildexact_estimate_id text;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_metrics jsonb;

CREATE INDEX IF NOT EXISTS fee_proposals_buildexact_job_id_idx
  ON public.fee_proposals (buildexact_job_id)
  WHERE buildexact_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS buildexact_estimates_buildexact_job_id_idx
  ON public.buildexact_estimates (buildexact_job_id)
  WHERE buildexact_job_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_proposals_buildexact_status_check'
  ) THEN
    ALTER TABLE public.fee_proposals
      ADD CONSTRAINT fee_proposals_buildexact_status_check
      CHECK (buildexact_status IS NULL OR buildexact_status IN ('sent', 'accepted'));
  END IF;
END $$;
