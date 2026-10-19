-- =============================================================================
-- 209 — Flashing order step 100 → 300 mm (Hub review HUB 005, 19 Oct 2026)
--
-- Blue Leaf now rounds flashing order lengths up to 300 mm steps, so a job orders a few standard lengths. New
-- flashings already get 300 from the app; this moves the EXISTING ones that are still on 100 mm.
--
-- DATA change (no schema change). OWNER-RUN, ONCE, when nobody is editing a takeoff (an open takeoff will show
-- "someone else saved first" and reload). Safe to re-run: it only touches flashings still on a 100 mm step.
--   * Skips any flashing that is on a PLACED order — changing its lengths would make placed pieces look un-ordered.
--   * Every change is recorded in takeoff_material_rule_history (old → new rules).
--   * Company standard flashings get a NEW revision at 300 mm (old revisions are immutable and kept); job copies
--     changed here are moved to that revision so they don't show a false "company standard updated" notice.
--   * Draft orders that already list those flashings will show their lines as "needs updating" — tap Update.
--     Placed orders and frozen PDFs are never changed.
-- Requires 206 (+ 207, 208).
--
-- ONE statement (data-modifying CTEs), so it is atomic on its own and needs no temp tables or BEGIN/COMMIT — the
-- Supabase SQL editor / pooler may not keep a temp table between statements (2026-10-20: the earlier temp-table
-- version applied once, then a second pass failed with "relation _t209 does not exist"; nothing was half-done).
-- A re-run finds nothing still on 100 mm and reports 0s.
-- =============================================================================
WITH target AS (          -- open flashings still on a 100 mm step, not on any placed order
  SELECT m.id, m.workspace_id, m.rules AS old_rules, m.from_preset_id, m.from_preset_revision
  FROM public.takeoff_job_materials m
  WHERE m.archived_at IS NULL
    AND coalesce(m.spec->>'family', 'flashing') = 'flashing'
    AND m.method_key IN ('flashing_runs', 'finished_piece_count')
    AND (NOT (m.rules ? 'incrementMm') OR (m.rules->>'incrementMm')::numeric = 100)
    AND NOT EXISTS (
      SELECT 1 FROM public.takeoff_order_lines l
      JOIN public.takeoff_placements p ON p.order_id = l.order_id AND p.status = 'placed'
      WHERE l.job_material_id = m.id)
), pcur AS (              -- company standard flashings whose CURRENT revision is on 100 mm
  SELECT p.id AS preset_id, p.current_revision AS old_revision, r.name, r.method_key, r.method_version, r.spec, r.rules, r.profile, r.source_review
  FROM public.takeoff_material_presets p
  JOIN public.takeoff_material_preset_revisions r ON r.preset_id = p.id AND r.revision = p.current_revision
  WHERE coalesce(r.spec->>'family', 'flashing') = 'flashing'
    AND r.method_key IN ('flashing_runs', 'finished_piece_count')
    AND (NOT (r.rules ? 'incrementMm') OR (r.rules->>'incrementMm')::numeric = 100)
), prev AS (              -- a NEW standard revision at 300 mm (old revisions are immutable and kept)
  INSERT INTO public.takeoff_material_preset_revisions (preset_id, revision, name, method_key, method_version, spec, rules, profile, source_review, created_by_user_id)
  SELECT preset_id, old_revision + 1, name, method_key, method_version, spec, jsonb_set(rules, '{incrementMm}', '300'::jsonb, true), profile, source_review, NULL
  FROM pcur
  RETURNING preset_id, revision
), pupd AS (
  UPDATE public.takeoff_material_presets p SET current_revision = x.revision, updated_at = now()
  FROM prev x WHERE p.id = x.preset_id
  RETURNING p.id
), mupd AS (              -- the job copies: 300 mm, next revision; a copy of a moved standard follows it
  UPDATE public.takeoff_job_materials m
  SET rules = jsonb_set(m.rules, '{incrementMm}', '300'::jsonb, true),
      revision = m.revision + 1,
      updated_at = now(),
      from_preset_revision = CASE WHEN pc.preset_id IS NOT NULL AND t.from_preset_revision = pc.old_revision THEN pc.old_revision + 1 ELSE m.from_preset_revision END
  FROM target t
  LEFT JOIN pcur pc ON pc.preset_id = t.from_preset_id
  WHERE m.id = t.id
  RETURNING m.id, m.revision, m.rules, m.workspace_id
), hist AS (              -- the audit trail: old → new rules, per material
  INSERT INTO public.takeoff_material_rule_history (job_material_id, material_revision, old_rules, new_rules, changed_by_type)
  SELECT u.id, u.revision, t.old_rules, u.rules, 'staff'
  FROM mupd u JOIN target t ON t.id = u.id
  RETURNING job_material_id
), wupd AS (              -- every takeoff that changed gets a new revision, so open devices reload instead of saving over it
  UPDATE public.takeoff_workspaces w SET revision = w.revision + 1, updated_at = now()
  WHERE w.id IN (SELECT DISTINCT workspace_id FROM mupd)
  RETURNING w.id
)
SELECT (SELECT count(*) FROM mupd) AS job_flashings_moved_to_300,
       (SELECT count(*) FROM pupd) AS company_standards_moved_to_300,
       (SELECT count(*) FROM hist) AS history_rows_written,
       (SELECT count(*) FROM wupd) AS takeoffs_given_a_new_revision;
