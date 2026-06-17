-- ============================================================================
-- 095_control_tower.sql
-- HUB TOWER (Control Tower) — Phase 0 foundation.
--
-- Adds the executive intelligence layer's OWN two tables and a dedicated,
-- hard read-only database role. Touches NO existing business data.
--
--   ct_findings      — every observation the Control Tower makes
--   ct_action_queue  — recommended actions awaiting HUMAN approval
--
-- Safety model (two layers — see CONTROL_TOWER_DATA_LAYER_PROPOSAL.md §6):
--   1. Application guard  — server/lib/controlTower/ctData.mjs whitelists writes
--      to exactly these two tables.
--   2. Database role      — `control_tower_ro` (THIS migration) is granted:
--        * SELECT on all current + future public tables
--        * INSERT, UPDATE on ct_findings + ct_action_queue ONLY
--        * NO DELETE / TRUNCATE anywhere
--        * NO INSERT/UPDATE on any existing business table
--      The Control Tower API connects AS this role (via a role-claim JWT through
--      PostgREST), so the database physically rejects any business-table write.
--
-- Idempotent: safe to re-run.
-- Migrations 095 is the next free number after 094 (procurement p2/p3).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Dedicated read-only role
-- ─────────────────────────────────────────────────────────────────────────────
-- NOLOGIN: the role is never logged into directly. PostgREST assumes it via
-- SET ROLE when a request presents a JWT whose `role` claim = 'control_tower_ro'.
-- That JWT is signed with the project JWT secret and stored ONLY in a server
-- env var (SUPABASE_CT_JWT) — never in frontend code, never committed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'control_tower_ro') THEN
    CREATE ROLE control_tower_ro NOLOGIN;
  END IF;
END $$;

-- Allow PostgREST's entry role to switch into the Control Tower role.
GRANT control_tower_ro TO authenticator;

-- Schema usage (required before any table privilege has effect).
GRANT USAGE ON SCHEMA public TO control_tower_ro;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ct_findings — the Control Tower's observation log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ct_findings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Classification
  domain                text NOT NULL,        -- procurement|schedule|financial|compliance|client|safety|system|...
  module                text,                 -- affected module: operations|finance|procurement|whs|sales|marketing|crm|system
  severity              text NOT NULL DEFAULT 'info'
                          CHECK (severity IN ('info','watch','warning','critical')),

  -- Affected entity (nullable — some findings are portfolio/system-wide)
  job_id                uuid REFERENCES public.jobs(id)     ON DELETE SET NULL,
  project_id            uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  -- The six required analytical fields
  title                 text NOT NULL,
  symptom               text,                 -- what is observably wrong
  root_cause            text,                 -- the underlying why
  recommended_fix       text,                 -- what should be done
  approval_requirement  text NOT NULL DEFAULT 'none'
                          CHECK (approval_requirement IN ('none','supervisor_approval','director_approval')),
  confidence            numeric(4,3)          -- 0.000–1.000
                          CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

  -- Supporting context
  evidence              jsonb NOT NULL DEFAULT '{}'::jsonb,  -- the source numbers/rows behind the finding
  score_impact          integer,                              -- points deducted from a health score, if any

  -- Lifecycle
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','acknowledged','resolved','expired')),
  data_hash             text,                 -- dedup key (don't re-log an identical open finding)
  expires_at            timestamptz,
  detected_by           text NOT NULL DEFAULT 'control_tower'
);

CREATE INDEX IF NOT EXISTS idx_ct_findings_status   ON public.ct_findings (status);
CREATE INDEX IF NOT EXISTS idx_ct_findings_severity ON public.ct_findings (severity);
CREATE INDEX IF NOT EXISTS idx_ct_findings_domain   ON public.ct_findings (domain);
CREATE INDEX IF NOT EXISTS idx_ct_findings_job      ON public.ct_findings (job_id);
CREATE INDEX IF NOT EXISTS idx_ct_findings_created  ON public.ct_findings (created_at DESC);
-- Dedup: only one OPEN finding per data_hash.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ct_findings_open_hash
  ON public.ct_findings (data_hash)
  WHERE status = 'open' AND data_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ct_action_queue — recommended actions awaiting human decision
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ct_action_queue (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  finding_id            uuid REFERENCES public.ct_findings(id) ON DELETE CASCADE,
  job_id                uuid REFERENCES public.jobs(id)     ON DELETE SET NULL,
  project_id            uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  module                text,

  -- The recommendation (the Control Tower NEVER executes this itself)
  recommended_action    text NOT NULL,
  action_type           text,                 -- issue_po|chase_rfq|approve_invoice|raise_eot|send_reminder|...
  target_endpoint       text,                 -- the Hub route a HUMAN could use — INFORMATIONAL ONLY
  payload_preview       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Prioritisation (charter §SYSTEM IMPROVEMENT MODE)
  impact                text,                 -- low|medium|high
  effort                text,                 -- low|medium|high
  risk_reduction        text,                 -- low|medium|high

  approval_requirement  text NOT NULL DEFAULT 'director_approval'
                          CHECK (approval_requirement IN ('none','supervisor_approval','director_approval')),

  -- Human decision trail
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','done','expired')),
  decided_by            uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  decided_at            timestamptz,
  decision_note         text,
  created_by            text NOT NULL DEFAULT 'control_tower'
);

