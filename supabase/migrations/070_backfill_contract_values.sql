-- =============================================================================
-- 070_backfill_contract_values.sql — one-time data fix (value-carry backfill)
--
-- Sets jobs.original_contract_value + contract_value from each job's fee proposal
-- for jobs currently sitting at NULL/0. Mirrors the corrected derivation now used by
-- fee-proposal-accept + win-finalize:
--   contract value (ex-GST) = total_inc_gst - tax_amount   (the ex-GST grand total)
--   fallbacks: total_inc_gst / 1.1, then net_total + markup_amount
--
-- SAFE + IDEMPOTENT: only fills where currently unset; never overwrites a real value.
-- Run AFTER the code fix is deployed and verified on a live accept/win, so the
-- derivation is confirmed correct before bulk-applying it.
-- =============================================================================

WITH proposal_cv AS (
  SELECT DISTINCT ON (fp.job_id)
    fp.job_id,
    CASE
      WHEN COALESCE(fp.total_inc_gst, 0) > 0 AND COALESCE(fp.tax_amount, 0) > 0
        THEN ROUND(fp.total_inc_gst - fp.tax_amount, 2)
      WHEN COALESCE(fp.total_inc_gst, 0) > 0
        THEN ROUND(fp.total_inc_gst / 1.1, 2)
      ELSE COALESCE(fp.net_total, 0) + COALESCE(fp.markup_amount, 0)
    END AS cv
  FROM public.fee_proposals fp
  WHERE fp.job_id IS NOT NULL
  -- prefer the accepted proposal, else the most recently updated
  ORDER BY fp.job_id, (fp.status = 'accepted') DESC, fp.updated_at DESC NULLS LAST
)
UPDATE public.jobs j
SET original_contract_value = pc.cv,
    contract_value          = pc.cv,
    updated_at              = now()
FROM proposal_cv pc
WHERE j.id = pc.job_id
  AND pc.cv > 0
  AND (j.original_contract_value IS NULL OR j.original_contract_value = 0);

-- Propagate to projects so the client portal shows the same figure.
UPDATE public.projects p
SET contract_value = j.contract_value,
    updated_at     = now()
FROM public.jobs j
WHERE p.job_id = j.id
  AND COALESCE(j.contract_value, 0) > 0
  AND (p.contract_value IS NULL OR p.contract_value = 0);

-- Verify after running:
--   SELECT id, address, original_contract_value, contract_value FROM jobs
--   WHERE status = 'won' ORDER BY updated_at DESC;
-- Jobs with NO fee proposal stay at 0 (correctly flagged in the Command Centre) —
-- those need a contract value entered manually.
-- =============================================================================
