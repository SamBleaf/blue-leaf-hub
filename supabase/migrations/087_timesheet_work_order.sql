-- 087_timesheet_work_order.sql
-- Store the Buildexact Work Order id created when an approved timesheet is pushed, so the push
-- is idempotent (never creates a duplicate Work Order for the same timesheet) and traceable.

ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS buildexact_work_order_id text;

NOTIFY pgrst, 'reload schema';
