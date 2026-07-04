-- ============================================================
-- Migration 136 — marketing_library: suggested_project_id
-- ============================================================
-- Adds a GPS-derived auto-suggestion column to marketing_library.
-- The auto-sort job (G2-A) writes this field when it can match a
-- photo's EXIF GPS coordinates to a nearby geocoded job.
--
-- Design intent:
--   suggested_project_id  — system-generated suggestion, written by
--                           the inbox auto-sort (EXIF GPS → haversine →
--                           nearest job within NEAREST_JOB_RADIUS_M).
--                           Never overrides the user-confirmed project_id.
--
--   project_id            — authoritative, user-confirmed at file-time.
--                           Only set when a human clicks "File" and
--                           selects a job.  Unchanged by auto-sort.
--
-- Keeping them separate means the UI can default the job picker to the
-- suggestion, and the user can accept or override it — no silent overwrites.
--
-- ADDITIVE and NON-DESTRUCTIVE.
-- Existing rows are unaffected (column defaults to NULL).
--
-- ROLLBACK:
--   ALTER TABLE marketing_library
--     DROP COLUMN IF EXISTS suggested_project_id;
-- ============================================================

ALTER TABLE marketing_library
  ADD COLUMN IF NOT EXISTS suggested_project_id uuid
    REFERENCES jobs(id) ON DELETE SET NULL;

-- Partial index — fast lookup for the triage UI filter "has GPS suggestion"
CREATE INDEX IF NOT EXISTS idx_marketing_library_suggested_project
  ON marketing_library (suggested_project_id)
  WHERE suggested_project_id IS NOT NULL;

COMMENT ON COLUMN marketing_library.suggested_project_id IS
  'System-suggested job (from EXIF GPS → nearest geocoded job within 2 km). '
  'Pre-populates the job picker at triage; only project_id is authoritative.';
