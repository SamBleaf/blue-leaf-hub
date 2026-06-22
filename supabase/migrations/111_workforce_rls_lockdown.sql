-- 111_workforce_rls_lockdown.sql
-- SECURITY (deploy blocker B2): the workforce tables shipped with wide-open RLS.
--
-- Migration 059 created, on EACH of employees / timesheets / timesheet_entries /
-- workforce_settings / site_tasks:
--     CREATE POLICY "auth_users_*" ON <t> FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- Because the frontend ships the public anon key and portal CLIENTS are real Supabase auth users
-- (created via sb.auth.admin.createUser), any logged-in client could read AND write these tables
-- directly — dumping every employees.worker_token (= full worker impersonation) and pay rate
-- (employees.hourly_rate, timesheet_entries.cost_amount, workforce_settings), and even rotating a
-- worker's token or altering a rate (WITH CHECK(true) permits writes), which corrupts the cost that
-- flows to Buildexact actuals. This defeats every server-side strip and admin role gate.
--
-- ALL workforce access in this app goes through the Express server using the SERVICE ROLE
-- (getServiceSupabase), which BYPASSES RLS. Verified 2026-06-22: there is zero `supabase.from(...)`
-- access to any of these five tables anywhere in src/ (the worker PWA uses workerFetch and the admin
-- UI uses apiFetch/authFetch — both hit /api/* on the server). So removing the permissive policies
-- leaves the app fully functional while denying all anon/authenticated (incl. client) direct access.
--
-- Effect: RLS stays ENABLED (from 059) with NO permissive policy → anon + authenticated are denied
-- by default; the service role continues to bypass RLS. Idempotent (IF EXISTS).
--
-- APPLY MANUALLY in the Supabase SQL editor (per project convention), then verify with a real
-- portal-client JWT that `select worker_token from employees` returns zero rows.

BEGIN;

DROP POLICY IF EXISTS "auth_users_employees"  ON employees;
DROP POLICY IF EXISTS "auth_users_timesheets" ON timesheets;
DROP POLICY IF EXISTS "auth_users_ts_entries" ON timesheet_entries;
DROP POLICY IF EXISTS "auth_users_settings"   ON workforce_settings;
DROP POLICY IF EXISTS "auth_users_site_tasks" ON site_tasks;

-- Keep RLS explicitly enabled (no-op if already enabled) so the tables fail closed.
ALTER TABLE employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_tasks         ENABLE ROW LEVEL SECURITY;

COMMIT;
