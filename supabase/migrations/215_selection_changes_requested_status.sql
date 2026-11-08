-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 215 | Master Register R04 — add the 'changes_requested' client-selection status
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- FORWARD migration (additive, idempotent). It does NOT re-edit migration 103/213 — editing an applied
-- migration never changes a live database; this new file is what carries the change forward (and runs
-- after 103/212/213/214 on a fresh apply, producing the same end state).
--
-- WHY: R04 P0-SEL gives a client two DISTINCT responses to a staff-proposed selection:
--   • Accept        → the selection goes to 'in_review' (Blue Leaf then formally approves) — existing value.
--   • Request changes → the selection goes to 'changes_requested' — Blue Leaf must resolve the requested
--                       change before it can be approved. It must NEVER read as an accepted selection
--                       awaiting routine approval, so it needs its own status value (this migration).
--
-- PREREQUISITES: 103 (client_selections + its status CHECK). Safe after 212/213/214.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r record;
BEGIN
  -- Already widened? (idempotent)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_selections'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%changes_requested%'
  ) THEN
    RAISE NOTICE '215: client_selections status CHECK already includes changes_requested — nothing to do';
    RETURN;
  END IF;

  -- Drop the existing status CHECK (mig 103 created it as an inline column CHECK — auto-named).
  -- Match it by definition so we never depend on a hard-coded constraint name.
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.client_selections'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%awaiting_client%'
      AND pg_get_constraintdef(oid) ILIKE '%in_review%'
  LOOP
    EXECUTE format('ALTER TABLE public.client_selections DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.client_selections
    ADD CONSTRAINT client_selections_status_check
    CHECK (status IN (
      'not_started', 'awaiting_client', 'in_review', 'changes_requested',
      'approved', 'ordered', 'installed', 'overdue'
    ));
  RAISE NOTICE '215: client_selections status CHECK now includes changes_requested';
END $$;

-- ── VERIFICATION (every row should read true) ───────────────────────────────────────────────────────
-- SELECT
--   EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.client_selections'::regclass
--           AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%changes_requested%') AS has_changes_requested,
--   (SELECT count(*) FROM pg_constraint WHERE conrelid='public.client_selections'::regclass
--    AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%awaiting_client%') = 1            AS exactly_one_status_check;

-- ── ROLLBACK (restore the pre-R04 status set; only safe once no row is 'changes_requested') ──────────
-- ALTER TABLE public.client_selections DROP CONSTRAINT IF EXISTS client_selections_status_check;
-- ALTER TABLE public.client_selections ADD CONSTRAINT client_selections_status_check
--   CHECK (status IN ('not_started','awaiting_client','in_review','approved','ordered','installed','overdue'));

NOTIFY pgrst, 'reload schema';
