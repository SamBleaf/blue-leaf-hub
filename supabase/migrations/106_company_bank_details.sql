-- 106_company_bank_details.sql
-- Adds bank/payment fields to company_profile so progress-claim and variation
-- emails (BQ-13/BQ-14) can render a "Payment details" block instead of leaving
-- clients to hunt for where to pay. Until these are populated, the emails simply
-- omit the payment block (getCompanyBank() returns null) — safe to deploy first.
--
-- BACKFILL (run manually after applying, with the real values):
--   UPDATE public.company_profile
--      SET bank_account_name = 'Blue Leaf Building',
--          bank_bsb          = 'XXX-XXX',
--          bank_account_number = 'XXXXXXXX';
--
-- DOWN (rollback):
--   ALTER TABLE public.company_profile
--     DROP COLUMN IF EXISTS bank_account_name,
--     DROP COLUMN IF EXISTS bank_bsb,
--     DROP COLUMN IF EXISTS bank_account_number;

ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS bank_account_name   text,
  ADD COLUMN IF NOT EXISTS bank_bsb            text,
  ADD COLUMN IF NOT EXISTS bank_account_number text;
