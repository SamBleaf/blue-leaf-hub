-- 117_workforce_allocations.sql
-- W16-A1 — Workforce crews + daily allocations (planning layer only).
-- Does NOT touch timesheets or Buildxact sync. API-only access (RLS deny-all).

BEGIN;

-- ── workforce_crews ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce_crews (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_crews_active ON workforce_crews (is_active) WHERE is_active = true;

-- ── workforce_crew_members ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce_crew_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id     uuid        NOT NULL REFERENCES workforce_crews (id) ON DELETE CASCADE,
  employee_id uuid        NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crew_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_workforce_crew_members_crew ON workforce_crew_members (crew_id);
CREATE INDEX IF NOT EXISTS idx_workforce_crew_members_employee ON workforce_crew_members (employee_id);

-- ── workforce_allocations ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce_allocations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_date  date        NOT NULL,
  employee_id      uuid        NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  crew_id          uuid        REFERENCES workforce_crews (id) ON DELETE SET NULL,
  project_id       uuid        REFERENCES projects (id) ON DELETE SET NULL,
  carpentry_job_id uuid        REFERENCES carpentry_jobs (id) ON DELETE SET NULL,
  notes            text,
  created_by       uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, allocation_date),
  CONSTRAINT workforce_allocations_job_spine_xor CHECK (
    (project_id IS NOT NULL AND carpentry_job_id IS NULL)
    OR (project_id IS NULL AND carpentry_job_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_workforce_allocations_date ON workforce_allocations (allocation_date);
CREATE INDEX IF NOT EXISTS idx_workforce_allocations_employee ON workforce_allocations (employee_id);
CREATE INDEX IF NOT EXISTS idx_workforce_allocations_project ON workforce_allocations (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_allocations_carpentry ON workforce_allocations (carpentry_job_id) WHERE carpentry_job_id IS NOT NULL;

-- ── RLS lockdown (same pattern as migration 111) ────────────────────────────
-- All access via Express service-role; deny anon + authenticated direct access.

ALTER TABLE workforce_crews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_crew_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_allocations    ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
