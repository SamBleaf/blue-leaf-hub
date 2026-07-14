-- =============================================================================
-- Migration 141 — timesheet_entries.budget_line_item_id (Phase 3: sub-task time)
-- Optional sub-task allocation beneath the main task_category. Nullable → fully
-- backward-compatible: existing entries, and any time logged without picking a
-- sub-task, keep rolling up to the main category exactly as before. The task_category
-- CHECK enum is untouched. ON DELETE SET NULL so deleting a sub-task section never
-- orphans logged time — it simply reverts to counting at the main-category level.
-- =============================================================================

ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS budget_line_item_id uuid
  REFERENCES public.carpentry_budget_line_items (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS timesheet_entries_line_item_idx
  ON public.timesheet_entries (budget_line_item_id);
