-- Job knowledge, Buildexact estimate store, structured quote extraction
-- Run after 012.

-- Raw Buildexact XLSX/PDF import — source of truth from estimating software
CREATE TABLE IF NOT EXISTS public.buildexact_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  fee_proposal_id uuid REFERENCES public.fee_proposals(id) ON DELETE SET NULL,
  quote_number text,
  address text,
  client_name text,
  building_type text,
  date_prepared text,
  net_total numeric,
  markup_amount numeric,
  markup_percent numeric,
  tax numeric,
  estimate_total numeric,
  categories jsonb,
  source text DEFAULT 'xlsx',
  imported_at timestamptz DEFAULT now()
);

ALTER TABLE public.buildexact_estimates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all anon buildexact_estimates" ON public.buildexact_estimates;
CREATE POLICY "Allow all anon buildexact_estimates" ON public.buildexact_estimates FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS buildexact_estimates_job_id_idx ON public.buildexact_estimates (job_id);

-- Per-job aggregated knowledge for Blueprint
CREATE TABLE IF NOT EXISTS public.job_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  address text,
  kind text,
  content text,
  data jsonb,
  source_id uuid,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.job_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all anon job_knowledge" ON public.job_knowledge;
CREATE POLICY "Allow all anon job_knowledge" ON public.job_knowledge FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS job_knowledge_job_id_idx ON public.job_knowledge (job_id);
CREATE INDEX IF NOT EXISTS job_knowledge_content_fts ON public.job_knowledge USING gin(to_tsvector('english', coalesce(content, '')));
CREATE UNIQUE INDEX IF NOT EXISTS job_knowledge_upsert_idx ON public.job_knowledge (job_id, kind, source_id);

-- Structured quote extraction on incoming email attachments
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS quoted_amount numeric,
  ADD COLUMN IF NOT EXISTS quote_extraction jsonb,
  ADD COLUMN IF NOT EXISTS quote_extracted_at timestamptz;

-- Prevent duplicate correspondence rows for the same inbound email
CREATE UNIQUE INDEX IF NOT EXISTS correspondence_message_id_unique
  ON public.correspondence (message_id)
  WHERE message_id IS NOT NULL AND message_id != '';
