-- 170_timesheet_entries_category_budget_driven.sql
-- Loggable timesheet categories are now DRIVEN BY THE JOB'S LABOUR BUDGET cost categories, not a
-- fixed list (Sam 2026-08-04: "when AAC installation is in the budget it needs to be a loggable area").
--
-- The old CHECK (migration 059) allowed ONLY the 9 canonical workforce keys:
--   first_fix_framing, cladding, second_fix, outdoor_works, formwork_slab_prep,
--   site_labouring, site_cleanup, supervision, other
-- So a budget-derived category like "aac_and_foam_supply_and_installation" (5A Gibson St / J1171 —
-- the "AAC and foam supply and installation" labour budget line) was rejected at INSERT with a
-- check-constraint violation, surfacing to the worker as "the entry is not valid".
--
-- FIX (Option B — any budget category loggable): relax the CHECK from a fixed IN-list to a FORMAT
-- guard — a lowercase slug of 1..64 chars — so any value produced by budgetTaskCategory()
-- (workforce_task_category, else slugCategory(category_name)) is accepted, while empty/garbage is
-- still blocked. The 9 canonical keys all match the slug format, so nothing existing breaks.
-- Mirrors migration 114's DROP+ADD approach for site_tasks.category.
--
-- NOTE (parity, not done here): site_tasks.category (worker/diary TASK categories, migration 114) is a
-- separate surface and keeps its fixed list. If worker TASK categories are later made budget-driven
-- too, apply the same relaxation there.
--
-- DOWN (revert to the fixed 9-value list):
--   ALTER TABLE public.timesheet_entries DROP CONSTRAINT IF EXISTS timesheet_entries_task_category_check;
--   ALTER TABLE public.timesheet_entries ADD CONSTRAINT timesheet_entries_task_category_check
--     CHECK (task_category IN ('first_fix_framing','cladding','second_fix','outdoor_works',
--       'formwork_slab_prep','site_labouring','site_cleanup','supervision','other'));

-- Drop whatever CHECK currently constrains timesheet_entries.task_category (the inline check from
-- migration 059 gets an auto-generated name), then add the format guard under a known name.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.timesheet_entries'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%task_category%'
  LOOP
    EXECUTE format('ALTER TABLE public.timesheet_entries DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.timesheet_entries ADD CONSTRAINT timesheet_entries_task_category_check
  CHECK (task_category ~ '^[a-z0-9_]+$' AND char_length(task_category) BETWEEN 1 AND 64);
