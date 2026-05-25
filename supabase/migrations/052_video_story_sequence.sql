-- Migration 052 — Video narrative story sequence output
-- 051 is video_clip_scores — do not skip

ALTER TABLE marketing_media_exports
  ADD COLUMN IF NOT EXISTS story_sequence jsonb DEFAULT NULL;

-- story_sequence shape (set by generateStorySequence):
-- {
--   "objective":          "brand_awareness|generate_enquiries|educate|build_authority",
--   "template_used":      "<template key>",
--   "clips": [
--     {
--       "position":       "hook|build|proof|cta",
--       "frame_index":    <int>,
--       "timestamp_secs": <float>,
--       "storage_path":   "<path>",
--       "overall_score":  <int>,
--       "caption":        "<generated caption>",
--       "overlay_text":   "<short overlay>",
--       "duration_secs":  <int>
--     }
--   ],
--   "assumptions_detected": <bool>,
--   "confidence":          <0-100>,
--   "generated_at":        "<iso timestamp>"
-- }
