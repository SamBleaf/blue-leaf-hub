-- =============================================================================
-- Migration 205 — Store the invoice / bill number on a captured carpentry job
--                  cost, so a re-scan of the same supplier invoice can be
--                  flagged as a likely duplicate at confirm time.
--
-- The Haiku OCR already reads the invoice number off the receipt; until now the
-- capture path discarded it. Storing it lets findPossibleDuplicate() (server/lib/
-- jobCostReceipts.mjs) do a near-certain "same invoice # + supplier on this job"
-- match, with a supplier + date + amount fuzzy fallback for receipts that carry
-- no printed number. The check is ADVISORY only — it surfaces a soft warning the
-- operator can override; it never blocks a save (genuine same-supplier same-day
-- receipts are real), mirroring the Finance is_duplicate flag.
--
-- Additive + idempotent. invoice_number is nullable so every existing manual /
-- mass-fill / finance-read-through path keeps working untouched.
-- =============================================================================

-- 1. Column on carpentry_job_costs: the OCR'd (or typed) invoice / bill number.
ALTER TABLE public.carpentry_job_costs
  ADD COLUMN IF NOT EXISTS invoice_number text;   -- from the invoice (OCR or typed); null = none printed/read

-- 2. Partial index to make the duplicate lookup cheap (only rows that carry a
--    number). Mirrors the finance (invoice_number, supplier_name) index style.
CREATE INDEX IF NOT EXISTS idx_carpentry_job_costs_invoice
  ON public.carpentry_job_costs (job_id, supplier_name, invoice_number)
  WHERE invoice_number IS NOT NULL;

NOTIFY pgrst, 'reload schema';
