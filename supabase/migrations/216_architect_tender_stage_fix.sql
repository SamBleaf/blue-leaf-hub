-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 216 | R04 P0-ARCH — move stranded Architect-Tender leads out of the retired 'accepted' stage
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- The Architect-Tender intake used to create leads at stage 'accepted' (retired by the 8-stage
-- restructure, mig 187), so each new architect tender landed on a dead board stage with no card and no
-- next action. The source create path now uses 'tender'; this corrects the leads the old path stranded.
--
-- SCOPED + SAFE: only leads whose lead_type is 'architect_tender' are moved — these are the ones the
-- broken intake created, with a known meaning (tender-led, concept/PTSA intentionally skipped). It does
-- NOT touch any other 'accepted' row (a pre-restructure design-build lead carries different meaning and
-- is left for mig 187's fold / manual review). Idempotent. Preserves lead_id, job_id and all records —
-- only the stage string changes. FORWARD migration (does not edit 187).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='lead_type') THEN
    UPDATE public.leads
       SET stage = 'tender', stage_entered_at = COALESCE(stage_entered_at, now())
     WHERE stage = 'accepted' AND lead_type = 'architect_tender';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '216: moved % stranded architect-tender lead(s) from accepted -> tender', n;
  ELSE
    RAISE NOTICE '216: leads.lead_type absent — nothing to correct (pre-architect-tender schema)';
  END IF;
END $$;

-- ── VERIFICATION ────────────────────────────────────────────────────────────────────────────────────
-- SELECT count(*) AS stranded_architect_tenders_remaining
--   FROM public.leads WHERE stage='accepted' AND lead_type='architect_tender';   -- expect 0
-- ── ROLLBACK: none (a stage-string correction; reverting would re-strand the leads). ─────────────────

NOTIFY pgrst, 'reload schema';
