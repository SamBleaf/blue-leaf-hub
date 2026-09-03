-- 199_preconstruction_portal.sql — Consultants→Won redesign · CV-3b (the pre-construction portal)
-- Sam's design: the client is inducted into the portal EARLY — at PTSA-signed / during the
-- Consultants stage — so the client↔consultant comms (CV-3a) have a home while the design is still
-- being coordinated, well before the build. The portal is keyed to `projects`, and a live Ops project
-- is normally created only at Won (trigger 096). To let the portal exist pre-Won WITHOUT a half-sold
-- job masquerading as a live Operations project, we mark the early project `is_preconstruction = true`.
-- Operations/field lists hide those; the Won transition (finalizeWonJob) flips the flag to false so the
-- SAME row graduates into the live Ops project (trigger 096 already adopts an existing project for the
-- job — NOT EXISTS — so no duplicate is created). Additive + idempotent; existing rows default to false
-- and are unaffected. Apply manually in the Supabase SQL editor.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_preconstruction boolean NOT NULL DEFAULT false;

-- Partial index — the Ops board filters these out, so keep the "live" set cheap to scan.
CREATE INDEX IF NOT EXISTS projects_precon_idx ON public.projects (is_preconstruction) WHERE is_preconstruction = true;

NOTIFY pgrst, 'reload schema';
