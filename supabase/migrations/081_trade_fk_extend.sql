-- =============================================================================
-- 081_trade_fk_extend.sql — Phase 6: trade taxonomy convergence
-- See docs/agent_knowledge/UNIVERSAL_DATA_MIGRATION_PLAN.md §3 (Phase 6) + §5.3 +
-- MASTER_DATA_DICTIONARY.md §17/§31 ("one trade vocabulary — the trade_categories
-- table; FK, not free-text").
--
-- GOAL: extend the canonical trade_category_id FK to the three remaining tables
--       that still carry only a free-text `trade` column:
--         • purchase_orders   (created in migration 006 — `trade text`, no FK)
--         • cost_intelligence (created in migration 001 — `trade text`, no FK)
--         • rfqs              (created in migration 001 — `trade text`, no FK)
--       trade_category_id FK already exists on financial_documents / normalized_costs
--       (mig 031/032), trade_master_library / rfq_trade_scopes (mig 043), and
--       subcontractors (mig 040) — those are NOT touched here.
--
-- ⚠️⚠️⚠️ MONEY-ADJACENT — SPEND ATTRIBUTION. A wrong trade backfill mis-attributes
-- spend → wrong per-trade margins (UNIVERSAL_DATA_MIGRATION_PLAN.md §6 risk
-- register: "Wrong trade_category_id backfill on POs/timesheets mis-attributes
-- spend"). The backfill below therefore uses an EXACT, case-insensitive name match
-- against trade_categories.name ONLY. It is deliberately CONSERVATIVE: legacy free
-- text such as 'plumbing' / 'painting' / 'carpentry' matches the canonical names
-- ('Plumbing' / 'Painting' / 'Carpentry'), but values like 'electrical',
-- 'concreting', 'excavation', 'bricklayer' will NOT match the canonical names
-- ('Electrical & Data', 'Concrete & Footings', 'Demolition / Civil', 'Masonry')
-- and are LEFT NULL ON PURPOSE for manual review. NEVER guess a trade — a NULL is
-- cheaper than a wrong attribution. NO fuzzy / token-overlap matching is done here.
--
-- PURELY ADDITIVE. No column is dropped or renamed; the existing `trade` text column
-- is kept on every table (legacy + display + fallback). Idempotent: ADD COLUMN IF
-- NOT EXISTS + CREATE INDEX IF NOT EXISTS + a guarded backfill that only writes rows
-- where trade_category_id IS NULL. Safe to re-run.
-- Apply this while the PO / timesheet ledgers are empty (before the live Buildxact
-- sync fills purchase_orders), per §5.3.
--
-- NOTE on the workforce task_category → trade_category mapping (H8): that mapping
-- ALREADY EXISTS in code (server/lib/financeCCRoutes.mjs TASK_CATEGORY_TO_TRADE_NAME),
-- resolves to trade_category_id at read time, and already folds in-house labour into
-- the per-trade budget-vs-actual. It is a code-side map (not a DB table), works, and
-- is NOT duplicated here. No task_category→trade table/function is added by this
-- migration.
-- =============================================================================

-- ── 1. purchase_orders ───────────────────────────────────────────────────────
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS trade_category_id uuid REFERENCES public.trade_categories(id);

-- Backfill by EXACT case-insensitive name match only (see money-adjacent note above).
-- Rows whose `trade` text does not EXACTLY equal a canonical trade_categories.name
-- stay NULL for manual review — never guessed.
UPDATE public.purchase_orders po
SET    trade_category_id = tc.id
FROM   public.trade_categories tc
WHERE  po.trade_category_id IS NULL
  AND  po.trade IS NOT NULL
  AND  LOWER(TRIM(po.trade)) = LOWER(tc.name);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_trade_category
  ON public.purchase_orders (trade_category_id);

-- ── 2. cost_intelligence ──────────────────────────────────────────────────────
ALTER TABLE public.cost_intelligence
  ADD COLUMN IF NOT EXISTS trade_category_id uuid REFERENCES public.trade_categories(id);

UPDATE public.cost_intelligence ci
SET    trade_category_id = tc.id
FROM   public.trade_categories tc
WHERE  ci.trade_category_id IS NULL
  AND  ci.trade IS NOT NULL
  AND  LOWER(TRIM(ci.trade)) = LOWER(tc.name);

CREATE INDEX IF NOT EXISTS idx_cost_intelligence_trade_category
  ON public.cost_intelligence (trade_category_id);

-- ── 3. rfqs ───────────────────────────────────────────────────────────────────
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS trade_category_id uuid REFERENCES public.trade_categories(id);

UPDATE public.rfqs r
SET    trade_category_id = tc.id
FROM   public.trade_categories tc
WHERE  r.trade_category_id IS NULL
  AND  r.trade IS NOT NULL
  AND  LOWER(TRIM(r.trade)) = LOWER(tc.name);

CREATE INDEX IF NOT EXISTS idx_rfqs_trade_category
  ON public.rfqs (trade_category_id);

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify (run after applying):
--
-- -- 1. FK columns + indexes present on all three tables:
-- SELECT table_name, column_name
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  column_name = 'trade_category_id'
--   AND  table_name IN ('purchase_orders','cost_intelligence','rfqs')
-- ORDER  BY table_name;
-- -- Expect 3 rows.
--
-- SELECT indexname FROM pg_indexes
-- WHERE  schemaname = 'public'
--   AND  indexname IN ('idx_purchase_orders_trade_category',
--                      'idx_cost_intelligence_trade_category',
--                      'idx_rfqs_trade_category');
-- -- Expect 3 rows.
--
-- -- 2. Backfill coverage — count matched vs NULL (NULL = manual review needed).
-- --    On empty ledgers all three totals are 0, which is expected and fine.
-- SELECT 'purchase_orders' AS tbl,
--        count(*) AS total,
--        count(trade_category_id) AS linked,
--        count(*) FILTER (WHERE trade_category_id IS NULL AND trade IS NOT NULL AND TRIM(trade) <> '') AS unmatched_with_trade
-- FROM   public.purchase_orders
-- UNION ALL
-- SELECT 'cost_intelligence',
--        count(*), count(trade_category_id),
--        count(*) FILTER (WHERE trade_category_id IS NULL AND trade IS NOT NULL AND TRIM(trade) <> '')
-- FROM   public.cost_intelligence
-- UNION ALL
-- SELECT 'rfqs',
--        count(*), count(trade_category_id),
--        count(*) FILTER (WHERE trade_category_id IS NULL AND trade IS NOT NULL AND TRIM(trade) <> '')
-- FROM   public.rfqs;
--
-- -- 3. List the DISTINCT unmatched trade texts to review + map manually.
-- --    Each value here is one a human must decide a canonical trade_category for
-- --    (or confirm it has none) — DO NOT auto-map.
-- SELECT DISTINCT trade FROM public.purchase_orders   WHERE trade_category_id IS NULL AND TRIM(COALESCE(trade,'')) <> ''
-- UNION SELECT DISTINCT trade FROM public.cost_intelligence WHERE trade_category_id IS NULL AND TRIM(COALESCE(trade,'')) <> ''
-- UNION SELECT DISTINCT trade FROM public.rfqs             WHERE trade_category_id IS NULL AND TRIM(COALESCE(trade,'')) <> ''
-- ORDER  BY 1;
-- =============================================================================
