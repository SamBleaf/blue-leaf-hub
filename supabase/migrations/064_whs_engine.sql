-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 064 — WHS Engine (Phase 1)
-- Single source of truth per project + generated document snapshots.
-- See docs/agent_knowledge/WHS_ENGINE_PLAN.md + docs/whs/template-pack/.
-- ─────────────────────────────────────────────────────────────────────────────

-- One WHS profile per project. Holds the questionnaire answers (promoted
-- high-reuse fields + a long-tail jsonb) and the risk-engine-derived outputs.
CREATE TABLE IF NOT EXISTS whs_site_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,

  -- ── Promoted high-reuse merge fields (entered once, merged into many outputs) ──
  -- Site setup (Module 2)
  site_access_location text,
  worker_parking_location text,
  visitor_parking_location text,
  delivery_area text,
  skip_location text,
  amenities_location text,
  toilet_location text,
  lunch_area text,
  site_fenced boolean,
  temporary_fencing_required boolean,
  site_map_url text,
  site_qr_induction_url text,
  -- Emergency (Modules 2 + 3)
  first_aid_location text,
  fire_extinguisher_location text,
  spill_kit_location text,
  assembly_point text,
  evacuation_signal text,
  emergency_vehicle_access text,
  nearest_hospital text,
  nearest_hospital_address text,
  nearest_hospital_phone text,
  nearest_medical_centre text,
  nearest_medical_centre_address text,
  first_aiders jsonb DEFAULT '[]'::jsonb,            -- [{name, phone, cert_expiry}]
  emergency_contacts jsonb DEFAULT '[]'::jsonb,      -- [{role, name, phone}]
  site_rules jsonb DEFAULT '[]'::jsonb,              -- selected + custom rules

  -- ── Full questionnaire answers (long tail, keyed by question id) ──
  answers jsonb DEFAULT '{}'::jsonb,                 -- { m0_*, m2_*, m4_*, m5_*, m6_* ... }

  -- ── Derived by the risk engine (recomputed on save — never hand-entered) ──
  high_risk_activities jsonb DEFAULT '[]'::jsonb,
  applicable_swms jsonb DEFAULT '[]'::jsonb,
  applicable_permits jsonb DEFAULT '[]'::jsonb,
  required_inspections jsonb DEFAULT '[]'::jsonb,
  required_registers jsonb DEFAULT '[]'::jsonb,
  required_toolbox_talks jsonb DEFAULT '[]'::jsonb,
  site_board_warnings jsonb DEFAULT '[]'::jsonb,
  training_requirements jsonb DEFAULT '[]'::jsonb,
  site_hazards jsonb DEFAULT '[]'::jsonb,

  -- ── Meta / versioning (legal defensibility) ──
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  version integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Immutable snapshot of each generated document (answer set + template version).
CREATE TABLE IF NOT EXISTS whs_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_key text NOT NULL,                        -- e.g. 'project_whs_management_plan'
  document_title text NOT NULL,
  audience_layer text CHECK (audience_layer IN ('management', 'site', 'worker')),
  template_version text,
  profile_version integer,                           -- whs_site_profiles.version at generation
  rendered_markdown text,
  missing_fields jsonb DEFAULT '[]'::jsonb,          -- required merge fields left blank
  status text NOT NULL DEFAULT 'generated'
    CHECK (status IN ('draft', 'generated', 'stale', 'approved', 'requires_review')),
  is_stale boolean NOT NULL DEFAULT false,
  generated_by uuid REFERENCES auth.users(id),
  generated_at timestamptz DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE whs_site_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE whs_documents     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON whs_site_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON whs_documents     FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whs_site_profiles_project ON whs_site_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_whs_documents_project     ON whs_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_whs_documents_template    ON whs_documents(template_key);
