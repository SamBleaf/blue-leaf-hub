-- 088 — Carpentry material-invoice capture (§3 of CARPENTRY_BUILDEXACT_INTEGRATION_PLAN)
-- Lets a finance invoice be allocated to a CARPENTRY job (parallel to the tender job_id)
-- and tracks the Buildexact Purchase Order push (the material twin of the labour Work Order).

ALTER TABLE financial_documents
  ADD COLUMN IF NOT EXISTS carpentry_job_id uuid REFERENCES carpentry_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buildexact_purchase_order_id text,
  ADD COLUMN IF NOT EXISTS buildexact_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS buildexact_push_error text;

CREATE INDEX IF NOT EXISTS idx_findocs_carpentry_job
  ON financial_documents(carpentry_job_id)
  WHERE carpentry_job_id IS NOT NULL;
