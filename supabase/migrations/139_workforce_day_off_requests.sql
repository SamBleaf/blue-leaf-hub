-- =============================================================================
-- 139_workforce_day_off_requests.sql — worker "request time off" (date range)
--
-- Field worker submits a date-range request from the PWA (POST
-- /api/worker/day-off-requests) → lands here as 'submitted' → Workforce
-- Approvals ("Time off" tab) reviews/approves/rejects/edits it.
--
-- On APPROVE, the server writes one row per day in [date_from, date_to] into the
-- EXISTING workforce_employee_rdo_dates table (mig 119) — this table does NOT
-- duplicate that model, it only tracks the REQUEST/approval lifecycle and which
-- RDO rows were created (applied_rdo_ids) so a later reject can clean them up.
-- Zero planner-code change: an approved day off just renders as "RDO".
--
-- Deny-all RLS (mirrors mig 119 / 124 exactly — enable RLS, no policies, so
-- anon/auth get nothing and only the service-role API can read/write this table).
--
-- PURELY ADDITIVE + idempotent (CREATE TABLE/INDEX IF NOT EXISTS). No data touched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS workforce_day_off_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date_from         date NOT NULL,
  date_to           date NOT NULL,
  reason            text,
  -- submitted → approved | rejected. An approved request that is later reversed
  -- goes to 'rejected' too (see applied_rdo_ids below for the cleanup trail).
  status            text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'rejected')),
  rejection_notes   text,
  -- ids of the workforce_employee_rdo_dates rows created on approval, so a
  -- later reject can delete exactly those rows (and only those) and clear this.
  applied_rdo_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS idx_workforce_day_off_requests_status ON workforce_day_off_requests (status);
CREATE INDEX IF NOT EXISTS idx_workforce_day_off_requests_employee ON workforce_day_off_requests (employee_id);

ALTER TABLE workforce_day_off_requests ENABLE ROW LEVEL SECURITY;
-- No policies → deny-all to anon/auth (mirrors mig 119 / 124); service-role API
-- (worker + admin/supervisor routes in workforceRoutes.mjs) bypasses RLS.

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='workforce_day_off_requests'
--    ORDER BY ordinal_position;
--   -- expect: id, employee_id, date_from, date_to, reason, status,
--   --         rejection_notes, applied_rdo_ids, reviewed_by, reviewed_at,
--   --         submitted_at, created_at, updated_at
--
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'workforce_day_off_requests';
--   -- expect: t (RLS enabled)
--   SELECT policyname FROM pg_policies WHERE tablename = 'workforce_day_off_requests';
--   -- expect: 0 rows (deny-all — service role only)
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'workforce_day_off_requests';
--   -- expect: workforce_day_off_requests_pkey,
--   --         idx_workforce_day_off_requests_status,
--   --         idx_workforce_day_off_requests_employee
-- =============================================================================
