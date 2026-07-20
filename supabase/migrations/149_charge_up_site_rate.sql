-- =============================================================================
-- Migration 149 — BLB Charge Up per-site charge-out rate override
-- A charge-up site (charge_up_jobs, mig 145) can carry a flat charge-out rate that
-- OVERRIDES each worker's charge_up_hourly for that site — so a job can be priced /
-- margin-adjusted independently of the default per-employee rate. NULL = fall back to
-- each worker's charge_up_hourly (the existing behaviour). Charge-out $ stays a derived
-- figure (hours × rate); nothing is frozen here (that's a later billing phase).
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS) — safe to re-run.
-- =============================================================================

ALTER TABLE public.charge_up_jobs
  ADD COLUMN IF NOT EXISTS charge_out_hourly numeric(10,4);

NOTIFY pgrst, 'reload schema';
