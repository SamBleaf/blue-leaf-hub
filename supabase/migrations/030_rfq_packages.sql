-- 030_rfq_packages.sql
-- Persistent RFQ Package: one package per tender, survives the wizard session.
-- Packages hold trade scopes, per-recipient tracking, and addenda.

CREATE TABLE IF NOT EXISTS rfq_packages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID REFERENCES jobs(id) ON DELETE SET NULL,
  project_address   TEXT    NOT NULL DEFAULT '',
  project_type      TEXT    DEFAULT '',
  tender_deadline   TEXT    DEFAULT '',
  architect_client  TEXT    DEFAULT '',
  dropbox_url       TEXT    DEFAULT '',
  extraction_data   JSONB   DEFAULT '{}'::jsonb,
  pdf_meta          JSONB   DEFAULT '[]'::jsonb,
  coverage_score    INTEGER DEFAULT 0,
  suggested_trades  JSONB   DEFAULT '[]'::jsonb,
  status            TEXT    DEFAULT 'active',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfq_trade_scopes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id         UUID NOT NULL REFERENCES rfq_packages(id) ON DELETE CASCADE,
  trade_id           TEXT NOT NULL,
  trade_label        TEXT NOT NULL,
  scope_bullets      JSONB DEFAULT '[]'::jsonb,
  exclusions         JSONB DEFAULT '[]'::jsonb,
  questions          JSONB DEFAULT '[]'::jsonb,
  internal_notes     TEXT  DEFAULT '',
  contractor_notes   TEXT  DEFAULT '',
  due_date           TEXT  DEFAULT '',
  attachments        JSONB DEFAULT '[]'::jsonb,
  status             TEXT  DEFAULT 'draft',
  estimate_category  TEXT  DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (package_id, trade_id)
);

CREATE TABLE IF NOT EXISTS rfq_recipients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_scope_id      UUID NOT NULL REFERENCES rfq_trade_scopes(id) ON DELETE CASCADE,
  package_id          UUID NOT NULL REFERENCES rfq_packages(id)     ON DELETE CASCADE,
  subcontractor_id    UUID REFERENCES subcontractors(id) ON DELETE SET NULL,
  business_name       TEXT NOT NULL,
  email               TEXT NOT NULL,
  status              TEXT DEFAULT 'not_sent',
  sent_at             TIMESTAMPTZ,
  follow_up_due       TIMESTAMPTZ,
  follow_up_sent_at   TIMESTAMPTZ,
  quote_received_at   TIMESTAMPTZ,
  quote_amount        NUMERIC,
  quote_exclusions    TEXT DEFAULT '',
  quote_pdf_path      TEXT DEFAULT '',
  email_subject       TEXT DEFAULT '',
  email_body          TEXT DEFAULT '',
  rfq_id              UUID REFERENCES rfqs(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfq_addenda (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      UUID NOT NULL REFERENCES rfq_packages(id) ON DELETE CASCADE,
  number          INTEGER NOT NULL,
  name            TEXT    NOT NULL,
  file_path       TEXT    DEFAULT '',
  affected_trades JSONB   DEFAULT '[]'::jsonb,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for common lookups
CREATE INDEX IF NOT EXISTS rfq_packages_job_id        ON rfq_packages(job_id);
CREATE INDEX IF NOT EXISTS rfq_trade_scopes_pkg       ON rfq_trade_scopes(package_id);
CREATE INDEX IF NOT EXISTS rfq_recipients_scope       ON rfq_recipients(trade_scope_id);
CREATE INDEX IF NOT EXISTS rfq_recipients_pkg         ON rfq_recipients(package_id);
CREATE INDEX IF NOT EXISTS rfq_addenda_pkg            ON rfq_addenda(package_id);
