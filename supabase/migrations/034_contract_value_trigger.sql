-- Migration 034: Auto-sync jobs.contract_value when a variation is signed.
-- Fixes the data drift where jobs.contract_value (set once at fee proposal accept)
-- diverges from the correct value = original_contract_value + SUM(signed variations).

-- Add original_contract_value column to preserve the baseline
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS original_contract_value numeric;

-- Backfill: if we have no original yet, the current stored value is the original
UPDATE jobs
SET original_contract_value = contract_value
WHERE original_contract_value IS NULL
  AND contract_value IS NOT NULL;

-- Trigger function: recalculate contract_value on any variation insert/update
CREATE OR REPLACE FUNCTION sync_job_contract_value()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE jobs
  SET contract_value = (
    COALESCE(original_contract_value, 0)
    + COALESCE(
        (SELECT SUM(amount_ex_gst)
         FROM job_variations
         WHERE job_id = NEW.job_id
           AND status = 'signed'),
        0
      )
  )
  WHERE id = NEW.job_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_variation_contract_sync ON job_variations;

CREATE TRIGGER job_variation_contract_sync
AFTER INSERT OR UPDATE OF status, amount_ex_gst
ON job_variations
FOR EACH ROW
EXECUTE FUNCTION sync_job_contract_value();
