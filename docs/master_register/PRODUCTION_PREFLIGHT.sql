-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Master Register R03 — PRODUCTION read-only PREFLIGHT  (run BEFORE any migration apply)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Every statement here is a SELECT. It writes NOTHING. Safe to run on production, repeatedly.
-- Run it in the Supabase SQL editor (prod project), or:
--   psql "$PROD_DB_URL" -X -f docs/master_register/PRODUCTION_PREFLIGHT.sql
-- Nothing in this repo can reach production (no committed credentials) — this script is for a human to
-- run with production access. Do NOT apply 212 / 213 / 214 until every expectation below is met.
--
-- VALIDATED 2026-11-07 against the fully-applied sandbox reference DB (104+212+213+214): every block
-- below returned the "EXPECT" result shown. Compare production's output to these.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

\echo ===== §1 DEPENDENCY PRESENCE — all seven columns must be  t  =====
-- If has_104_auth_is_staff is f, STOP: 213 will abort at the room_scope_items deny_clients step (by design,
-- fail-closed) and 214 will also raise. Apply migration 104 first. has_103/188/199/200/212 gate 212/213 too.
SELECT to_regclass('public.client_selections') IS NOT NULL                                           AS has_103_client_selections,
       to_regprocedure('public.auth_is_staff()') IS NOT NULL                                         AS has_104_auth_is_staff,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads'    AND column_name='selections_schedule') AS has_188_selections_schedule,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='is_preconstruction')  AS has_199_is_preconstruction,
       to_regclass('public.internal_categories') IS NOT NULL                                         AS has_200_internal_categories,
       to_regclass('public.room_scope_items') IS NOT NULL                                            AS has_212_room_scope_items,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='register_meta')       AS has_213_register_meta;
-- EXPECT on prod BEFORE this release: has_103=t has_104=t has_188=t has_199=t has_200=t, and
--        has_212=f has_213=f  (212/213 not yet applied). After applying 212+213 they become t.

\echo
\echo ===== §2a REGISTER TABLES — each internal table must carry a RESTRICTIVE deny_clients =====
SELECT tablename, policyname, permissive, roles, qual
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('client_selections','room_scope_items','projects','job_events','lead_documents','internal_categories')
ORDER BY tablename, permissive DESC, policyname;
-- EXPECT (fully applied): every one of the six tables has a row
--   deny_clients | RESTRICTIVE | {authenticated} | auth_is_staff()
-- Permissive policies beside it (auth_internal/auth_users/…=true, projects.authenticated_all_projects
-- =auth.uid() IS NOT NULL, ct_ro_select for control_tower_ro) are harmless — a RESTRICTIVE policy ANDs,
-- so staff pass and portal clients are denied. BEFORE 212/213, room_scope_items won't exist yet and
-- client_selections may lack its deny row — that is the state these migrations fix.

\echo
\echo ===== §2b WHOLE-SURFACE SWEEP — authenticated/public PERMISSIVE policy with NO restrictive partner =====
SELECT p.tablename, p.policyname, COALESCE(p.qual, p.with_check, '?') AS predicate
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
WHERE p.schemaname='public' AND c.relrowsecurity AND p.permissive='PERMISSIVE'
  AND (p.roles @> ARRAY['authenticated']::name[] OR p.roles @> ARRAY['public']::name[])
  AND COALESCE(p.qual, p.with_check, '') !~* 'auth_is_staff'
  AND COALESCE(p.qual, '') !~* 'auth\.uid\(\)\s*=\s*[a-z_]'
  AND NOT EXISTS (SELECT 1 FROM pg_policies r WHERE r.schemaname='public' AND r.tablename=p.tablename AND r.permissive='RESTRICTIVE')
ORDER BY 1;
-- EXPECT on prod BEFORE 214: exactly one row — internal_categories | auth_users | true  (the gap 214 closes).
--        After 214: ZERO rows.
-- Any OTHER table that appears is a pre-existing exposure OUTSIDE the register's scope — report it, do not
-- fix it as part of this release.

\echo
\echo ===== §6 DOCUMENT_TYPE PREFLIGHT — existing values outside the new 213 CHECK list (expect ZERO rows) =====
SELECT DISTINCT document_type FROM public.lead_documents
WHERE document_type IS NOT NULL AND document_type NOT IN (
  'brief','blueprint','survey','quote','contract','ptsa_signed',
  'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other',
  'client_brief','architect_brief','selections_schedule','register_baseline',
  'consultant_document','supplier_document')
ORDER BY 1;
-- EXPECT: ZERO rows. Any value returned MUST be added to the CHECK list in 213 (or the data reconciled)
-- before applying — 213 runs this same check internally and ABORTS, naming the offender, rather than
-- failing mid-apply on the constraint.

\echo
\echo ===== EXTRA function-exposure check — run AFTER 213 is applied (skip pre-213) =====
-- Confirms the two register functions are SECURITY INVOKER and executable by service_role ONLY.
SELECT p.proname,
       p.prosecdef                                          AS security_definer_EXPECT_f,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec_EXPECT_f,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_exec_EXPECT_f,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_exec_EXPECT_t
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('register_apply','register_issue_document')
ORDER BY p.proname;
-- EXPECT (after 213): both rows  f | f | f | t.
