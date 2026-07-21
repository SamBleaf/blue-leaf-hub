-- =============================================================================
-- Migration 152 — Worker-app plans: carpentry-job documents + a private 'job-plans' bucket
-- Plans are uploaded into the Hub → Supabase Storage → shown on the worker PWA (deliberate
-- "issue to field" — the current set is what the boys see). job_documents (mig 069) already
-- models supabase-stored, worker-facing docs + a supersedes chain; it only lacked a carpentry
-- spine (job_id → jobs), so most worker sites (carpentry) couldn't hold plans. This adds it.
-- A "plan" row = document_type in the plan set + audience_layer in (site,worker) +
-- status='current' + storage_provider='supabase'. Supersession is EXPLICIT (set at upload),
-- never inferred — see chargeUp/plans routes. Additive + idempotent.
-- =============================================================================

ALTER TABLE public.job_documents
  ADD COLUMN IF NOT EXISTS carpentry_job_id uuid
  REFERENCES public.carpentry_jobs (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_job_documents_carpentry_job
  ON public.job_documents (carpentry_job_id) WHERE carpentry_job_id IS NOT NULL;

-- Private bucket for issued plan PDFs. Served only via short-lived signed URLs through the
-- service role (RLS-bypassing); the bucket is private so clients have no direct access.
insert into storage.buckets (id, name, public)
values ('job-plans', 'job-plans', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
