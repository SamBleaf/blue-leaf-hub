-- ============================================================
-- Migration 135 — Site Intelligence enrichment columns
-- ============================================================
-- Adds site enrichment columns to jobs + leads.
-- Part of Phase 1 (G1-B) of the Job Geocoding / Maps plan
-- (docs/plans/JOB_GEOCODING_CROSS_MODULE_PLAN.md).
--
-- Stores results from siteEnrichmentService.mjs: council/LGA,
-- bushfire overlay, P&D Code zone, slope (from Mapbox Tilequery),
-- derived complexity, plus a raw-layer audit blob.
--
-- ADDITIVE and NON-DESTRUCTIVE. All columns use ADD COLUMN IF NOT
-- EXISTS. No existing rows or columns are modified.
--
-- NOTE: Apply manually in the Supabase SQL editor (Dashboard →
-- SQL Editor → New query → paste → Run). Do NOT run via CLI
-- against production without staging review.
--
-- ROLLBACK:
--   ALTER TABLE jobs
--     DROP COLUMN IF EXISTS site_council,
--     DROP COLUMN IF EXISTS site_bushfire_prone,
--     DROP COLUMN IF EXISTS site_bushfire_detail,
--     DROP COLUMN IF EXISTS site_zone,
--     DROP COLUMN IF EXISTS site_slope_deg,
--     DROP COLUMN IF EXISTS site_slope_band,
--     DROP COLUMN IF EXISTS site_complexity,
--     DROP COLUMN IF EXISTS site_enriched_at,
--     DROP COLUMN IF EXISTS site_intel;
--   ALTER TABLE leads
--     DROP COLUMN IF EXISTS site_council,
--     DROP COLUMN IF EXISTS site_bushfire_prone,
--     DROP COLUMN IF EXISTS site_bushfire_detail,
--     DROP COLUMN IF EXISTS site_zone,
--     DROP COLUMN IF EXISTS site_slope_deg,
--     DROP COLUMN IF EXISTS site_slope_band,
--     DROP COLUMN IF EXISTS site_complexity,
--     DROP COLUMN IF EXISTS site_enriched_at,
--     DROP COLUMN IF EXISTS site_intel;
-- ============================================================

-- ── 1. jobs — site intelligence columns ─────────────────────
ALTER TABLE jobs
  -- Council / LGA name (e.g. "ADELAIDE HILLS COUNCIL")
  ADD COLUMN IF NOT EXISTS site_council         text,
  -- Whether the site is in a bushfire-prone overlay (advisory)
  ADD COLUMN IF NOT EXISTS site_bushfire_prone  boolean,
  -- Raw overlay descriptor from the bushfire layer (e.g. risk class)
  ADD COLUMN IF NOT EXISTS site_bushfire_detail text,
  -- P&D Code zone name (e.g. "Suburban Neighbourhood", "Rural Zone")
  ADD COLUMN IF NOT EXISTS site_zone            text,
  -- Slope in degrees (derived from Mapbox Tilequery elevation grid)
  ADD COLUMN IF NOT EXISTS site_slope_deg       numeric,
  -- Slope band: flat | gentle | moderate | steep
  ADD COLUMN IF NOT EXISTS site_slope_band      text
    CHECK (site_slope_band IN ('flat', 'gentle', 'moderate', 'steep')),
  -- Derived site complexity signal: low | medium | high
  ADD COLUMN IF NOT EXISTS site_complexity      text
    CHECK (site_complexity IN ('low', 'medium', 'high')),
  -- When enrichment was last run
  ADD COLUMN IF NOT EXISTS site_enriched_at     timestamptz,
  -- Raw layer responses for audit / debugging (do not display to users)
  ADD COLUMN IF NOT EXISTS site_intel           jsonb;

-- ── 2. leads — site intelligence columns (mirror) ───────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS site_council         text,
  ADD COLUMN IF NOT EXISTS site_bushfire_prone  boolean,
  ADD COLUMN IF NOT EXISTS site_bushfire_detail text,
  ADD COLUMN IF NOT EXISTS site_zone            text,
  ADD COLUMN IF NOT EXISTS site_slope_deg       numeric,
  ADD COLUMN IF NOT EXISTS site_slope_band      text
    CHECK (site_slope_band IN ('flat', 'gentle', 'moderate', 'steep')),
  ADD COLUMN IF NOT EXISTS site_complexity      text
    CHECK (site_complexity IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS site_enriched_at     timestamptz,
  ADD COLUMN IF NOT EXISTS site_intel           jsonb;

-- ── 3. Partial index for backfill queries ───────────────────
-- Fast scan for rows that have coordinates but haven't been enriched yet.
CREATE INDEX IF NOT EXISTS idx_jobs_site_enriched
  ON jobs (site_enriched_at)
  WHERE geo_lat IS NOT NULL AND site_enriched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_site_enriched
  ON leads (site_enriched_at)
  WHERE geo_lat IS NOT NULL AND site_enriched_at IS NULL;
