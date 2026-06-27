-- ════════════════════════════════════════════════════════════════════════════
-- Migration 120 — Drop dead column leads.ptsa_scope_notes (W03-DRIFT-001)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY: `ptsa_scope_notes` is a dead column — no server route or frontend reads or
-- writes it (verified: grep across server/ + src/ returns zero references). It was
-- superseded by the PTSA signed-document flow. Removing it keeps the leads schema
-- honest. Low risk: nothing depends on it.
--
-- ⚠ APPLY MANUALLY in the Supabase SQL editor (this repo's migrations are paste-applied).
-- IF EXISTS makes it idempotent and a no-op if the column was already removed.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.leads DROP COLUMN IF EXISTS ptsa_scope_notes;

-- VERIFICATION (run after applying):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'leads' AND column_name = 'ptsa_scope_notes';   -- expect 0 rows
--
-- ROLLBACK (only if some out-of-tree consumer still needs it):
--   ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ptsa_scope_notes text;
