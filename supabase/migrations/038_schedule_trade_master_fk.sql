-- Migration 038: Link schedule_tasks to trade_master_library.
-- schedule_tasks.trade is currently free text (no referential integrity).
-- trade_master_id provides a typed FK while leaving free-text trade field for display.

ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS trade_master_id UUID REFERENCES trade_master_library(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_tasks_trade_master
  ON schedule_tasks (trade_master_id)
  WHERE trade_master_id IS NOT NULL;

-- Best-effort backfill: match on trade_id (snake_case text in schedule vs trade_id in library)
UPDATE schedule_tasks st
SET trade_master_id = tml.id
FROM trade_master_library tml
WHERE LOWER(REPLACE(st.trade, ' ', '_')) = LOWER(tml.trade_id)
  AND st.trade_master_id IS NULL
  AND st.trade IS NOT NULL;
