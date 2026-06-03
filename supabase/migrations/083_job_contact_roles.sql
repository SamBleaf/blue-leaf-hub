-- =============================================================================
-- 083_job_contact_roles.sql — Knowledge Core "Party spine": people ↔ jobs by role
-- See CLAUDE.md § Canonical Data Law (point 5: "people/orgs live on the Party
-- spine and link via roles") + MASTER_DATA_DICTIONARY.md (Party spine).
--
-- GOAL: structured tracking of which contacts (crm_contacts) play which role on
--       which job. The motivating case: a builder (Brad) refers jobs to Blue Leaf
--       AND stays on as a paid consultant on those same clients. We need to track,
--       SEPARATELY:
--         (a) value of works they brought in  (credits_referral=true → job contract value)
--         (b) what they cost us in consulting fees (fee_amount, EX-GST)
--
-- ⚠️⚠️⚠️ COST / MARGIN-SENSITIVE. fee_amount is a consulting cost we pay — it is
-- margin-sensitive and finance/admin-only. RLS below mirrors the other CRM tables
-- (authenticated USING(true)); the REAL gate is route-level requireRole("admin")
-- on every read+write endpoint (server/lib/crmRoutes.mjs). Non-admin users must
-- never see consulting fees.
--
-- PURELY ADDITIVE. New table only — no existing column dropped or renamed; no
-- existing rollup changes. Idempotent (CREATE TABLE/INDEX/POLICY IF NOT EXISTS +
-- guarded policy create) — safe to re-run.
-- fee_amount is stored EX-GST per CLAUDE.md § Amounts.
-- =============================================================================

-- ── 1. job_contact_roles ─────────────────────────────────────────────────────
-- job_id is NULLABLE: a role can be known at lead stage (before a job exists).
-- lead_id is NULLABLE + ON DELETE SET NULL: a deleted lead must not cascade-delete
-- a role that has since been linked to a real job.
CREATE TABLE IF NOT EXISTS public.job_contact_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,         -- nullable (role can be known at lead stage)
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,      -- nullable
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('referrer','consultant','architect','designer','agent','engineer','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','inactive')),
  start_date date,
  end_date date,
  fee_amount numeric(12,2),                 -- consulting fee we pay for this role, EX-GST (nullable)
  credits_referral boolean DEFAULT false,   -- when true, this role credits the job's contract value as "value brought in"
  fee_arrangement text,                     -- free text: "5% of contract / $1500 day rate / referral only"
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, contact_id, role)
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_job_contact_roles_contact ON public.job_contact_roles (contact_id);
CREATE INDEX IF NOT EXISTS idx_job_contact_roles_job     ON public.job_contact_roles (job_id);

-- ── 3. RLS (mirror the existing CRM tables — route-level requireRole does the
--          real finance/admin gating) ────────────────────────────────────────
ALTER TABLE public.job_contact_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_contact_roles'
      AND policyname = 'auth_users'
  ) THEN
    CREATE POLICY "auth_users" ON public.job_contact_roles
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify (run after applying):
--
-- SELECT count(*) AS job_contact_roles_rows FROM public.job_contact_roles;
-- -- Expect 0 on a fresh apply (table just created) — confirms the table exists.
--
-- -- Columns + check constraints present:
-- SELECT column_name, data_type, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_schema='public' AND table_name='job_contact_roles'
-- ORDER  BY ordinal_position;
--
-- -- Indexes present:
-- SELECT indexname FROM pg_indexes
-- WHERE  schemaname='public' AND tablename='job_contact_roles'
-- ORDER  BY indexname;
-- -- Expect idx_job_contact_roles_contact + idx_job_contact_roles_job.
--
-- -- RLS policy present:
-- SELECT policyname FROM pg_policies
-- WHERE  schemaname='public' AND tablename='job_contact_roles';
-- -- Expect 'auth_users'.
-- =============================================================================
