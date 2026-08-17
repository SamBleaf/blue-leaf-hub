-- 183_lead_documents_invoice_type.sql
-- Widen the lead_documents.document_type CHECK to accept 'invoice' — the official Xero
-- invoice PDF filed against a lead (Xero AR P2). Additive + idempotent; mirrors mig 181.
-- Deploy-ahead-safe: the invoice-PDF filing inserts the lead_documents row best-effort, so
-- until this is applied the Dropbox/storage copy still lands, just without the lead_documents row.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_documents_document_type_check'
      AND pg_get_constraintdef(oid) ILIKE '%document_type%'
  ) THEN
    ALTER TABLE public.lead_documents DROP CONSTRAINT lead_documents_document_type_check;
  END IF;
END $$;

ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_document_type_check
  CHECK (document_type IN ('brief','blueprint','survey','quote','contract','ptsa_signed','concept_agreement','invoice','other'));

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
--   ALTER TABLE public.lead_documents DROP CONSTRAINT IF EXISTS lead_documents_document_type_check;
--   ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_document_type_check
--     CHECK (document_type IN ('brief','blueprint','survey','quote','contract','ptsa_signed','concept_agreement','other'));
