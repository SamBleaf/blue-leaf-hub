-- =============================================================================
-- Migration 153 — Multi-assign: site_tasks single assignee → task_assignments join
-- A site task can now hold MANY assignees. The legacy site_tasks.assigned_to is kept as a
-- mirror of the FIRST assignee (back-compat for the two embed aliases + a rollback path); the
-- server dual-writes both and dual-reads (task_assignments when present, else assigned_to).
-- Backfills every current single assignee. Additive + idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.task_assignments (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid          NOT NULL REFERENCES public.site_tasks (id) ON DELETE CASCADE,
  worker_id    uuid          NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  -- assigned_at is the ORDER key: setAssignees stamps a distinct ms per assignee (index offset),
  -- so reads return insertion order and row 0 stays the assigned_to mirror. No extra column needed.
  assigned_at  timestamptz   NOT NULL DEFAULT now(),
  assigned_by  uuid          REFERENCES public.employees (id) ON DELETE SET NULL,
  UNIQUE (task_id, worker_id)
);

CREATE INDEX IF NOT EXISTS task_assignments_task_idx   ON public.task_assignments (task_id);
CREATE INDEX IF NOT EXISTS task_assignments_worker_idx ON public.task_assignments (worker_id);

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_assignments' AND policyname = 'auth_users') THEN
    CREATE POLICY "auth_users" ON public.task_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Backfill existing single assignees (idempotent via the UNIQUE + ON CONFLICT).
INSERT INTO public.task_assignments (task_id, worker_id, assigned_at)
SELECT id, assigned_to, COALESCE(created_at, now())
  FROM public.site_tasks
 WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, worker_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
