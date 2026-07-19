-- 147_timesheet_entries_canonical_key.sql
-- Budget-spine alignment Phase 1: the SUB-TASK becomes a first-class identity on timesheets.
--
-- A carpentry sub-task = (task_category, canonical_key) — a canonical_key group within a labour
-- budget category (e.g. task_category='cladding', canonical_key='cladding_installation'). Until
-- now hours attributed only at the coarse 8-key task_category (budget_line_item_id existed but was
-- never used in practice), so per-sub-task actuals never accrued. This column lets a worker's hours
-- attribute to the budget sub-task, so budget → schedule → PWA → timesheet all share one identity.
--
-- Nullable + no FK (canonical_key is a dictionary slug, validated in the confirm/PWA UI, not an
-- enum in the DB — same as carpentry_budget_line_items.canonical_key). Idempotent.

ALTER TABLE timesheet_entries
  ADD COLUMN IF NOT EXISTS canonical_key text;

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_canonical_key
  ON timesheet_entries(canonical_key);

-- Composite index for the per-sub-task rollup (task_category + canonical_key).
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_subtask
  ON timesheet_entries(task_category, canonical_key);

NOTIFY pgrst, 'reload schema';
