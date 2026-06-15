-- ============================================================================
-- 085_procurement_intelligence.sql
-- Procurement Intelligence module (BQ-10) — Phase A schema.
--
-- Builds the procurement register that becomes the SINGLE SOURCE OF TRUTH for
-- order-by dates, superseding schedule_tasks.procurement_* (which are frozen,
-- not dropped — see deprecation comments at the foot of this file).
--
-- Canonical Data Law:
--   * order_by_date is a GENERATED STORED column (computed, never stored-editable).
--   * Reuses trade_categories, portal_decisions, purchase_orders,
--     supplier_trade_defaults, financial_documents, schedule_tasks, jobs,
--     projects, subcontractors — never duplicates them.
--   * suppliers is a NEW entity (material vendors) — distinct from subcontractors
--     (trade installers). supplier_trade_defaults (ABN→trade learning) is seeded
--     into suppliers, not duplicated.
--
-- Idempotency: every source (template/estimate/schedule/manual) is keyed by
--   (job_id, source, source_ref) partial-unique → regenerate + re-run never
--   duplicates. related_schedule_task_id is a NON-unique link (many items map
--   to one schedule phase).
--
-- Migration 085 was previously unused (084 = workforce sync-mode; 086-090 land
-- after this number). Safe to claim.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. suppliers — material vendors (distinct from subcontractors)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abn text,
  trade_category_id uuid REFERENCES public.trade_categories(id) ON DELETE SET NULL,
  contact_name text,
  email text,
  phone text,
  usual_lead_time_days integer,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ABN unique where present (partial — many suppliers may have no ABN recorded)
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_abn_key
  ON public.suppliers (abn) WHERE abn IS NOT NULL AND abn <> '';
CREATE INDEX IF NOT EXISTS idx_suppliers_trade   ON public.suppliers (trade_category_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_active  ON public.suppliers (is_active);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' AND policyname='auth_users') THEN
    CREATE POLICY "auth_users" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. procurement_templates — ONE master list (per-item build-type filter)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_category_id uuid REFERENCES public.trade_categories(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  default_unit text,
  supply_type text NOT NULL DEFAULT 'builder_supplied'
    CHECK (supply_type IN ('builder_supplied','subbie_supplied','client_supplied','pc_item')),
  default_lead_time_days integer DEFAULT 0,
  default_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_sequence integer DEFAULT 100,
  phase text,
  selection_required boolean DEFAULT false,
  match_existing boolean DEFAULT false,
  -- null/empty = applies to all build types; else e.g. {new_build,knockdown_rebuild,extension}
  applies_to_build_types text[],
  is_long_lead boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proc_templates_active ON public.procurement_templates (is_active);
CREATE INDEX IF NOT EXISTS idx_proc_templates_trade  ON public.procurement_templates (trade_category_id);

ALTER TABLE public.procurement_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='procurement_templates' AND policyname='auth_users') THEN
    CREATE POLICY "auth_users" ON public.procurement_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. procurement_items — the register (source of truth, per job)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  trade_category_id uuid REFERENCES public.trade_categories(id) ON DELETE SET NULL,

  item_name text NOT NULL,
  category text,

  -- provenance + idempotency
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('template','estimate','rfq','project_intelligence','schedule','manual','template+estimate')),
  source_ref text,                 -- template id / estimate line ref / schedule task id
  template_id uuid REFERENCES public.procurement_templates(id) ON DELETE SET NULL,
  user_modified boolean DEFAULT false,   -- anti-clobber: human edits set true

  required boolean DEFAULT true,         -- soft-remove = false
  supply_type text NOT NULL DEFAULT 'builder_supplied'
    CHECK (supply_type IN ('builder_supplied','subbie_supplied','client_supplied','pc_item')),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  backup_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,

  -- schedule linkage (NON-unique: many items can map to one schedule phase/task)
  related_schedule_task_id uuid REFERENCES public.schedule_tasks(id) ON DELETE SET NULL,
  required_on_site_date date,            -- input (Versioned: updated by schedule ripple)

  -- order-by math inputs (1.2)
  lead_time_days integer,
  approval_buffer_days integer DEFAULT 5,
  internal_review_buffer_days integer DEFAULT 3,
  -- order_by_date = on-site − lead − approval − review (GENERATED, never editable)
  order_by_date date GENERATED ALWAYS AS (
    required_on_site_date
      - (COALESCE(lead_time_days,0) + COALESCE(approval_buffer_days,0) + COALESCE(internal_review_buffer_days,0))
  ) STORED,

  -- selection / clarification (reuses portal_decisions)
  selection_required boolean DEFAULT false,
  selection_decision_id uuid REFERENCES public.portal_decisions(id) ON DELETE SET NULL,
  selection_status text CHECK (selection_status IS NULL OR selection_status IN ('pending','confirmed','not_required')),
  architect_clarification_required boolean DEFAULT false,
  match_existing boolean DEFAULT false,

  -- supplier quote
  supplier_quote_required boolean DEFAULT false,
  supplier_quote_status text CHECK (supplier_quote_status IS NULL OR supplier_quote_status IN ('pending','received','not_required')),

  -- workflow status (§E)
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'not_started','scope_required','quote_requested','quote_received',
      'waiting_on_selection','waiting_on_clarification','ready_for_approval','approved',
      'po_drafted','po_sent','order_confirmed','delivery_booked','delivered','closed',
      'delayed','cancelled')),
  -- risk status (§E) — cached for sort; recomputed on read/write because 'today' moves
  risk_status text NOT NULL DEFAULT 'on_track'
    CHECK (risk_status IN ('on_track','watch','at_risk','critical','blocked')),
  risk_refreshed_at timestamptz,

  -- amounts (ex-GST). committed cost is COMPUTED (Σ approved_amount where po_sent+) — not stored here.
  cost_allowance numeric(12,2),          -- from estimate / template
  quoted_amount numeric(12,2),
  approved_amount numeric(12,2),
  uom text,
  quantity numeric(12,2),

  -- commitment + invoice linkage (reuses purchase_orders / financial_documents)
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,

  documents jsonb DEFAULT '[]'::jsonb,
  notes text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Idempotency: one logical item per (job, source, source_ref). Partial so that
