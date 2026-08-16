-- 178_leads_is_test.sql — Test/dev harness
-- Marks a lead as a TEST lead so it can be bounced freely across every pipeline stage (all hard
-- gates bypassed), is excluded from the automatic email cadences + the internal digest + reporting,
-- and carries a visible TEST badge. Additive + defaulted, so it is safe to deploy the code ahead of
-- this paste (the stage-change bypass reads is_test defensively and treats a missing column as false).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false;

-- DOWN (manual):
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS is_test;
