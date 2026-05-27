-- Migration 059: Workforce Module — Timesheets, Employees, Site Tasks

-- Employees (in-house carpenters, labourers, supervisors)
CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  trade text NOT NULL DEFAULT 'carpenter'
    CHECK (trade IN ('carpenter','labourer','leading_hand','supervisor','other')),
  employment_type text NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time','part_time','casual')),
  hourly_rate numeric(8,2) NOT NULL DEFAULT 0,
  overtime_multiplier numeric(4,2) NOT NULL DEFAULT 1.5,
  double_time_multiplier numeric(4,2) NOT NULL DEFAULT 2.0,
  is_leading_hand boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  buildexact_employee_id text,
  invite_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Timesheets (one per employee per day per project)
CREATE TABLE timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected')),
  rejection_notes text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  buildexact_synced_at timestamptz,
  buildexact_sync_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Timesheet entries (one per task category within a day)
CREATE TABLE timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  task_category text NOT NULL CHECK (task_category IN (
    'first_fix_framing','cladding','second_fix','outdoor_works',
    'formwork_slab_prep','site_labouring','site_cleanup',
    'supervision','other'
  )),
  phase text,
  hours decimal(4,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  overtime_hours decimal(4,2) NOT NULL DEFAULT 0,
  cost_amount numeric(10,2),
  notes text,
  completion_photo_url text,
  created_at timestamptz DEFAULT now()
);

-- Org-wide workforce settings (single row, upserted on first access)
CREATE TABLE workforce_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_hours decimal(4,2) NOT NULL DEFAULT 8.0,
  standard_break_minutes integer NOT NULL DEFAULT 30,
  standard_start_time time NOT NULL DEFAULT '07:00',
  overtime_threshold decimal(4,2) NOT NULL DEFAULT 8.0,
  double_time_threshold decimal(4,2) NOT NULL DEFAULT 10.0,
  working_days text[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  cost_code_first_fix_framing text DEFAULT 'CARP-001',
  cost_code_cladding text DEFAULT 'CARP-002',
  cost_code_second_fix text DEFAULT 'CARP-003',
  cost_code_outdoor_works text DEFAULT 'CARP-004',
  cost_code_formwork_slab_prep text DEFAULT 'CONC-001',
  cost_code_site_labouring text DEFAULT 'LAB-001',
  cost_code_site_cleanup text DEFAULT 'LAB-002',
  cost_code_supervision text DEFAULT 'SUP-001',
  cost_code_other text DEFAULT 'GEN-001',
  updated_at timestamptz DEFAULT now()
);
INSERT INTO workforce_settings DEFAULT VALUES;

-- Site tasks (operational to-do list per project)
CREATE TABLE site_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES employees(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent','normal','when_time_permits')),
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','defect','safety','materials','inspection')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','done','wont_do')),
  due_date date,
  created_by uuid REFERENCES auth.users(id),
  created_via text NOT NULL DEFAULT 'manual'
    CHECK (created_via IN ('manual','voice_note','ai_extraction')),
  voice_note_id uuid,
  completed_at timestamptz,
  completed_by uuid REFERENCES employees(id),
  completion_photo_url text,
  completion_notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_timesheets_employee_date ON timesheets(employee_id, date);
CREATE INDEX idx_timesheets_project       ON timesheets(project_id);
CREATE INDEX idx_timesheets_status        ON timesheets(status);
CREATE INDEX idx_ts_entries_timesheet     ON timesheet_entries(timesheet_id);
CREATE INDEX idx_ts_entries_employee      ON timesheet_entries(employee_id);
CREATE INDEX idx_employees_user_id        ON employees(user_id);
CREATE INDEX idx_employees_active         ON employees(is_active) WHERE is_active = true;
CREATE INDEX idx_site_tasks_project       ON site_tasks(project_id);
CREATE INDEX idx_site_tasks_status        ON site_tasks(status) WHERE status = 'open';
CREATE INDEX idx_site_tasks_assigned      ON site_tasks(assigned_to);

-- RLS
ALTER TABLE employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_tasks         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_employees"    ON employees          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_settings"     ON workforce_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_site_tasks"   ON site_tasks         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_timesheets"   ON timesheets         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_ts_entries"   ON timesheet_entries  FOR ALL TO authenticated USING (true) WITH CHECK (true);
