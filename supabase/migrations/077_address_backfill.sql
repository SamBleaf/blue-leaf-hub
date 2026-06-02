-- =============================================================================
-- 077_address_backfill.sql — Phase 1: address as canonical identity
-- See docs/agent_knowledge/UNIVERSAL_DATA_MIGRATION_PLAN.md §3 (Phase 1) +
-- MASTER_DATA_DICTIONARY.md §4.1 / §128.
--
-- GOAL: make jobs.address_normalised the single match key and populate
--       address_suburb / address_postcode / address_state on every jobs row,
--       computed the SAME WAY normaliseAddress() (server/lib/addressNormalise.mjs)
--       computes them — so SQL-side data == JS-side derivation.
--
-- IMPORTANT — why the backfill is NOT done in this SQL:
--   normaliseAddress() is a regex-based parser: it expands street abbreviations
--   via a JS lookup map (st→street, rd→road, cres→crescent, …), strips the
--   trailing AU state token + postcode, and parses suburb/state/postcode from
--   the tail. That abbreviation-expansion map cannot be faithfully replicated in
--   portable SQL. Migration 040 already shipped a NAIVE backfill
--   (`address_normalised = LOWER(TRIM(address))`, suburb/postcode/state left NULL)
--   which does NOT match normaliseAddress() output and would mis-match against
--   keys written by the live code path. So this migration:
--     (a) idempotently RE-ASSERTS the columns + partial index (already added in
--         migration 040 — safe no-ops here so this file is self-contained), and
--     (b) leaves the actual value backfill to a one-off Node script that calls
--         normaliseAddress() directly:  node scripts/backfill-address-facts.mjs
--   Run that script AFTER applying this migration (see the note at the bottom).
--
-- PURELY ADDITIVE. No column is dropped or renamed; no existing data is
-- destroyed. Safe to apply at any time, idempotent (safe to re-run).
-- Apply this while `jobs` is near-empty (before the live Buildxact sync fills it).
-- =============================================================================

-- ── 1. Canonical address columns (re-assert; migration 040 added these) ───────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS address_normalised TEXT,             -- lowercase, expanded abbreviations, state/postcode stripped
  ADD COLUMN IF NOT EXISTS address_suburb     TEXT,
  ADD COLUMN IF NOT EXISTS address_state      TEXT DEFAULT 'SA',
  ADD COLUMN IF NOT EXISTS address_postcode   TEXT,
  ADD COLUMN IF NOT EXISTS is_duplicate_of    UUID REFERENCES public.jobs(id) ON DELETE SET NULL;

-- ── 2. Partial index on the match key (re-assert; migration 040 added this) ───
CREATE INDEX IF NOT EXISTS idx_jobs_address_normalised
  ON public.jobs (address_normalised)
  WHERE address_normalised IS NOT NULL;

-- ── 3. Value backfill — DONE BY THE NODE SCRIPT, NOT HERE ─────────────────────
-- The accurate backfill (matching normaliseAddress()) lives in
--   scripts/backfill-address-facts.mjs
-- Run it once, immediately after applying this migration:
--   node scripts/backfill-address-facts.mjs            # dry-run (prints planned writes)
--   node scripts/backfill-address-facts.mjs --apply    # writes via setFact() (stamps provenance)
-- It walks every jobs row, recomputes { normalised, suburb, postcode, state }
-- with the exact JS parser, and writes them through the facts service so each
-- value gets a job_fact_history provenance row (reason='address_backfill').

-- ── 4. Duplicate detection — REVIEW-ONLY, NOT auto-merged ─────────────────────
-- Two jobs that share a normalised key are candidate duplicates. We deliberately
-- do NOT auto-set is_duplicate_of here: a wrong auto-merge mis-links two real
-- sites (UNIVERSAL_DATA_MIGRATION_PLAN.md §6 risk register). Instead, the SELECT
-- below LISTS candidates for manual review. The optional UPDATE is left commented
-- and must only be run by a human after eyeballing the candidate list, and only
-- while `jobs` is near-empty.
--
-- To set is_duplicate_of for confirmed duplicates (points the LATER-created row
-- at the EARLIEST row sharing its normalised key) — REVIEW FIRST, then uncomment:
--
--   WITH ranked AS (
--     SELECT id, address_normalised,
--            FIRST_VALUE(id) OVER (
--              PARTITION BY address_normalised ORDER BY created_at ASC, id ASC
--            ) AS canonical_id,
--            ROW_NUMBER() OVER (
--              PARTITION BY address_normalised ORDER BY created_at ASC, id ASC
--            ) AS rn
--     FROM public.jobs
--     WHERE address_normalised IS NOT NULL
--   )
--   UPDATE public.jobs j
--   SET    is_duplicate_of = r.canonical_id
--   FROM   ranked r
--   WHERE  j.id = r.id AND r.rn > 1 AND j.is_duplicate_of IS NULL;

-- =============================================================================
-- Verify (run after applying + after the Node backfill script):
--
-- -- 1. Columns + index present:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='jobs'
--     AND column_name IN ('address_normalised','address_suburb','address_state','address_postcode','is_duplicate_of');
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname='public' AND tablename='jobs' AND indexname='idx_jobs_address_normalised';
--
-- -- 2. Backfill coverage (rows still missing a normalised key after the script ran):
-- SELECT count(*) AS jobs_total,
--        count(*) FILTER (WHERE address_normalised IS NULL AND address IS NOT NULL) AS missing_normalised,
--        count(*) FILTER (WHERE address_suburb IS NULL  AND address IS NOT NULL)     AS missing_suburb
-- FROM public.jobs;
--
-- -- 3. Duplicate candidates to review (should be 0 rows on near-empty jobs):
-- SELECT address_normalised, count(*) AS n, array_agg(id) AS job_ids
-- FROM public.jobs
-- WHERE address_normalised IS NOT NULL
-- GROUP BY address_normalised
-- HAVING count(*) > 1;
-- =============================================================================

NOTIFY pgrst, 'reload schema';
