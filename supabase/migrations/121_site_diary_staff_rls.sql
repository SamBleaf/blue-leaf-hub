-- ════════════════════════════════════════════════════════════════════════════
-- Migration 121 — Staff-only RLS on site_diary (W13-SEC-004)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY (W13-SEC-004): site_diary entries (work-in-progress notes, issues, photo
-- paths) are staff-internal. The portal-client exposure is already mitigated at the
-- API layer (requireAuth blocks the client role), but the table itself lacked the
-- DB-level deny-clients guard that migration 104 applied to every *RLS-enabled*
-- table. If site_diary had RLS off (or only a permissive policy), a logged-in portal
-- client's JWT could read it directly via PostgREST. This adds defense-in-depth.
--
-- HOW (mirrors migrations 044 + 104 for a single table):
--   • PERMISSIVE policy: any authenticated user passes (matches the mig-044 baseline
--     so staff reads/writes via the authenticated anon client keep working).
--   • RESTRICTIVE deny_clients: ANDs with the permissive one — staff (auth_is_staff)
--     pass, clients (role='client') are denied. Service-role API bypasses RLS.
--
-- PREREQUISITE: migration 104 (defines public.auth_is_staff()).
-- ⚠ APPLY MANUALLY in the Supabase SQL editor, then run the VERIFICATION block and
--   confirm a STAFF session still reads site_diary AND a client session is denied.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.site_diary ENABLE ROW LEVEL SECURITY;

-- Permissive baseline: authenticated staff (and the existing app flows) keep access.
DROP POLICY IF EXISTS site_diary_authenticated ON public.site_diary;
CREATE POLICY site_diary_authenticated ON public.site_diary
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Restrictive deny-clients: ANDs with the above — only staff roles pass.
DROP POLICY IF EXISTS deny_clients ON public.site_diary;
CREATE POLICY deny_clients ON public.site_diary
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.auth_is_staff())
  WITH CHECK (public.auth_is_staff());

-- VERIFICATION (run after applying):
--   a) SELECT relrowsecurity FROM pg_class WHERE relname='site_diary';   -- expect true
--   b) SELECT policyname, permissive FROM pg_policies
--        WHERE schemaname='public' AND tablename='site_diary';           -- expect both policies
--   c) App smoke: staff login → site diary loads; client session (anon key + client JWT)
--      querying /rest/v1/site_diary → ZERO rows / permission denied.
--
-- ROLLBACK (if it breaks staff access):
--   DROP POLICY IF EXISTS deny_clients ON public.site_diary;
--   DROP POLICY IF EXISTS site_diary_authenticated ON public.site_diary;
--   ALTER TABLE public.site_diary DISABLE ROW LEVEL SECURITY;
-- ════════════════════════════════════════════════════════════════════════════
