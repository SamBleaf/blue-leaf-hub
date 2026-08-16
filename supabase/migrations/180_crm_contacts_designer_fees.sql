-- 180_crm_contacts_designer_fees.sql — Sales OS: Discovery stage (per-designer fee defaults)
-- crm_contacts (mig 061) has no company or fee fields. Add a company (for the {{designer_company}}
-- email token) and the two CLIENT-FACING default fees a designer carries — selecting a designer on
-- a lead autofills these onto leads.concept_fee / design_package_fee (editable per lead). Stored
-- EX-GST, rendered inc-GST. These are DISTINCT from job_contact_roles.fee_amount, which is the
-- admin-only COST we pay a consultant — keep them apart. Additive-only.

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS company             text,
  ADD COLUMN IF NOT EXISTS default_concept_fee numeric(12,2),   -- EX-GST
  ADD COLUMN IF NOT EXISTS default_design_fee  numeric(12,2);   -- EX-GST

-- DOWN (manual):
--   ALTER TABLE public.crm_contacts
--     DROP COLUMN IF EXISTS company, DROP COLUMN IF EXISTS default_concept_fee, DROP COLUMN IF EXISTS default_design_fee;
