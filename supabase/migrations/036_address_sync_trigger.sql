-- Migration 036: Keep projects.address in sync with jobs.address (the address master).
-- jobs.address is authoritative — set during tendering before a project exists.
-- When jobs.address changes, propagate to the linked project.

CREATE OR REPLACE FUNCTION sync_project_address_from_job()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.address IS DISTINCT FROM OLD.address THEN
    UPDATE projects
    SET address = NEW.address
    WHERE job_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_address_sync ON jobs;

CREATE TRIGGER job_address_sync
AFTER UPDATE OF address
ON jobs
FOR EACH ROW
EXECUTE FUNCTION sync_project_address_from_job();

-- One-time backfill: correct any projects where address diverged
UPDATE projects p
SET address = j.address
FROM jobs j
WHERE j.id = p.job_id
  AND j.address IS NOT NULL
  AND j.address IS DISTINCT FROM p.address;
