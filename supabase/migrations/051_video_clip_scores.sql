-- Migration 051 — Video clip scores
-- 050 is campaign slot publish metrics — do not skip

CREATE TABLE IF NOT EXISTS video_clip_scores (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id         uuid NOT NULL REFERENCES marketing_media_assets(id) ON DELETE CASCADE,
  frame_index            integer NOT NULL,
  storage_path           text NOT NULL,
  timestamp_secs         numeric(10,2),

  -- 8 scored dimensions (1–10)
  visual_quality         integer CHECK (visual_quality         BETWEEN 1 AND 10),
  motion_blur            integer CHECK (motion_blur            BETWEEN 1 AND 10),  -- 10 = sharp, 1 = very blurry
  construction_relevance integer CHECK (construction_relevance BETWEEN 1 AND 10),
  brand_alignment        integer CHECK (brand_alignment        BETWEEN 1 AND 10),
  educational_value      integer CHECK (educational_value      BETWEEN 1 AND 10),
  human_interest         integer CHECK (human_interest         BETWEEN 1 AND 10),
  technical_detail       integer CHECK (technical_detail       BETWEEN 1 AND 10),
  overall_score          integer CHECK (overall_score          BETWEEN 1 AND 10),

  -- Qualitative outputs
  primary_subject        text,
  content_opportunities  text[]    DEFAULT '{}',
  publish_ready          boolean   DEFAULT false,
  reject_reason          text,

  model_used             text,
  scored_at              timestamptz DEFAULT now(),

  UNIQUE(media_asset_id, frame_index)
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

CREATE INDEX IF NOT EXISTS idx_video_clip_scores_asset  ON video_clip_scores(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_video_clip_scores_ready  ON video_clip_scores(publish_ready);
CREATE INDEX IF NOT EXISTS idx_video_clip_scores_overall ON video_clip_scores(overall_score DESC);
