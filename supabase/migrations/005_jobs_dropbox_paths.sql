-- Jobs: separate shared Dropbox URL from private INTERNAL path (never emailed)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS dropbox_shared_link text DEFAULT '';

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS dropbox_internal_path text DEFAULT '';

UPDATE public.jobs
SET dropbox_shared_link = COALESCE(NULLIF(trim(dropbox_shared_link), ''), trim(dropbox_link))
WHERE trim(COALESCE(dropbox_link, '')) <> ''
  AND trim(COALESCE(dropbox_shared_link, '')) = '';
