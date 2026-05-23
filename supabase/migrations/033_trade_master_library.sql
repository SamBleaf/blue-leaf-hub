-- Trade master library + RFQ trade intelligence (estimate baseline, coverage analysis)

CREATE TABLE IF NOT EXISTS trade_master_library (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id              TEXT NOT NULL UNIQUE,
  trade_name            TEXT NOT NULL,
  trade_category        TEXT NOT NULL DEFAULT 'general',
  subcategory           TEXT DEFAULT '',
  buildxact_category    TEXT DEFAULT '',
  buildxact_trade_key   TEXT DEFAULT '',
  default_rfq_template  JSONB DEFAULT '[]'::jsonb,
  default_attachments   JSONB DEFAULT '[]'::jsonb,
  default_trade_notes   TEXT DEFAULT '',
  is_active             BOOLEAN DEFAULT true,
  quote_required        BOOLEAN DEFAULT true,
  contractor_tags       JSONB DEFAULT '[]'::jsonb,
  priority              INTEGER DEFAULT 50,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_master_library_active_idx
  ON trade_master_library (is_active, quote_required);

CREATE INDEX IF NOT EXISTS trade_master_library_bx_key_idx
  ON trade_master_library (buildxact_trade_key)
  WHERE buildxact_trade_key IS NOT NULL AND buildxact_trade_key <> '';

ALTER TABLE rfq_trade_scopes
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS trade_master_id UUID REFERENCES trade_master_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_enrichment JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimate_line_refs JSONB DEFAULT '[]'::jsonb;

ALTER TABLE rfq_packages
  ADD COLUMN IF NOT EXISTS estimate_baseline JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_trade_analysis JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trade_coverage JSONB DEFAULT '{}'::jsonb;