CREATE INDEX IF NOT EXISTS idx_ct_action_status  ON public.ct_action_queue (status);
CREATE INDEX IF NOT EXISTS idx_ct_action_finding ON public.ct_action_queue (finding_id);
CREATE INDEX IF NOT EXISTS idx_ct_action_job     ON public.ct_action_queue (job_id);
CREATE INDEX IF NOT EXISTS idx_ct_action_created ON public.ct_action_queue (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS on the two Control Tower tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ct_findings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_action_queue ENABLE ROW LEVEL SECURITY;

-- Authenticated app users (admins, via the API) may READ findings/actions.
DROP POLICY IF EXISTS ct_findings_auth_read     ON public.ct_findings;
DROP POLICY IF EXISTS ct_action_auth_read       ON public.ct_action_queue;
CREATE POLICY ct_findings_auth_read ON public.ct_findings
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY ct_action_auth_read   ON public.ct_action_queue
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- A human acting via the admin API (service_role bypasses RLS) records the
-- approve/reject decision on an action — that UPDATE path is governed by the
-- API layer (requireRole 'admin'), not by control_tower_ro.
DROP POLICY IF EXISTS ct_action_auth_decide ON public.ct_action_queue;
CREATE POLICY ct_action_auth_decide ON public.ct_action_queue
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- The Control Tower role: read + insert + update on its own tables. NO DELETE.
DROP POLICY IF EXISTS ct_findings_ro_read   ON public.ct_findings;
DROP POLICY IF EXISTS ct_findings_ro_insert ON public.ct_findings;
DROP POLICY IF EXISTS ct_findings_ro_update ON public.ct_findings;
CREATE POLICY ct_findings_ro_read   ON public.ct_findings FOR SELECT TO control_tower_ro USING (true);
CREATE POLICY ct_findings_ro_insert ON public.ct_findings FOR INSERT TO control_tower_ro WITH CHECK (true);
CREATE POLICY ct_findings_ro_update ON public.ct_findings FOR UPDATE TO control_tower_ro USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ct_action_ro_read   ON public.ct_action_queue;
DROP POLICY IF EXISTS ct_action_ro_insert ON public.ct_action_queue;
DROP POLICY IF EXISTS ct_action_ro_update ON public.ct_action_queue;
CREATE POLICY ct_action_ro_read   ON public.ct_action_queue FOR SELECT TO control_tower_ro USING (true);
CREATE POLICY ct_action_ro_insert ON public.ct_action_queue FOR INSERT TO control_tower_ro WITH CHECK (true);
CREATE POLICY ct_action_ro_update ON public.ct_action_queue FOR UPDATE TO control_tower_ro USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Read-only RLS policy for control_tower_ro on EVERY existing public table
--    (business tables' existing policies target `authenticated`/`anon`, so the
--    Control Tower role needs its own permissive SELECT policy to see rows).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('ct_findings','ct_action_queue')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS ct_ro_select ON public.%I;', r.tablename);
    EXECUTE format(
      'CREATE POLICY ct_ro_select ON public.%I FOR SELECT TO control_tower_ro USING (true);',
      r.tablename
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Table-level GRANTs (the hard command-level guarantee)
-- ─────────────────────────────────────────────────────────────────────────────
-- Belt & braces: strip any write the role might have inherited from PUBLIC, then
-- grant exactly what is allowed.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM control_tower_ro;

-- SELECT on everything (current).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO control_tower_ro;
-- SELECT on everything (future tables created later).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO control_tower_ro;

-- The ONLY write privileges the Control Tower role gets — and never DELETE.
GRANT INSERT, UPDATE ON public.ct_findings     TO control_tower_ro;
GRANT INSERT, UPDATE ON public.ct_action_queue TO control_tower_ro;

-- App + infra roles for the two new tables.
GRANT SELECT ON public.ct_findings, public.ct_action_queue TO authenticated;
GRANT ALL    ON public.ct_findings, public.ct_action_queue TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Verification (run manually after applying)
-- ─────────────────────────────────────────────────────────────────────────────
-- a) Role must hold NO write on any business table:
--    SELECT table_name, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE grantee = 'control_tower_ro'
--      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
--      AND table_name NOT IN ('ct_findings','ct_action_queue');
--    Expected: 0 rows.
--
-- b) Role must hold NO DELETE anywhere:
--    SELECT table_name FROM information_schema.role_table_grants
--    WHERE grantee = 'control_tower_ro' AND privilege_type = 'DELETE';
--    Expected: 0 rows.
--
-- c) Role can read jobs:
--    SET ROLE control_tower_ro; SELECT count(*) FROM public.jobs; RESET ROLE;
