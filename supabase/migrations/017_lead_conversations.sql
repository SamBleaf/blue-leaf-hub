-- Migration 017: Lead conversations (meeting transcripts + Blueprint analysis)

CREATE TABLE IF NOT EXISTS lead_conversations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title          text,
  transcript_text text       NOT NULL,
  bp_suggestions  jsonb,     -- structured suggestions returned by Blueprint
  applied_suggestions jsonb, -- subset that was actually applied by user
  applied_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_conversations_lead_id_idx ON lead_conversations(lead_id);

-- Broad anon RLS (matches existing pattern)
ALTER TABLE lead_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_lead_conversations" ON lead_conversations
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_lead_conversations" ON lead_conversations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
