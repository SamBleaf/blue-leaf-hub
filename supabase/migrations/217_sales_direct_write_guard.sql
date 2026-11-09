-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 217 | R05 P1 — Sales controls: refuse direct browser-token writes to pipeline and contract state
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- WHY: the Hub API enforces stage gates, roles and the signed-contract evidence rule, but the anon key
-- ships in the browser and RLS on leads and lead_documents lets any staff JWT (employee included) write
-- those rows directly through PostgREST. A direct request could set stage='won' or contract_status='signed',
-- or insert a construction_contract row pointing at no file, and the Hub API would then accept it as evidence.
--
-- WHAT: two BEFORE triggers that refuse those specific changes when the database role is a browser token
-- (anon or authenticated). Everything else is untouched:
--   • The Hub API runs as service_role, so its gates and dedicated writers keep working.
--   • SECURITY DEFINER functions and the SQL editor do not run as anon/authenticated.
--   • Any other write stays as RLS allows it, including RfqEngine's direct leads.job_id link.
--   • Protected values may be resent unchanged; only a change is refused.
--
-- ADDITIVE: no table, column, policy or data change. The app does not depend on this migration, so it can
-- be applied before or after the code deploys. Idempotent.
--
-- PREREQUISITE: migrations 024, 045, 178, 179 and 194 applied (the preflight below checks the columns).
-- NOT APPLIED TO PRODUCTION — requires the owner to apply it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['stage','contract_status','contract_signed_date','ptsa_status','concept_agreement_status','lead_type','is_test']) AS c
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='leads' AND column_name=c);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '217 preflight: leads is missing column(s): %. Apply the earlier migrations first.', missing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='lead_documents' AND column_name='document_type') THEN
    RAISE EXCEPTION '217 preflight: lead_documents.document_type is missing. Apply the earlier migrations first.';
  END IF;
END $$;

-- SECURITY INVOKER (the default) on purpose: current_user must be the caller's role.
CREATE OR REPLACE FUNCTION public.leads_direct_write_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stage IS DISTINCT FROM 'enquiry'
       OR NEW.contract_status IS NOT NULL
       OR NEW.contract_signed_date IS NOT NULL
       OR NEW.ptsa_status = 'signed'
       OR NEW.concept_agreement_status = 'accepted'
       OR COALESCE(NEW.lead_type, 'standard') <> 'standard'
       OR COALESCE(NEW.is_test, false) THEN
      RAISE EXCEPTION 'A lead can only be created past Enquiry through the Hub.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.stage                    IS DISTINCT FROM OLD.stage
     OR NEW.contract_status          IS DISTINCT FROM OLD.contract_status
     OR NEW.contract_signed_date     IS DISTINCT FROM OLD.contract_signed_date
     OR NEW.ptsa_status              IS DISTINCT FROM OLD.ptsa_status
     OR NEW.concept_agreement_status IS DISTINCT FROM OLD.concept_agreement_status
     OR NEW.lead_type                IS DISTINCT FROM OLD.lead_type
     OR NEW.is_test                  IS DISTINCT FROM OLD.is_test THEN
    RAISE EXCEPTION 'Lead stage and signed-contract details can only be changed through the Hub.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_direct_write_guard ON public.leads;
CREATE TRIGGER trg_leads_direct_write_guard
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_direct_write_guard();

-- A construction_contract row is the evidence the Won gate reads, so a browser token can't add, change or remove one.
CREATE OR REPLACE FUNCTION public.lead_documents_contract_evidence_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND ((TG_OP <> 'INSERT' AND OLD.document_type = 'construction_contract')
       OR (TG_OP <> 'DELETE' AND NEW.document_type = 'construction_contract')) THEN
    RAISE EXCEPTION 'A signed building contract can only be recorded or removed through the Hub.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_documents_contract_evidence_guard ON public.lead_documents;
CREATE TRIGGER trg_lead_documents_contract_evidence_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.lead_documents
  FOR EACH ROW EXECUTE FUNCTION public.lead_documents_contract_evidence_guard();

-- ── VERIFICATION ────────────────────────────────────────────────────────────────────────────────────
-- SELECT tgname FROM pg_trigger WHERE tgname IN
--   ('trg_leads_direct_write_guard','trg_lead_documents_contract_evidence_guard') AND NOT tgisinternal;  -- expect 2 rows
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_lead_documents_contract_evidence_guard ON public.lead_documents;
-- DROP FUNCTION IF EXISTS public.lead_documents_contract_evidence_guard();
-- DROP TRIGGER IF EXISTS trg_leads_direct_write_guard ON public.leads;
-- DROP FUNCTION IF EXISTS public.leads_direct_write_guard();
