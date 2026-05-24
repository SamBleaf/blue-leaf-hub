-- Winning Offer fields on leads (all nullable, no breaking changes)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ptsa_project_scope      TEXT,
  ADD COLUMN IF NOT EXISTS wo_client_vision        TEXT,
  ADD COLUMN IF NOT EXISTS wo_budget_confirmed     TEXT,
  ADD COLUMN IF NOT EXISTS wo_timeline_confirmed   TEXT,
  ADD COLUMN IF NOT EXISTS wo_decision_makers      TEXT,
  ADD COLUMN IF NOT EXISTS wo_most_excited_about   TEXT,
  ADD COLUMN IF NOT EXISTS wo_biggest_concern      TEXT,
  ADD COLUMN IF NOT EXISTS wo_other_builders       TEXT,
  ADD COLUMN IF NOT EXISTS wo_our_differentiator   TEXT,
  ADD COLUMN IF NOT EXISTS wo_reference_project_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS wo_presentation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wo_presentation_notes   TEXT;

-- Reference projects library (supervised/managed builds, past experience)
CREATE TABLE IF NOT EXISTS reference_projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_label    TEXT NOT NULL,
  suburb           TEXT,
  project_type     TEXT,
  approx_value     NUMERIC(12,2),
  year_completed   INTEGER,
  storeys          INTEGER,
  floor_area_m2    NUMERIC(8,2),
  our_role         TEXT DEFAULT 'supervised'
    CHECK (our_role IN ('supervised','project_managed','site_managed','owner_builder_pm')),
  attribution_note TEXT,
  key_features     JSONB DEFAULT '[]',
  testimonial_text TEXT,
  testimonial_name TEXT,
  media_asset_ids  JSONB DEFAULT '[]',
  display_photo_url TEXT,
  is_active        BOOLEAN DEFAULT true,
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reference_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users" ON reference_projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reference_projects_active
  ON reference_projects(is_active, sort_order);
