-- 179_lead_discovery_fields.sql — Sales OS: Discovery stage
-- Additive-only columns on public.leads for the Discovery stage: the selected designer, the
-- client-facing concept + design-package fees (stored EX-GST per CLAUDE.md § Amounts; rendered
-- inc-GST in the email/doc/UI), the concept-agreement lifecycle, the discovery email cadence stamps
-- (mirror qualify_intro_sent_at / qualify_followup_sent_at), and the concept follow-up meeting
-- attendees (email token). No CHECK on the status text — the vocab lives app-side in constants.js
-- (mig-174 pattern). client_folder_* already exist (mig 174, pre-provisioned). Deploy-ahead-safe.

ALTER TABLE public.leads
  -- designer selection + client-facing fees (fee model: per-designer defaults, editable per lead)
  ADD COLUMN IF NOT EXISTS selected_designer_contact_id uuid REFERENCES public.crm_contacts(id),
  ADD COLUMN IF NOT EXISTS concept_fee                  numeric(12,2),   -- EX-GST
  ADD COLUMN IF NOT EXISTS design_package_fee           numeric(12,2),   -- EX-GST
  -- concept agreement lifecycle (vocab app-side: draft|generated|sent|accepted|declined)
  ADD COLUMN IF NOT EXISTS concept_agreement_status         text,
  ADD COLUMN IF NOT EXISTS concept_agreement_generated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS concept_agreement_accepted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS concept_agreement_document_path  text,
  -- discovery email cadence stamps
  ADD COLUMN IF NOT EXISTS discovery_email_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS discovery_followup_sent_at   timestamptz,
  -- the concept follow-up meeting attendees (email merge token)
  ADD COLUMN IF NOT EXISTS discovery_meeting_attendees  text;

-- The 7-day discovery follow-up cadence sweeps for discovery-stage leads whose email went out and
-- who haven't accepted yet; a partial index keeps that cheap.
CREATE INDEX IF NOT EXISTS leads_discovery_email_pending_idx
  ON public.leads (discovery_email_sent_at)
  WHERE discovery_email_sent_at IS NOT NULL AND concept_agreement_status IS DISTINCT FROM 'accepted';

-- DOWN (manual):
--   DROP INDEX IF EXISTS leads_discovery_email_pending_idx;
--   ALTER TABLE public.leads
--     DROP COLUMN IF EXISTS selected_designer_contact_id, DROP COLUMN IF EXISTS concept_fee,
--     DROP COLUMN IF EXISTS design_package_fee, DROP COLUMN IF EXISTS concept_agreement_status,
--     DROP COLUMN IF EXISTS concept_agreement_generated_at, DROP COLUMN IF EXISTS concept_agreement_accepted_at,
--     DROP COLUMN IF EXISTS concept_agreement_document_path, DROP COLUMN IF EXISTS discovery_email_sent_at,
--     DROP COLUMN IF EXISTS discovery_followup_sent_at, DROP COLUMN IF EXISTS discovery_meeting_attendees;
