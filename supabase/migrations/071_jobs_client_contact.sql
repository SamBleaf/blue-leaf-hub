-- =============================================================================
-- 071_jobs_client_contact.sql — Phase 2: client contact on the job spine
--
-- The client's email/phone currently live on leads, crm_contacts, and
-- projects.portal_client_email — but NOT on jobs, the canonical spine. So portal
-- invites, progress claims, and variations re-enter the client contact. Add the
-- fields to jobs so client identity + contact is canonical on the job, stamped at
-- lead→job conversion and read by everything downstream.
--
-- PURELY ADDITIVE. Apply before deploying the Phase 2 code that writes these.
-- =============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS client_phone text;
