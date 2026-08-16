-- 181_lead_documents_concept_agreement_type.sql — Sales OS: Discovery stage
-- Widen the lead_documents.document_type CHECK to accept 'concept_agreement' (the generated concept
-- agreement saved to the client at Discovery). The CHECK was created in mig 060 and widened in mig
-- 101 (added 'ptsa_signed'); we DROP whatever check currently constrains the column (its name may be
-- auto-generated) then re-ADD the full list, so this is robust regardless of the existing name.

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.lead_documents'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%document_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.lead_documents DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_document_type_check
  CHECK (document_type IN ('brief','blueprint','survey','quote','contract','ptsa_signed','concept_agreement','other'));

-- DOWN (manual): revert to the pre-181 list (drop 'concept_agreement')
--   ALTER TABLE public.lead_documents DROP CONSTRAINT IF EXISTS lead_documents_document_type_check;
--   ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_document_type_check
--     CHECK (document_type IN ('brief','blueprint','survey','quote','contract','ptsa_signed','other'));
