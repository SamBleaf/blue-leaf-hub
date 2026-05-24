-- Migration 049 — Campaign intelligence operational fields
-- 048 is Winning Offer system — do not skip

ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS goal              text
    CHECK (goal IN ('brand_awareness','generate_enquiries','educate','build_authority','seo')),
  ADD COLUMN IF NOT EXISTS audience          text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tone              text    DEFAULT 'professional'
    CHECK (tone IN ('professional','educational','premium','technical','friendly')),
  ADD COLUMN IF NOT EXISTS posting_schedule  jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_sources   text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS platform_settings jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_mix       jsonb   DEFAULT '{"educational":35,"showcase":25,"behind_scenes":15,"opinion":15,"authority":10}',
  ADD COLUMN IF NOT EXISTS ai_rules          jsonb   DEFAULT '{"never_invent_specs":true,"prioritise_performance":true,"hook_first":true}',
  ADD COLUMN IF NOT EXISTS approval_mode     text    DEFAULT 'manual_all'
    CHECK (approval_mode IN ('auto_low_risk','manual_high_risk','manual_all')),
  ADD COLUMN IF NOT EXISTS performance_data  jsonb   DEFAULT '{}';

-- Campaign posting calendar (one row per scheduled post slot)
CREATE TABLE IF NOT EXISTS campaign_schedule_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  slot_date       date NOT NULL,
  day_of_week     text NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  content_mode    text,
  channel         text,
  content_item_id uuid REFERENCES marketing_content_items(id) ON DELETE SET NULL,
  status          text DEFAULT 'empty' CHECK (status IN ('empty','assigned','published','skipped')),
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE campaign_schedule_slots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaign_schedule_slots' AND policyname = 'auth_users'
  ) THEN
    CREATE POLICY "auth_users" ON campaign_schedule_slots
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaign_slots_campaign ON campaign_schedule_slots(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_slots_date ON campaign_schedule_slots(slot_date);
