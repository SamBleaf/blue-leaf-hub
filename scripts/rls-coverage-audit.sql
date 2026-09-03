-- ============================================================================
-- rls-coverage-audit.sql — the standing "a client can't reach it" check.
--
-- WHY: migration 104's `deny_clients` sweep was ONE-TIME. Any table added later
-- that carries a permissive `authenticated`/`public`/`anon` policy (or has RLS
-- off) silently re-opens direct client/anon access via PostgREST. This query
-- FINDS those gaps. Run it in the Supabase SQL editor after EVERY migration
-- batch. ZERO ROWS = clean. Any row = a client-reachable gap to close.
--
-- READ-ONLY — safe to run against prod. Reads only catalog metadata.
--
-- Fix pattern for any row it returns:
--   CREATE POLICY deny_clients ON public.<table> AS RESTRICTIVE FOR ALL
--     TO authenticated USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff());
--   -- and if RLS is OFF also:  ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
-- ============================================================================

-- ── 1. Client/anon-reachable TABLES ────────────────────────────────────────
-- A table is a GAP only if a CLIENT can actually satisfy a policy — i.e. it has
-- a permissive policy whose USING doesn't require auth_is_staff() (e.g. USING(true)
-- or auth.uid() IS NOT NULL) and no RESTRICTIVE deny_clients to AND it out; OR RLS
-- is off entirely. A permissive STAFF-ONLY policy (USING auth_is_staff()) is NOT a
-- gap — a client fails it, matches nothing, and is denied — so it is not flagged.
SELECT
  c.relname AS table_name,
  CASE WHEN NOT c.relrowsecurity
       THEN 'RLS OFF — reachable by the bare anon key (no login)'
       ELSE 'client-open policy, no deny_clients — reachable by a logged-in client'
  END AS gap
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  -- documented intentional exception: anon INSERT for website attribution tracking (finding L1).
  AND c.relname <> 'attribution_events'
  AND (
    NOT c.relrowsecurity
    OR (
      EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname
          AND p.permissive = 'PERMISSIVE'
          AND p.roles::text ~ 'authenticated|public|anon'
          AND COALESCE(p.qual, '') NOT ILIKE '%auth_is_staff%'   -- a client could satisfy it
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname
          AND p.permissive = 'RESTRICTIVE'
          AND p.qual ILIKE '%auth_is_staff%'
      )
    )
  )
ORDER BY c.relrowsecurity, c.relname;

-- ── 2. RLS-bypassing VIEWS (finding H2) ────────────────────────────────────
-- Any row = a view that runs with owner rights (so it sidesteps base-table RLS)
-- AND is granted to a browser role. Fix:
--   ALTER VIEW public.<view> SET (security_invoker = on);
--   REVOKE ALL ON public.<view> FROM anon, authenticated;
SELECT
  c.relname AS view_name,
  'not security_invoker AND granted to a browser role → RLS-bypass risk' AS gap
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND NOT ('security_invoker=on' = ANY (COALESCE(c.reloptions, '{}')))
  AND ( has_table_privilege('anon', c.oid, 'SELECT')
     OR has_table_privilege('authenticated', c.oid, 'SELECT') )
ORDER BY c.relname;
