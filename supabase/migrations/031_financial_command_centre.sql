-- Financial Command Centre: trade categories, budgets, progress claims, variations, WIPAA
-- Requires: 020_finance_manager.sql (financial_documents), 022_jobs_wip_fields.sql (jobs)

-- ─── Trade categories (37 from Buildxact master template) ────────────────────

CREATE TABLE trade_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  buildxact_code text,
  sort_order integer NOT NULL,
  category_type text DEFAULT 'trade'
    CHECK (category_type IN ('trade','overhead','plant','other')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO trade_categories (name, sort_order, category_type) VALUES
  ('Preliminaries',         1,  'overhead'),
  ('Hire Items',            2,  'plant'),
  ('Site Establishment',    3,  'overhead'),
  ('Demolition / Civil',    4,  'trade'),
  ('Concrete & Footings',   5,  'trade'),
  ('Termite Protection',    6,  'trade'),
  ('Structural Steel',      7,  'trade'),
  ('Carpentry',             8,  'trade'),
  ('Windows / Skylights',   9,  'trade'),
  ('External Cladding',     10, 'trade'),
  ('Roof Plumber',          11, 'trade'),
  ('Masonry',               12, 'trade'),
  ('Electrical & Data',     13, 'trade'),
  ('Lighting & Automation', 14, 'trade'),
  ('Plumbing',              15, 'trade'),
  ('Sanitary Ware',         16, 'trade'),
  ('Stairs',                17, 'trade'),
  ('Insulation',            18, 'trade'),
  ('Internal Linings',      19, 'trade'),
  ('Tiler',                 20, 'trade'),
  ('Joinery',               21, 'trade'),
  ('Painting',              22, 'trade'),
  ('Garage Door',           23, 'trade'),
  ('Plastering & Rendering',24, 'trade'),
  ('Flooring',              25, 'trade'),
  ('Window Furnishings',    26, 'trade'),
  ('Appliances',            27, 'other'),
  ('Door Hardware',         28, 'other'),
  ('Fixtures & Fittings',   29, 'other'),
  ('Glazing',               30, 'trade'),
  ('Solar & Batteries',     31, 'trade'),
  ('Heating & Cooling',     32, 'trade'),
  ('Landscaping',           33, 'trade'),
  ('Paving',                34, 'trade'),
  ('Fencing',               35, 'trade'),
  ('Pool Works',            36, 'trade'),
  ('Site Cleaner',          37, 'trade');

-- ─── Supplier trade defaults (AI learning table) ─────────────────────────────

CREATE TABLE supplier_trade_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_abn text NOT NULL UNIQUE,
  supplier_name text NOT NULL,
  trade_category_id uuid REFERENCES trade_categories(id),
  confirmed_count integer DEFAULT 0,
  auto_tag boolean DEFAULT false,
  last_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── Job budgets ──────────────────────────────────────────────────────────────

CREATE TABLE job_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  trade_category_id uuid NOT NULL REFERENCES trade_categories(id),
  original_budget numeric(12,2),   -- immutable after first seed
  budget_amount numeric(12,2) NOT NULL DEFAULT 0,
  forecast_amount numeric(12,2),
  forecast_notes text,
  seeded_from text DEFAULT 'manual',  -- 'manual' | 'buildxact' | 'csv'
  seeded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, trade_category_id)
);

CREATE TABLE job_budget_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_budget_id uuid NOT NULL REFERENCES job_budgets(id),
  changed_by uuid REFERENCES auth.users(id),
  field_changed text NOT NULL,
  previous_value numeric(12,2),
  new_value numeric(12,2),
  reason text NOT NULL,
  changed_at timestamptz DEFAULT now()
);

-- ─── Progress claims ──────────────────────────────────────────────────────────

