-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Master Register R03 — PRODUCTION read-only PREFLIGHT  (run BEFORE any migration apply)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Every statement here is a SELECT. It writes NOTHING. Safe to run on production, repeatedly.
-- Run it in the Supabase SQL editor (prod project), or:
--   psql "$PROD_DB_URL" -X -f docs/master_register/PRODUCTION_PREFLIGHT.sql
-- Nothing in this repo can reach production (no committed credentials) — this script is for a human to
-- run with production access. Do NOT apply 212 / 213 / 214 until every expectation below is met.
--
-- VALIDATED 2026-11-07 against the fully-applied sandbox reference DB (104+212+213+214). Because the sandbox
-- has everything applied, it returned each block's "After applying" expectation (§1 has_212/213 = t, §2b ZERO
-- rows, functions f|f|f|t). The *primary* EXPECT lines below describe what PRODUCTION should show BEFORE
-- applying 212/213/214; the "After applying" clauses are what the sandbox confirmed. Compare accordingly.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

\echo ===== §1 DEPENDENCY PRESENCE — all seven columns must be  t  =====
-- If has_104_auth_is_staff is f, STOP: 213 will abort at the room_scope_items deny_clients step (by design,
-- fail-closed) and 214 will also raise. Apply migration 104 first. has_103/188/199/200/212 gate 212/213 too.
-- Column checks use pg_catalog (pg_attribute), not information_schema.columns, which is privilege-filtered
-- and can give a non-owner role a false "column absent" → a wrong "migration not applied" reading.
WITH col AS (
  SELECT c.relname AS tbl, a.attname AS col
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
)
SELECT to_regclass('public.client_selections') IS NOT NULL                                           AS has_103_client_selections,
       to_regprocedure('public.auth_is_staff()') IS NOT NULL                                         AS has_104_auth_is_staff,
       EXISTS (SELECT 1 FROM col WHERE tbl='leads'    AND col='selections_schedule')                 AS has_188_selections_schedule,
       EXISTS (SELECT 1 FROM col WHERE tbl='projects' AND col='is_preconstruction')                  AS has_199_is_preconstruction,
       to_regclass('public.internal_categories') IS NOT NULL                                         AS has_200_internal_categories,
       to_regclass('public.room_scope_items') IS NOT NULL                                            AS has_212_room_scope_items,
       EXISTS (SELECT 1 FROM col WHERE tbl='projects' AND col='register_meta')                       AS has_213_register_meta;
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
  -- exclude legitimate owner-scoped "read your own row" policies in EITHER operand order
  AND COALESCE(p.qual, '') !~* '(auth\.uid\(\)\s*=\s*[a-z_.]+|[a-z_.]+\s*=\s*auth\.uid\(\))'
  AND NOT EXISTS (SELECT 1 FROM pg_policies r WHERE r.schemaname='public' AND r.tablename=p.tablename AND r.permissive='RESTRICTIVE')
ORDER BY 1;
-- EXPECT on prod BEFORE 214: exactly one row — internal_categories | auth_users | true  (the gap 214 closes).
--        After 214: ZERO rows.
-- Any OTHER table that appears is a pre-existing exposure OUTSIDE the register's scope — report it, do not
-- fix it as part of this release. (An owner-scoped policy written `col = auth.uid()` is now excluded in either
-- order; if an unexpected table still appears, read its predicate before treating it as a regression.)

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

\echo
\echo ===== §7 R04 / 215 — client_selections status CHECK (changes_requested) =====
-- 215 only WIDENS the status CHECK to allow one more value ('changes_requested'); it adds no column and
-- removes no value, so NO existing row can be invalidated by it — zero data risk. This block just
-- confirms the CHECK that 215 rewrites is present and what it currently allows.
SELECT c.conname,
       pg_get_constraintdef(c.oid)                          AS status_check_def,
       pg_get_constraintdef(c.oid) ILIKE '%changes_requested%' AS already_has_215_EXPECT_f
FROM pg_constraint c
WHERE c.conrelid = 'public.client_selections'::regclass AND c.contype='c'
  AND pg_get_constraintdef(c.oid) ILIKE '%in_review%'
  AND pg_get_constraintdef(c.oid) ILIKE '%awaiting_client%';
-- EXPECT on prod BEFORE 215: exactly one row, already_has_215 = f (the mig-103 status CHECK, no
--   'changes_requested'). After 215: already_has_215 = t. If ZERO rows: the mig-103 status CHECK is
--   missing/renamed — stop and reconcile, because 215's definition-matched DROP would then no-op and the
--   new value would be unconstrained (harmless but not what 215 intends).

\echo
\echo ===== §8 R04 / 216 — stranded Architect-Tender leads (accepted -> tender) =====
-- 216 is a SCOPED one-row-class UPDATE: only leads with lead_type='architect_tender' sitting on the
-- retired 'accepted' stage. It touches nothing else. These two SELECTs show (a) the column 216 guards on
-- and (b) exactly which rows it will move, so the count can be confirmed before and after.
SELECT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname='leads' AND a.attname='lead_type' AND a.attnum>0 AND NOT a.attisdropped) AS has_lead_type_EXPECT_t;
SELECT count(*) FILTER (WHERE stage='accepted' AND lead_type='architect_tender') AS stranded_architect_tenders_EXPECT_moved_then_0,
       count(*) FILTER (WHERE stage='accepted')                                   AS all_accepted_rows_LEFT_UNTOUCHED
FROM public.leads;
-- EXPECT on prod BEFORE 216: has_lead_type=t; stranded = N (the architect-tender leads the old intake
--   created on 'accepted'); all_accepted_rows = N + any genuine pre-restructure design-build leads 216
--   must NOT touch. After 216: stranded = 0; all_accepted_rows drops by exactly N (the non-architect
--   'accepted' rows are deliberately left for mig-187's fold / manual review — 216 never moves them).
-- Confirm 'tender' is an accepted stage value before applying (post mig-187 it is; this is the target):
SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.leads'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%stage%' AND pg_get_constraintdef(oid) ILIKE '%tender%'
) OR NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.leads'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%stage%'
) AS tender_is_an_allowed_stage_EXPECT_t;
-- EXPECT: t — either a stage CHECK exists and lists 'tender', or there is no stage CHECK at all (free text).
--   If f: a stage CHECK exists that does NOT allow 'tender' — 216 would fail; reconcile mig-187 first.
