-- =============================================================================
-- 078_lead_carry_provenance.sql — Phase 2: lead → job fact carry (estimate field)
-- See docs/agent_knowledge/UNIVERSAL_DATA_MIGRATION_PLAN.md §3 (Phase 2) +
-- MASTER_DATA_DICTIONARY.md §11/§16 ("Lead→job conversion stamps ... estimated_value
-- onto the job").
--
-- WHY: lead→job conversion now happens server-side (POST /api/sales/leads/:id/
-- convert-to-job) and stamps each carried lead fact via the facts service so
-- job_fact_history records the value came from the lead. Client name/email/phone,
-- address, project_type, architect_name already have canonical jobs columns
-- (mig 001 + mig 071) and registered facts. The one gap is the lead's DEAL-VALUE
-- ESTIMATE (leads.estimated_value): jobs has no estimate column distinct from the
-- contract money. We deliberately do NOT carry it into:
--   - original_contract_value / contract_value — those are the consequential
--     CONTRACT money, set at WIN by Phase 5 from the accepted proposal. Reusing them
--     here would conflict with Phase 5 and inflate finance/margin with a sales guess.
--   - estimated_total_cost (mig 022) — that is a budgeted COST-to-complete, not a
--     deal value; wrong semantics.
-- So add a dedicated, internal-tier jobs.estimated_value to hold the carried sales
-- estimate. The carry provenance itself lives in job_fact_history (source='system',
-- reason='lead_conversion') — NO new history table is needed (the plan's preferred
-- approach: reuse job_fact_history).
--
-- PURELY ADDITIVE. No column is dropped or renamed; no existing data is destroyed.
-- Idempotent (safe to re-run). Apply before deploying the Phase 2 conversion code
-- that writes this column. While jobs is near-empty there is nothing to backfill.
-- =============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2);  -- deal-value estimate carried from leads.estimated_value at conversion (NOT the contract value)

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify (after applying):
--   SELECT column_name, data_type, numeric_precision, numeric_scale
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'jobs'
--     AND column_name = 'estimated_value';
-- Expect one row: estimated_value | numeric | 12 | 2
-- =============================================================================
