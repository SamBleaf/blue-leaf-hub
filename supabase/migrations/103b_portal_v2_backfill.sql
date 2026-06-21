-- ════════════════════════════════════════════════════════════════════════════
-- Migration 103b — Client Portal v2.0 DATA BACKFILL (run AFTER 103)
-- ════════════════════════════════════════════════════════════════════════════
-- Links existing shadow rows to their canonical finance rows so the v2 portal
-- shows authoritative amounts. One-time, idempotent (only fills NULL links).
--
-- Column names verified against real schema:
--   portal_decisions: type ('variation'|'selection'), cost_delta (ex-GST money)
--   job_variations:   amount_ex_gst, title, status('signed'|'sent_to_client'|...)
--   portal_claims:    stage_name, amount, status('paid'|'invoiced'|'upcoming')
--   progress_claims:  stage, amount_ex_gst, claim_number
--   bridge:           projects.job_id  (portal keys project_id, finance keys job_id)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Variations: portal_decisions(type='variation') → job_variations ────────
UPDATE portal_decisions pd
SET job_variation_id = jv.id
FROM job_variations jv
JOIN jobs j        ON j.id = jv.job_id
JOIN projects p    ON p.job_id = j.id
WHERE p.id = pd.project_id
  AND pd.type = 'variation'
  AND pd.job_variation_id IS NULL
  AND (
        lower(pd.title) = lower(jv.title)   -- exact (case-insensitive) — no LIKE wildcards
     OR pd.cost_delta = jv.amount_ex_gst
  );

-- Flag any variation-type decision we could NOT auto-match, so it is obvious in
-- the admin UI that a human needs to link it (rather than silently mismatching).
UPDATE portal_decisions
SET title = '⚠ UNLINKED — ' || title
WHERE type = 'variation'
  AND job_variation_id IS NULL
  AND title NOT LIKE '⚠ UNLINKED — %';

-- ─── Claims: portal_claims → progress_claims ────────────────────────────────
UPDATE portal_claims pc
SET progress_claim_id = pr.id
FROM progress_claims pr
JOIN jobs j     ON j.id = pr.job_id
JOIN projects p ON p.job_id = j.id
WHERE p.id = pc.project_id
  AND pc.progress_claim_id IS NULL
  AND pc.stage_name ILIKE '%' || pr.stage || '%';

-- ════════════════════════════════════════════════════════════════════════════
-- End Migration 103b
-- ════════════════════════════════════════════════════════════════════════════
