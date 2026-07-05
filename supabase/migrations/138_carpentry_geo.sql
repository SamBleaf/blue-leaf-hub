-- =============================================================================
-- 138_carpentry_geo.sql — geocode facts for carpentry jobs (Ops map layer)
--
-- carpentry_jobs is its own island table (mig 065) with its own site `address`.
-- Most carpentry work is STANDALONE subcontract work for an EXTERNAL builder
-- (carpentry_jobs.job_id IS NULL — mig 082), so it never appears via the builder
-- `projects`→`jobs` join the Ops map used until now. To plot carpentry sites on
-- the Operations map we geocode carpentry_jobs.address directly — same geo facts,
-- same geocodeService, same cache as jobs/leads (mig 134).
--
-- Mirrors the geo_* column set added to jobs/leads in mig 134 exactly, so
-- geocodeToFacts(table, id, ...) writes to carpentry_jobs with zero special-casing.
--
-- PURELY ADDITIVE + idempotent (ADD COLUMN IF NOT EXISTS). No data destroyed.
-- =============================================================================

ALTER TABLE carpentry_jobs
  ADD COLUMN IF NOT EXISTS geo_lat          numeric,
  ADD COLUMN IF NOT EXISTS geo_lng          numeric,
  -- rooftop | interpolated | locality | failed
  ADD COLUMN IF NOT EXISTS geo_confidence   text
    CHECK (geo_confidence IN ('rooftop', 'interpolated', 'locality', 'failed')),
  ADD COLUMN IF NOT EXISTS geo_source       text,
  ADD COLUMN IF NOT EXISTS geo_geocoded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS geo_place_id     text,
  -- address | suburb  (records which grain was geocoded)
  ADD COLUMN IF NOT EXISTS geo_precision    text
    CHECK (geo_precision IN ('address', 'suburb'));

-- Partial index — only rows that have been geocoded (the Ops map filters on coords).
CREATE INDEX IF NOT EXISTS idx_carpentry_jobs_geo
  ON carpentry_jobs (geo_lat, geo_lng)
  WHERE geo_lat IS NOT NULL AND geo_lng IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='carpentry_jobs'
--      AND column_name LIKE 'geo_%' ORDER BY column_name;
--   -- expect: geo_confidence, geo_geocoded_at, geo_lat, geo_lng,
--   --         geo_place_id, geo_precision, geo_source
--
-- Backfill after applying (admin token):
--   POST /api/geo/backfill { dryRun:true,  scope:"carpentry" }   -- plan
--   POST /api/geo/backfill { dryRun:false, scope:"carpentry" }   -- write
-- =============================================================================
