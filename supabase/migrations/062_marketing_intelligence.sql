-- ============================================================
-- Migration 062 — Marketing Intelligence
-- Tables: social_post_publishes, social_post_snapshots,
--         search_console_snapshots, keyword_targets,
--         ga4_snapshots, gbp_snapshots, attribution_events,
--         enquiry_attribution, website_pages, seo_content_briefs,
--         content_clusters, website_questions
-- ALTERs: leads (first/last touch), marketing_content_items (publish + perf)
-- ============================================================

-- ─── 1. Social post publish tracking ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_post_publishes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id  uuid NOT NULL REFERENCES marketing_content_items(id) ON DELETE CASCADE,
  campaign_id      uuid REFERENCES marketing_campaigns(id),
  platform         text NOT NULL CHECK (platform IN ('instagram','facebook','linkedin')),
  platform_post_id text,
  published_at     timestamptz NOT NULL DEFAULT now(),
  published_by     uuid REFERENCES auth.users(id),
  caption_used     text,
  media_asset_id   uuid REFERENCES marketing_media_assets(id),
  created_at       timestamptz DEFAULT now()
);

-- ─── 2. Social performance snapshots ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_post_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_id            uuid NOT NULL REFERENCES social_post_publishes(id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL DEFAULT CURRENT_DATE,
  platform              text NOT NULL,
  reach                 integer,
  impressions           integer,
  likes                 integer,
  comments              integer,
  shares                integer,
  saves                 integer,
  link_clicks           integer,
  profile_visits        integer,
  engagement_rate       numeric(6,4),
  video_views           integer,
  video_avg_watch_pct   numeric(5,2),
  raw_data              jsonb DEFAULT '{}',
  created_at            timestamptz DEFAULT now(),
  UNIQUE(publish_id, snapshot_date)
);

-- ─── 3. Google Search Console snapshots ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_console_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  page_url      text NOT NULL,
  query         text,
  impressions   integer,
  clicks        integer,
  ctr           numeric(6,4),
  avg_position  numeric(6,2),
  country       text DEFAULT 'aus',
  device        text DEFAULT 'all' CHECK (device IN ('all','desktop','mobile','tablet')),
  created_at    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_unique
  ON search_console_snapshots(snapshot_date, page_url, COALESCE(query,'__page__'), device);

CREATE INDEX IF NOT EXISTS idx_gsc_page  ON search_console_snapshots(page_url);
CREATE INDEX IF NOT EXISTS idx_gsc_date  ON search_console_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_gsc_query ON search_console_snapshots(query) WHERE query IS NOT NULL;

-- ─── 4. Content clusters (created before keyword_targets to allow FK) ─────────
CREATE TABLE IF NOT EXISTS content_clusters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  hub_page_url text,
  description  text,
  keywords     text[],
  page_count   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- ─── 5. Keyword targets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keyword_targets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword             text NOT NULL UNIQUE,
  intent              text CHECK (intent IN ('commercial','informational','navigational')),
  target_page_url     text,
  target_position     integer DEFAULT 5,
  current_position    numeric(6,2),
  position_trend      text CHECK (position_trend IN ('up','down','stable','new')),
  monthly_impressions integer,
  cluster_id          uuid REFERENCES content_clusters(id) ON DELETE SET NULL,
  priority            text DEFAULT 'medium' CHECK (priority IN ('high','medium','low','watch')),
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ─── 6. GA4 snapshots ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ga4_snapshots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date           date NOT NULL,
  page_url                text,
  source                  text,
  medium                  text,
  campaign                text,
  sessions                integer,
  engaged_sessions        integer,
  engagement_rate         numeric(6,4),
  avg_engagement_seconds  integer,
  conversions             integer,
  new_users               integer,
  created_at              timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ga4_unique
  ON ga4_snapshots(snapshot_date, COALESCE(page_url,'__site__'), COALESCE(source,'unknown'), COALESCE(medium,'unknown'));

-- ─── 7. Google Business Profile snapshots ────────────────────────────────────
CREATE TABLE IF NOT EXISTS gbp_snapshots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date           date NOT NULL UNIQUE,
  search_impressions      integer,
  map_impressions         integer,
  website_clicks          integer,
  phone_calls             integer,
  direction_requests      integer,
  photo_views             integer,
  review_count            integer,
  average_rating          numeric(3,2),
  new_reviews_this_period integer,
  created_at              timestamptz DEFAULT now()
);

-- ─── 8. Attribution events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attribution_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       text,
  visitor_id       text,
  event_type       text NOT NULL CHECK (event_type IN
    ('page_view','content_view','video_play','enquiry_start','enquiry_submit','call_click','email_click')),
  page_url         text,
  referrer_url     text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_content      text,
  utm_term         text,
  content_item_id  uuid REFERENCES marketing_content_items(id) ON DELETE SET NULL,
  lead_id          uuid REFERENCES leads(id) ON DELETE SET NULL,
  device_type      text CHECK (device_type IN ('desktop','mobile','tablet')),
  event_at         timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribution_session ON attribution_events(session_id);
