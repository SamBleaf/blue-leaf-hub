-- ════════════════════════════════════════════════════════════════════════════
-- Migration 214 — internal_categories: deny portal clients (RLS gap from mig 200)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY (found during the Master Register R03 RLS sweep, 2026-11-07): migration 200
-- created public.internal_categories with a permissive policy
--   auth_users FOR ALL TO authenticated USING (true) WITH CHECK (true)
-- but no RESTRICTIVE deny_clients policy (mig 104's sweep only covered tables that
-- existed at the time). Portal v2 clients hold real `authenticated` JWTs and the
-- anon key ships in the browser bundle, so a logged-in client could read AND
-- insert/update/delete Blue Leaf's internal cost categories via PostgREST.
--
-- FIX: add the standard RESTRICTIVE deny_clients policy (same as mig 104/186/213).
-- RESTRICTIVE ANDs with the permissive auth_users policy:
--   • staff  → auth_is_staff() = true  → unchanged
--   • client → auth_is_staff() = false → denied
--   • service role (Hub API)           → bypasses RLS → unchanged
-- Additive only: no data change, no column change, existing policy left in place.
--
-- SWEEP RESULT (sandbox with migrations 001–213 applied): every other RLS-enabled
-- public table already denies clients (deny_clients, staff-only permissive policy,
-- or no permissive policy at all). Production can drift from the repo, so run the
-- PRE-CHECK below on production first and send the output back before applying.
--
-- PREREQUISITE: migration 104 (public.auth_is_staff()) and 200 applied.
-- NOT APPLIED TO PRODUCTION — requires explicit approval.
-- ════════════════════════════════════════════════════════════════════════════

-- PRE-CHECK (read-only; run on production first). Lists RLS-enabled public tables
-- with a permissive policy open to authenticated/public that is not staff-gated and
-- no restrictive policy. Expected before 214: internal_categories only.
--   SELECT p.tablename, p.policyname, p.cmd, p.roles, p.qual
--   FROM pg_policies p
--   JOIN pg_class c ON c.relname = p.tablename
--   JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
--   WHERE p.schemaname = 'public' AND c.relrowsecurity
--     AND p.permissive = 'PERMISSIVE'
--     AND (p.roles @> ARRAY['authenticated']::name[] OR p.roles @> ARRAY['public']::name[])
--     AND COALESCE(p.qual, p.with_check, '') NOT ILIKE '%auth_is_staff%'
--     AND COALESCE(p.qual, '') NOT ILIKE '%auth.uid()%'
--     AND NOT EXISTS (SELECT 1 FROM pg_policies r WHERE r.schemaname = 'public'
--                     AND r.tablename = p.tablename AND r.permissive = 'RESTRICTIVE')
--   ORDER BY 1;

DO $$
BEGIN
  IF to_regclass('public.internal_categories') IS NULL THEN
    RAISE NOTICE '214: public.internal_categories not found — migration 200 not applied; nothing to do';
    RETURN;
  END IF;
  IF to_regprocedure('public.auth_is_staff()') IS NULL THEN
    RAISE EXCEPTION '214: public.auth_is_staff() missing — apply migration 104 first';
  END IF;
  EXECUTE 'ALTER TABLE public.internal_categories ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS deny_clients ON public.internal_categories';
  EXECUTE 'CREATE POLICY deny_clients ON public.internal_categories AS RESTRICTIVE FOR ALL TO authenticated '
       || 'USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff())';
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after applying)
-- a) SELECT policyname, permissive, roles FROM pg_policies
--      WHERE schemaname='public' AND tablename='internal_categories' ORDER BY 1;
--    → auth_users PERMISSIVE {authenticated} + deny_clients RESTRICTIVE {authenticated}
-- b) Re-run the PRE-CHECK above → zero rows.
-- c) App: staff open Finance → internal job costs (category list loads as before);
--    a client JWT GET /rest/v1/internal_categories returns [] and a POST is rejected (42501).
--
-- ROLLBACK (restores the pre-214 state exactly):
--   DROP POLICY IF EXISTS deny_clients ON public.internal_categories;
-- ════════════════════════════════════════════════════════════════════════════
