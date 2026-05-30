-- =============================================================================
-- 065_carpentry_module.sql
-- Blue Leaf Hub — Carpentry Subsidiary Module
--
-- Creates the full data model for the carpentry subsidiary:
--   carpentry_jobs           — core job records (created from accepted Buildexact quotes)
--   carpentry_job_milestones — simple milestone-based schedule (Frame / Fit-Off / PC / etc.)
--   carpentry_job_costs      — actual material + subcontract cost entries (labour via timesheets)
--   carpentry_site_diary     — daily site diary entries for carpentry jobs
--
-- Alters existing tables:
--   timesheets               — adds carpentry_job_id for labour cost attribution
--   marketing_content_items  — adds carpentry_job_id for content tagging
--   marketing_media_assets   — adds carpentry_job_id for media tagging
--
-- Adds sequence + function for CJB-NNN reference number generation.
-- =============================================================================

-- ── 1. carpentry_jobs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.carpentry_jobs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reference              text        UNIQUE NOT NULL,          -- CJB-001, CJB-002, …
  buildexact_job_id      text,                                 -- Buildexact job ID (source of truth)
  buildexact_estimate_id text,                                 -- Buildexact estimate ID
  client_name            text        NOT NULL,                 -- builder company name
  client_contact         text,                                 -- contact person at builder
  client_phone           text,
  client_email           text,
  address                text        NOT NULL,                 -- job site address
  description            text,                                 -- brief scope description
  project_type           text        NOT NULL DEFAULT 'both'
    CHECK (project_type IN ('frame','fitoff','both','other')), -- frame only / fit-off only / both
  status                 text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','on_hold','complete','cancelled')),
  quoted_value           numeric(12,2),                        -- ex-GST contract value from Buildexact
  quoted_cost            numeric(12,2),                        -- budgeted cost from Buildexact estimate
  quoted_margin_pct      numeric(5,2),                         -- (value - cost) / value * 100
  start_date             date,                                 -- planned start
  end_date               date,                                 -- planned practical completion
  actual_start           date,                                 -- recorded on first diary entry
  actual_end             date,                                 -- recorded on job closeout
  floor_area_m2          numeric(8,2),                         -- for $/m² benchmarking
  storey_count           integer     NOT NULL DEFAULT 1,
  notes                  text,
  closeout_data          jsonb,                                -- snapshot written by POST /closeout
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carpentry_jobs_status_idx   ON public.carpentry_jobs (status);
CREATE INDEX IF NOT EXISTS carpentry_jobs_client_idx   ON public.carpentry_jobs (client_name);
CREATE INDEX IF NOT EXISTS carpentry_jobs_created_idx  ON public.carpentry_jobs (created_at DESC);

-- ── 2. carpentry_job_milestones ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.carpentry_job_milestones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid        NOT NULL REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE,
  name        text        NOT NULL,        -- "Frame Start", "Lock-Up", "Fit-Off Complete", etc.
  target_date date,                        -- planned date
  actual_date date,                        -- recorded completion date
  status      text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','complete')),
  sort_order  integer     NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carpentry_milestones_job_idx ON public.carpentry_job_milestones (job_id, sort_order);

-- ── 3. carpentry_job_costs ────────────────────────────────────────────────────
-- Material, subcontract, and other non-labour costs.
-- Labour actuals are sourced from timesheets.carpentry_job_id (see alter below).

CREATE TABLE IF NOT EXISTS public.carpentry_job_costs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid        NOT NULL REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE,
  cost_type        text        NOT NULL
    CHECK (cost_type IN ('material','subcontract','other')),
  description      text        NOT NULL,
  amount           numeric(12,2) NOT NULL CHECK (amount >= 0), -- ex-GST
  source           text        NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','xero')),
  source_reference text,                   -- Xero bill ID once Xero integration is live
  cost_date        date        NOT NULL DEFAULT CURRENT_DATE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carpentry_costs_job_idx  ON public.carpentry_job_costs (job_id);
CREATE INDEX IF NOT EXISTS carpentry_costs_type_idx ON public.carpentry_job_costs (job_id, cost_type);

-- ── 4. carpentry_site_diary ───────────────────────────────────────────────────
-- Mirrors site_diary but references carpentry_jobs instead of projects.
-- Kept separate to avoid making site_diary.project_id nullable.

CREATE TABLE IF NOT EXISTS public.carpentry_site_diary (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               uuid        NOT NULL REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE,
  entry_date           date        NOT NULL DEFAULT CURRENT_DATE,
  weather              text,
  trades_onsite        text[]      NOT NULL DEFAULT '{}',
  work_completed       text,
  issues               text,
  instructions_given   text,
  visitors             text,
  raw_voice_transcript text,
  structured_by_ai     boolean     NOT NULL DEFAULT false,
  supervisor           text,
  photo_paths          text[]      NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carpentry_diary_job_date_idx ON public.carpentry_site_diary (job_id, entry_date DESC);

-- ── 5. Sequence — CJB reference numbers ──────────────────────────────────────

INSERT INTO public.sequences (id, current_value)
  VALUES ('carpentry_job', 0)
  ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.alloc_carpentry_sequence()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val integer;
BEGIN
  UPDATE public.sequences
    SET current_value = current_value + 1
    WHERE id = 'carpentry_job'
    RETURNING current_value INTO next_val;
  RETURN next_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.alloc_carpentry_sequence()
  TO anon, authenticated, service_role;

-- ── 6. Alter timesheets — carpentry_job_id ────────────────────────────────────
-- Allows approved timesheets to be attributed to a carpentry job for labour cost tracking.
-- Mirrors the existing job_id column pattern.

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS carpentry_job_id uuid REFERENCES public.carpentry_jobs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS timesheets_carpentry_job_idx ON public.timesheets (carpentry_job_id)
  WHERE carpentry_job_id IS NOT NULL;

-- ── 7. Alter marketing_content_items — carpentry_job_id ──────────────────────
-- Allows marketing content to be tagged to a carpentry job.
-- Mirrors the existing job_id FK on this table.

ALTER TABLE public.marketing_content_items
  ADD COLUMN IF NOT EXISTS carpentry_job_id uuid REFERENCES public.carpentry_jobs (id) ON DELETE SET NULL;

-- ── 8. Alter marketing_media_assets — carpentry_job_id ───────────────────────
-- Allows photos/videos uploaded from carpentry sites to be tagged to the job.

ALTER TABLE public.marketing_media_assets
  ADD COLUMN IF NOT EXISTS carpentry_job_id uuid REFERENCES public.carpentry_jobs (id) ON DELETE SET NULL;

-- ── 9. RLS — enable and allow service_role full access ───────────────────────

ALTER TABLE public.carpentry_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carpentry_job_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carpentry_job_costs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carpentry_site_diary   ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — all server-side queries use the service role key.
-- Authenticated users (app) get full access via the policies below.
-- Adjust to role-based policies once role columns are finalised.

CREATE POLICY "Authenticated full access — carpentry_jobs"
  ON public.carpentry_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access — carpentry_job_milestones"
  ON public.carpentry_job_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access — carpentry_job_costs"
  ON public.carpentry_job_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access — carpentry_site_diary"
  ON public.carpentry_site_diary FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- Run order: apply in Supabase SQL Editor before deploying Sprint 1 server code.
-- Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'carpentry%';
-- =============================================================================
