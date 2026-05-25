-- Migration 054 — Allow nullable storage_path on marketing_media_assets
-- 053 is video_analysis_status — do not skip
--
-- Server-streamed video uploads (large drone files) bypass Supabase storage
-- entirely: the raw video is processed on the server and only extracted frames
-- are stored. The asset row therefore has no storage_path of its own.
-- Thumbnail path is stored separately in thumbnail_path.

ALTER TABLE marketing_media_assets
  ALTER COLUMN storage_path DROP NOT NULL;
