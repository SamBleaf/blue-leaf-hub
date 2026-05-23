-- 043_trade_taxonomy_fk.sql
-- Formalises the link between the three trade taxonomy layers:
--   trade_categories (37, finance/cost intelligence)
--   trade_master_library (37, RFQ engine)
--   rfq_trade_scopes (RFQ package trade rows)
--
-- Before this migration the link existed only by name string matching.
-- After this migration trade_master_library.trade_category_id and
-- rfq_trade_scopes.trade_category_id are proper FK columns, backfilled
-- automatically from the name match that was already 37/37.

-- ── 1. Add trade_category_id to trade_master_library ──────────────────────
ALTER TABLE trade_master_library
  ADD COLUMN IF NOT EXISTS trade_category_id UUID
    REFERENCES trade_categories(id) ON DELETE SET NULL;

-- Backfill: match on buildxact_category → trade_categories.name (case-insensitive)
-- Falls back to trade_name if buildxact_category is null.
UPDATE trade_master_library tml
SET    trade_category_id = tc.id
FROM   trade_categories tc
WHERE  tml.trade_category_id IS NULL
  AND  LOWER(COALESCE(NULLIF(tml.buildxact_category, ''), tml.trade_name)) = LOWER(tc.name);

-- ── 2. Add trade_category_id to rfq_trade_scopes ──────────────────────────
ALTER TABLE rfq_trade_scopes
  ADD COLUMN IF NOT EXISTS trade_category_id UUID
    REFERENCES trade_categories(id) ON DELETE SET NULL;

-- Backfill existing rows: join via trade_master_library using trade_id slug
UPDATE rfq_trade_scopes rts
SET    trade_category_id = tml.trade_category_id
FROM   trade_master_library tml
WHERE  rts.trade_category_id IS NULL
  AND  rts.trade_id = tml.trade_id
  AND  tml.trade_category_id IS NOT NULL;

-- ── 3. Index for join performance ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS trade_master_library_tc_id ON trade_master_library(trade_category_id);
CREATE INDEX IF NOT EXISTS rfq_trade_scopes_tc_id     ON rfq_trade_scopes(trade_category_id);

-- ── Verification query (run after applying) ────────────────────────────────
-- SELECT COUNT(*) AS total,
--        COUNT(trade_category_id) AS linked
-- FROM   trade_master_library;
-- Expected: total=37, linked=37
