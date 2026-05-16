-- Blue Leaf Hub — core schema & seed data
-- Run this in Supabase SQL Editor as a migration

-- Jobs
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL DEFAULT '',
  project_type text DEFAULT '',
  client_name text DEFAULT '',
  architect_name text DEFAULT '',
  floor_area_m2 numeric DEFAULT NULL,
  dropbox_link text DEFAULT '',
  status text DEFAULT 'tendering' CHECK (status IN ('tendering', 'won', 'lost', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Subcontractors
CREATE TABLE IF NOT EXISTS public.subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact text DEFAULT '',
  mobile text DEFAULT '',
  email text DEFAULT '',
  trade text DEFAULT '',
  abn text DEFAULT '',
  address text DEFAULT '',
  suburb text DEFAULT '',
  state text DEFAULT 'SA',
  postcode text DEFAULT '',
  rating int CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  notes text DEFAULT '',
  last_used date DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RFQs
CREATE TABLE IF NOT EXISTS public.rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors (id) ON DELETE CASCADE,
  trade text DEFAULT '',
  sent_at timestamptz DEFAULT NULL,
  deadline date DEFAULT NULL,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'reminded', 'received', 'accepted', 'declined')),
  quote_amount numeric DEFAULT NULL,
  quote_pdf_path text DEFAULT '',
  reminder_sent_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfqs_job_id_idx ON public.rfqs (job_id);

-- Cost intelligence
CREATE TABLE IF NOT EXISTS public.cost_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  trade text DEFAULT '',
  quote_amount numeric DEFAULT NULL,
  floor_area_m2 numeric DEFAULT NULL,
  rate_per_m2 numeric GENERATED ALWAYS AS (
    CASE
      WHEN floor_area_m2 IS NOT NULL AND floor_area_m2 > 0 THEN quote_amount / floor_area_m2
      ELSE NULL
    END
  ) STORED,
  project_type text DEFAULT '',
  recorded_at date DEFAULT (now())::date
);

CREATE INDEX IF NOT EXISTS cost_intel_job_id_idx ON public.cost_intelligence (job_id);

-- RLS — permissive for internal deployment; tighten with auth providers later.
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anon jobs" ON public.jobs;
CREATE POLICY "Allow all anon jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon subcontractors" ON public.subcontractors;
CREATE POLICY "Allow all anon subcontractors" ON public.subcontractors FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon rfqs" ON public.rfqs;
CREATE POLICY "Allow all anon rfqs" ON public.rfqs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon cost_intel" ON public.cost_intelligence;
CREATE POLICY "Allow all anon cost_intel" ON public.cost_intelligence FOR ALL USING (true) WITH CHECK (true);

-- Seed subcontractors (preserve provided data; trades stored as-supplied lowercase where applicable)
INSERT INTO public.subcontractors (business_name, contact, mobile, email, trade, abn, address, suburb, state, postcode) VALUES
  ('Boston Earthmoving', 'Brodie', '0419814436', 'brodie@bostonearthmoving.com', 'excavation', NULL, NULL, NULL, 'SA', NULL),
  ('Eastside Demolition', 'Justin', '0411187038', '', 'demolition', '47 706 158 122', '13 Williams St', 'Hawthorn', 'SA', '5062'),
  ('Dejay Contracting', NULL, '', 'admin@dejaycontracting.com.au', 'demolition', '17 602 469 321', '1415 Main North Rd', 'Para Hills', 'SA', '5096'),
  ('D Wilson Construction', 'Daniel', '0431434122', 'DWconstructions@outlook.com.au', 'concreting', NULL, '153 Hayman Rd', 'Lewiston', 'SA', '5501'),
  ('Flick Pest Control', NULL, '', 'adelaide@flick.com.au', 'termite protection', '85 000 056 665', '9 Mill Ct', 'Kilburn', 'SA', '5084'),
  ('Powell Bricklaying Pty Ltd', 'Phil', '0401951144', 'powellbricklayingptyltd@outlook.com', 'bricklayer', NULL, NULL, NULL, 'SA', NULL),
  ('Andrew Evans Plumbing', 'Adam', '0423707034', 'adamc@andrewevansplumbing.com', 'plumbing', NULL, NULL, NULL, 'SA', NULL),
  ('Proline Electrical Services', 'Daniel', '0413696113', 'daniel@prolineelectrical.net', 'electrical', '47 100 846 710', '35 John Ramsay Ct', 'Hope Valley', 'SA', '5090'),
  ('M&E Electrical', 'Tony', '0418837750', NULL, 'electrical', NULL, '3 Wilford Ave', 'Underdale', 'SA', '5032'),
  ('Stair Lock', NULL, NULL, 'SAsales@stairlock.com.au', 'stairs', NULL, '180 Philip Highway', 'Elizabeth', 'SA', '5112'),
  ('Foley Linings', 'Pat', '0437170412', 'pat@foleylinings.com.au', 'internal linings', NULL, NULL, NULL, 'SA', NULL),
  ('Spellacy Construction', 'Bryan', '0407427888', 'bryan@spellacyconstruction.com', 'internal linings', NULL, NULL, NULL, 'SA', NULL),
  ('Adelaide Painting Services', 'Ricky', '0433365299', 'ricki@adelaidepaintingservices.com.au', 'painting', NULL, NULL, NULL, 'SA', NULL),
  ('Air Services Australia', 'Dorian', '0405997943', 'airservices@bigpond.com', 'airconditioning', NULL, NULL, NULL, 'SA', NULL),
  ('Elite Pools', 'Matt', '0455168691', 'matt@elitepoolsandlandscapes.com.au', 'pool works', NULL, NULL, NULL, 'SA', NULL),
  ('Eden Heating', 'Adam', '0429345000', 'admin@edenheating.com.au', 'heating', NULL, NULL, NULL, 'SA', NULL),
  ('East Adelaide Tiling Co.', NULL, '0418821703', 'Info@eastadelaidetilingco.com.au', 'tiling', NULL, NULL, NULL, 'SA', NULL),
  ('Adelaide Tiling Co', 'Jamie', '0431299337', 'info@adelaidetiling.co', 'tiling', NULL, '30 Cormack Road', 'Wingfield', 'SA', '5013'),
  ('Shorscaff', 'Carlo', '0412857343', 'admin@shorscaff.com.au', 'scaffolding', NULL, '25 Baulderstone Road', 'Gepps Cross', 'SA', '5094'),
  ('Elite Timber Flooring', 'Jacob', '0432879270', 'admin@elitetimberflooring.com.au', 'flooring', NULL, '13 Tobruk Ave', 'St Marys', 'SA', '5042'),
  ('Summit Roofing SA', 'Jacob', '0411453442', 'admin@summitroofingsa.com.au', 'metal roofing', NULL, NULL, NULL, 'SA', NULL),
  ('Allan Carter Cabinet Makers', 'Allan', NULL, 'Cabinets@allancarter.com.au', 'cabinetry', NULL, NULL, NULL, 'SA', NULL),
  ('Hoopelec', NULL, '0432846692', 'admin@hoopelec.com.au', 'electrical', NULL, NULL, NULL, 'SA', NULL),
  ('Possum Roofing', 'Finn', '0421692099', 'finley@possumroofandclad.com.au', 'metal roofing', NULL, NULL, NULL, 'SA', NULL);
