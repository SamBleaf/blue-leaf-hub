-- Job extraction store, outbound Message-ID tracking, fee proposal PDF path

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS arch_ref text DEFAULT '',
  ADD COLUMN IF NOT EXISTS eng_ref text DEFAULT '',
  ADD COLUMN IF NOT EXISTS spec_ref text DEFAULT '',
  ADD COLUMN IF NOT EXISTS slab_area_m2 numeric,
  ADD COLUMN IF NOT EXISTS roof_area_m2 numeric,
  ADD COLUMN IF NOT EXISTS storeys integer,
  ADD COLUMN IF NOT EXISTS building_type text DEFAULT '',
  ADD COLUMN IF NOT EXISTS extracted_data jsonb;

-- Optional: link to Buildxact job for fee proposal / integrations
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS buildexact_job_id text;

ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS sent_message_id text DEFAULT '';

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS message_id text;

ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS dropbox_pdf_path text;
