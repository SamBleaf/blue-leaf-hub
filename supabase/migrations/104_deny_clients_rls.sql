-- ════════════════════════════════════════════════════════════════════════════
-- Migration 104 — DENY portal clients direct database access (RLS hardening)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY (red-team finding B1/#1/#14): Portal v2 issues clients REAL Supabase
-- `authenticated` accounts. Migration 044 granted the `authenticated` role full
-- access to every business table via `USING (auth.uid() IS NOT NULL)`. The anon
-- key ships in the browser bundle, so a logged-in client could call PostgREST
-- directly with their JWT and read/write EVERY project, job cost, other clients'
-- PII and the entire CRM — bypassing the portal's service-role API + allowlists.
--
-- FIX: clients must have NO direct table access. All client data flows only
-- through the service-role portal API (which bypasses RLS). We add a single
-- RESTRICTIVE policy per RLS-enabled table that requires the caller to be STAFF.
-- RESTRICTIVE policies AND with the existing permissive ones, so:
--   • staff (role <> 'client')  → auth_is_staff() = true  → unaffected
--   • clients (role = 'client') → auth_is_staff() = false → denied everywhere
--   • service role              → bypasses RLS entirely   → portal API unaffected
--   • anon (public web forms)   → not the `authenticated` role → unaffected
--
-- EXCEPTION: user_profiles — a client must read their OWN row (the frontend
-- AuthContext loads role from user_profiles via the anon client at login).
--
-- ⚠ APPLY CAREFULLY: this touches every RLS-enabled table on the single prod DB.
--   After pasting, run the VERIFICATION query at the bottom and confirm a staff
--   login still works AND a client session is denied on `jobs`/`crm_contacts`.
--   Rollback is at the very bottom (commented).
--
-- PREREQUISITE: migration 103 (project_client_users, client accounts) applied.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Staff check (SECURITY DEFINER so it can read user_profiles under RLS) ──
CREATE OR REPLACE FUNCTION public.auth_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND up.is_active = true
      AND up.role IN ('admin', 'supervisor', 'employee')
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_staff() FROM public;
GRANT EXECUTE ON FUNCTION public.auth_is_staff() TO authenticated;

-- ── 2. user_profiles: clients may read their OWN row only; staff unrestricted ──
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_clients_except_self ON public.user_profiles;
CREATE POLICY deny_clients_except_self ON public.user_profiles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.auth_is_staff() OR id = auth.uid())
  WITH CHECK (public.auth_is_staff() OR id = auth.uid());

-- ── 3. Every other RLS-enabled public table: staff only (restrictive) ─────────
-- Skips user_profiles (handled above). Only touches tables that already have RLS
-- enabled, so we never accidentally lock down a table that intentionally had RLS off.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relname <> 'user_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_clients ON public.%I', t.tablename);
    EXECUTE format(
      'CREATE POLICY deny_clients ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff())',
      t.tablename
    );
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run as separate statements after applying)
-- ════════════════════════════════════════════════════════════════════════════
-- a) Function works for a known staff user id:
--      SELECT public.auth_is_staff();   -- run while authenticated as staff → true
-- b) Confirm a restrictive policy now exists on the sensitive tables:
--      SELECT tablename, policyname, permissive FROM pg_policies
--      WHERE schemaname='public' AND policyname IN ('deny_clients','deny_clients_except_self')
--      ORDER BY tablename;
-- c) Smoke test in the app: staff login loads normally; a client session (anon key
--    + client JWT) querying /rest/v1/jobs returns ZERO rows / permission denied.
--
-- ROLLBACK (if it breaks staff access — paste this to revert):
--   DO $$ DECLARE t record; BEGIN
--     FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--              WHERE n.nspname='public' AND c.relkind='r' LOOP
--       EXECUTE format('DROP POLICY IF EXISTS deny_clients ON public.%I', t.relname);
--     END LOOP;
--   END $$;
--   DROP POLICY IF EXISTS deny_clients_except_self ON public.user_profiles;
--   -- (leave auth_is_staff() in place; it is harmless)
-- ════════════════════════════════════════════════════════════════════════════
