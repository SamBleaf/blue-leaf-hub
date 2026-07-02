-- 130_attribution_roi.sql — Batch 1C main. Closes the marketing→revenue loop.
-- Additive + non-destructive. Idempotent. Depends on 127 (fit), 129 (fee_proposals.lead_id).
--
-- Three pieces:
--   1. lead_touch_events — append-only multi-touch spine (unifies attribution_events,
--      email opens/clicks and logged offline touches into one weighted stream).
--   2. enquiry_attribution revenue columns — won_value / won_at / stage_at_report /
--      allocation_model, so conversion value is written back per lead.
--   3. v_lead_attribution_roi — per-lead read model (source × fit × proposal × won × cost)
--      that replaces the hard-coded pipeline_value:null stub in the marketing dashboard.

-- ── 1. lead_touch_events (append-only) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_touch_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  channel         text NOT NULL CHECK (channel IN ('organic','paid','social','email','referral','direct','offline')),
  source          text,
  medium          text,
  campaign        text,
  content_item_id uuid,
  email_send_id   uuid,
  weight          numeric(6,4) NOT NULL DEFAULT 1.0,
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_touch_events_lead ON lead_touch_events(lead_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_lead_touch_events_channel ON lead_touch_events(channel);
-- RLS on (consistent with attribution_events / enquiry_attribution). No policy = server
-- service-role access only, which is all this table needs (never read via the anon client).
ALTER TABLE lead_touch_events ENABLE ROW LEVEL SECURITY;

-- ── 2. enquiry_attribution revenue writeback columns ────────────────────────
ALTER TABLE enquiry_attribution
  ADD COLUMN IF NOT EXISTS won_value       numeric(14,2),
  ADD COLUMN IF NOT EXISTS won_at          date,
  ADD COLUMN IF NOT EXISTS stage_at_report text,
  ADD COLUMN IF NOT EXISTS allocation_model text NOT NULL DEFAULT 'position'
    CHECK (allocation_model IN ('first','last','linear','position'));

-- ── 3. v_lead_attribution_roi (per-lead read model) ─────────────────────────
-- One row per lead: attribution source + fit + realised/pipeline value + acquisition
-- cost. The marketing endpoint groups this by source/category for the ROI table, and
-- SUMs won_value / pipeline_value to fill the old null KPI. Read-only; no data moved.
CREATE OR REPLACE VIEW v_lead_attribution_roi AS
SELECT
  l.id                                                     AS lead_id,
  l.created_at                                             AS lead_created_at,
  l.stage                                                  AS stage,
  (l.stage = 'won')                                        AS is_won,
  l.lead_source                                            AS lead_source,
  l.lead_source_category                                   AS lead_source_category,
  COALESCE(ea.first_touch_source, l.first_touch_source)    AS first_touch_source,
  COALESCE(ea.last_touch_source,  l.last_touch_source)     AS last_touch_source,
  l.utm_campaign                                           AS campaign,
  l.fit_quality                                            AS fit_quality,
  l.readiness                                              AS readiness,
  COALESCE(l.lead_source_cost, 0)                          AS lead_cost,
  l.job_id                                                 AS job_id,
  j.contract_value                                         AS contract_value,
  fp.proposal_value                                        AS proposal_value,
  fp.proposal_count                                        AS proposal_count,
  -- realised revenue: only for won leads, best-available value
  CASE WHEN l.stage = 'won'
    THEN COALESCE(ea.won_value, j.contract_value, fp.proposal_value, l.estimated_value, 0)
    ELSE 0 END                                             AS won_value,
  -- open pipeline: value still in flight (not won, not lost)
  CASE WHEN l.stage NOT IN ('won','lost')
    THEN COALESCE(fp.proposal_value, l.estimated_value, 0)
    ELSE 0 END                                             AS pipeline_value
FROM leads l
LEFT JOIN enquiry_attribution ea ON ea.lead_id = l.id
LEFT JOIN jobs j ON j.id = l.job_id
LEFT JOIN (
  SELECT lead_id, SUM(total_inc_gst) AS proposal_value, COUNT(*) AS proposal_count
  FROM fee_proposals WHERE lead_id IS NOT NULL GROUP BY lead_id
) fp ON fp.lead_id = l.id;

COMMENT ON VIEW v_lead_attribution_roi IS
  'Batch 1C: per-lead attribution + realised/pipeline value + acquisition cost. Grouped by source in the marketing ROI endpoint; replaces the pipeline_value:null stub.';
