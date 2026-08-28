-- 188_concept_stage.sql — Sales Pipeline Phase 2 (Concept stage build-out)
-- The Concept stage (key winning_offer) delivers the paid concept design work. Adds:
--  • concept_design_status — the design state machine (with_designer → sent_to_client → approved)
--  • concept_pathway_explained — the exit-gate flag (PTSA/Plans pathway explained to the client)
--  • concept_fee_override_* — the design-lock manual override (Sam/Josh let design start pre-payment)
--  • selections_schedule (jsonb) — the schedule thread (finishes/F&F), carried Concept→Consultants→Tender
--  • concept_drawings lead_documents doc-type (uploaded designer drawings, versioned)
-- No CHECK on the vocab columns (deploy-ahead — values in src/lib/constants.js). Additive + idempotent.
-- Apply manually in the Supabase SQL editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS concept_design_status     text,
  ADD COLUMN IF NOT EXISTS concept_pathway_explained boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS concept_fee_override_at    timestamptz,
  ADD COLUMN IF NOT EXISTS concept_fee_override_by    uuid,
  ADD COLUMN IF NOT EXISTS selections_schedule        jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- ── lead_documents.document_type — add 'concept_drawings' (name-agnostic CHECK swap, mirrors mig 183) ──
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
    'concept_agreement','concept_drawings','invoice','other'
  ));

NOTIFY pgrst, 'reload schema';
