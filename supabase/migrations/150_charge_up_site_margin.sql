-- =============================================================================
-- Migration 150 — BLB Charge Up per-site TARGET GROSS MARGIN (replaces mig 149's flat rate)
-- Sam prices a charge-up site by an adjustable MARGIN ON WAGES, not a flat $/hr. margin_pct is
-- the target gross margin %, so charge-out = wage cost ÷ (1 − margin_pct/100) and the shown gross
-- margin equals the number typed. NULL = fall back to each worker's charge_up_hourly (default).
-- Supersedes mig 149's charge_out_hourly (dropped; it held no production data). Additive + idempotent.
-- =============================================================================

ALTER TABLE public.charge_up_jobs DROP COLUMN IF EXISTS charge_out_hourly;

ALTER TABLE public.charge_up_jobs
  ADD COLUMN IF NOT EXISTS margin_pct numeric(5,2) CHECK (margin_pct >= 0 AND margin_pct < 100);

NOTIFY pgrst, 'reload schema';
