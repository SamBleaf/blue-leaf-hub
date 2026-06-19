-- 099_site_media_storage.sql
-- Private 'site-media' Storage bucket for worker completion photos.
--
-- Photos taken when a worker completes a site task are uploaded here and the OBJECT PATH is stored in
-- site_tasks.completion_photo_url (path string, NOT base64 — column already exists from mig 059).
--
-- Security model: all reads/writes go through the server's service-role key, which BYPASSES RLS.
-- Bucket privacy is therefore enforced by (a) the bucket being PRIVATE and (b) the server only ever
-- serving objects via short-lived signed URLs (never getPublicUrl). The RLS policies below are
-- forward-compatible for any future client-direct path and do NOT govern the current server flow.
--
-- No new table columns are added (Canonical Data Law): completion_photo_url already exists on
-- site_tasks and timesheet_entries (mig 059). FOLLOW-UP: register the 'work_completion_photo' fact
-- in docs/agent_knowledge/MASTER_DATA_DICTIONARY.md §11 and migrate it into job_documents
-- (mig 069, document_type='photo') when the facts service lands.

insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', false)
on conflict (id) do nothing;

-- No storage.objects RLS policies are created: every read/write goes through the server's
-- service-role key (which bypasses RLS), and the bucket is PRIVATE, so authenticated/anon clients
-- have no direct access by design. Add a path-scoped policy here only if a client-direct flow is
-- ever introduced. Objects are served to the office exclusively via short-lived signed URLs.

notify pgrst, 'reload schema';
