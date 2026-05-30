-- =============================================================================
-- Migration 067 — Carpentry job budgets (Phase 2 costing)
-- Seeded from the Buildexact estimate categories on import.
--   • labour lines  → actuals from approved timesheets (timesheets.carpentry_job_id),
--                     grouped by the mapped workforce task_category
--   • material lines → actuals from carpentry_job_costs (rolled up)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.carpentry_job_budgets (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                  uuid          NOT NULL REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE,
  category_name           text          NOT NULL,                 -- e.g. "First Fix Framing"
  cost_type               text          NOT NULL CHECK (cost_type IN ('labour', 'material')),
  budget_ex_gst           numeric(12,2) NOT NULL DEFAULT 0,       -- estimate subtotal ex-GST
  workforce_task_category text,                                   -- labour lines: feeding timesheet task_category
  sort_order              integer       NOT NULL DEFAULT 0,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (job_id, category_name)
);

ALTER TABLE public.carpentry_job_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON public.carpentry_job_budgets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS carpentry_budgets_job_idx ON public.carpentry_job_budgets (job_id);
