-- Migration 101: PTSA signed → store signed PDF, stamp lead, provision Dropbox job folder + backfill
-- Additive + idempotent. Mirrors the DO-block style of 045 (ptsa fields) / 060 (lead_documents).
--
-- When a Pre-Tender Service Agreement is marked SIGNED on a lead, one event:
--   (a) stores the signed PDF in the 'lead-documents' Supabase bucket (source of truth),
--   (b) stamps the lead signed (ptsa_status='signed', ptsa_signed_document_path, ptsa_signed_at),
--   (c) provisions the job + Dropbox folder tree (NON-FATAL mirror), and
--   (d) backfills the lead's docs/notes/conversations into the job folder.
-- Supabase is the source of truth; Dropbox is a non-fatal mirror.

-- ─── lead_documents: widen document_type CHECK to add 'ptsa_signed' ───────────
-- Existing set (migration 060): brief | blueprint | survey | quote | contract | other.
-- DROP + re-ADD with 'ptsa_signed' appended (keep every existing value).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_documents_document_type_check'
  ) THEN
    ALTER TABLE lead_documents DROP CONSTRAINT lead_documents_document_type_check;
  END IF;
  ALTER TABLE lead_documents
    ADD CONSTRAINT lead_documents_document_type_check
    CHECK (document_type IN ('brief', 'blueprint', 'survey', 'quote', 'contract', 'ptsa_signed', 'other'));
END $$;

-- ─── leads: signed PTSA pointer + timestamp ──────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ptsa_signed_document_path text,
  ADD COLUMN IF NOT EXISTS ptsa_signed_at            timestamptz;

-- ─── jobs: idempotency markers for Dropbox provisioning + lead backfill ───────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS dropbox_provisioned_at   timestamptz,
  ADD COLUMN IF NOT EXISTS lead_data_backfilled_at  timestamptz;

-- Reload PostgREST schema cache so the new columns are queryable immediately.
NOTIFY pgrst, 'reload schema';
