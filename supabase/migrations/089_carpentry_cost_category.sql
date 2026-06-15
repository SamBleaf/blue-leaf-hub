-- 089 — Carpentry material invoice: which supply category the PO pushes to.
-- Stores the chosen carpentry_job_budgets.category_name (cost_type='material') so the
-- Buildexact Purchase Order line gets the right parentTask (Actuals Category) instead of
-- landing uncategorised.

ALTER TABLE financial_documents
  ADD COLUMN IF NOT EXISTS carpentry_cost_category text;
