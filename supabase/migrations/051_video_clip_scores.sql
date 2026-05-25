-- Migration 051 — Video clip scores (V2 redesign)
-- 050 is campaign slot publish metrics — do not skip
-- Drop and recreate if schema changed from previous draft.

DROP TABLE IF EXISTS video_clip_scores CASCADE;

CREATE TABLE IF NOT EXISTS video_clip_scores (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id          uuid NOT NULL REFERENCES marketing_media_assets(id) ON DELETE CASCADE,
  frame_index             integer NOT NULL,
  timestamp_secs          numeric(8,2),
  frame_storage_path      text,
  construction_stage      text,
  activity_description    text,
  composition_score       integer CHECK (composition_score       BETWEEN 1 AND 10),
  motion_score            integer CHECK (motion_score            BETWEEN 1 AND 10),
  narrative_value         integer CHECK (narrative_value         BETWEEN 1 AND 10),
  construction_importance integer CHECK (construction_importance BETWEEN 1 AND 10),
  visual_preference_score integer CHECK (visual_preference_score BETWEEN 1 AND 10),
  narrative_position      text CHECK (narrative_position IN
    ('establishing','progress','detail','activity','reveal','avoid','none')),
  confidence_pct          numeric(5,2),
  is_selected             boolean DEFAULT false,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE video_clip_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'video_clip_scores' AND policyname = 'auth_users'
  ) THEN
    CREATE POLICY "auth_users" ON video_clip_scores
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clip_scores_asset ON video_clip_scores(media_asset_id);
