-- 107_site_tasks_xor_check.sql
-- A site_task belongs to EXACTLY ONE of a construction project or a carpentry job.
-- (project_id was made nullable in mig 068 when carpentry_job_id was added; nothing
-- enforced that one-and-only-one held.) This guards the worker job-picker + the
-- carpentry/operations create paths from minting orphaned or double-owned tasks.
--
-- PRE-APPLY AUDIT — run first; expect 0 rows. Any rows here violate the rule and
-- should be repaired before VALIDATE (below):
--   SELECT id, project_id, carpentry_job_id, title
--     FROM public.site_tasks
--    WHERE (project_id IS NULL) = (carpentry_job_id IS NULL);
--
-- Added NOT VALID so the migration applies cleanly even if legacy rows violate it:
-- the rule is enforced for all new/updated rows immediately. After repairing any
-- rows the audit found, enforce it retroactively with:
--   ALTER TABLE public.site_tasks VALIDATE CONSTRAINT site_tasks_one_owner;
--
-- DOWN (rollback):
--   ALTER TABLE public.site_tasks DROP CONSTRAINT IF EXISTS site_tasks_one_owner;

ALTER TABLE public.site_tasks
  ADD CONSTRAINT site_tasks_one_owner
  CHECK ((project_id IS NULL) <> (carpentry_job_id IS NULL)) NOT VALID;
