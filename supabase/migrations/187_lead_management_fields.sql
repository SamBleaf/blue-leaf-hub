-- 187_lead_management_fields.sql — Sales Pipeline restructure (Phase 1)
-- Adds the operator management fields shown as chips in the lead focus panel (temperature /
-- stuck reason / risk flags), and retires the `accepted` pipeline stage (folded into tender).
-- Additive + idempotent. No CHECK on the vocab columns (deploy-ahead — values live in
-- src/lib/constants.js). Apply manually in the Supabase SQL editor.
--
-- ROLLBACK (manual):
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS lead_temperature,
--     DROP COLUMN IF EXISTS stuck_reason, DROP COLUMN IF EXISTS risk_flags;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_temperature text,          -- hot | warm | cooling | ghosting | nurture
  ADD COLUMN IF NOT EXISTS stuck_reason      text,          -- waiting_on_* | budget_mismatch | scope_unclear | other
  ADD COLUMN IF NOT EXISTS risk_flags        text[] NOT NULL DEFAULT '{}';  -- multi-select risk chips

-- Retire the `accepted` stage: fold any live rows into `tender` (the visible pipeline drops
-- `accepted`; the string stays valid since leads.stage is unconstrained text).
UPDATE public.leads SET stage = 'tender' WHERE stage = 'accepted';

NOTIFY pgrst, 'reload schema';
