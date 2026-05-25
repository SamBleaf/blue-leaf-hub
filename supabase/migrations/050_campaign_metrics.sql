-- Migration 050 — Campaign slot publish metrics
-- 049 is campaign_intelligence — do not skip

ALTER TABLE campaign_schedule_slots
  ADD COLUMN IF NOT EXISTS published_metrics jsonb        DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS published_at      timestamptz,
  ADD COLUMN IF NOT EXISTS published_by      uuid         REFERENCES auth.users(id);
