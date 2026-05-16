-- IMAP quote replies: public URL for quote PDF + attachment metadata on correspondence

ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS quote_pdf_url text;

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
