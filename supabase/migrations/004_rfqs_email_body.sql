-- Store full sent RFQ email text for Quote Tracker "View Email"

ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS email_body text DEFAULT '';
