-- 175_correspondence_lead_id.sql — Sales OS Slice 1: the two-way lead mailbox
-- The correspondence table has always been job-keyed (migration 006). Leads had no home for their
-- email thread, so the Qualify email + inbound replies had nowhere to land. This adds a nullable
-- lead_id FK so a correspondence row can key to a LEAD instead of (or as well as) a job. Additive:
-- every existing job-keyed row keeps lead_id NULL and is untouched.

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads (id) ON DELETE CASCADE;

-- Lead mailbox reads filter by lead_id; partial index keeps it cheap and skips the job-only rows.
CREATE INDEX IF NOT EXISTS correspondence_lead_id_idx
  ON public.correspondence (lead_id)
  WHERE lead_id IS NOT NULL;

-- DOWN (manual):
--   DROP INDEX IF EXISTS correspondence_lead_id_idx;
--   ALTER TABLE public.correspondence DROP COLUMN IF EXISTS lead_id;
