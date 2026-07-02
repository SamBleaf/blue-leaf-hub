-- 129_fee_proposals_lead_id.sql — Batch 1C sub-batch (guarded, own tests).
-- fee_proposals currently links to a lead only indirectly (fee_proposals.job_id →
-- jobs.id → jobs.lead_id). Proposal-level attribution needs a direct lead_id. This is
-- the ONLY change in this sub-batch — no ROI view, no dashboard consumer yet — so it can
-- be verified across fee-proposal / sales / tender / finance flows in isolation first.
--
-- Additive + non-destructive. Idempotent. A BEFORE trigger keeps lead_id in sync with the
-- job wherever a proposal is created/edited, so no per-write-site code change is needed.

ALTER TABLE fee_proposals
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fee_proposals_lead_id
  ON fee_proposals(lead_id) WHERE lead_id IS NOT NULL;

-- One-time backfill from the job's reverse link (jobs.lead_id, migration 035).
UPDATE fee_proposals fp
SET lead_id = j.lead_id
FROM jobs j
WHERE fp.job_id = j.id
  AND j.lead_id IS NOT NULL
  AND fp.lead_id IS NULL;

-- Keep lead_id derived from the linked job on insert/update. A row's explicit lead_id is
-- respected only when it has no job_id (defensive: proposals are job-keyed in practice).
CREATE OR REPLACE FUNCTION fee_proposals_set_lead_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    SELECT j.lead_id INTO NEW.lead_id FROM jobs j WHERE j.id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fee_proposals_set_lead_id ON fee_proposals;
CREATE TRIGGER trg_fee_proposals_set_lead_id
  BEFORE INSERT OR UPDATE OF job_id ON fee_proposals
  FOR EACH ROW EXECUTE FUNCTION fee_proposals_set_lead_id();

COMMENT ON COLUMN fee_proposals.lead_id IS
  'Batch 1C: direct lead link for proposal-level attribution. Derived from jobs.lead_id via trigger; backfilled once from migration 035 reverse link.';
