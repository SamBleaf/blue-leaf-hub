-- =============================================================================
-- Migration 140 — Carpentry budget line items (Phase 3: earned-value spine)
-- The estimate's leaf line items, grouped into a small set of canonical sub-tasks
-- beneath each carpentry_job_budgets category. One row per estimate leaf (lossless);
-- the PWA dropdown + pricing board COMBINE at query time by canonical_key.
--   • labour sub-tasks  → actuals from timesheet_entries.budget_line_item_id (mig 141)
--   • material sub-tasks → actuals from carpentry_job_costs tagged to the line item
-- The estimate→sub-task mapping drives pricing → money-tier fact (Canonical Data Law):
-- rows are 'suggested' on import and become 'confirmed' only by a human review step.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.carpentry_budget_line_items (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                   uuid          NOT NULL REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE,
  carpentry_job_budget_id  uuid          NOT NULL REFERENCES public.carpentry_job_budgets (id) ON DELETE CASCADE,
  description              text          NOT NULL,                 -- estimate leaf desc, or combined sub-task label
  task_category            text,                                   -- parent 8-key (labour); null for material
  canonical_key            text,                                   -- cross-job sub-task slug; null = unmapped, rolls to parent
  sell_ex_gst              numeric(12,2) NOT NULL DEFAULT 0,       -- cost + markup (the earned-value denominator)
  cost_ex_gst              numeric(12,2) NOT NULL DEFAULT 0,       -- ex-markup cost
  allowance                text          NOT NULL DEFAULT '' CHECK (allowance IN ('PC','PS','')),
  source                   text          NOT NULL DEFAULT 'estimateitems',  -- 'estimateitems' | 'manual'
  status                   text          NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','confirmed')),
  source_document_id       uuid,                                   -- provenance (nullable until Knowledge Core lands)
  confidence               numeric(4,3),                           -- mapping confidence 0..1
  sort_order               integer       NOT NULL DEFAULT 0,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.carpentry_budget_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON public.carpentry_budget_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS carpentry_line_items_job_idx    ON public.carpentry_budget_line_items (job_id);
CREATE INDEX IF NOT EXISTS carpentry_line_items_budget_idx ON public.carpentry_budget_line_items (carpentry_job_budget_id);
CREATE INDEX IF NOT EXISTS carpentry_line_items_canon_idx  ON public.carpentry_budget_line_items (canonical_key);
