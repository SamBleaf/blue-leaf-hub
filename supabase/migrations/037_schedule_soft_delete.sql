-- Migration 037: Soft-delete for schedule_tasks regeneration.
-- Previously regenerate deleted all rows for a project (hard DELETE), losing history.
-- Now: deleted_at marks removed rows; schedule_version increments on each regenerate.
-- All queries must filter WHERE deleted_at IS NULL.

ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schedule_version INTEGER NOT NULL DEFAULT 1;

-- Partial index — live queries only need to scan active rows
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_active
  ON schedule_tasks (project_id, deleted_at)
  WHERE deleted_at IS NULL;

-- Bump all existing rows to version 1 (they are the current live set)
UPDATE schedule_tasks
SET schedule_version = 1
WHERE schedule_version IS NULL OR schedule_version = 0;
