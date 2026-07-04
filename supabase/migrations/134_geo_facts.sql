-- ============================================================
-- Migration 134 — Geocoding foundation (geo facts)
-- ============================================================
-- Adds geocoding columns to jobs + leads and a shared geocode_cache
-- table for deduplication. Part of Phase 0 (G0-A) of the Job
-- Geocoding / Maps plan (docs/plans/JOB_GEOCODING_CROSS_MODULE_PLAN.md).
--
-- ADDITIVE and NON-DESTRUCTIVE. No existing rows or columns are
-- altered. All columns use ADD COLUMN IF NOT EXISTS.
--
-- NOTE: Apply manually in the Supabase SQL editor (Dashboard →
-- SQL Editor → New query → paste → Run). Do NOT run via CLI
-- against production without staging review.
--
-- ROLLBACK:
--   ALTER TABLE jobs
--     DROP COLUMN IF EXISTS geo_lat,
--     DROP COLUMN IF EXISTS geo_lng,
--     DROP COLUMN IF EXISTS geo_confidence,
--     DROP COLUMN IF EXISTS geo_source,
--     DROP COLUMN IF EXISTS geo_geocoded_at,
--     DROP COLUMN IF EXISTS geo_place_id,
--     DROP COLUMN IF EXISTS geo_precision;
--   ALTER TABLE leads
--     DROP COLUMN IF EXISTS geo_lat,
--     DROP COLUMN IF EXISTS geo_lng,
--     DROP COLUMN IF EXISTS geo_confidence,
--     DROP COLUMN IF EXISTS geo_source,
--     DROP COLUMN IF EXISTS geo_geocoded_at,
--     DROP COLUMN IF EXISTS geo_place_id,
--     DROP COLUMN IF EXISTS geo_precision;
--   DROP TABLE IF EXISTS geocode_cache;
--   DROP INDEX IF EXISTS idx_jobs_geo_lat;
--   DROP INDEX IF EXISTS idx_leads_geo_lat;
-- ============================================================

-- ── 1. jobs — geo columns ────────────────────────────────────
ALTER TABLE jobs
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

-- ── 2. leads — geo columns (mirror) ─────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS geo_lat          numeric,
  ADD COLUMN IF NOT EXISTS geo_lng          numeric,
  ADD COLUMN IF NOT EXISTS geo_confidence   text
    CHECK (geo_confidence IN ('rooftop', 'interpolated', 'locality', 'failed')),
  ADD COLUMN IF NOT EXISTS geo_source       text,
  ADD COLUMN IF NOT EXISTS geo_geocoded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS geo_place_id     text,
  ADD COLUMN IF NOT EXISTS geo_precision    text
    CHECK (geo_precision IN ('address', 'suburb'));

-- ── 3. geocode_cache — dedupe identical queries ──────────────
-- Prevents re-geocoding the same normalised address/suburb string.
-- query_normalised is the output of normaliseAddress().normalised
-- (or the suburb string for suburb-grain requests).
CREATE TABLE IF NOT EXISTS geocode_cache (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  query_normalised  text        NOT NULL UNIQUE,
  lat               numeric     NOT NULL,
  lng               numeric     NOT NULL,
  confidence        text        NOT NULL
    CHECK (confidence IN ('rooftop', 'interpolated', 'locality', 'failed')),
  place_id          text,
  precision         text        NOT NULL
    CHECK (precision IN ('address', 'suburb')),
  source            text        NOT NULL DEFAULT 'mapbox',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Unique index on query_normalised (already implied by UNIQUE constraint,
-- explicit index for fast cache-first lookups).
CREATE UNIQUE INDEX IF NOT EXISTS idx_geocode_cache_query
  ON geocode_cache (query_normalised);

-- ── 4. Partial indexes — fast spatial lookups on geocoded rows ──
CREATE INDEX IF NOT EXISTS idx_jobs_geo_lat
  ON jobs (geo_lat)
  WHERE geo_lat IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_geo_lat
  ON leads (geo_lat)
  WHERE geo_lat IS NOT NULL;
