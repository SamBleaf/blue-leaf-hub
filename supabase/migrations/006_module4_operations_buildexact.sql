-- Module 4 (Tender Manager) + Operations + Buildexact webhook foundation
-- Run after 001–005. Jobs.status / won / lost / archived already exists on jobs (001).

-- RFQ status: allow "not_required" for win review
ALTER TABLE public.rfqs DROP CONSTRAINT IF EXISTS rfqs_status_check;
ALTER TABLE public.rfqs
  ADD CONSTRAINT rfqs_status_check CHECK (
    status IN ('sent', 'reminded', 'received', 'accepted', 'declined', 'not_required')
  );

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS won_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS lost_at timestamptz;

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  address text NOT NULL,
  status text DEFAULT 'active',
  accepted_trades jsonb,
  dropbox_shared_link text,
  dropbox_internal_path text,
  buildexact_job_id text,
  buildexact_linked_at timestamptz,
  buildexact_last_sync timestamptz,
  buildexact_link_source text DEFAULT 'pending',
  tentative_start_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  subcontractor_id uuid REFERENCES public.subcontractors (id) ON DELETE SET NULL,
  rfq_id uuid REFERENCES public.rfqs (id) ON DELETE SET NULL,
  po_number text UNIQUE,
  trade text,
  scope_of_work text,
  line_items jsonb,
  total_amount numeric,
  gst_amount numeric,
  total_inc_gst numeric,
  status text DEFAULT 'draft',
  scheduled_completion date,
  tentative_start_date date,
  issued_at timestamptz,
  accepted_at timestamptz,
  dropbox_pdf_path text,
  buildexact_po_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs (id) ON DELETE CASCADE,
  rfq_id uuid REFERENCES public.rfqs (id) ON DELETE SET NULL,
  subcontractor_id uuid REFERENCES public.subcontractors (id) ON DELETE SET NULL,
  direction text,
  subject text,
  body text,
  sent_at timestamptz DEFAULT now(),
  logged_by text DEFAULT 'sam'
);

CREATE TABLE IF NOT EXISTS public.sequences (
  id text PRIMARY KEY,
  current_value integer NOT NULL DEFAULT 0
);

INSERT INTO public.sequences (id, current_value) VALUES ('po_number', 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.alloc_po_sequence()
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
  WHERE id = 'po_number'
  RETURNING current_value INTO next_val;
  RETURN next_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.alloc_po_sequence() TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.buildexact_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  payload jsonb,
  processed boolean DEFAULT false,
  matched_project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  received_at timestamptz DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildexact_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anon projects" ON public.projects;
CREATE POLICY "Allow all anon projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all anon purchase_orders" ON public.purchase_orders;
CREATE POLICY "Allow all anon purchase_orders" ON public.purchase_orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all anon correspondence" ON public.correspondence;
CREATE POLICY "Allow all anon correspondence" ON public.correspondence FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all anon sequences" ON public.sequences;
CREATE POLICY "Allow all anon sequences" ON public.sequences FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all anon webhook_events" ON public.buildexact_webhook_events;
CREATE POLICY "Allow all anon webhook_events" ON public.buildexact_webhook_events FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS projects_job_id_idx ON public.projects (job_id);
CREATE INDEX IF NOT EXISTS correspondence_job_id_idx ON public.correspondence (job_id);
CREATE INDEX IF NOT EXISTS purchase_orders_project_id_idx ON public.purchase_orders (project_id);
