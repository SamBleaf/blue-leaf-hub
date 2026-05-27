-- Migration 057 — AI Call Log
-- Tracks every Anthropic API call made by the server for cost visibility in Settings.
-- Fire-and-forget inserts only — never blocks a request.

CREATE TABLE IF NOT EXISTS ai_call_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at   timestamptz NOT NULL    DEFAULT now(),
  module      text        NOT NULL,   -- server file (e.g. 'financeRoutes', 'blueprintRoutes')
  model       text        NOT NULL,
  input_tokens  integer,
  output_tokens integer,
  cost_usd    numeric(12,8),
  is_streaming boolean     NOT NULL DEFAULT false
);

CREATE INDEX idx_ai_call_log_called_at ON ai_call_log(called_at DESC);
CREATE INDEX idx_ai_call_log_module    ON ai_call_log(module);

ALTER TABLE ai_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "director_only" ON ai_call_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );
-- Only server (service role) may insert
