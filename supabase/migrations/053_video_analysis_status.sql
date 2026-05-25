-- Migration 053 — Video analysis pipeline status + story_sequence export format
-- 052 adds story_sequence column; this enables export_format value and asset status tracking

ALTER TABLE marketing_media_assets
  ADD COLUMN IF NOT EXISTS analysis_status text
    CHECK (analysis_status IS NULL OR analysis_status IN ('pending', 'processing', 'complete', 'error'));

ALTER TABLE marketing_media_exports
  DROP CONSTRAINT IF EXISTS marketing_media_exports_export_format_check;

ALTER TABLE marketing_media_exports
  ADD CONSTRAINT marketing_media_exports_export_format_check
    CHECK (export_format IN ('9x16', '1x1', '16x9', '4x5', 'story_sequence'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_exports_asset_format
  ON marketing_media_exports (media_asset_id, export_format);
