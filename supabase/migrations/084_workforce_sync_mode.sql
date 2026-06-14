-- 084_workforce_sync_mode.sql
-- Workforce module schema additions (applied together):
--   1. workforce_settings.buildexact_sync_mode — labour-sync mode toggle
--        'auto'   — approved timesheets push to Buildexact automatically (current behaviour, default)
--        'manual' — approved timesheets wait; an admin pushes them via the "Sync to Buildexact" button
--   2. employees.worker_token — per-worker magic-link token (W01). Lets a field worker open the
--        PWA from a personal link WITHOUT a Supabase account. Validated server-side, scoped to that
--        one employee, and revocable (regenerate the token to invalidate the old link).

ALTER TABLE workforce_settings
  ADD COLUMN IF NOT EXISTS buildexact_sync_mode text NOT NULL DEFAULT 'auto'
    CHECK (buildexact_sync_mode IN ('auto','manual'));

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS worker_token text;

-- Unique only among non-null tokens (most employees won't have one until a link is issued).
CREATE UNIQUE INDEX IF NOT EXISTS employees_worker_token_key
  ON employees(worker_token) WHERE worker_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
