-- 114_site_tasks_labour_category.sql
-- D4 fix: the task-category dropdown now offers the job's LABOUR budget streams (so a worker task's
-- category == the budget category == the timesheet task_category). But site_tasks.category had a CHECK
-- (migration 059) allowing only the 5 generic types, so picking a labour stream failed insert.
-- Expand the CHECK to also allow the canonical workforce labour task keys (WORKFORCE_LABOUR_TASKS).
--
-- DOWN (revert to generic-only):
--   ALTER TABLE public.site_tasks DROP CONSTRAINT IF EXISTS site_tasks_category_check;
--   ALTER TABLE public.site_tasks ADD CONSTRAINT site_tasks_category_check
--     CHECK (category IN ('general','defect','safety','materials','inspection'));

-- Drop whatever CHECK currently constrains site_tasks.category (inline checks get an auto name),
-- then add the expanded one under a known name.
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
  CHECK (category IN (
    'general','defect','safety','materials','inspection',
    'first_fix_framing','cladding','second_fix','outdoor_works',
    'formwork_slab_prep','site_labouring','site_cleanup','supervision'
  ));
