-- 090 — Company Cost Model (P1 of the labour burn-rate plan).
-- Synced from the Google Sheet (named ranges OperatingParams / Overheads / EmployeeRates).
-- The Hub consumes the sheet's already-computed flat-overhead rates; this is the canonical store.

CREATE TABLE IF NOT EXISTS company_cost_model (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sheet_id text,
  -- Operating parameters (from the OperatingParams range)
  working_weeks numeric(6,2),
  productive_hours_week numeric(6,2),
  hours_per_day numeric(5,2),
  headcount integer,
  margin_pct numeric(6,4),            -- 0.20 = 20%
  productive_pct numeric(6,4),        -- 0.78 = 78%
  -- Overheads
  overhead_total numeric(14,2),
  overhead_recovery_per_hour numeric(10,4),   -- flat $/hr added to every true cost
  overheads jsonb DEFAULT '[]'::jsonb,         -- [{ name, annual }]
  -- Sync metadata
  last_synced_at timestamptz,
  last_sync_status text,              -- 'ok' | 'error'
  sync_error text,
  updated_at timestamptz DEFAULT now()
);
-- Enforce a single row (one company cost model)
CREATE UNIQUE INDEX IF NOT EXISTS company_cost_model_singleton ON company_cost_model ((true));

CREATE TABLE IF NOT EXISTS employee_cost_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text NOT NULL UNIQUE,           -- the name as it appears in the sheet
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,  -- matched by name on sync
  base_hourly numeric(10,4),
  true_hourly numeric(10,4),                     -- wage + super + leave loading (real cost)
  overhead_hourly numeric(10,4),                 -- flat overhead recovery $/hr
  break_even_hourly numeric(10,4),               -- true + overhead = the cost to use
  charge_up_hourly numeric(10,4),                -- break-even × (1 + margin) = bill rate
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_cost_rates_emp ON employee_cost_rates(employee_id);

ALTER TABLE company_cost_model  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_cost_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users" ON company_cost_model  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON employee_cost_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);
