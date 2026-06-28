-- 122_marketing_command_centre_mvp.sql
-- Marketing Command Centre — Run A (Batch 1 + Batch 2) MVP spine.
--
-- AUTHORITY: Sam approved H1 (handoff) + H2 (this migration, file number 122) — 2026-06-28.
-- SCOPE: forward-compatible spine for Stage 1. Run A activates ONLY templates + weekly plans +
--        a handful of content/campaign columns. Packages, drone, paid, publish-jobs are EMPTY
--        STUBS (no UI until later runs). All changes are additive, idempotent, non-destructive.
--
-- RULES FOLLOWED:
--   * Every ALTER uses ADD COLUMN IF NOT EXISTS — no duplicate of existing 046/049/062 columns.
--   * Existing names reused (NOT duplicated): approval_mode (049), stage_detected/capture_date/
--     analysis/analysis_status (046/053). This migration does NOT add approval_policy, stage_tag,
--     captured_at, photo_analysis, or pipeline_status.
--   * CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, seed via ON CONFLICT DO NOTHING.
--   * RLS: authenticated policy (server uses service role and bypasses; API is admin-gated).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. NEW TABLES
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 Campaign templates (ACTIVE — seeded with 7 Blue Leaf templates)
CREATE TABLE IF NOT EXISTS marketing_campaign_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key         text NOT NULL UNIQUE,
  name                 text NOT NULL,
  description          text,
  goal                 text,                       -- maps to marketing_campaigns.goal when valid
  default_channels     text[] NOT NULL DEFAULT '{}',
  default_audience     text[] NOT NULL DEFAULT '{}',
  content_mix          jsonb NOT NULL DEFAULT '{}',
  ai_rules             jsonb NOT NULL DEFAULT '{}',
  approval_mode        text NOT NULL DEFAULT 'manual_all'
    CHECK (approval_mode IN ('auto_low_risk','manual_high_risk','manual_all')),
  weekly_target_posts  int  NOT NULL DEFAULT 3,
  sample_topics        text[] NOT NULL DEFAULT '{}',
  slot_skeleton        jsonb NOT NULL DEFAULT '{}', -- { "pattern": [{ day, channel, content_mode }] }
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- 1.2 Content packages (STUB — created now, no UI writes until Run C)
CREATE TABLE IF NOT EXISTS marketing_content_packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  package_date      date,
  topic             text,
  pillar            text,
  angle_payload     jsonb DEFAULT '{}',
  source_asset_ids  uuid[] DEFAULT '{}',
  carousel_order    int[]  DEFAULT '{}',
  audience          text[] DEFAULT '{}',
  recommended_platforms text[] DEFAULT '{}',
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','published','archived')),
  review_summary    jsonb DEFAULT '{}',
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 1.3 Weekly plans (ACTIVE — Weekly Planner record)
CREATE TABLE IF NOT EXISTS marketing_weekly_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start    date NOT NULL,
  campaign_id   uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  notes         text,
  target_count  int DEFAULT 3,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_weekly_plans_week ON marketing_weekly_plans(week_start, campaign_id);

-- 1.4 Drone shot plans (STUB — Stage 5; no UI in Run A–D)
CREATE TABLE IF NOT EXISTS drone_shot_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  job_id            uuid REFERENCES jobs(id) ON DELETE SET NULL,
  name              text,
  repeat_frequency  text,
  takeoff_point     jsonb,
  altitude_m        numeric,
  flight_pattern    text,
  orbit_type        text,
  key_angles        jsonb DEFAULT '{}',
  route_notes       text,
  safety_notes      text,
  privacy_notes     text,
  neighbour_exclusion jsonb DEFAULT '{}',
  linked_campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  waypoint_route    jsonb DEFAULT '{}',
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 1.5 Paid campaigns (STUB — Stage 4)
CREATE TABLE IF NOT EXISTS marketing_paid_campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organic_campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  audience_profile    jsonb DEFAULT '{}',
  campaign_goal       text,
  budget_cents        bigint,
  spend_cents         bigint,
  platform            text,
  status              text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','complete')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 1.6 Publish jobs (STUB — Stage 3 scheduled/automated publish queue)
CREATE TABLE IF NOT EXISTS marketing_publish_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id   uuid REFERENCES marketing_content_items(id) ON DELETE CASCADE,
  social_post_publish_id uuid REFERENCES social_post_publishes(id) ON DELETE SET NULL,
  platform          text,
  scheduled_at      timestamptz,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','published','failed','deleted')),
  failed_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. COLUMN ADDITIONS (additive, idempotent — NO duplicates of existing columns)
-- ───────────────────────────────────────────────────────────────────────────

