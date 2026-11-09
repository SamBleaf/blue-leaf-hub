-- 219_plans_supplied_pathway.sql — R05 P6. Records that a client already holds completed plans (Sales blueprint Tab 11).
--
-- Additive and nullable. NULL plans_supplied_at means the lead behaves exactly as today, so there is no backfill.
-- delivery_model is untouched: it says how Blue Leaf contracts and never waives a stage.
-- The Hub API writes these through POST /api/sales/leads/:id/plans-supplied, as service_role. A browser token can't.
--
-- ROLLBACK:
--   Restore public.leads_direct_write_guard() from 217_sales_direct_write_guard.sql, then:
--   ALTER TABLE public.leads DROP COLUMN plans_supplied_note, DROP COLUMN plans_supplied_by, DROP COLUMN plans_supplied_at;
--   Check first: SELECT count(*) FROM public.leads WHERE plans_supplied_at IS NOT NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS plans_supplied_at   timestamptz,
  ADD COLUMN IF NOT EXISTS plans_supplied_by   uuid,
  ADD COLUMN IF NOT EXISTS plans_supplied_note text;

COMMENT ON COLUMN public.leads.plans_supplied_at IS 'Client already holds completed plans: Concept and PTSA do not apply. Set only through the Hub API. Never derived from delivery_model.';

-- Same guard as 217, plus these columns. They change which stages apply, so a direct browser write could otherwise skip a hard gate.
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
       OR COALESCE(NEW.is_test, false)
       OR NEW.plans_supplied_at IS NOT NULL THEN
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
     OR NEW.is_test                  IS DISTINCT FROM OLD.is_test
     OR NEW.plans_supplied_at        IS DISTINCT FROM OLD.plans_supplied_at
     OR NEW.plans_supplied_by        IS DISTINCT FROM OLD.plans_supplied_by
     OR NEW.plans_supplied_note      IS DISTINCT FROM OLD.plans_supplied_note THEN
    RAISE EXCEPTION 'Lead stage and signed-contract details can only be changed through the Hub.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
