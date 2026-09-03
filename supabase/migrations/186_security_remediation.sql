-- ============================================================================
-- 186_security_remediation.sql
-- Consolidated remediation for SECURITY_AUDIT.md findings C1, C2, C3, H1, H2.
--
-- APPLY TO A BRANCH / STAGING FIRST. Run the §6 verification curls before and
-- after. Then the positive control (staff login + client portal walkthrough).
-- Only then production, followed by:  NOTIFY pgrst, 'reload schema';
--
-- Every statement here is ADDITIVE and non-conflicting: it enables RLS, drops
-- known-bad permissive policies, and adds staff-only (auth_is_staff()) policies.
-- Nothing here touches the service-role server, which bypasses RLS entirely.
--
-- >>> TWO THINGS YOU MUST CONFIRM BEFORE APPLYING — see BLOCKER comments below.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- C1 — Storage: lead-documents & marketing-media are SELECT/DELETE-able by any
--      authenticated user (= any portal client). Lock to staff.
--
-- >>> BLOCKER-1 (CONFIRM BEFORE APPLYING):
--     This assumes the client portal NEVER reads these buckets with a client
--     JWT — it only ever gets files via server-generated signed URLs
--     (portalV2Routes.mjs createSignedUrl). The audit traced this, but verify:
--       grep -rn "lead-documents\|marketing-media" src/   # client-side code
--     If any CLIENT screen fetches these buckets directly, staff-only will
--     break it and you must instead scope by folder/ownership, not staff.
--
-- >>> ALSO: confirm in the Supabase dashboard that BOTH buckets are private
--     (public = false). If marketing-media is public (serves website images),
--     its read policy is moot and you may only want the DELETE/UPDATE lockdown.
-- ----------------------------------------------------------------------------

-- lead-documents: signed contracts, PTSA/concept agreements, surveys, proposals
DROP POLICY IF EXISTS "lead_documents_authenticated_read"   ON storage.objects;
DROP POLICY IF EXISTS "lead_documents_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "lead_documents_authenticated_delete" ON storage.objects;

CREATE POLICY "lead_documents_staff_all" ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'lead-documents' AND public.auth_is_staff())
  WITH CHECK (bucket_id = 'lead-documents' AND public.auth_is_staff());

-- marketing-media: project photos/videos.
-- NOTE: if a separate anon "thumbnails read" policy exists and is intended,
-- leave it; this only replaces the broad authenticated read/write/delete.
DROP POLICY IF EXISTS "authenticated_read"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete" ON storage.objects;

CREATE POLICY "marketing_media_staff_all" ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'marketing-media' AND public.auth_is_staff())
  WITH CHECK (bucket_id = 'marketing-media' AND public.auth_is_staff());


-- ----------------------------------------------------------------------------
-- C2 — 17 tables with RLS disabled → open to the bare anon key, no login.
--      Enable RLS + staff-only policy.
--
-- >>> BLOCKER-2 (CONFIRM BEFORE APPLYING):
--     rfq_quote_submissions and rfq_quote_attachments hold SUBCONTRACTOR quote
--     data. Staff-only is correct ONLY IF subbies never submit quotes through a
--     non-staff (anon/authenticated-client) path — e.g. an emailed RFQ link
--     that writes straight to Supabase. If such a path exists or is planned,
--     these two tables need a NARROW anon/authenticated INSERT policy instead of
--     a blanket staff lock, or you'll break quote intake.
--     Check:  grep -rn "rfq_quote_submissions\|rfq_quote_attachments" src/ server/
--     If all writes go through the service-role server, staff-only is safe.
--
--     The other 15 tables are internal (marketing, geocode, tender, schedule),
--     no external write path — staff-only is safe.
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rfq_quote_submissions','rfq_quote_attachments','tender_trade_scopes',
    'tender_addenda','tender_addendum_trades','rfq_events','rfq_package_orphans',
    'geocode_cache','marketing_weekly_plans','marketing_paid_campaigns',
    'marketing_publish_jobs','marketing_content_packages','marketing_campaign_templates',
    'marketing_library','drone_shot_plans','schedule_eot','trade_master_library'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- ⚠ FIX (2026-08-30): 11 of these 17 are NOT rls-off — they are rls-ON with a pre-existing
    -- PERMISSIVE policy (mig 154 tender tables carry "auth_users" USING(true); mig 122 marketing
    -- tables carry "<t>_authenticated" USING(auth.uid() IS NOT NULL)). Postgres OR-combines
    -- permissive policies, so adding a permissive staff_all leaves (true OR auth_is_staff()) = true
    -- → the lock is a NO-OP and a logged-in client keeps full CRUD. Drop the permissive policies
    -- first so staff_all is the only policy. DROP IF EXISTS is a no-op on the 6 genuinely rls-off.
    EXECUTE format('DROP POLICY IF EXISTS "auth_users" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated', t);
    -- guard against re-run: only create if absent
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'staff_all'
    ) THEN
      EXECUTE format($p$
        CREATE POLICY staff_all ON public.%I
          FOR ALL TO authenticated
          USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff())
      $p$, t);
    END IF;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- C3 — site_reports: mig 074 self-heal re-added an anon FOR ALL USING(true).
--      deny_clients is TO authenticated so anon bypasses it → anonymous CRUD on
--      WHS incident records. Drop the anon policy.
--      (authenticated_all_site_reports + deny_clients already gate staff/clients.)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all anon site_reports" ON public.site_reports;
-- REMINDER (do outside this migration): patch 074_site_reports_selfheal.sql so a
-- future re-run recreates the STAFF policy, not the anon one.


-- ----------------------------------------------------------------------------
-- H1 — 5 tables created after mig 104 never got deny_clients → client full CRUD.
--      Add the standard restrictive policy.
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'carpentry_budget_line_items','carpentry_job_stage_schedule',
    'charge_up_jobs','task_assignments','site_task_deletions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'deny_clients'
    ) THEN
      EXECUTE format($p$
        CREATE POLICY deny_clients ON public.%I
          AS RESTRICTIVE FOR ALL TO authenticated
          USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff())
      $p$, t);
    END IF;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- H2 — 5 views run owner-rights (bypass RLS). Make them invoker-rights so the
--      base-table policies apply, AND revoke the API-role grants (defence in
--      depth). App reads these only via the service-role server, so non-breaking.
--
--      security_invoker requires PG15+ (Supabase is fine). If any of these
--      views selects from ANOTHER view, set security_invoker on that one too or
--      RLS won't reach the base tables. v_lead_timeline spans the most — check.
-- ----------------------------------------------------------------------------
ALTER VIEW public.v_crm_people            SET (security_invoker = on);
ALTER VIEW public.v_lead_timeline         SET (security_invoker = on);
ALTER VIEW public.v_lead_attribution_roi  SET (security_invoker = on);
ALTER VIEW public.v_area_performance      SET (security_invoker = on);
ALTER VIEW public.v_procurement_dashboard SET (security_invoker = on);

REVOKE ALL ON
  public.v_crm_people,
  public.v_lead_timeline,
  public.v_lead_attribution_roi,
  public.v_area_performance,
  public.v_procurement_dashboard
FROM anon, authenticated;


COMMIT;

-- After production apply:  NOTIFY pgrst, 'reload schema';
-- Then run the §6 verification curls (anon + client JWT → empty/403)
-- and the staff-JWT positive control (must still return rows)
