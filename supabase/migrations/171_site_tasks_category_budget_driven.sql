-- 171_site_tasks_category_budget_driven.sql
-- Parity with migration 170 (timesheet_entries.task_category), for the worker/diary TASK categories.
--
-- Sam's model (migration 114's own comment): "category == the budget category == the timesheet
-- task_category". Migration 170 made timesheet_entries.task_category budget-driven (any labour budget
-- cost category is loggable). This does the same for site_tasks.category so a worker TASK can carry a
-- budget-derived category (e.g. "aac_and_foam_supply_and_installation") too — otherwise creating a task
-- against an off-list budget category would fail the CHECK, exactly as timesheet logging did.
--
-- Migration 114 expanded site_tasks.category from the 5 generic types to the generic 5 + the 8
-- canonical workforce keys (still a FIXED list). Relax it to the same FORMAT guard used in 170 — a
-- lowercase slug of 1..64 chars — so any budgetTaskCategory() value is accepted while empty/garbage is
-- blocked. Every value from 114's list (all lowercase_underscore) still validates, so nothing breaks.
--
-- DOWN (revert to migration 114's fixed list):
--   ALTER TABLE public.site_tasks DROP CONSTRAINT IF EXISTS site_tasks_category_check;
--   ALTER TABLE public.site_tasks ADD CONSTRAINT site_tasks_category_check
--     CHECK (category IN ('general','defect','safety','materials','inspection',
--       'first_fix_framing','cladding','second_fix','outdoor_works',
--       'formwork_slab_prep','site_labouring','site_cleanup','supervision'));

-- Drop whatever CHECK currently constrains site_tasks.category (114's site_tasks_category_check). The
-- ILIKE '%category%' filter matches only the category CHECK — task_audience (mig 115) and status
-- (mig 126) constraints don't mention "category", so they are left intact.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.site_tasks'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.site_tasks DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.site_tasks ADD CONSTRAINT site_tasks_category_check
  CHECK (category ~ '^[a-z0-9_]+$' AND char_length(category) BETWEEN 1 AND 64);
