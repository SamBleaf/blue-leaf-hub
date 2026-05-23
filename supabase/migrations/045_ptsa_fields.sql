-- Migration 045: Pre-Tender Service Agreement (PTSA) fields on leads
-- Adds structured PTSA fields alongside existing pretender_* columns from migration 024.
-- preconstruction_fee (migration 016) = the PTSA fee dollar amount (already on leads).
-- pretender_signed_date + pretender_notes (migration 024) = kept, reused.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ptsa_services        JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ptsa_scope_notes     TEXT,
  ADD COLUMN IF NOT EXISTS ptsa_validity_days   INTEGER DEFAULT 14,
  ADD COLUMN IF NOT EXISTS ptsa_status          TEXT    DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS ptsa_sent_date       DATE,
  ADD COLUMN IF NOT EXISTS ptsa_special_terms   TEXT,
  ADD COLUMN IF NOT EXISTS ptsa_credit_to_contract BOOLEAN DEFAULT true;

-- Enforce valid status values (safe to run multiple times — DO block drops/re-adds)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'leads_ptsa_status_check'
      AND table_name = 'leads'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_ptsa_status_check
      CHECK (ptsa_status IN ('draft','sent','signed','declined'));
  END IF;
END$$;
