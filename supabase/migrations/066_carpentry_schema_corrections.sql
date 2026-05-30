-- =============================================================================
-- 066_carpentry_schema_corrections.sql
-- Blue Leaf Hub — Carpentry Module: schema corrections from design review
--
-- Changes:
--   1. Expand project_type enum — 'both' → 'full_package', add 'lockup'
--   2. Add 'defects' to status enum
--   3. Drop closeout_data jsonb column (replaced by carpentry_job_performance)
--   4. Create carpentry_job_performance table for historical performance queries
-- =============================================================================

-- ── 1. project_type CHECK — drop inline constraint, re-add expanded version ──

ALTER TABLE public.carpentry_jobs
  DROP CONSTRAINT IF EXISTS carpentry_jobs_project_type_check;

ALTER TABLE public.carpentry_jobs
  ADD CONSTRAINT carpentry_jobs_project_type_check
  CHECK (project_type IN ('frame', 'fitoff', 'lockup', 'full_package', 'other'));

-- Update column default from 'both' (now invalid) to 'full_package'
ALTER TABLE public.carpentry_jobs
  ALTER COLUMN project_type SET DEFAULT 'full_package';

-- ── 2. status CHECK — drop inline constraint, re-add with 'defects' ──────────

ALTER TABLE public.carpentry_jobs
  DROP CONSTRAINT IF EXISTS carpentry_jobs_status_check;

ALTER TABLE public.carpentry_jobs
  ADD CONSTRAINT carpentry_jobs_status_check
  CHECK (status IN ('active', 'on_hold', 'defects', 'complete', 'cancelled'));

-- ── 3. Drop closeout_data (replaced by carpentry_job_performance) ─────────────

ALTER TABLE public.carpentry_jobs
  DROP COLUMN IF EXISTS closeout_data;

-- ── 4. carpentry_job_performance ──────────────────────────────────────────────
-- One row per completed job. Written by POST /api/carpentry/jobs/:id/closeout.
-- Source of truth for historical performance queries (Sprint 4).

CREATE TABLE IF NOT EXISTS public.carpentry_job_performance (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid          UNIQUE NOT NULL
                        REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE,

  -- Revenue + cost actuals
  final_revenue       numeric(12,2),          -- quoted_value at time of close
  final_labour_cost   numeric(12,2),          -- aggregated from approved timesheets
  final_material_cost numeric(12,2),          -- sum of carpentry_job_costs
  final_total_cost    numeric(12,2),          -- labour + material
  labour_hours        numeric(8,2),           -- total approved hours attributed

  -- Margin
  final_margin_pct    numeric(5,2),           -- (revenue - total_cost) / revenue × 100
  budget_margin_pct   numeric(5,2),           -- quoted_margin_pct at time of close
  variance_pct        numeric(5,2),           -- final_margin_pct - budget_margin_pct

  -- Productivity benchmarks (per m²)
  floor_area_m2       numeric(8,2),
  hours_per_m2        numeric(8,2),
  cost_per_m2         numeric(8,2),

  -- Time
  duration_days       integer,                -- actual_end - actual_start in calendar days

  -- Counts
  timesheet_count     integer,
  cost_entry_count    integer,

  -- Free-text notes captured at closeout
  lessons_learned     text,

  -- Audit
  closed_at           timestamptz NOT NULL DEFAULT now(),
  closed_by           uuid
);

CREATE INDEX IF NOT EXISTS carpentry_perf_job_idx        ON public.carpentry_job_performance (job_id);
CREATE INDEX IF NOT EXISTS carpentry_perf_margin_idx     ON public.carpentry_job_performance (final_margin_pct);
CREATE INDEX IF NOT EXISTS carpentry_perf_area_idx       ON public.carpentry_job_performance (floor_area_m2)
  WHERE floor_area_m2 IS NOT NULL;

ALTER TABLE public.carpentry_job_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access — carpentry_job_performance"
  ON public.carpentry_job_performance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- Verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'carpentry_jobs' ORDER BY ordinal_position;
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'carpentry_job_performance';
-- =============================================================================
