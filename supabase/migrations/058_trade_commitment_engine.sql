-- 058_trade_commitment_engine.sql
-- Trade Commitment Engine: lifecycle tracking from PO issue to commencement

CREATE TABLE trade_communication_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'po_issued','commencement_notice','stage_complete_notice',
    'schedule_change_notice','follow_up_1','follow_up_2',
    'supervisor_escalation','response_received','commencement_confirmed',
    'availability_conflict'
  )),
  sent_at timestamptz DEFAULT now(),
  response_received_at timestamptz,
  response_status text CHECK (response_status IN ('responded','unsure','ghosted','unavailable')),
  response_notes text,
  email_subject text,
  tentative_start_label text,
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE supervisor_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  task_type text NOT NULL CHECK (task_type IN (
    'call_trade_schedule_change','call_trade_no_response',
    'follow_up_trade','find_backup_trade','other'
  )),
  title text NOT NULL,
  description text,
  due_date date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','done','dismissed')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id)
);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS po_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS commencement_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_1_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_2_sent_at timestamptz;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS commencement_date date,
  ADD COLUMN IF NOT EXISTS contract_signed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tcl_project    ON trade_communication_log(project_id);
CREATE INDEX IF NOT EXISTS idx_tcl_po         ON trade_communication_log(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_tcl_event      ON trade_communication_log(event_type);
CREATE INDEX IF NOT EXISTS idx_tcl_noresponse ON trade_communication_log(response_received_at)
  WHERE response_received_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sup_tasks_prj  ON supervisor_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_sup_tasks_sts  ON supervisor_tasks(status) WHERE status = 'pending';

ALTER TABLE trade_communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON trade_communication_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON supervisor_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