-- manual items (source_ref NULL) never collide and never block inserts.
CREATE UNIQUE INDEX IF NOT EXISTS procurement_items_source_key
  ON public.procurement_items (job_id, source, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proc_items_job        ON public.procurement_items (job_id);
CREATE INDEX IF NOT EXISTS idx_proc_items_project    ON public.procurement_items (project_id);
CREATE INDEX IF NOT EXISTS idx_proc_items_orderby    ON public.procurement_items (order_by_date);
CREATE INDEX IF NOT EXISTS idx_proc_items_status     ON public.procurement_items (status);
CREATE INDEX IF NOT EXISTS idx_proc_items_risk       ON public.procurement_items (risk_status);
CREATE INDEX IF NOT EXISTS idx_proc_items_trade      ON public.procurement_items (trade_category_id);
CREATE INDEX IF NOT EXISTS idx_proc_items_task       ON public.procurement_items (related_schedule_task_id);
CREATE INDEX IF NOT EXISTS idx_proc_items_decision   ON public.procurement_items (selection_decision_id);

ALTER TABLE public.procurement_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='procurement_items' AND policyname='auth_users') THEN
    CREATE POLICY "auth_users" ON public.procurement_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed suppliers from supplier_trade_defaults (idempotent — ABN→supplier)
