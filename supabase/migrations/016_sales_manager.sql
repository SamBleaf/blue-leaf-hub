-- 016_sales_manager.sql

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text,
  email text,
  phone text,
  project_type text,
  suburb text,
  site_address text,
  estimated_value numeric(12,2),
  stage text NOT NULL DEFAULT 'enquiry',
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  next_action text,
  next_action_date date,
  qualify_budget integer,
  qualify_timeframe integer,
  qualify_site integer,
  qualify_decision_maker integer,
  qualify_score integer GENERATED ALWAYS AS (
    COALESCE(qualify_budget,0) + COALESCE(qualify_timeframe,0) +
    COALESCE(qualify_site,0) + COALESCE(qualify_decision_maker,0)
  ) STORED,
  discovery_notes text,
  design_stage text,
  desired_start_date date,
  floor_area_estimate numeric(8,2),
  key_requirements text,
  preconstruction_fee numeric(10,2),
  construction_budget_min numeric(12,2),
  construction_budget_max numeric(12,2),
  inclusions_summary text,
  lead_source text,
  lead_source_detail text,
  buildexact_lead_id text,
  fee_proposal_id uuid,
  job_id uuid,
  nurture_follow_up_date date,
  nurture_notes text,
  assigned_to text DEFAULT 'Sam Morris',
  lost_reason text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  summary text NOT NULL,
  detail text,
  next_action text,
  next_action_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_stage_idx ON leads(stage);
CREATE INDEX IF NOT EXISTS leads_last_activity_idx ON leads(last_activity_at);
CREATE INDEX IF NOT EXISTS lead_activities_lead_id_idx ON lead_activities(lead_id);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_anon_all" ON leads;
CREATE POLICY "leads_anon_all" ON leads FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lead_activities_anon_all" ON lead_activities;
CREATE POLICY "lead_activities_anon_all" ON lead_activities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
