-- Sprint 2A: baseline ghost bar columns
ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS baseline_start_date date,
  ADD COLUMN IF NOT EXISTS baseline_end_date   date;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS schedule_baseline_locked_at timestamptz;

-- Sprint 2B: EOT (Extension of Time) tracking
CREATE TABLE IF NOT EXISTS schedule_eot (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reason_code    text        NOT NULL,
  days_claimed   integer     NOT NULL,
  description    text,
  status         text        NOT NULL DEFAULT 'pending',
  days_approved  integer,
  raised_at      timestamptz DEFAULT now(),
  resolved_at    timestamptz,
  applied_at     timestamptz,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_eot_project_id_idx ON schedule_eot(project_id);
