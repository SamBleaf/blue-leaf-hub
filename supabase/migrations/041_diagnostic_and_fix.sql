-- Migration 041: Diagnostic + safe repair for 034–039 + budget seed helper
-- Run in Supabase SQL editor. All steps are idempotent (IF NOT EXISTS / DO NOTHING).

-- ============================================================
-- PART 1: REPAIR MIGRATIONS 034–039 (safe to re-run)
-- ============================================================

-- 034: original_contract_value on jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS original_contract_value NUMERIC(12,2);

-- 035: lead_id FK on jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_lead_id ON jobs(lead_id);

-- 037: soft-delete + versioning on schedule_tasks
ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_version INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_schedule_tasks_deleted_at
  ON schedule_tasks(deleted_at) WHERE deleted_at IS NOT NULL;

-- 038: trade_master_id FK on schedule_tasks
ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS trade_master_id UUID REFERENCES trade_master_library(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_tasks_trade_master
  ON schedule_tasks(trade_master_id) WHERE trade_master_id IS NOT NULL;

-- Best-effort backfill for 038
UPDATE schedule_tasks st
SET trade_master_id = tml.id
FROM trade_master_library tml
WHERE LOWER(REPLACE(st.trade, ' ', '_')) = LOWER(tml.trade_id)
  AND st.trade_master_id IS NULL
  AND st.trade IS NOT NULL;

-- 039: rfq_packages.job_id constraint
-- Surface orphans first
CREATE TABLE IF NOT EXISTS rfq_package_orphans AS
SELECT id, project_address, created_at
FROM rfq_packages
WHERE job_id IS NULL;

-- Best-effort backfill by address match
UPDATE rfq_packages rp
SET job_id = j.id
FROM jobs j
WHERE rp.job_id IS NULL
  AND LOWER(TRIM(rp.project_address)) = LOWER(TRIM(j.address));

CREATE INDEX IF NOT EXISTS idx_rfq_packages_job_id ON rfq_packages(job_id);

-- NOTE: The NOT NULL constraint from step 3 of 039 is intentionally OMITTED here.
-- It will fail if any rfq_packages still have job_id = NULL after the backfill above.
-- Check first: SELECT * FROM rfq_package_orphans;
-- If empty, run manually: ALTER TABLE rfq_packages ALTER COLUMN job_id SET NOT NULL;


-- ============================================================
-- PART 2: DIAGNOSTIC — confirm what exists
-- ============================================================

SELECT
  t.table_name,
  t.column_name,
  CASE WHEN c.column_name IS NOT NULL THEN '✅' ELSE '❌ MISSING' END AS status,
  c.is_nullable
FROM (VALUES
  ('jobs',            'original_contract_value'),
  ('jobs',            'lead_id'),
  ('schedule_tasks',  'deleted_at'),
  ('schedule_tasks',  'schedule_version'),
  ('schedule_tasks',  'trade_master_id'),
  ('rfq_packages',    'job_id')
) AS t(table_name, column_name)
LEFT JOIN information_schema.columns c
  ON c.table_name = t.table_name
  AND c.column_name = t.column_name
  AND c.table_schema = 'public'
ORDER BY t.table_name, t.column_name;

-- Check 039 NOT NULL status
SELECT
  is_nullable,
  CASE WHEN is_nullable = 'NO' THEN '✅ NOT NULL applied' ELSE '⚠️ still nullable' END AS constraint_status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'rfq_packages'
  AND column_name = 'job_id';

-- Remaining orphans (should be 0 before applying NOT NULL)
SELECT COUNT(*) AS remaining_orphans FROM rfq_packages WHERE job_id IS NULL;
