-- Integrations: RFQ tracking fields, user settings, unmatched quote inbox

ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_entered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dropbox_pdf_url text;

CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anon user_settings" ON public.user_settings;
CREATE POLICY "Allow all anon user_settings" ON public.user_settings
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.unmatched_quote_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'gmail',
  external_id text,
  from_email text,
  subject text,
  body_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  matched_job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  matched_rfq_id uuid REFERENCES public.rfqs (id) ON DELETE SET NULL
);

ALTER TABLE public.unmatched_quote_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all anon unmatched_quotes" ON public.unmatched_quote_emails;
CREATE POLICY "Allow all anon unmatched_quotes" ON public.unmatched_quote_emails
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS unmatched_quote_emails_resolved_idx
  ON public.unmatched_quote_emails (resolved_at)
  WHERE resolved_at IS NULL;
