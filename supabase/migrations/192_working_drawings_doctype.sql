-- 192_working_drawings_doctype.sql — Sales Pipeline Phase 3b (PTSA / Plans deliverables)
-- The PTSA / Plans stage produces the detailed working drawings (plans, elevations, 3D render).
-- Add 'working_drawings' to the lead_documents.document_type CHECK (name-agnostic swap, mirrors
-- migs 183 + 188). Additive + idempotent. Apply manually in the Supabase SQL editor.

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
    'concept_agreement','concept_drawings','working_drawings','invoice','other'
  ));

NOTIFY pgrst, 'reload schema';
