-- =============================================================================
-- Migration 204 — Attach a receipt (PDF / photo) to a carpentry job cost, so a
--                  supplier invoice can be captured straight from the Workforce
--                  internal-house view (upload or phone-camera scan) instead of
--                  going through the Finance module.
--
-- Plan: the house glance (InternalHouseJobDetail) gets a "scan / upload invoice"
-- action. The file is stored in a private Storage bucket, Haiku OCR prefills the
-- supplier + ex-GST amount, and the confirmed amount is written as an ordinary
-- carpentry_job_costs row (source 'manual') — so it drops straight into the job's
-- running material tally (no Finance approval, no double-count: these rows are
-- disjoint from the finance read-through, same as any manual cost).
--
-- Additive + idempotent. receipt_path / supplier_name are nullable so every
-- existing manual-cost + mass-fill path keeps working untouched.
-- =============================================================================

-- 1. Columns on carpentry_job_costs: the stored receipt + the OCR'd supplier.
ALTER TABLE public.carpentry_job_costs
  ADD COLUMN IF NOT EXISTS receipt_path  text,   -- path within the 'job-cost-receipts' bucket (null = no file)
  ADD COLUMN IF NOT EXISTS supplier_name text;   -- from the invoice (OCR or typed); description stays the human label

-- 2. Private Storage bucket for the receipt files. (If your project blocks bucket
--    creation via SQL, create it manually: Storage -> New bucket -> name
--    'job-cost-receipts' -> Private — the policies below are what matter.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-cost-receipts', 'job-cost-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS on storage.objects for the bucket — authenticated users only (the server
--    uses the service role and bypasses these; these gate any direct client access).
--    Mirrors the 'lead-documents' policies from migration 060.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'job_cost_receipts_insert') THEN
    CREATE POLICY job_cost_receipts_insert ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'job-cost-receipts');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'job_cost_receipts_select') THEN
    CREATE POLICY job_cost_receipts_select ON storage.objects
      FOR SELECT TO authenticated USING (bucket_id = 'job-cost-receipts');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'job_cost_receipts_delete') THEN
    CREATE POLICY job_cost_receipts_delete ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = 'job-cost-receipts');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
