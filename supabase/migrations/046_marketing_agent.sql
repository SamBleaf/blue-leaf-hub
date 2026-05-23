-- Migration 046: Marketing Agent — Stage 1 + Stage 2 tables
-- Stage 1: content generation + campaigns
-- Stage 2: media assets, video exports, music library

-- ── Stage 1 ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  objective   text,
  channels    text[]    DEFAULT '{}',
  start_at    date,
  end_at      date,
  status      text      DEFAULT 'active'
    CHECK (status IN ('active','paused','complete','archived')),
  tags        text[]    DEFAULT '{}',
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_content_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel          text NOT NULL
    CHECK (channel IN ('website','instagram','facebook','email','client_guide','landing_page','other')),
  pillar           text
    CHECK (pillar IN ('how_we_build','what_to_expect','the_work','community_craft')),
  campaign_id      uuid REFERENCES marketing_campaigns(id),
  project_id       uuid REFERENCES projects(id),
  job_id           uuid REFERENCES jobs(id),
  lead_id          uuid REFERENCES leads(id),
  media_source_id  uuid,  -- FK to marketing_media_assets added after Stage 2 table exists
  topic            text NOT NULL,
  client_stage     text
    CHECK (client_stage IN (
      'awareness','consideration','enquiry',
      'nurture','pre_construction','on_site','post_handover')),
  title            text,
  body             text,
  cta              text,
  hashtags         text[],
  structured_body  jsonb DEFAULT '{}',
  status           text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','published','archived')),
  review_scores    jsonb DEFAULT '{}',
  publish_date     date,
  reviewed_by      uuid REFERENCES auth.users(id),
  approved_at      timestamptz,
  tags             text[] DEFAULT '{}',
  performance_notes text,
  version          integer DEFAULT 1,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE marketing_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON marketing_campaigns
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "auth_users" ON marketing_content_items
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_mkt_content_channel   ON marketing_content_items(channel);
CREATE INDEX IF NOT EXISTS idx_mkt_content_status    ON marketing_content_items(status);
CREATE INDEX IF NOT EXISTS idx_mkt_content_campaign  ON marketing_content_items(campaign_id);

-- ── Stage 2 ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketing_music_library (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  artist           text,
  source           text DEFAULT 'youtube_audio_library',
  storage_path     text NOT NULL,
  duration_seconds numeric,
  mood             text
    CHECK (mood IN ('calm_educational','confident_progress','warm_handover')),
  bpm              integer,
  is_active        boolean DEFAULT true,
  added_by         uuid REFERENCES auth.users(id),
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_media_assets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path           text NOT NULL,
  storage_bucket         text DEFAULT 'marketing-media',
  mime_type              text NOT NULL,
  media_type             text NOT NULL
    CHECK (media_type IN ('photo','video','drone_video','timelapse','testimonial_video','transcript','notes')),
  original_filename      text,
  file_size_bytes        bigint,
  duration_seconds       numeric,
  project_id             uuid REFERENCES projects(id),
  job_id                 uuid REFERENCES jobs(id),
  capture_date           date,
  is_dji_dlog_m          boolean DEFAULT false,
  stage_detected         text,
  analysis               jsonb DEFAULT '{}',
  thumbnail_path         text,
  consent_for_marketing  boolean DEFAULT false,
  created_by             uuid REFERENCES auth.users(id),
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_media_exports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id    uuid NOT NULL REFERENCES marketing_media_assets(id),
  content_item_id   uuid REFERENCES marketing_content_items(id),
  export_format     text NOT NULL
    CHECK (export_format IN ('9x16','1x1','16x9','4x5')),
  storage_path      text,
  status            text DEFAULT 'processing'
    CHECK (status IN ('processing','ready','failed')),
  pipeline_log      jsonb DEFAULT '[]',
  music_track_id    uuid REFERENCES marketing_music_library(id),
  music_volume      numeric DEFAULT 0.6,
  colour_preset     text DEFAULT 'brand'
    CHECK (colour_preset IN ('brand','warm','natural')),
  captions_burned   boolean DEFAULT false,
  created_at        timestamptz DEFAULT now()
);

-- Add FK from marketing_content_items → marketing_media_assets now that the table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'marketing_content_items_media_source_id_fkey'
  ) THEN
    ALTER TABLE marketing_content_items
      ADD CONSTRAINT marketing_content_items_media_source_id_fkey
      FOREIGN KEY (media_source_id) REFERENCES marketing_media_assets(id) ON DELETE SET NULL;
  END IF;
END$$;

ALTER TABLE marketing_music_library     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_media_assets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_media_exports     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON marketing_music_library
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_users" ON marketing_media_assets
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_users" ON marketing_media_exports
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_mkt_media_assets_project  ON marketing_media_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_mkt_media_assets_type     ON marketing_media_assets(media_type);
CREATE INDEX IF NOT EXISTS idx_mkt_media_exports_asset   ON marketing_media_exports(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_mkt_media_exports_status  ON marketing_media_exports(status);
CREATE INDEX IF NOT EXISTS idx_mkt_music_mood            ON marketing_music_library(mood);
