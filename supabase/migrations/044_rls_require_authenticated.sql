-- 044_rls_require_authenticated.sql
-- Tightens RLS: removes anon-role access from all business data tables.
-- Before: ~15 tables allowed unauthenticated reads/writes (anon key is in the
--         frontend JS bundle, so this was effectively public access).
-- After:  all tables require an authenticated Supabase session.
--
-- The server uses the service_role key which bypasses RLS entirely — no server
-- routes are affected. Only direct frontend Supabase calls are restricted.
--
-- Pattern: USING (auth.uid() IS NOT NULL)
--   = any signed-in user can access all rows (appropriate for single-tenant app).

-- ── 001 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all anon jobs"          ON public.jobs;
DROP POLICY IF EXISTS "Allow all anon subcontractors" ON public.subcontractors;
DROP POLICY IF EXISTS "Allow all anon rfqs"           ON public.rfqs;
DROP POLICY IF EXISTS "Allow all anon cost_intel"     ON public.cost_intelligence;

CREATE POLICY "authenticated_all_jobs"          ON public.jobs           FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_subcontractors" ON public.subcontractors FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_rfqs"           ON public.rfqs           FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_cost_intel"     ON public.cost_intelligence FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 002 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all anon custom_trades" ON public.custom_trades;
CREATE POLICY "authenticated_all_custom_trades" ON public.custom_trades FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 003 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all anon user_settings"    ON public.user_settings;
DROP POLICY IF EXISTS "Allow all anon unmatched_quotes" ON public.unmatched_quote_emails;
CREATE POLICY "authenticated_all_user_settings"         ON public.user_settings          FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_unmatched_quotes"      ON public.unmatched_quote_emails FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 006 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all anon projects"        ON public.projects;
DROP POLICY IF EXISTS "Allow all anon purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Allow all anon correspondence"  ON public.correspondence;
DROP POLICY IF EXISTS "Allow all anon sequences"       ON public.sequences;
DROP POLICY IF EXISTS "Allow all anon webhook_events"  ON public.buildexact_webhook_events;

CREATE POLICY "authenticated_all_projects"        ON public.projects                  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_purchase_orders" ON public.purchase_orders           FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_correspondence"  ON public.correspondence            FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_sequences"       ON public.sequences                 FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_webhook_events"  ON public.buildexact_webhook_events FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 007 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all anon fee_proposals" ON public.fee_proposals;
CREATE POLICY "authenticated_all_fee_proposals" ON public.fee_proposals FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 010 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all anon schedule_tasks"        ON schedule_tasks;
DROP POLICY IF EXISTS "Allow all anon contractor_compliance" ON contractor_compliance;
DROP POLICY IF EXISTS "Allow all anon site_inductions"       ON site_inductions;
DROP POLICY IF EXISTS "Allow all anon swms_templates"        ON swms_templates;
DROP POLICY IF EXISTS "Allow all anon project_swms"          ON project_swms;
DROP POLICY IF EXISTS "Allow all anon site_reports"          ON site_reports;
DROP POLICY IF EXISTS "Allow all anon site_diary"            ON site_diary;

CREATE POLICY "authenticated_all_schedule_tasks"        ON schedule_tasks        FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_contractor_compliance" ON contractor_compliance FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_site_inductions"       ON site_inductions       FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_swms_templates"        ON swms_templates        FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_project_swms"          ON project_swms          FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_site_reports"          ON site_reports          FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_site_diary"            ON site_diary            FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 013 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all anon buildexact_estimates" ON public.buildexact_estimates;
DROP POLICY IF EXISTS "Allow all anon job_knowledge"        ON public.job_knowledge;
CREATE POLICY "authenticated_all_buildexact_estimates" ON public.buildexact_estimates FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_job_knowledge"        ON public.job_knowledge        FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 014 tables — schedule_templates had conflicting anon + authenticated ───
DROP POLICY IF EXISTS "Allow all anon schedule_templates" ON public.schedule_templates;
-- Note: the proper per-user policies from 014 (schedule_templates_read/insert/update/delete)
-- remain in place — they already use auth.uid() correctly.

-- ── 016 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leads_anon_all"          ON leads;
DROP POLICY IF EXISTS "lead_activities_anon_all" ON lead_activities;
CREATE POLICY "authenticated_all_leads"           ON leads           FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_lead_activities" ON lead_activities FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 017 tables ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all_lead_conversations" ON lead_conversations;
DROP POLICY IF EXISTS "auth_all_lead_conversations" ON lead_conversations;
-- Replace both with a single clean authenticated policy
CREATE POLICY "authenticated_all_lead_conversations" ON lead_conversations FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Run after applying to confirm no anon policies remain:
-- SELECT schemaname, tablename, policyname, roles
-- FROM pg_policies
-- WHERE 'anon' = ANY(roles)
-- ORDER BY tablename;
-- Expected: 0 rows
