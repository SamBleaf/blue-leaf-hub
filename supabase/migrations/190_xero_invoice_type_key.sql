-- 190_xero_invoice_type_key.sql — Sales Pipeline Phase 3
-- A lead now carries MULTIPLE invoice types (concept_fee + design_package, later deposit). The
-- original UNIQUE(source_type, source_id) from mig 182 would collide them onto one row. Re-key the
-- anti-double-create uniqueness on (invoice_type, source_type, source_id). Idempotent.

DROP INDEX IF EXISTS public.xero_invoices_source_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS xero_invoices_type_source_uidx
  ON public.xero_invoices (invoice_type, source_type, source_id);

NOTIFY pgrst, 'reload schema';
