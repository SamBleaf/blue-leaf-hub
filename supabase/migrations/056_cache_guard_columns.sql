-- Migration 056 — Cache guard source_hash columns (F6, F7)
-- Note: spec named this 052 but migration 052 was already used by video_story_sequence.
-- This migration is 056 — apply it next in sequence after 055_project_insights.
--
-- source_hash = SHA-256 hex digest of the uploaded file buffer/base64 string.
-- Allows detecting whether the same file was uploaded again without re-running AI.

-- F6: Architectural plan PDF extraction cache
ALTER TABLE project_metrics
  ADD COLUMN IF NOT EXISTS source_hash text;

-- F7: Buildxact XLSX and PDF parse cache
ALTER TABLE buildexact_estimates
  ADD COLUMN IF NOT EXISTS source_hash text;

CREATE INDEX IF NOT EXISTS idx_buildexact_estimates_source_hash
  ON buildexact_estimates(source_hash)
  WHERE source_hash IS NOT NULL;
