-- Migration 055 — Project insights: hash dedup + NPS
-- 054 is media_storage_path_nullable — do not skip

-- Extend cost_intelligence_insights with dedup hash + trigger context
ALTER TABLE cost_intelligence_insights
  ADD COLUMN IF NOT EXISTS data_hash     text,
  ADD COLUMN IF NOT EXISTS trigger_type  text,
  ADD COLUMN IF NOT EXISTS threshold_met text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_insights_hash
  ON cost_intelligence_insights(job_id, data_hash)
  WHERE data_hash IS NOT NULL;

-- NPS survey scores per job
CREATE TABLE IF NOT EXISTS job_nps_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score        integer NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment      text,
  surveyed_by  text,
  recorded_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE job_nps_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'job_nps_scores'
    AND policyname = 'auth_users'
  ) THEN
    CREATE POLICY "auth_users" ON job_nps_scores
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_nps_job   ON job_nps_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_job_nps_score ON job_nps_scores(score);
