-- Migration 039: Enforce job_id on rfq_packages.
-- Orphaned packages (job_id IS NULL) cannot answer "which job does this belong to?"
-- and are invisible to Budget vs Actual and cost benchmarks.

-- Step 1: surface orphans so they can be diagnosed (materialise before we constrain)
CREATE TABLE IF NOT EXISTS rfq_package_orphans AS
SELECT id, project_address, created_at
FROM rfq_packages
WHERE job_id IS NULL;

-- Step 2: attempt best-effort backfill by matching project_address → jobs.address
UPDATE rfq_packages rp
SET job_id = j.id
FROM jobs j
WHERE rp.job_id IS NULL
  AND LOWER(TRIM(rp.project_address)) = LOWER(TRIM(j.address));

-- Step 3: add NOT NULL constraint (any still-null rows will error here — check
-- rfq_package_orphans first and manually reconcile before applying this migration)
ALTER TABLE rfq_packages
  ALTER COLUMN job_id SET NOT NULL;

-- Step 4: index for the common "packages for this job" query
CREATE INDEX IF NOT EXISTS idx_rfq_packages_job_id
  ON rfq_packages (job_id);
