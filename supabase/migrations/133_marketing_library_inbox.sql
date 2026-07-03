-- ============================================================
-- Migration 133 — Marketing Library Inbox / Triage columns
-- ============================================================
-- Extends marketing_library (created in migration 132) with
-- inbox/triage metadata required for the INBOX-BATCH-A feature:
--
--   status       — lifecycle state: inbox | filed | rejected
--                  Existing rows default to 'filed' (already categorised).
--   quality_score — 0–1 composite (sharpness/exposure/resolution).
--                  NULL until auto-sort runs.
--   starred      — pinned/favourite flag for triage UI.
--   dup_group    — perceptual-hash cluster id for burst deduplication.
--                  NULL until pHash sorter runs.
--
-- ADDITIVE and NON-DESTRUCTIVE. No existing rows are altered
-- (ADD COLUMN IF NOT EXISTS; defaults preserve current data).
--
-- NOTE: Apply manually in the Supabase SQL editor (Dashboard →
-- SQL Editor → New query → paste → Run). Do NOT run via CLI
-- against production without staging review.
--
-- ROLLBACK (non-destructive — no existing data is touched):
--   ALTER TABLE marketing_library
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS quality_score,
--     DROP COLUMN IF EXISTS starred,
--     DROP COLUMN IF EXISTS dup_group;
--   DROP INDEX IF EXISTS idx_marketing_library_status;
--   DROP INDEX IF EXISTS idx_marketing_library_dup_group;
-- ============================================================

-- ── New columns ───────────────────────────────────────────────────────────────

ALTER TABLE marketing_library
  ADD COLUMN IF NOT EXISTS status        text    NOT NULL DEFAULT 'filed',
  ADD COLUMN IF NOT EXISTS quality_score numeric          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS starred       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dup_group     text             DEFAULT NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Inbox / triage view filter — most common WHERE clause after migration
CREATE INDEX IF NOT EXISTS idx_marketing_library_status
  ON marketing_library (status);

-- Burst deduplication group — partial: only rows assigned a cluster
CREATE INDEX IF NOT EXISTS idx_marketing_library_dup_group
  ON marketing_library (dup_group)
  WHERE dup_group IS NOT NULL;