CREATE INDEX IF NOT EXISTS idx_attribution_lead    ON attribution_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attribution_content ON attribution_events(content_item_id) WHERE content_item_id IS NOT NULL;

-- ─── 9. Enquiry attribution summary ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enquiry_attribution (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                      uuid NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  first_touch_source           text,
  first_touch_medium           text,
  first_touch_page             text,
  first_touch_content_item_id  uuid REFERENCES marketing_content_items(id) ON DELETE SET NULL,
  first_touch_at               timestamptz,
  last_touch_source            text,
  last_touch_medium            text,
  last_touch_page              text,
  last_touch_content_item_id   uuid REFERENCES marketing_content_items(id) ON DELETE SET NULL,
  last_touch_at                timestamptz,
  total_sessions               integer,
  total_page_views             integer,
  assisted_content_item_ids    uuid[],
  days_from_first_touch        integer,
  created_at                   timestamptz DEFAULT now()
);

-- ─── 10. Website pages inventory ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_pages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url_path                text NOT NULL UNIQUE,
  title                   text,
  meta_description        text,
  h1                      text,
  page_type               text CHECK (page_type IN
    ('homepage','service','suburb','case_study','client_guide','faq','journal','about','process')),
  primary_keyword         text,
  cluster                 text,
  target_word_count       integer,
  status                  text DEFAULT 'planned' CHECK (status IN ('planned','live','needs_update','archived')),
  last_published_at       date,
  last_updated_at         date,
  current_impressions     integer,
  current_clicks          integer,
  current_ctr             numeric(6,4),
  current_avg_position    numeric(6,2),
  needs_refresh           boolean DEFAULT false,
  content_item_id         uuid REFERENCES marketing_content_items(id) ON DELETE SET NULL,
  seo_brief_generated_at  timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- ─── 11. SEO content briefs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seo_content_briefs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_page_id           uuid NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  keyword                   text NOT NULL,
  intent                    text,
  recommended_title         text,
  recommended_meta_description text,
  recommended_h1            text,
  recommended_h2s           text[],
  word_count_target         integer,
  key_questions_to_answer   text[],
  internal_link_suggestions text[],
  competing_pages           jsonb,
  content_angles            text[],
  schema_markup_type        text,
  model_used                text,
  generated_at              timestamptz DEFAULT now(),
  expires_at                timestamptz,
  approved_by               uuid REFERENCES auth.users(id),
  approved_at               timestamptz
);

-- ─── 12. Website questions (Question Engine) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS website_questions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text         text NOT NULL,
  source_type           text CHECK (source_type IN
    ('lead_conversation','lead_note','site_diary','crm_interaction','manual')),
  source_id             uuid,
  seo_potential         text CHECK (seo_potential IN ('high','medium','low','none')),
  monthly_search_estimate integer,
  suggested_content_type text CHECK (suggested_content_type IN
    ('faq_page','client_guide','instagram_post','journal_article','website_page')),
  suggested_keyword     text,
  content_item_id       uuid REFERENCES marketing_content_items(id) ON DELETE SET NULL,
  website_page_id       uuid REFERENCES website_pages(id) ON DELETE SET NULL,
  status                text DEFAULT 'queued' CHECK (status IN ('queued','in_progress','published','dismissed')),
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_questions_status ON website_questions(status);

-- ─── Alters: leads ────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS first_touch_source        text,
  ADD COLUMN IF NOT EXISTS first_touch_medium        text,
  ADD COLUMN IF NOT EXISTS first_touch_utm_campaign  text,
  ADD COLUMN IF NOT EXISTS last_touch_source         text,
  ADD COLUMN IF NOT EXISTS last_touch_medium         text,
  ADD COLUMN IF NOT EXISTS utm_campaign              text;

-- ─── Alters: marketing_content_items ─────────────────────────────────────────
ALTER TABLE marketing_content_items
  ADD COLUMN IF NOT EXISTS published_url           text,
  ADD COLUMN IF NOT EXISTS published_at            timestamptz,
  ADD COLUMN IF NOT EXISTS seo_score               integer,
  ADD COLUMN IF NOT EXISTS total_reach             integer,
  ADD COLUMN IF NOT EXISTS total_engagements       integer,
  ADD COLUMN IF NOT EXISTS total_link_clicks       integer,
  ADD COLUMN IF NOT EXISTS attributed_enquiries    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_lead_value   numeric(12,2) DEFAULT 0;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE social_post_publishes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_console_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_targets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga4_snapshots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbp_snapshots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribution_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiry_attribution      ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_pages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_content_briefs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_clusters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_questions        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON social_post_publishes    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON social_post_snapshots    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON search_console_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON keyword_targets          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON ga4_snapshots            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON gbp_snapshots            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON attribution_events       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON enquiry_attribution      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON website_pages            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON seo_content_briefs       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON content_clusters         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON website_questions        FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public: attribution events from website (no auth — website visitors)
CREATE POLICY "public_insert_attribution" ON attribution_events
  FOR INSERT TO anon WITH CHECK (true);
