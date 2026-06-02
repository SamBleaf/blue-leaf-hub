-- =============================================================================
-- 082_carpentry_job_link.sql — Phase 7: carpentry de-island (FINAL phase)
-- See docs/agent_knowledge/UNIVERSAL_DATA_MIGRATION_PLAN.md §3 (Phase 7) + §5.3 +
-- MASTER_DATA_DICTIONARY.md §0 (locked decision) / §31 / §40.
--
-- GOAL: give the carpentry island a single upward link to the builder `jobs`
--       spine so carpentry work can (optionally) roll up with the parent job:
--         • add NULLABLE carpentry_jobs.job_id uuid REFERENCES jobs(id)
--         • index carpentry_jobs(job_id)
--       The link is NULLABLE on purpose: carpentry is often STANDALONE
--       subsidiary work for an EXTERNAL builder (carpentry_jobs.client_name is a
--       builder company, not a Blue Leaf job) — that work has NO parent `jobs`
--       row and MUST stay NULL. This answers dictionary open-question #1.
--
-- ⚠️⚠️⚠️ MONEY-ADJACENT — LABOUR DOUBLE-COUNTING. A timesheet can carry BOTH a
-- builder `timesheets.job_id` AND a `timesheets.carpentry_job_id` (the worker PWA
-- normally sets only one, but the supervisor PATCH
-- /api/workforce/timesheets/:id/carpentry-job adds carpentry_job_id WITHOUT
-- clearing job_id — server/lib/workforceRoutes.mjs). Today there is NO
-- double-count because finance rolls labour up by `timesheets.job_id` and
-- carpentry rolls it up by `timesheets.carpentry_job_id` — two SEPARATE id
-- spaces, two SEPARATE rollups. This migration only adds the LINK; it does NOT
-- change any rollup. The canonical de-dup rule + guard live in
-- server/lib/labourAttribution.mjs and are applied ONLY where a rollup is
-- explicitly made carpentry-aware (none are changed in this phase — see the
-- migration plan: the link + the guard are the deliverables; folding carpentry
-- into existing builder-job numbers is a flagged recommendation, deferred).
--
-- IMPORTANT — why the BACKFILL is NOT done in this SQL:
--   The link is established by EXACT normalised-address match between
--   carpentry_jobs.address and jobs.address_normalised. The match key is what
--   normaliseAddress() (server/lib/addressNormalise.mjs) produces — a regex-based
--   parser that expands street abbreviations via a JS lookup map (st→street,
--   rd→road, cres→crescent, …) and strips the AU state token + postcode. That
--   abbreviation-expansion map CANNOT be faithfully replicated in portable SQL,
--   and a naive LOWER(TRIM()) match would mis-link (or fail to link) real sites.
--   So this migration:
--     (a) idempotently adds the column + index, and
--     (b) leaves the actual link backfill to a one-off Node script that calls
--         normaliseAddress() / resolveJobIdByAddress() directly:
--           node scripts/backfill-carpentry-job-link.mjs
--   Run that script AFTER applying this migration (see the note at the bottom).
--   It links ONLY exact normalised-address matches; ambiguous (>1 candidate
--   builder job) and unmatched carpentry jobs are LEFT NULL — never force-linked.
--
-- PURELY ADDITIVE. No column is dropped or renamed; no existing data is
-- destroyed; no rollup number changes. Idempotent (ADD COLUMN IF NOT EXISTS +
-- CREATE INDEX IF NOT EXISTS) — safe to re-run.
-- Apply this while `carpentry_jobs` is near-empty (before the live Buildxact
-- sync fills it), per §5.3.
-- =============================================================================

-- ── 1. Nullable upward link to the builder jobs spine ────────────────────────
-- NULLABLE: standalone subsidiary carpentry (external builder) has no parent job.
-- ON DELETE SET NULL: deleting a builder job must not cascade-delete carpentry
-- work — it simply de-links it (carpentry survives as standalone).
ALTER TABLE public.carpentry_jobs
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;

-- ── 2. Index on the link (partial — only linked rows) ────────────────────────
CREATE INDEX IF NOT EXISTS idx_carpentry_jobs_job_id
  ON public.carpentry_jobs (job_id)
  WHERE job_id IS NOT NULL;

-- ── 3. Link backfill — DONE BY THE NODE SCRIPT, NOT HERE ─────────────────────
-- The accurate link backfill (matching normaliseAddress()) lives in
--   scripts/backfill-carpentry-job-link.mjs
-- Run it once, immediately after applying this migration:
--   node scripts/backfill-carpentry-job-link.mjs            # dry-run (prints planned links)
--   node scripts/backfill-carpentry-job-link.mjs --apply    # writes carpentry_jobs.job_id
-- It walks every carpentry_jobs row, normalises its address with the exact JS
-- parser, resolves the builder job by EXACT normalised-address key, and links
-- ONLY when there is exactly one confident match. Ambiguous / unmatched rows are
-- LEFT NULL (standalone) for manual review — NEVER force-linked.

-- =============================================================================
-- Verify (run after applying + after the Node backfill script):
--
-- -- 1. Column + index present:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='carpentry_jobs' AND column_name='job_id';
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname='public' AND tablename='carpentry_jobs' AND indexname='idx_carpentry_jobs_job_id';
--
-- -- 2. Link coverage — carpentry jobs WITH vs WITHOUT a builder parent.
-- --    On near-empty carpentry_jobs both totals are 0, which is expected and fine.
-- --    A NULL job_id is VALID (standalone subsidiary work) — not an error.
-- SELECT count(*)                          AS carpentry_total,
--        count(job_id)                     AS linked_to_builder_job,
--        count(*) FILTER (WHERE job_id IS NULL) AS standalone_or_unmatched
-- FROM   public.carpentry_jobs;
--
-- -- 3. List the linked pairs to eyeball (carpentry address ↔ builder job address):
-- SELECT cj.reference, cj.address AS carpentry_address, j.address AS builder_address
-- FROM   public.carpentry_jobs cj
-- JOIN   public.jobs j ON j.id = cj.job_id
-- ORDER  BY cj.reference;
--
-- -- 4. Sanity — a carpentry job must never link to MORE than one builder job
-- --    (FK guarantees a single uuid; this just confirms no orphaned link):
-- SELECT cj.id, cj.reference
-- FROM   public.carpentry_jobs cj
-- LEFT   JOIN public.jobs j ON j.id = cj.job_id
-- WHERE  cj.job_id IS NOT NULL AND j.id IS NULL;
-- -- Expect 0 rows.
-- =============================================================================

NOTIFY pgrst, 'reload schema';
