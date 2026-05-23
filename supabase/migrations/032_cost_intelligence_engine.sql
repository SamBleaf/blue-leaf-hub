-- Cost Intelligence Engine: project metrics, normalised costs, benchmarks, insights, pre-tender
-- Requires: 031_financial_command_centre.sql (trade_categories)

-- ─── Project metrics (one row per job) ───────────────────────────────────────

CREATE TABLE project_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,

  -- Dimensions (populated from existing fields or manual entry)
  floor_area_m2 numeric(8,2),
  garage_area_m2 numeric(8,2),
  alfresco_area_m2 numeric(8,2),
  deck_area_m2 numeric(8,2),
  total_area_m2 numeric(8,2),
  roof_area_m2 numeric(8,2),
  wall_area_m2 numeric(8,2),
  ceiling_area_m2 numeric(8,2),
  framing_area_m2 numeric(8,2),
  external_cladding_area_m2 numeric(8,2),
  concrete_volume_m3 numeric(8,2),
  driveway_area_m2 numeric(8,2),

  -- Site
  storeys integer,
  site_slope text CHECK (site_slope IN ('flat','gentle','moderate','steep','very_steep')),
  site_access text CHECK (site_access IN ('good','limited','difficult')),
  distance_from_cbd_km numeric(5,1),

  -- Building type
  project_type text,
  wall_type text,
  roof_type text,
  roof_pitch integer,
  roof_complexity text CHECK (roof_complexity IN ('simple','moderate','complex','very_complex')),

  -- Feature flags (significant cost drivers)
  wet_areas integer DEFAULT 0,
  number_of_windows integer,
  window_area_m2 numeric(8,2),
  number_of_doors integer,
  number_of_stairs integer,
  has_raked_ceilings boolean DEFAULT false,
  has_skillion_roof boolean DEFAULT false,
  has_parapets boolean DEFAULT false,
  has_suspended_slab boolean DEFAULT false,
  has_retaining_walls boolean DEFAULT false,
  retaining_wall_height_m numeric(4,2),

  -- Compliance
  bal_rating text,
  energy_rating numeric(3,1),

  -- Complexity scores (AI-assessed 1–10)
  architectural_complexity_score integer CHECK (architectural_complexity_score BETWEEN 1 AND 10),
  overall_complexity_score integer CHECK (overall_complexity_score BETWEEN 1 AND 10),

  -- Extraction metadata
  extraction_source text DEFAULT 'manual',  -- 'manual' | 'ai_plans' | 'buildxact'
  extraction_confidence numeric(5,2),
  extracted_at timestamptz,

  is_complete boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── Normalised costs (one row per trade per job, auto-computed) ──────────────

CREATE TABLE normalized_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  trade_category_id uuid NOT NULL REFERENCES trade_categories(id),

  -- Raw amounts
  quoted_amount numeric(12,2),
  budget_amount numeric(12,2),
  actual_amount numeric(12,2),
  variation_amount numeric(12,2),
  final_amount numeric(12,2),   -- actual + variations; set when is_final = true

  -- Normalised rates (computed on write, stored for fast querying)
  rate_per_m2_floor numeric(10,4),
  rate_per_m2_trade_area numeric(10,4),
  rate_per_lm numeric(10,4),
  rate_per_unit numeric(10,4),
  rate_unit_description text,

  -- Variance
  budget_vs_actual_pct numeric(6,2),
  quoted_vs_actual_pct numeric(6,2),

  -- Metadata
  data_quality text DEFAULT 'partial',  -- 'partial' | 'complete' | 'final'
  is_final boolean DEFAULT false,
  recorded_at date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, trade_category_id)
);

-- ─── Cost benchmarks (pre-computed aggregates — never query normalized_costs live) ──

