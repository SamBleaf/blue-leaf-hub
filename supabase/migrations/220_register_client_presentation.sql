-- 220_register_client_presentation.sql — Document suite pair 2 (docs/documents/SELECTIONS_SPEC.md, decision S1).
--
-- The Client Selections Presentation becomes its own issued document, with its own revision series. Until now it was a
-- layout of 'selections_schedule', and issue is keyed on document_type, so issuing the presentation superseded the
-- technical schedule and the other way round. Both documents still read the same register records.
--
-- Additive. Adds 'client_presentation' to the lead_documents.document_type CHECK and to the register_issue_document
-- allow-list. Same advisory lock, revision rule and immutability trigger. Audience is stored as 'client'.
-- ORDER: apply after 213 and 218 (this replaces 218's function and keeps 'tender_scope_notes').
-- Before it is applied: the presentation previews, but issuing it is refused with "Apply migration 220 first".
-- Existing rows: an issued 'selections_schedule' that was the client layout (source_snapshot->>'layout' = 'client')
-- keeps its type; issued rows are immutable (213 trigger). None exist in production (213 is not applied there).
--   Check: SELECT count(*) FROM public.lead_documents WHERE document_type = 'selections_schedule' AND source_snapshot->>'layout' = 'client';
--
-- Uses the name-agnostic, preflighted swap from 194, 213 and 218: the replacement CHECK validates every existing row,
-- so if an unknown value exists this aborts and names it, and nothing changes.
--
-- ROLLBACK (only if no client_presentation row exists):
--   Re-run 218_register_tender_notes.sql (restores its CHECK and function).
--   Check first: SELECT count(*) FROM public.lead_documents WHERE document_type = 'client_presentation';

DO $$
DECLARE c text; v_bad text;
BEGIN
  SELECT string_agg(DISTINCT document_type, ', ') INTO v_bad
  FROM public.lead_documents
  WHERE document_type IS NOT NULL AND document_type NOT IN (
    'brief','blueprint','survey','quote','contract','ptsa_signed',
    'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other',
    'client_brief','architect_brief','selections_schedule','register_baseline',
    'consultant_document','supplier_document','tender_scope_notes','client_presentation');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '220: existing lead_documents.document_type values are not in the new allowed list: %. Widen the list or reconcile the data before applying.', v_bad;
  END IF;

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
    'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other',
    'client_brief','architect_brief','selections_schedule','register_baseline',
    'consultant_document','supplier_document','tender_scope_notes','client_presentation'
  ));

CREATE OR REPLACE FUNCTION public.register_issue_document(
  p_lead_id          uuid,
  p_document_type    text,
  p_expected_version integer,
  p_row              jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cur   public.lead_documents%ROWTYPE;
  v_next  integer;
  v_new   public.lead_documents%ROWTYPE;
BEGIN
  IF p_document_type NOT IN ('client_brief', 'architect_brief', 'selections_schedule', 'register_baseline', 'tender_scope_notes', 'client_presentation') THEN
    RAISE EXCEPTION 'register_issue_document: % is not a register document type', p_document_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'register_issue_document: lead % not found', p_lead_id;
  END IF;
  -- serialise concurrent issues of the same document for the same lead (no lead-row lock contention)
  PERFORM pg_advisory_xact_lock(hashtext('register_issue:' || p_lead_id::text || ':' || p_document_type));

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next FROM public.lead_documents
   WHERE lead_id = p_lead_id AND document_type = p_document_type AND issued_at IS NOT NULL;
  IF p_expected_version IS DISTINCT FROM v_next THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'version_conflict', 'next_version', v_next);
  END IF;

  SELECT * INTO v_cur FROM public.lead_documents
   WHERE lead_id = p_lead_id AND document_type = p_document_type AND issued_at IS NOT NULL AND status = 'current'
   FOR UPDATE;
  IF FOUND THEN
    UPDATE public.lead_documents SET status = 'superseded' WHERE id = v_cur.id;
  END IF;

  INSERT INTO public.lead_documents (
    lead_id, filename, file_size, mime_type, storage_path, document_type, uploaded_by,
    version, status, supersedes_document_id, content_sha256, revision_label, template_key, template_version,
    source_snapshot, issued_at, issued_by, issued_by_name, recipient_name, recipient_email, audience, job_id, project_id)
  VALUES (
    p_lead_id, p_row ->> 'filename', NULLIF(p_row ->> 'file_size', '')::int, p_row ->> 'mime_type', p_row ->> 'storage_path',
    p_document_type, COALESCE(NULLIF(p_row ->> 'uploaded_by', ''), 'register'),
    v_next, 'current', v_cur.id, p_row ->> 'content_sha256', p_row ->> 'revision_label', p_row ->> 'template_key',
    p_row ->> 'template_version', p_row -> 'source_snapshot', now(), NULLIF(p_row ->> 'issued_by', '')::uuid,
    p_row ->> 'issued_by_name', p_row ->> 'recipient_name', p_row ->> 'recipient_email', p_row ->> 'audience',
    NULLIF(p_row ->> 'job_id', '')::uuid, NULLIF(p_row ->> 'project_id', '')::uuid)
  RETURNING * INTO v_new;

  RETURN jsonb_build_object('ok', true, 'document', to_jsonb(v_new) - 'source_snapshot', 'superseded_id', v_cur.id);
END $$;

-- CREATE OR REPLACE keeps existing privileges. Stated again so this file alone shows who may call it.
REVOKE ALL ON FUNCTION public.register_issue_document(uuid, text, integer, jsonb) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON FUNCTION public.register_issue_document(uuid, text, integer, jsonb) FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON FUNCTION public.register_issue_document(uuid, text, integer, jsonb) FROM authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE 'GRANT EXECUTE ON FUNCTION public.register_issue_document(uuid, text, integer, jsonb) TO service_role'; END IF;
END $$;

-- After apply: SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'lead_documents_document_type_check';
