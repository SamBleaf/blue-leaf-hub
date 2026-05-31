-- =============================================================================
-- 074_site_reports_selfheal.sql — ensure site_reports exists (idempotent)
--
-- The live workflow test (2026-05-31) found `public.site_reports` missing from the
-- DEV database (a partial migration-010 apply — swms_templates/project_swms from the
-- same migration were present). WHS incident reports read/write this table
-- (whsRoutes.mjs), so they errored with "Could not find the table 'public.site_reports'
-- in the schema cache". This migration re-creates it idempotently so any environment
-- that drifted self-heals on apply. Safe to run everywhere (all IF NOT EXISTS).
-- Mirrors the definition in 010_module6_operations.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS site_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  report_type text NOT NULL CHECK (report_type IN (
    'incident','near_miss','hazard','defect','non_conformance'
  )),
  severity text CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  description text,
  corrective_action text,
  reported_by text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','in_progress','resolved'
  )),
  photo_paths text[] DEFAULT '{}',
  dropbox_pdf_path text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS site_reports_project_idx ON site_reports(project_id);

ALTER TABLE site_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all anon site_reports" ON site_reports;
CREATE POLICY "Allow all anon site_reports" ON site_reports FOR ALL USING (true) WITH CHECK (true);

-- Ask PostgREST to reload its schema cache so the table is immediately visible.
NOTIFY pgrst, 'reload schema';
