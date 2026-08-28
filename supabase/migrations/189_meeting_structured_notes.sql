-- 189_meeting_structured_notes.sql — Sales Pipeline Phase 2b
-- Every pipeline meeting carries STRUCTURED notes (not raw transcript only): client priorities,
-- decisions made, changes requested, risks raised, follow-up actions, owner, next step.
-- Stored as jsonb on the lead_meetings row (mig 185). Additive + idempotent.

ALTER TABLE public.lead_meetings
  ADD COLUMN IF NOT EXISTS structured_notes jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
