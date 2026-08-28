-- 195_won_ops_handoff.sql — Sales Pipeline Phase 6 (Won dual-state + the Ops handoff)
-- Won is a two-part state: Contract Secured (entered on a signed contract + recorded contract value)
-- → Ops Ready (the 8-item handoff checklist complete). Adds:
--  • won_substatus — contract_secured | ops_ready (values in src/lib/constants.js; no CHECK)
--  • ops_ready_checklist (jsonb) — { itemKey: bool } operator confirmations for the handoff
-- The job→project handoff itself is a DB guarantee already (trigger 096 creates a projects row when a
-- job flips to status='won'); the Won transition now flips the linked job + stamps the contract value.
-- Additive + idempotent. Apply manually in the Supabase SQL editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS won_substatus       text,
  ADD COLUMN IF NOT EXISTS ops_ready_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
