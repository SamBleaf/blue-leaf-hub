-- 197_schedule_signoff.sql — Schedule Continuity SC-2 (the hard-gated programme sign-off)
-- The client-facing build programme (derived from SCHED lines + buffers) must be human-approved
-- before it renders into a client document — the machine drafts, a person owns the number. Adds the
-- sign-off stamp on the lead. Additive + idempotent. Apply manually in the Supabase SQL editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS schedule_signed_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_signed_off_by uuid;

NOTIFY pgrst, 'reload schema';
