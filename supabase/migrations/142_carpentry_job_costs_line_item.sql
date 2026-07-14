-- =============================================================================
-- Migration 142 — carpentry_job_costs.carpentry_budget_line_item_id (material sub-tasks)
-- Lets a material cost entry (supplier invoice) be tagged to a sub-task line item, not
-- just its parent category — so material sub-task actuals (e.g. wall frames vs floor
-- frames) accrue. Nullable + ON DELETE SET NULL: deleting a sub-task reverts the cost to
-- counting at the category level. Complements mig 113 (carpentry_job_budget_id).
-- =============================================================================

ALTER TABLE public.carpentry_job_costs
  ADD COLUMN IF NOT EXISTS carpentry_budget_line_item_id uuid
  REFERENCES public.carpentry_budget_line_items (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS carpentry_job_costs_line_item_idx
  ON public.carpentry_job_costs (carpentry_budget_line_item_id);
