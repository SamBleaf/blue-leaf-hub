-- 193_consultants_stage.sql — Sales Pipeline Phase 4 (Consultants stage — new capability)
-- The Consultants stage coordinates the engineer / private certifier / lighting / sanitary etc.,
-- issues the provisional fittings & fixtures schedule to suppliers, and tracks the councils/certifier
-- approval risk. Adds:
--  • approval_risk — the visible chip (unknown | low | medium | high; default unknown)
--  • consultant_roster (jsonb) — [{ role, contact_id, brief_issued_at, returned_at, notes }]
--  • consultants_engineering_ready — exit gate: engineering complete enough for tender
--  • consultants_cert_pathway_confirmed — exit gate: certification pathway confirmed
--  • provisional_ff_issued — exit gate: provisional F&F schedule issued to suppliers
-- No CHECK on approval_risk (deploy-ahead — values in src/lib/constants.js). Additive + idempotent.
-- Apply manually in the Supabase SQL editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS approval_risk                       text    NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS consultant_roster                   jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS consultants_engineering_ready       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consultants_cert_pathway_confirmed  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisional_ff_issued               boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
