-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Master Register R04 — PRODUCTION read-only PREFLIGHT  (Supabase SQL Editor version)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Every statement here is a SELECT. It writes NOTHING. Safe to run on production, repeatedly.
-- This is the \echo-free twin of PRODUCTION_PREFLIGHT.sql, for the Supabase dashboard SQL Editor
-- (the SQL Editor does not support psql meta-commands like \echo).
--
-- HOW TO USE: the Editor shows the result grid of the LAST statement you run. Highlight ONE section
-- (between the ===== banners) and press Run to see that section's grid. Start with §0 SUMMARY — it is a
-- single row that answers "what is applied?" at a glance. Drop into a detail section (§2a/§2b/§6/§8) only
-- when a flag needs explaining.
--
-- WHAT "APPLIED" MEANS HERE: this project applies migrations by pasting the .sql into this SQL Editor, not
-- via the Supabase CLI, so there is usually NO supabase_migrations.schema_migrations ledger row per file.
-- The authoritative evidence of whether 212–216 are live is therefore the SCHEMA/DATA state these queries
-- read — not a migrations table. (§0b checks the ledger too, in case this project was ever CLI-managed.)
-- Do not claim a migration is applied or unapplied except from these results.
-- ════════════════════════════════════════════════════════════════════════════════════════════════


-- ===== §0 SUMMARY — one row: prerequisites + which of 212/213/214/215 are applied ==================
-- EXPECT on prod BEFORE this release: has_103/104/188/199/200 = true  (prerequisites present), and
--        has_212/213/214/215 = false  (R04 not yet applied). After applying, each becomes true.
-- If has_104_auth_is_staff = false: STOP — 213 fail-closes (aborts at the room_scope_items deny step, by
--        design) and 214 also raises. Apply migration 104 first.
-- NB column checks use pg_catalog (pg_attribute), not information_schema.columns, because
-- information_schema is privilege-filtered — a non-owner role can get a false "column absent". pg_catalog
-- is not filtered, so these read correctly under any role (the SQL Editor's postgres role included).
WITH col AS (
  SELECT c.relname AS tbl, a.attname AS col
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
)
SELECT
  to_regclass('public.client_selections')              IS NOT NULL                                   AS has_103_client_selections,
  to_regprocedure('public.auth_is_staff()')            IS NOT NULL                                   AS has_104_auth_is_staff,
  EXISTS (SELECT 1 FROM col WHERE tbl='leads'    AND col='selections_schedule')                       AS has_188_selections_schedule,
  EXISTS (SELECT 1 FROM col WHERE tbl='projects' AND col='is_preconstruction')                        AS has_199_is_preconstruction,
  to_regclass('public.internal_categories')            IS NOT NULL                                   AS has_200_internal_categories,
  to_regclass('public.room_scope_items')               IS NOT NULL                                   AS has_212_room_scope_items,
  EXISTS (SELECT 1 FROM col WHERE tbl='projects' AND col='register_meta')                             AS has_213_register_meta,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='internal_categories'
            AND permissive='RESTRICTIVE' AND policyname='deny_clients')                               AS has_214_deny_clients,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.client_selections')
            AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%changes_requested%')                AS has_215_changes_requested;
-- (216 leaves no schema trace — it is a data correction; confirm it with §8 below.)


-- ===== §0b MIGRATION LEDGER (only if this project is CLI-managed; usually empty here) ===============
-- If supabase_migrations.schema_migrations exists, show any rows for 212–216. Absence of rows is NOT
-- evidence a migration is unapplied here (manual-paste model) — trust §0's schema checks instead.
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version ~ '^21[2-6]'
ORDER BY version;
-- If this errors with "relation ... does not exist", the ledger is simply not used — expected; use §0.


-- ===== §2a REGISTER TABLES — each internal table must carry a RESTRICTIVE deny_clients ==============
-- EXPECT (fully applied): every one of these tables has a row  deny_clients | RESTRICTIVE | {authenticated}
--        with auth_is_staff() in the predicate. BEFORE 212/213, room_scope_items won't exist yet and
--        client_selections may lack its deny row — that is the state these migrations fix.
SELECT tablename, policyname, permissive, roles, qual
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('client_selections','room_scope_items','projects','job_events','lead_documents','internal_categories')
ORDER BY tablename, permissive DESC, policyname;


