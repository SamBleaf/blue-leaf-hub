-- 194_tender_stage.sql — Sales Pipeline Phase 5 (Tender sub-statuses + proposal as a sales tool)
-- The Tender stage gets a sub-status strip, the Blue Leaf Proposal Checklist (client-facing QC), and
-- the building-contract lifecycle (prepared → sent → signed) that the Won gate consumes. Adds:
--  • tender_substatus — the strip position (values in src/lib/constants.js; no CHECK, deploy-ahead)
--  • proposal_checklist (jsonb) — { itemKey: bool } for the Blue Leaf Proposal Checklist
--  • contract_status / contract_sent_date / contract_signed_date — the contract lifecycle
--  • construction_contract lead_documents doc-type (the signed building contract)
-- Additive + idempotent. Apply manually in the Supabase SQL editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tender_substatus     text,
  ADD COLUMN IF NOT EXISTS proposal_checklist   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contract_status      text,
  ADD COLUMN IF NOT EXISTS contract_sent_date   date,
  ADD COLUMN IF NOT EXISTS contract_signed_date date;

-- ── lead_documents.document_type — add 'construction_contract' (name-agnostic swap, mirrors 183/188/192) ──
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'lead_documents' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%document_type%'
  LOOP EXECUTE format('ALTER TABLE public.lead_documents DROP CONSTRAINT %I', c); END LOOP;
END $$;

ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_document_type_check
  CHECK (document_type IN (
    'brief','blueprint','survey','quote','contract','ptsa_signed',
    'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other'
  ));

NOTIFY pgrst, 'reload schema';
