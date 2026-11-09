-- R05_PRODUCTION_PREFLIGHT.sql — READ ONLY. Paste into the Supabase SQL editor and send back the results.
-- Changes nothing. Says which of migrations 212 to 219 are actually in this database, and whether 218 can apply cleanly.
SELECT 'register_apply fn (213)'                 AS check_name, to_regprocedure('public.register_apply(uuid,uuid,jsonb,jsonb,text)') IS NOT NULL AS present
UNION ALL SELECT 'register_issue_document fn (213)', to_regprocedure('public.register_issue_document(uuid,text,integer,jsonb)') IS NOT NULL
UNION ALL SELECT 'room_scope_items table (212)',  to_regclass('public.room_scope_items') IS NOT NULL
UNION ALL SELECT 'client_selections.client_visible (212)', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='client_selections' AND column_name='client_visible')
UNION ALL SELECT 'leads.delivery_model (213)',    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='delivery_model')
UNION ALL SELECT 'leads.contract_status (194)',   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='contract_status')
UNION ALL SELECT 'browser write guard on leads (217)', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_leads_direct_write_guard' AND NOT tgisinternal)
UNION ALL SELECT 'contract evidence guard (217)', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_lead_documents_contract_evidence_guard' AND NOT tgisinternal)
UNION ALL SELECT 'tender notes allowed (218)',    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lead_documents_document_type_check' AND pg_get_constraintdef(oid) ILIKE '%tender_scope_notes%')
UNION ALL SELECT 'leads.plans_supplied_at (219)', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='plans_supplied_at');

-- Anything here stops 218 from applying. Expect no rows.
SELECT document_type, count(*) AS rows_blocking_218 FROM public.lead_documents
WHERE document_type IS NOT NULL AND document_type NOT IN (
  'brief','blueprint','survey','quote','contract','ptsa_signed','concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other',
  'client_brief','architect_brief','selections_schedule','register_baseline','consultant_document','supplier_document','tender_scope_notes')
GROUP BY document_type;

-- Leads marked signed with no signed PDF on file. These can't move to Won until a PDF is attached. Leads already at Won are not affected.
SELECT l.id, l.name, l.stage FROM public.leads l
WHERE l.contract_status = 'signed' AND l.stage <> 'won'
  AND NOT EXISTS (SELECT 1 FROM public.lead_documents d WHERE d.lead_id = l.id AND d.document_type = 'construction_contract' AND d.storage_path IS NOT NULL);

-- Leads at Consultants or Tender whose documents have only reached Received. These will now show as still to review.
SELECT l.id, l.name, l.stage FROM public.leads l
WHERE l.stage IN ('consultants','tender') AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(l.consultant_roster,'[]'::jsonb)) r, jsonb_array_elements(COALESCE(r->'deliverables','[]'::jsonb)) d WHERE d->>'status' = 'received');
