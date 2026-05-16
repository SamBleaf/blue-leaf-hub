-- Module 6: Operations — schedule, WHS, site diary, inductions

CREATE TABLE IF NOT EXISTS schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  trade text NOT NULL,
  phase text NOT NULL CHECK (phase IN (
    'site_prep','substructure','frame','rough_in','lock_up','fitout','completion'
  )),
  start_date date,
  end_date date,
  duration_days integer NOT NULL DEFAULT 1,
  depends_on uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned','in_progress','complete','delayed','blocked'
  )),
  is_hold_point boolean NOT NULL DEFAULT false,
  procurement_lead_days integer,
  order_by_date date,
  ai_flag text,
  notes text,
  assigned_subcontractor_id uuid REFERENCES subcontractors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contractor_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
    'public_liability','workers_comp','licence','swms','other'
  )),
  document_name text,
  issue_date date,
  expiry_date date,
  policy_number text,
  insurer text,
  dropbox_path text,
  status text NOT NULL DEFAULT 'current' CHECK (status IN (
    'current','expiring_soon','expired','missing'
  )),
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_inductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  subcontractor_id uuid REFERENCES subcontractors(id),
  person_name text NOT NULL,
  company text,
  trade text,
  mobile text,
  emergency_contact_name text,
  emergency_contact_phone text,
  site_rules_acknowledged boolean NOT NULL DEFAULT false,
  swms_acknowledged boolean NOT NULL DEFAULT false,
  signature_data_url text,
  induction_pdf_path text,
  inducted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

CREATE TABLE IF NOT EXISTS swms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade text NOT NULL,
  title text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  content_html text,
  pdf_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_swms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  swms_template_id uuid REFERENCES swms_templates(id) NOT NULL,
  trade text
);

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

CREATE TABLE IF NOT EXISTS site_diary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  weather text,
  trades_onsite text[] DEFAULT '{}',
  work_completed text,
  issues text,
  instructions_given text,
  visitors text,
  raw_voice_transcript text,
  structured_by_ai boolean NOT NULL DEFAULT false,
  supervisor text,
  photo_paths text[] DEFAULT '{}',
  dropbox_pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_tasks_project_idx ON schedule_tasks(project_id);
CREATE INDEX IF NOT EXISTS site_inductions_project_idx ON site_inductions(project_id);
CREATE INDEX IF NOT EXISTS site_reports_project_idx ON site_reports(project_id);
CREATE INDEX IF NOT EXISTS site_diary_project_idx ON site_diary(project_id);
CREATE INDEX IF NOT EXISTS project_swms_project_idx ON project_swms(project_id);

ALTER TABLE schedule_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_inductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE swms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_swms ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_diary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all anon schedule_tasks" ON schedule_tasks;
CREATE POLICY "Allow all anon schedule_tasks" ON schedule_tasks FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon contractor_compliance" ON contractor_compliance;
CREATE POLICY "Allow all anon contractor_compliance" ON contractor_compliance FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon site_inductions" ON site_inductions;
CREATE POLICY "Allow all anon site_inductions" ON site_inductions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon swms_templates" ON swms_templates;
CREATE POLICY "Allow all anon swms_templates" ON swms_templates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon project_swms" ON project_swms;
CREATE POLICY "Allow all anon project_swms" ON project_swms FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon site_reports" ON site_reports;
CREATE POLICY "Allow all anon site_reports" ON site_reports FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all anon site_diary" ON site_diary;
CREATE POLICY "Allow all anon site_diary" ON site_diary FOR ALL USING (true) WITH CHECK (true);
