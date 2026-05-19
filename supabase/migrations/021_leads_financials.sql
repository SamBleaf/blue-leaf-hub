-- Phase 2: APB financial fields on leads

ALTER TABLE leads ADD COLUMN IF NOT EXISTS target_gp_pct  numeric(5,2);   -- target GROSS MARGIN % (not markup)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS won_at          date;            -- date lead marked as won
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_at         date;            -- date lead marked as lost
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source_cost numeric(10,2); -- acquisition cost (for ROI tracking)