-- 2.1 marketing_campaigns — link to template + weekly target (audience/content_mix/ai_rules/approval_mode already exist from 049)
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS template_key        text,
  ADD COLUMN IF NOT EXISTS weekly_target_posts int DEFAULT 3;

-- 2.2 marketing_content_items — package link + operational/governance spine (reviewed_by/approved_at/published_at already exist)
ALTER TABLE marketing_content_items
  ADD COLUMN IF NOT EXISTS package_id            uuid REFERENCES marketing_content_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operational_labels    text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risk_level            text,
  ADD COLUMN IF NOT EXISTS approval_required_from text,
  ADD COLUMN IF NOT EXISTS generation_metadata   jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scheduled_at          timestamptz,
  ADD COLUMN IF NOT EXISTS evergreen_score       numeric DEFAULT 0;

-- 2.3 marketing_media_assets — capture/drone/sequence spine (capture_date/stage_detected/analysis/analysis_status already exist)
ALTER TABLE marketing_media_assets
  ADD COLUMN IF NOT EXISTS capture_source     text,
  ADD COLUMN IF NOT EXISTS route_notes        text,
  ADD COLUMN IF NOT EXISTS takeoff_point      jsonb,
  ADD COLUMN IF NOT EXISTS altitude_m         numeric,
  ADD COLUMN IF NOT EXISTS flight_pattern     text,
  ADD COLUMN IF NOT EXISTS orbit_type         text,
  ADD COLUMN IF NOT EXISTS shot_type          text,
  ADD COLUMN IF NOT EXISTS safety_notes       text,
  ADD COLUMN IF NOT EXISTS privacy_notes      text,
  ADD COLUMN IF NOT EXISTS sequence_group_id  uuid,
  ADD COLUMN IF NOT EXISTS sequence_position  int,
  ADD COLUMN IF NOT EXISTS suggested_uses     jsonb,
  ADD COLUMN IF NOT EXISTS evergreen_score    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_id        uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL;

-- 2.4 social_post_publishes — publish-mode spine (manual in Stage 1; Stage 3 activates the rest)
ALTER TABLE social_post_publishes
  ADD COLUMN IF NOT EXISTS publish_mode    text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS publish_status  text DEFAULT 'logged',
  ADD COLUMN IF NOT EXISTS failed_reason   text,
  ADD COLUMN IF NOT EXISTS rollback_status text,
  ADD COLUMN IF NOT EXISTS scheduled_at    timestamptz,
  ADD COLUMN IF NOT EXISTS approval_status text;