CREATE TABLE progress_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  claim_number integer NOT NULL,
  claim_reference text,
  stage text CHECK (stage IN ('deposit','slab','frame','lock_up','fixing','practical_completion','custom')),
  description text,
  amount_ex_gst numeric(12,2) NOT NULL,
  gst_amount numeric(12,2) GENERATED ALWAYS AS (amount_ex_gst * 0.1) STORED,
  amount_inc_gst numeric(12,2) GENERATED ALWAYS AS (amount_ex_gst * 1.1) STORED,
  cumulative_claimed numeric(12,2),
  percentage_claimed numeric(5,2),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','overdue','partially_paid','paid','disputed','void')),
  issued_date date,
  due_date date,
  document_url text,
  xero_invoice_id text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, claim_number)
);

CREATE TABLE progress_claim_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_claim_id uuid NOT NULL REFERENCES progress_claims(id),
  payment_amount numeric(12,2) NOT NULL,
  payment_date date NOT NULL,
  payment_reference text,
  payment_method text CHECK (payment_method IN ('eft','cheque','cash','xero_match')),
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- ─── Variations ───────────────────────────────────────────────────────────────
-- RULE: unsigned variations NEVER affect P&L.
-- contract_value = original_contract_value + SUM(job_variations WHERE status='signed')

CREATE TABLE job_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  variation_number integer NOT NULL,
  variation_reference text,
  title text NOT NULL,
  description text,
  trade_category_id uuid REFERENCES trade_categories(id),
  cost_to_builder numeric(12,2) DEFAULT 0,
  amount_ex_gst numeric(12,2) NOT NULL DEFAULT 0,
  gst_amount numeric(12,2) GENERATED ALWAYS AS (amount_ex_gst * 0.1) STORED,
  amount_inc_gst numeric(12,2) GENERATED ALWAYS AS (amount_ex_gst * 1.1) STORED,
  line_items jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent_to_client','signed','rejected','void','invoiced')),
  sent_date timestamptz,
  signed_date timestamptz,
  rejection_reason text,
  document_url text,
  signed_document_url text,
  eot_days integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, variation_number)
);

-- ─── WIPAA reviews ────────────────────────────────────────────────────────────

CREATE TABLE wipaa_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  review_date date NOT NULL,
  reviewed_by uuid REFERENCES auth.users(id),
  contract_value numeric(12,2),
  original_estimate numeric(12,2),
  forecast_total_cost numeric(12,2),
  cost_to_date numeric(12,2),
  progress_billed numeric(12,2),
  pct_complete numeric(5,2),
  wipaa_value numeric(12,2),
  projected_margin_pct numeric(5,2),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ─── Extend financial_documents ───────────────────────────────────────────────
-- trade_category_id is required before approval (enforced in API, not DB constraint,
-- to allow existing rows to keep working)

ALTER TABLE financial_documents
  ADD COLUMN IF NOT EXISTS trade_category_id uuid REFERENCES trade_categories(id),
  ADD COLUMN IF NOT EXISTS ai_trade_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS ai_job_match_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS approved_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_follow_up_date date;

-- ─── Extend jobs ──────────────────────────────────────────────────────────────

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS target_margin_pct numeric(5,2) DEFAULT 40.0,
  ADD COLUMN IF NOT EXISTS floor_margin_pct numeric(5,2) DEFAULT 33.0,
  ADD COLUMN IF NOT EXISTS forecast_total_cost numeric(12,2),
  ADD COLUMN IF NOT EXISTS original_contract_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS financial_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_wipaa_review_date date;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE trade_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_trade_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_budgets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_budget_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_claims         ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_claim_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_variations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wipaa_reviews           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON trade_categories        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON supplier_trade_defaults FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON job_budgets             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON job_budget_history      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON progress_claims         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON progress_claim_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON job_variations          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON wipaa_reviews           FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_job_budgets_job        ON job_budgets(job_id);
CREATE INDEX idx_progress_claims_job    ON progress_claims(job_id);
CREATE INDEX idx_progress_claims_status ON progress_claims(status);
CREATE INDEX idx_job_variations_job     ON job_variations(job_id);
CREATE INDEX idx_job_variations_status  ON job_variations(status);
CREATE INDEX idx_findocs_trade          ON financial_documents(trade_category_id);
CREATE INDEX idx_supplier_defaults_abn  ON supplier_trade_defaults(supplier_abn);
