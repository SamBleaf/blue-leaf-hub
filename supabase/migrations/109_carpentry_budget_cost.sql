-- 109_carpentry_budget_cost.sql
-- Carpentry budgets now store BOTH the marked-up sell price ex-GST (budget_ex_gst,
-- what the budget displays) AND the ex-markup cost (cost_ex_gst) so margin
-- (sell − cost) and budget-vs-actual work. The Estimate-Items XLSX carries both
-- (Total = cost, Total+Markup = sell ex-GST); the seed writes sell to budget_ex_gst
-- and cost to cost_ex_gst.
--
-- PRE-APPLY AUDIT (optional): existing rows have budget_ex_gst = the old ex-markup
-- cost; after this, cost_ex_gst defaults to 0 until re-seeded from an Estimate-Items
-- import. Re-import affected jobs to populate both correctly.
--
-- DOWN:
--   ALTER TABLE public.carpentry_job_budgets DROP COLUMN IF EXISTS cost_ex_gst;

ALTER TABLE public.carpentry_job_budgets
  ADD COLUMN IF NOT EXISTS cost_ex_gst numeric(12,2) NOT NULL DEFAULT 0;