CREATE INDEX IF NOT EXISTS idx_marketing_content_items_package ON marketing_content_items(package_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_template    ON marketing_campaigns(template_key);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. SEED — 7 Blue Leaf campaign templates (idempotent on template_key)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO marketing_campaign_templates
  (template_key, name, description, goal, default_channels, default_audience, content_mix, ai_rules, approval_mode, weekly_target_posts, sample_topics, slot_skeleton)
VALUES
  (
    'better_built_renovations', 'Better Built Renovations',
    'Educational + enquiry-generating content about high-end renovation quality and process.',
    'generate_enquiries', ARRAY['instagram','facebook','website'], ARRAY['homeowner','renovation_client'],
    '{"educational":40,"showcase":25,"behind_scenes":15,"opinion":10,"authority":10}'::jsonb,
    '{"never_invent_specs":true,"prioritise_performance":true,"hook_first":true}'::jsonb,
    'manual_all', 3,
    ARRAY['Why renovation budgets blow out','What to expect during pre-construction','How to choose a renovation builder','Old-home structural surprises (and how we plan for them)','Renovating for energy performance'],
    '{"pattern":[{"day":"Tue","channel":"instagram","content_mode":"educational"},{"day":"Thu","channel":"facebook","content_mode":"showcase"},{"day":"Sat","channel":"instagram","content_mode":"behind_scenes"}]}'::jsonb
  ),
  (
    'trust_the_process', 'Trust the Process',
    'Behind-the-scenes education that builds trust in the Blue Leaf build process.',
    'educate', ARRAY['instagram','facebook','email'], ARRAY['homeowner','renovation_client','custom_home_client'],
    '{"educational":45,"behind_scenes":30,"showcase":15,"authority":10}'::jsonb,
    '{"never_invent_specs":true,"prioritise_performance":true,"hook_first":true}'::jsonb,
    'manual_all', 3,
    ARRAY['What you cannot see after the walls close','Why sequencing matters before lock-up','The hidden cost of skipping detail','How we protect a home before cladding','Site meetings that keep a build on track'],
    '{"pattern":[{"day":"Mon","channel":"instagram","content_mode":"behind_scenes"},{"day":"Wed","channel":"facebook","content_mode":"educational"},{"day":"Fri","channel":"email","content_mode":"educational"}]}'::jsonb
  ),
  (
    'high_performance_homes', 'High Performance Homes',
    'Authority content on energy efficiency, airtightness and passive design.',
    'build_authority', ARRAY['instagram','website'], ARRAY['custom_home_client','passive_design','architect_designer'],
    '{"authority":40,"educational":35,"showcase":15,"opinion":10}'::jsonb,
    '{"never_invent_specs":true,"prioritise_performance":true,"hook_first":true}'::jsonb,
    'manual_all', 3,
    ARRAY['Why airtightness matters for comfort','What weather-tightness means in Adelaide','High-performance wall systems explained','Thermal bridging and how we avoid it','Designing for energy performance from day one'],
    '{"pattern":[{"day":"Tue","channel":"instagram","content_mode":"authority"},{"day":"Thu","channel":"website","content_mode":"educational"}]}'::jsonb
  ),
  (
    'craftsmanship_in_detail', 'Craftsmanship in Detail',
    'Showcase the workmanship — junctions, finishes and detail before the reveal.',
    'brand_awareness', ARRAY['instagram','facebook'], ARRAY['homeowner','renovation_client','architect_designer'],
    '{"showcase":50,"behind_scenes":25,"educational":15,"authority":10}'::jsonb,
    '{"never_invent_specs":true,"prioritise_performance":true,"hook_first":true}'::jsonb,
    'manual_all', 3,
    ARRAY['Detail matters: junctions before finishes','Why we obsess over the parts you never see','Carpentry detail at the fixing stage','Tiling and waterproofing done right','The difference good detailing makes'],
    '{"pattern":[{"day":"Wed","channel":"instagram","content_mode":"showcase"},{"day":"Sat","channel":"facebook","content_mode":"showcase"}]}'::jsonb
  ),
  (
    'project_transformation', 'Project Transformation',
    'Before / during / after transformation stories — strong enquiry driver.',
    'generate_enquiries', ARRAY['instagram','facebook','drone'], ARRAY['homeowner','renovation_client','local_general'],
    '{"showcase":45,"behind_scenes":20,"educational":20,"opinion":15}'::jsonb,
    '{"never_invent_specs":true,"prioritise_performance":true,"hook_first":true}'::jsonb,
    'manual_all', 3,
    ARRAY['Transformation: before scaffolding to lock-up','Monthly progress from above','This was the same room six months ago','The story of one renovation','From tired to high-performance home'],
    '{"pattern":[{"day":"Tue","channel":"instagram","content_mode":"showcase"},{"day":"Fri","channel":"facebook","content_mode":"showcase"}]}'::jsonb
  ),
  (
    'architect_partner', 'Architect Partner Content',
    'Authority content for architects and designers — LinkedIn copy-only in Stage 1 (no API publish).',
    'build_authority', ARRAY['instagram','linkedin','website'], ARRAY['architect_designer','custom_home_client'],
    '{"authority":45,"educational":30,"showcase":15,"opinion":10}'::jsonb,
    '{"never_invent_specs":true,"prioritise_performance":true,"hook_first":true}'::jsonb,
    'manual_all', 2,
    ARRAY['Architect note: sequencing around external membranes','Buildability: what we flag at design stage','Working with architects on high-performance detail','Documentation that prevents site surprises','Why early builder input protects the design intent'],
    '{"pattern":[{"day":"Mon","channel":"linkedin","content_mode":"authority"},{"day":"Thu","channel":"website","content_mode":"educational"}]}'::jsonb
  ),
  (
    'behind_the_build', 'Behind the Build',
    'Brand-awareness, people-and-site storytelling — the human side of the build.',
    'brand_awareness', ARRAY['instagram','facebook'], ARRAY['local_general','homeowner'],
    '{"behind_scenes":45,"showcase":25,"educational":20,"opinion":10}'::jsonb,
    '{"never_invent_specs":true,"prioritise_performance":true,"hook_first":true}'::jsonb,
    'manual_all', 3,
    ARRAY['A day on a Blue Leaf site','Meet the team behind the build','Why we document every stage','Site safety, the right way','The little wins that make a build'],
    '{"pattern":[{"day":"Wed","channel":"instagram","content_mode":"behind_scenes"},{"day":"Sat","channel":"facebook","content_mode":"behind_scenes"}]}'::jsonb
  )
ON CONFLICT (template_key) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RLS — authenticated policy on new tables (server uses service role; API is admin-gated)
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_campaign_templates',
    'marketing_content_packages',
    'marketing_weekly_plans',
    'drone_shot_plans',
    'marketing_paid_campaigns',
    'marketing_publish_jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
      t || '_authenticated', t
    );
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Reload PostgREST schema cache
-- ───────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
