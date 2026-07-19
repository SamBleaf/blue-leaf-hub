-- 146_workforce_alloc_charge_up.sql
-- BLB Charge Up — Planner: a charge-up shift must carry the specific site (address).
-- Adds an optional charge_up_job_id to workforce_allocations so an allocation to the
-- BL-CHARGEUP category records WHICH site the person is on. Nullable + ON DELETE SET NULL
-- so non-charge-up allocations are unaffected and deleting a site never orphans a shift.
-- Idempotent. Clone of the mig 141 pattern (timesheet_entries.charge_up_job_id / mig 145).

ALTER TABLE workforce_allocations
  ADD COLUMN IF NOT EXISTS charge_up_job_id uuid REFERENCES charge_up_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workforce_alloc_charge_up
  ON workforce_allocations(charge_up_job_id);

-- Ask PostgREST to reload its schema cache so the new column + FK embed are available.
NOTIFY pgrst, 'reload schema';