-- ===== §2b WHOLE-SURFACE SWEEP — authenticated/public PERMISSIVE policy with NO restrictive partner =
-- EXPECT on prod BEFORE 214: exactly one row — internal_categories | auth_users | true  (the gap 214 closes).
--        After 214: ZERO rows. Any OTHER table here is a pre-existing exposure OUTSIDE this release's scope
--        — report it, do not fix it as part of R04.
SELECT p.tablename, p.policyname, COALESCE(p.qual, p.with_check, '?') AS predicate
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
WHERE p.schemaname='public' AND c.relrowsecurity AND p.permissive='PERMISSIVE'
  AND (p.roles @> ARRAY['authenticated']::name[] OR p.roles @> ARRAY['public']::name[])
  AND COALESCE(p.qual, p.with_check, '') !~* 'auth_is_staff'
  AND COALESCE(p.qual, '') !~* '(auth\.uid\(\)\s*=\s*[a-z_.]+|[a-z_.]+\s*=\s*auth\.uid\(\))'
  AND NOT EXISTS (SELECT 1 FROM pg_policies r WHERE r.schemaname='public' AND r.tablename=p.tablename AND r.permissive='RESTRICTIVE')
ORDER BY 1;


-- ===== §6 DOCUMENT_TYPE PREFLIGHT — existing values outside the 213 CHECK list (expect ZERO rows) ===
-- Any value returned MUST be added to the CHECK list in 213 (or the data reconciled) before applying —
-- 213 runs this same check internally and ABORTS naming the offender rather than failing mid-apply.
SELECT DISTINCT document_type FROM public.lead_documents
WHERE document_type IS NOT NULL AND document_type NOT IN (
  'brief','blueprint','survey','quote','contract','ptsa_signed',
  'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other',
  'client_brief','architect_brief','selections_schedule','register_baseline',
  'consultant_document','supplier_document')
ORDER BY 1;


-- ===== §7 R04 / 215 — client_selections status CHECK (changes_requested) ============================
-- 215 only WIDENS the status CHECK to allow one more value; it adds no column and removes no value, so NO
-- existing row can be invalidated by it. EXPECT before 215: already_has_215 = false. After: true.
SELECT c.conname,
       pg_get_constraintdef(c.oid)                             AS status_check_def,
       pg_get_constraintdef(c.oid) ILIKE '%changes_requested%' AS already_has_215
FROM pg_constraint c
WHERE c.conrelid = to_regclass('public.client_selections') AND c.contype='c'
  AND pg_get_constraintdef(c.oid) ILIKE '%in_review%'
  AND pg_get_constraintdef(c.oid) ILIKE '%awaiting_client%';
-- If ZERO rows: the mig-103 status CHECK is missing/renamed — stop and reconcile before applying 215.


-- ===== §8 R04 / 216 — stranded Architect-Tender leads (accepted -> tender) ==========================
-- 216 is a SCOPED UPDATE: only leads with lead_type='architect_tender' on the retired 'accepted' stage.
-- This block is written to be SAFE even if leads.lead_type does not exist (it references the column only
-- inside a dynamic guard). Run it as-is.
DO $$
DECLARE has_col boolean; stranded int; total_accepted int;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='leads' AND a.attname='lead_type' AND a.attnum>0 AND NOT a.attisdropped) INTO has_col;
  IF has_col THEN
    EXECUTE $q$ SELECT count(*) FILTER (WHERE stage='accepted' AND lead_type='architect_tender'),
                       count(*) FILTER (WHERE stage='accepted')
                FROM public.leads $q$ INTO stranded, total_accepted;
    RAISE NOTICE '216 preflight: has_lead_type=true; stranded_architect_tenders=% (216 moves these); all_accepted_rows=% (216 leaves the rest)', stranded, total_accepted;
  ELSE
    RAISE NOTICE '216 preflight: leads.lead_type absent — 216 would no-op (nothing to correct)';
  END IF;
END $$;
-- The NOTICE prints under "Messages"/"Logs" in the SQL Editor. EXPECT before 216: stranded = N (the rows
-- 216 moves); all_accepted = N + genuine pre-restructure design-build leads 216 must NOT touch. After 216:
-- stranded = 0. Confirm 'tender' is an allowed stage before applying (post mig-187 it is):
SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = to_regclass('public.leads') AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%stage%' AND pg_get_constraintdef(oid) ILIKE '%tender%'
) OR NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = to_regclass('public.leads') AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%stage%'
) AS tender_is_an_allowed_stage;   -- EXPECT: true


-- ===== §9 FUNCTION EXPOSURE — run AFTER 213 is applied (skip pre-213) ===============================
-- Confirms the two register functions are SECURITY INVOKER and executable by service_role ONLY.
-- EXPECT (after 213): both rows  false | false | false | true.
SELECT p.proname,
       p.prosecdef                                               AS security_definer_expect_false,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec_expect_false,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_exec_expect_false,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_exec_expect_true
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('register_apply','register_issue_document')
ORDER BY p.proname;