--    Reconciles the existing ABN-learning table into the new vendor entity.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.suppliers (name, abn, trade_category_id)
SELECT std.supplier_name, std.supplier_abn, std.trade_category_id
FROM public.supplier_trade_defaults std
WHERE std.supplier_abn IS NOT NULL AND std.supplier_abn <> ''
ON CONFLICT (abn) WHERE abn IS NOT NULL AND abn <> '' DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Backfill procurement_items from schedule_tasks.procurement_* (idempotent)
--    Maps task → job via projects.job_id. Skips jobless projects (orphans).
--    Re-runnable: ON CONFLICT (job_id,'schedule',task.id) DO NOTHING.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.procurement_items (
  job_id, project_id, trade_category_id, item_name, source, source_ref,
  related_schedule_task_id, required_on_site_date, lead_time_days,
  supply_type, status, supplier_id, notes
)
SELECT
  p.job_id,
  st.project_id,
  tc.id AS trade_category_id,
  COALESCE(NULLIF(st.procurement_item, ''), st.name) AS item_name,
  'schedule' AS source,
  st.id::text AS source_ref,
  st.id AS related_schedule_task_id,
  st.start_date AS required_on_site_date,
  COALESCE(st.procurement_lead_days, st.lead_time_weeks * 7) AS lead_time_days,
  'builder_supplied' AS supply_type,
  CASE st.procurement_order_status
    WHEN 'ordered'   THEN 'order_confirmed'
    WHEN 'delivered' THEN 'delivered'
    ELSE 'not_started'
  END AS status,
  NULL::uuid AS supplier_id,
  NULLIF(st.procurement_supplier, '') AS notes
FROM public.schedule_tasks st
JOIN public.projects p ON p.id = st.project_id
LEFT JOIN public.trade_categories tc
  ON lower(tc.name) = lower(st.trade)
WHERE p.job_id IS NOT NULL
  AND (st.task_type = 'procurement' OR (st.procurement_item IS NOT NULL AND st.procurement_item <> ''))
ON CONFLICT (job_id, source, source_ref) WHERE source_ref IS NOT NULL DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Freeze the old schedule_tasks.procurement_* fields (provenance + rollback).
--    The register (procurement_items) is now the source of truth; the schedule
--    renders a VIEW of it. Columns kept one release — dropped in a later cleanup
--    migration once the register is proven live (traceability matrix row 25).
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.schedule_tasks.procurement_item IS
  'DEPRECATED (migration 085): superseded by procurement_items register. Read order-by from procurement_items.order_by_date via related_schedule_task_id. The procurement module reads the register; the legacy schedule procurement-task endpoints (scheduleRoutes) still maintain this for backward compat until a cleanup migration retires them.';
COMMENT ON COLUMN public.schedule_tasks.procurement_supplier IS
  'DEPRECATED (migration 085): superseded by procurement_items.supplier_id. The procurement module reads the register; the legacy schedule procurement-task endpoints (scheduleRoutes) still maintain this for backward compat until a cleanup migration retires them.';
COMMENT ON COLUMN public.schedule_tasks.procurement_lead_days IS
  'DEPRECATED (migration 085): superseded by procurement_items.lead_time_days. The procurement module reads the register; the legacy schedule procurement-task endpoints (scheduleRoutes) still maintain this for backward compat until a cleanup migration retires them.';
COMMENT ON COLUMN public.schedule_tasks.procurement_order_by IS
  'DEPRECATED (migration 085): superseded by procurement_items.order_by_date (GENERATED). The procurement module reads the register; the legacy schedule procurement-task endpoints (scheduleRoutes) still maintain this for backward compat until a cleanup migration retires them.';
COMMENT ON COLUMN public.schedule_tasks.procurement_order_status IS
  'DEPRECATED (migration 085): superseded by procurement_items.status. The procurement module reads the register; the legacy schedule procurement-task endpoints (scheduleRoutes) still maintain this for backward compat until a cleanup migration retires them.';

COMMENT ON TABLE public.procurement_items IS
  'Procurement register (BQ-10) — single source of truth for order-by dates, selection blockers, and committed cost. order_by_date is GENERATED. Idempotency key: (job_id, source, source_ref).';
COMMENT ON TABLE public.suppliers IS
  'Material vendors (distinct from subcontractors/trade installers). Seeded from supplier_trade_defaults.';
COMMENT ON TABLE public.procurement_templates IS
  'One master procurement template; per-item applies_to_build_types filters generation by job build type.';
