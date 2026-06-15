-- ============================================================================
-- 092_procurement_intelligence_p2p3.sql
-- Procurement Intelligence (BQ-10) — P2/P3 enrichment.
--   * suppliers: richer profile + denormalised performance (plan §D, §I).
--   * procurement_items: lifecycle timestamps so learning can measure
--     actual lead time / on-time delivery, + discontinued-product flag (§L, §N).
--   * supplier_lead_observations: the learning ledger — one row per
--     ordered→delivered item, the raw data lead-time learning aggregates (§I, P3).
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS).
-- order_by_date / committed cost stay GENERATED/computed — nothing here changes that.
-- ============================================================================

-- ── suppliers: profile richness + denormalised performance ───────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS account_terms text,
  ADD COLUMN IF NOT EXISTS is_preferred boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS usual_products text,
  -- performance is DERIVED from supplier_lead_observations (computed, refreshed by
  -- the learning service); cached here for fast display. Never hand-edited.
  ADD COLUMN IF NOT EXISTS on_time_rate numeric(5,2),            -- 0..100 (% on/before expected)
  ADD COLUMN IF NOT EXISTS avg_lead_variance_days numeric(6,1),  -- mean(actual − expected) lead days
  ADD COLUMN IF NOT EXISTS learned_lead_time_days integer,       -- median actual lead from observations
  ADD COLUMN IF NOT EXISTS completed_orders integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS performance_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_suppliers_preferred ON public.suppliers (is_preferred);

-- ── procurement_items: lifecycle timestamps + discontinued flag ──────────────
ALTER TABLE public.procurement_items
  ADD COLUMN IF NOT EXISTS ordered_at timestamptz,            -- when PO sent / order placed
  ADD COLUMN IF NOT EXISTS order_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,       -- supplier-promised delivery
  ADD COLUMN IF NOT EXISTS delivered_at date,                 -- actual delivery
  ADD COLUMN IF NOT EXISTS discontinued boolean DEFAULT false; -- discontinued/unavailable product (§N)

CREATE INDEX IF NOT EXISTS idx_proc_items_supplier ON public.procurement_items (supplier_id);
CREATE INDEX IF NOT EXISTS idx_proc_items_delivered ON public.procurement_items (delivered_at);
-- Command-centre hot path: active items ordered by order-by date.
CREATE INDEX IF NOT EXISTS idx_proc_items_active_orderby ON public.procurement_items (order_by_date) WHERE required = true;

-- ── supplier_lead_observations: the lead-time learning ledger ────────────────
-- One immutable row per item that completed the order→deliver cycle. The learning
-- service aggregates these into suppliers.* performance + learned_lead_time_days.
CREATE TABLE IF NOT EXISTS public.supplier_lead_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  trade_category_id uuid REFERENCES public.trade_categories(id) ON DELETE SET NULL,
  procurement_item_id uuid REFERENCES public.procurement_items(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  item_name text,
  expected_lead_days integer,                 -- lead_time_days at order time
  actual_lead_days integer,                   -- delivered_at − ordered_at
  lead_variance_days integer,                 -- actual − expected (+ = late)
  on_time boolean,                            -- delivered_at ≤ expected_delivery_date
  ordered_at timestamptz,
  delivered_at date,
  created_at timestamptz DEFAULT now(),
  -- idempotent capture: one observation per item
  UNIQUE (procurement_item_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_obs_supplier ON public.supplier_lead_observations (supplier_id);
CREATE INDEX IF NOT EXISTS idx_lead_obs_trade    ON public.supplier_lead_observations (trade_category_id);

ALTER TABLE public.supplier_lead_observations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_lead_observations' AND policyname='auth_users') THEN
    CREATE POLICY "auth_users" ON public.supplier_lead_observations FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.supplier_lead_observations IS
  'Lead-time learning ledger (BQ-10 P3): one row per ordered→delivered procurement item. Aggregated into suppliers.on_time_rate / avg_lead_variance_days / learned_lead_time_days. Never hand-edited.';
