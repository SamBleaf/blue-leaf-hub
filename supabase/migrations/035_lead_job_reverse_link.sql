-- Migration 035: Add lead_id FK to jobs so we can traverse lead → job in both directions.
-- Currently leads.job_id exists but jobs has no reverse pointer.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_lead_id
  ON jobs(lead_id)
  WHERE lead_id IS NOT NULL;

-- Backfill from the existing leads.job_id direction
UPDATE jobs j
SET lead_id = l.id
FROM leads l
WHERE l.job_id = j.id
  AND j.lead_id IS NULL;
