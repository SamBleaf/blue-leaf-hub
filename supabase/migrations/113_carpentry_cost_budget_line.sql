-- 113_carpentry_cost_budget_line.sql
-- D5 (full budget↔actuals): let a material/other cost entry be tagged to the budget line it belongs
-- to, so the Budget tab can show per-category material Actual vs Budget (today material actuals are a
-- single lump under totals). Nullable + ON DELETE SET NULL so existing/un-tagged costs are unaffected
-- and re-seeding the budget never orphans a cost hard.
--
-- DOWN:
--   ALTER TABLE public.carpentry_job_costs DROP COLUMN IF EXISTS carpentry_job_budget_id;

ALTER TABLE public.carpentry_job_costs
  ADD COLUMN IF NOT EXISTS carpentry_job_budget_id uuid
    REFERENCES public.carpentry_job_budgets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS carpentry_job_costs_budget_line_idx
  ON public.carpentry_job_costs (carpentry_job_budget_id);
