-- 126_site_tasks_blocked_status.sql
-- Add 'blocked' to site_tasks.status so workers can flag a task they cannot progress
-- (e.g. waiting on materials). The reason is stored in completion_notes.
--
-- Pattern mirrors 114_site_tasks_labour_category.sql: drop the existing inline status
-- CHECK by name-scanning pg_constraint, then re-add under a known name.
--
-- Original values: open | in_progress | done | wont_do
-- After:           open | in_progress | done | wont_do | blocked
--
-- Additive + idempotent: safe to re-run. Does not touch data.
--
-- DOWN (revert):
--   ALTER TABLE public.site_tasks DROP CONSTRAINT IF EXISTS site_tasks_status_check;
--   ALTER TABLE public.site_tasks ADD CONSTRAINT site_tasks_status_check
--     CHECK (status IN ('open','in_progress','done','wont_do'));

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.site_tasks'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.site_tasks DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.site_tasks ADD CONSTRAINT site_tasks_status_check
  CHECK (status IN ('open','in_progress','done','wont_do','blocked'));
