-- 098_timesheet_buildexact_completion.sql
-- Buildexact Work Order COMPLETION state machine for timesheets.
--
-- Background: timesheets push to Buildexact as Work Orders (mig 087 added buildexact_work_order_id).
-- We now also COMPLETE the order via POST /jobs/purchaseorders/complete, which books the actual
-- labour cost. "Created" and "completed" are distinct states that the old two columns
-- (buildexact_synced_at / buildexact_sync_error) cannot represent, and concurrent push paths could
-- create/complete duplicates. These columns fix both.
--
--   buildexact_synced_at        -> WORK ORDER CREATED at (existing column; meaning unchanged)
--   buildexact_completed_at     -> actuals BOOKED at (completion succeeded). NULL = not completed.
--   buildexact_sync_claimed_at  -> concurrency claim; a fresh claim (<5 min) blocks other pushers.
--   buildexact_needs_review     -> terminal: orphaned/empty order or edited-after-order; never auto-retried.

ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS buildexact_completed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS buildexact_sync_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS buildexact_needs_review    boolean NOT NULL DEFAULT false;

-- Backfill 1: under the OLD code, buildexact_synced_at being set meant the Work Order was CREATED
-- (there was no completion step). Mark those rows completed so the new create->complete flow never
-- retroactively re-touches historical orders (which would alter past actuals in the accounting system).
UPDATE timesheets
   SET buildexact_completed_at = buildexact_synced_at
 WHERE buildexact_synced_at IS NOT NULL
   AND buildexact_completed_at IS NULL;

-- Backfill 2: old rows where a Work Order id exists but it was never marked synced (e.g. the
-- historical "line items didn't land" failure) are not auto-recoverable -> flag for manual review
-- so the new retry path doesn't loop trying to complete an empty/broken order.
UPDATE timesheets
   SET buildexact_needs_review = true
 WHERE buildexact_work_order_id IS NOT NULL
   AND buildexact_synced_at IS NULL
   AND buildexact_completed_at IS NULL;

NOTIFY pgrst, 'reload schema';
