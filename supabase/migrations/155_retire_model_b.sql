-- =============================================================================
-- Migration 155 — Tender restructure, build step 10: RETIRE Model B.
-- Model A (jobs + rfqs + the mig-154 rfq_quote_submissions/attachments/tender_* tables) is the
-- sole tender spine. Model B was vestigial at drop time (rfq_packages 2 · rfq_trade_scopes 3 ·
-- rfq_recipients 1 · rfq_addenda 0 — mostly a "Debug" package). All application writers were
-- removed first (RfqEngine finalize + the RfqPackageDetail CRUD page); every remaining READER
-- degrades gracefully (Supabase query errors return {data:null} — the readers fall back to empty),
-- and the fee-proposal inclusions reader was repointed to tender_trade_scopes.
--
-- No table outside Model B holds a foreign key INTO these tables, and no view/function/trigger
-- references them, so the drop cannot ripple beyond Model B. Idempotent (IF EXISTS). Ordered
-- child→parent; CASCADE is belt-and-braces for the internal FKs.
-- Spec: docs/plans/TENDER_MODEL_A_VS_B.md, TENDER_SCHEMA_AND_MIGRATION.md.
--
-- SAFETY: apply this ONLY after the step-10 code is deployed and smoke-tested (send an RFQ →
-- lands on the Tender Board; generate a fee proposal). Until applied, the app already ignores
-- these tables; applying it makes the retirement permanent.
-- =============================================================================

DROP TABLE IF EXISTS public.rfq_recipients   CASCADE;
DROP TABLE IF EXISTS public.rfq_addenda       CASCADE;
DROP TABLE IF EXISTS public.rfq_trade_scopes  CASCADE;
DROP TABLE IF EXISTS public.rfq_packages      CASCADE;

NOTIFY pgrst, 'reload schema';
