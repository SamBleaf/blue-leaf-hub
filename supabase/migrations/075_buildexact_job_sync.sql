-- 075_buildexact_job_sync.sql
-- Mirror of a Buildxact job's headline financials, pulled by the sync engine so the Hub HOLDS the
-- Buildxact numbers (Phase-1 of the Hub⇄Buildxact integration — Buildxact is the financial system of
-- record; the Hub mirrors for visibility + side-by-side reconciliation). One row per Buildxact job;
-- re-sync upserts. Idempotent (safe to re-run).

CREATE TABLE IF NOT EXISTS buildexact_job_sync (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid REFERENCES jobs(id) ON DELETE SET NULL,  -- linked Hub job (null if unlinked)
  buildexact_job_id  text NOT NULL UNIQUE,
  job_number         text,
  client_name        text,
  address            text,
  contract_ex        numeric(14,2),
  contract_gst       numeric(14,2),
  estimate_ex        numeric(14,2),
  markup             numeric(14,2),
  actual_ex          numeric(14,2),
  claims_ex          numeric(14,2),
  claims_gst         numeric(14,2),
  variations_ex      numeric(14,2),
  variations_gst     numeric(14,2),
  po_count           integer,
  po_ex              numeric(14,2),
  estimate_id        text,
  raw                jsonb,                  -- full pulled payload (job + estimate + POs) for drill-down
  synced_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buildexact_job_sync_job ON buildexact_job_sync(job_id);

ALTER TABLE buildexact_job_sync ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_users" ON buildexact_job_sync FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
