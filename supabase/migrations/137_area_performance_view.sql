-- 137_area_performance_view.sql  (G3-B1 — Sales Intelligence Area Performance)
-- Additive / read-only view. No tables altered. No data moved.
--
-- v_area_performance — per-suburb rollup over leads + v_lead_attribution_roi.
-- Used by GET /api/marketing/area-performance (marketingAreaPerformanceRoutes.mjs).
--
-- MANUAL APPLY: paste into Supabase dashboard SQL editor, then NOTIFY pgrst.
--
-- Depends on:
--   migration 127  (leads.fit_quality, leads.lead_source_category, leads.stage)
--   migration 128  (v_lead_attribution_roi — already a view, no dep risk)
--   migration 130  (v_lead_attribution_roi definition lives here)
--
-- ── Qualified stages (stage index ≥ 2 = qualify and beyond, excluding nurture/lost) ──
-- Pipeline order: enquiry(0) → qualify(1) → discovery(2) → winning_offer(3)
--   → fee_proposal(4) → accepted(5) → tender(6) → won(7) + nurture/lost (off-pipe)
-- We call "qualified" = past the enquiry stage: stage IN (qualify … won).
-- "poor fit" = fit_quality IN ('poor','price_shopper').
--
-- Cost data is honest:  lead_cost = COALESCE(lead_source_cost, 0) per the ROI view.
-- cost_per_won is NULL when there are no won leads OR all lead_costs are 0
-- (can't distinguish "truly zero cost" from "cost not captured" — we use a flag).

CREATE OR REPLACE VIEW v_area_performance AS
WITH base AS (
  -- One row per lead, joined to the ROI view for cost + won_value
  SELECT
    l.id                        AS lead_id,
    COALESCE(NULLIF(TRIM(l.suburb), ''), '(no suburb)') AS suburb,
    l.stage                     AS stage,
    l.lead_source_category      AS lead_source_category,
    l.fit_quality               AS fit_quality,
    l.project_type              AS project_type,
    l.created_at                AS created_at,
    -- "qualified" = made it past first-touch enquiry stage
    l.stage NOT IN ('enquiry', 'nurture', 'lost') AS is_qualified,
    l.stage = 'won'             AS is_won,
    l.fit_quality IN ('poor', 'price_shopper') AS is_poor_fit,
    -- won_value from ROI view (0 for non-won per view definition)
    COALESCE(roi.won_value, 0)  AS won_value,
    -- raw lead cost — 0 when not captured (honest; see cost_any_captured flag below)
    COALESCE(roi.lead_cost, 0)  AS lead_cost,
    roi.lead_cost > 0           AS has_cost
  FROM leads l
  LEFT JOIN v_lead_attribution_roi roi ON roi.lead_id = l.id
  WHERE l.archived = false
),
agg AS (
  SELECT
    suburb,
    COUNT(*)                                           AS enquiries,
    COUNT(*) FILTER (WHERE is_qualified)               AS qualified,
    COUNT(*) FILTER (WHERE is_poor_fit)                AS poor_fit,
    COUNT(*) FILTER (WHERE is_won)                     AS won,
    COALESCE(SUM(won_value) FILTER (WHERE is_won), 0)  AS won_value,

    -- quality_ratio = qualified / enquiries  (guard div/0)
    ROUND(
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE is_qualified)::numeric / COUNT(*)
        ELSE 0 END, 4
    ) AS quality_ratio,

    -- win_rate = won / qualified  (guard div/0)
    ROUND(
      CASE WHEN COUNT(*) FILTER (WHERE is_qualified) > 0
        THEN COUNT(*) FILTER (WHERE is_won)::numeric
             / COUNT(*) FILTER (WHERE is_qualified)
        ELSE NULL END, 4
    ) AS win_rate,

    -- total cost across all leads in this suburb (only summed if any cost captured)
    SUM(lead_cost)              AS total_cost,
    BOOL_OR(has_cost)           AS cost_any_captured,

    -- cost_per_won: NULL when no cost data or no won leads
    CASE
      WHEN BOOL_OR(has_cost) AND COUNT(*) FILTER (WHERE is_won) > 0
        THEN ROUND(SUM(lead_cost) / COUNT(*) FILTER (WHERE is_won), 2)
      ELSE NULL
    END                         AS cost_per_won,

    -- dominant source by count (mode)
    (
      SELECT lead_source_category
      FROM base b2
      WHERE b2.suburb = base.suburb
        AND b2.lead_source_category IS NOT NULL
      GROUP BY lead_source_category
      ORDER BY COUNT(*) DESC
      LIMIT 1
    )                           AS top_source,

    -- fit mix as counts for frontend display
    COUNT(*) FILTER (WHERE fit_quality = 'strong')        AS fit_strong,
    COUNT(*) FILTER (WHERE fit_quality = 'possible')      AS fit_possible,
    COUNT(*) FILTER (WHERE fit_quality = 'nurture')       AS fit_nurture,
    COUNT(*) FILTER (WHERE fit_quality = 'poor')          AS fit_poor,
    COUNT(*) FILTER (WHERE fit_quality = 'price_shopper') AS fit_price_shopper

  FROM base
  GROUP BY suburb
)
SELECT
  suburb,
  enquiries,
  qualified,
  poor_fit,
  won,
  won_value,
  quality_ratio,
  win_rate,
  cost_per_won,
  cost_any_captured,
  top_source,
  fit_strong,
  fit_possible,
  fit_nurture,
  fit_poor,
  fit_price_shopper,
  -- small-sample flag: fewer than 5 enquiries → de-emphasise in UI
  enquiries < 5                 AS low_sample
FROM agg;

COMMENT ON VIEW v_area_performance IS
  'G3-B1: per-suburb outcome quality rollup — enquiries/qualified/won/value/win-rate/cost-per-won/fit-mix.
   cost_per_won is NULL when no lead_source_cost data is captured (honest; not fabricated).
   low_sample=true when enquiries < 5 — flagged in UI.
   Depends on v_lead_attribution_roi (mig 130) + leads columns from migs 016/127.
   Read-only; safe to recreate. Applied: manual paste into Supabase dashboard.';

NOTIFY pgrst, 'reload schema';
