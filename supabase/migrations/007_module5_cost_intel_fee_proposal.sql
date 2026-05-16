-- Module 5: Cost Intelligence columns + Fee Proposals + proposal sequence
-- Run after 006.

-- Cost intelligence: trade-specific quantities & provenance
ALTER TABLE public.cost_intelligence
  ADD COLUMN IF NOT EXISTS roof_area_m2 numeric,
  ADD COLUMN IF NOT EXISTS wall_area_m2 numeric,
  ADD COLUMN IF NOT EXISTS tile_area_floor_m2 numeric,
  ADD COLUMN IF NOT EXISTS tile_area_wall_m2 numeric,
  ADD COLUMN IF NOT EXISTS solar_system_kw numeric,
  ADD COLUMN IF NOT EXISTS wet_areas integer,
  ADD COLUMN IF NOT EXISTS storeys integer,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'tender';

-- Fee proposals
CREATE TABLE IF NOT EXISTS public.fee_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  quote_number text UNIQUE,
  address text,
  client_name text,
  client_salutation text,
  architect_name text,
  building_type text,
  arch_ref text,
  eng_ref text,
  spec_ref text,
  categories jsonb,
  optional_items jsonb,
  exclusions jsonb,
  inclusion_sections jsonb,
  pc_sums jsonb,
  fee_schedule jsonb,
  net_total numeric,
  markup_percent numeric,
  markup_amount numeric,
  tax_amount numeric,
  total_inc_gst numeric,
  signatories text DEFAULT 'Joshua Manning and Sam Morris',
  opening_paragraph text,
  next_steps text,
  status text DEFAULT 'draft',
  sent_at timestamptz,
  sent_to_email text,
  dropbox_docx_path text,
  buildexact_estimate_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.fee_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all anon fee_proposals" ON public.fee_proposals;
CREATE POLICY "Allow all anon fee_proposals" ON public.fee_proposals FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.sequences (id, current_value) VALUES ('proposal_number', 1191)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.alloc_proposal_sequence()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val integer;
BEGIN
  UPDATE public.sequences
  SET current_value = current_value + 1
  WHERE id = 'proposal_number'
  RETURNING current_value INTO next_val;
  RETURN next_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.alloc_proposal_sequence() TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS fee_proposals_job_id_idx ON public.fee_proposals (job_id);
CREATE INDEX IF NOT EXISTS fee_proposals_status_idx ON public.fee_proposals (status);