CREATE TABLE cost_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_category_id uuid NOT NULL REFERENCES trade_categories(id),

  -- Filter dimensions (null = applies to all)
  project_type text,
  site_slope text,
  storey_range text,  -- '1' | '2' | '3+' | null

  -- Sample
  sample_count integer DEFAULT 0,
  min_sample_for_display integer DEFAULT 3,

  -- $/m² floor benchmarks
  rate_per_m2_floor_avg numeric(10,4),
  rate_per_m2_floor_p25 numeric(10,4),
  rate_per_m2_floor_p50 numeric(10,4),
  rate_per_m2_floor_p75 numeric(10,4),
  rate_per_m2_floor_min numeric(10,4),
  rate_per_m2_floor_max numeric(10,4),

  -- Trade-specific rate benchmarks
  rate_per_unit_avg numeric(10,4),
  rate_per_unit_p25 numeric(10,4),
  rate_per_unit_p75 numeric(10,4),
  rate_unit_description text,

  -- Total cost benchmarks
  total_cost_avg numeric(12,2),
  total_cost_p25 numeric(12,2),
  total_cost_p50 numeric(12,2),
  total_cost_p75 numeric(12,2),

  -- Overrun statistics
  avg_budget_overrun_pct numeric(6,2),
  overrun_frequency_pct numeric(5,2),

  -- Temporal (stale if no data in last 6 months — flagged in UI)
  covers_period_from date,
  covers_period_to date,
  last_updated timestamptz DEFAULT now(),

  UNIQUE(trade_category_id, project_type, site_slope, storey_range)
);

-- ─── AI insights ──────────────────────────────────────────────────────────────

CREATE TABLE cost_intelligence_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,  -- null = global insight
  trade_category_id uuid REFERENCES trade_categories(id),
  insight_type text CHECK (insight_type IN
    ('budget_risk','trend','similarity','overrun_pattern','benchmark','underclaim')),
  severity text CHECK (severity IN ('info','warning','alert')),
  title text NOT NULL,
  body text NOT NULL,
  supporting_data jsonb,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  is_dismissed boolean DEFAULT false,
  dismissed_by uuid REFERENCES auth.users(id),
  dismissed_at timestamptz
);

-- ─── Pre-tender estimates ─────────────────────────────────────────────────────

CREATE TABLE pretender_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,

  -- Inputs
  floor_area_m2 numeric(8,2),
  project_type text,
  storeys integer,
  site_slope text,
  wall_type text,
  roof_complexity text,
  has_raked_ceilings boolean,
  has_suspended_slab boolean,
  wet_areas integer,
  complexity_description text,

  -- Outputs
  estimate_ranges jsonb,          -- [{trade_category_id, name, low, high, avg, confidence, sample_count}]
  suggested_total_low numeric(12,2),
  suggested_total_high numeric(12,2),
  confidence_pct numeric(5,2),
  similar_project_ids jsonb,      -- [{job_id, address, similarity_score}]
  uncertainty_notes text,
  model_used text,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE project_metrics              ENABLE ROW LEVEL SECURITY;
ALTER TABLE normalized_costs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_benchmarks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_intelligence_insights   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pretender_estimates          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON project_metrics            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON normalized_costs           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON cost_benchmarks            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON cost_intelligence_insights FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON pretender_estimates        FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_project_metrics_job    ON project_metrics(job_id);
CREATE INDEX idx_normalized_costs_job   ON normalized_costs(job_id);
CREATE INDEX idx_normalized_costs_trade ON normalized_costs(trade_category_id);
CREATE INDEX idx_normalized_costs_final ON normalized_costs(is_final);
CREATE INDEX idx_cost_benchmarks_trade  ON cost_benchmarks(trade_category_id);
CREATE INDEX idx_ci_insights_job        ON cost_intelligence_insights(job_id);
CREATE INDEX idx_ci_insights_dismissed  ON cost_intelligence_insights(is_dismissed);
CREATE INDEX idx_pretender_estimates_job ON pretender_estimates(job_id);

-- Similarity matching indexes
CREATE INDEX idx_project_metrics_slope   ON project_metrics(site_slope);
CREATE INDEX idx_project_metrics_storeys ON project_metrics(storeys);
CREATE INDEX idx_project_metrics_type    ON project_metrics(project_type);
