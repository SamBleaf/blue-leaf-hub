-- 191_concept_email_stamps.sql — Sales Pipeline Phase 3 (Concept email completion)
-- The Concept client emails now carry a company-profile attachment + a follow-up cadence (behind
-- CONCEPT_EMAIL_FOLLOWUP_ENABLED). The cadence needs queryable send stamps on the lead, mirroring the
-- qualify/discovery pattern (qualify_intro_sent_at / discovery_email_sent_at + *_followup_sent_at).
-- Additive + idempotent. Apply manually in the Supabase SQL editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS concept_brief_questions_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS concept_interim_sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS concept_followup_sent_at        timestamptz;

NOTIFY pgrst, 'reload schema';
