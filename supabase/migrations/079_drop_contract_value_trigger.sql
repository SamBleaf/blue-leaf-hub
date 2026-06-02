-- =============================================================================
-- 079_drop_contract_value_trigger.sql — Phase 5: collapse contract_value to a
-- single GENERATED source of truth.
-- See docs/agent_knowledge/UNIVERSAL_DATA_MIGRATION_PLAN.md §3 (Phase 5) + §5.3 +
-- MASTER_DATA_DICTIONARY.md §17/§20/§29 ("contract_value is Generated — never
-- stored editable").
--
-- WHY: contract_value must be a GENERATED fact computed live as
--   contract_value = original_contract_value + Σ(signed variations, ex-GST)
-- The factsService contractValue computer already produces exactly this, and the
-- Buildxact reconcile tool's Hub side uses the identical formula
-- (server/lib/buildexactReconcile.mjs ~line 90). Migration 034 created a TRIGGER
-- (job_variation_contract_sync) + function (sync_job_contract_value) that STORE the
-- value into jobs.contract_value whenever a variation is signed. That stored column
-- is now redundant: it is a second source that can silently drift from the computed
-- truth. This migration drops the trigger + its function so the stored column is no
-- longer auto-written. jobs.original_contract_value stays as the ONLY stored money
-- INPUT (static); jobs.contract_value remains as a column but is no longer kept in
-- sync by the trigger (finance now reads the Generated fact via getJobProfile/getFact).
--
-- ⚠️⚠️⚠️ APPLY ONLY AFTER all finance reads use the canonical contract_value fact
-- (Phase 5 code: financeCCRoutes.mjs reads contract_value via getFact/getJobProfile)
-- AND a live-test + Buildxact reconcile pass confirm Hub contract_value matches
-- Buildxact within $1 (buildexactReconcile.mjs TOLERANCE = 1). Dropping this trigger
-- while any code still trusts the stored jobs.contract_value as authoritative would
-- leave stale reads. Migrate the reads first, then apply this. ⚠️⚠️⚠️
--
-- The function sync_job_contract_value() is used ONLY by the job_variation_contract_sync
-- trigger (verified: no other migration or trigger references it), so dropping both is
-- safe. PURELY a deletion of the storage trigger — no data is destroyed, no column is
-- dropped or renamed. Idempotent (IF EXISTS). Safe to re-run.
-- =============================================================================

-- 1) Drop the trigger that stores jobs.contract_value on every variation insert/update.
DROP TRIGGER IF EXISTS job_variation_contract_sync ON public.job_variations;

-- 2) Drop the trigger function (only consumer was the trigger above).
DROP FUNCTION IF EXISTS public.sync_job_contract_value();

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify (after applying) — expect ZERO rows from each query:
--
--   -- Trigger is gone:
--   SELECT tgname FROM pg_trigger
--   WHERE tgname = 'job_variation_contract_sync'
--     AND NOT tgisinternal;
--   -- Expect 0 rows.
--
--   -- Function is gone:
--   SELECT proname FROM pg_proc
--   WHERE proname = 'sync_job_contract_value';
--   -- Expect 0 rows.
--
-- Then run a reconcile pass to confirm the single Generated source still matches:
--   node scripts/reconcile-buildxact.mjs all
-- Hub "Contract (ex GST)" must equal Buildxact within $1 for every linked job.
-- =============================================================================
