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
-- =============================================================================
BEGIN;

CREATE TEMP TABLE _t209 ON COMMIT DROP AS
SELECT m.id, m.workspace_id, m.rules AS old_rules, m.from_preset_id, m.from_preset_revision
FROM public.takeoff_job_materials m
WHERE m.archived_at IS NULL
  AND coalesce(m.spec->>'family', 'flashing') = 'flashing'
  AND m.method_key IN ('flashing_runs', 'finished_piece_count')
  AND (NOT (m.rules ? 'incrementMm') OR (m.rules->>'incrementMm')::numeric = 100)
  AND NOT EXISTS (
    SELECT 1 FROM public.takeoff_order_lines l
    JOIN public.takeoff_placements p ON p.order_id = l.order_id AND p.status = 'placed'
    WHERE l.job_material_id = m.id);

UPDATE public.takeoff_job_materials m
SET rules = jsonb_set(m.rules, '{incrementMm}', '300'::jsonb, true), revision = m.revision + 1, updated_at = now()
FROM _t209 t WHERE m.id = t.id;

INSERT INTO public.takeoff_material_rule_history (job_material_id, material_revision, old_rules, new_rules, changed_by_type)
SELECT m.id, m.revision, t.old_rules, m.rules, 'staff'
FROM public.takeoff_job_materials m JOIN _t209 t ON t.id = m.id;

-- company standard flashings still on 100 mm: a new revision at 300 mm
CREATE TEMP TABLE _p209 ON COMMIT DROP AS
SELECT p.id AS preset_id, p.current_revision AS old_revision
FROM public.takeoff_material_presets p
JOIN public.takeoff_material_preset_revisions r ON r.preset_id = p.id AND r.revision = p.current_revision
WHERE coalesce(r.spec->>'family', 'flashing') = 'flashing'
  AND r.method_key IN ('flashing_runs', 'finished_piece_count')
  AND (NOT (r.rules ? 'incrementMm') OR (r.rules->>'incrementMm')::numeric = 100);

INSERT INTO public.takeoff_material_preset_revisions (preset_id, revision, name, method_key, method_version, spec, rules, profile, source_review, created_by_user_id)
SELECT r.preset_id, r.revision + 1, r.name, r.method_key, r.method_version, r.spec, jsonb_set(r.rules, '{incrementMm}', '300'::jsonb, true), r.profile, r.source_review, NULL
FROM public.takeoff_material_preset_revisions r JOIN _p209 x ON x.preset_id = r.preset_id AND r.revision = x.old_revision;

UPDATE public.takeoff_material_presets p SET current_revision = x.old_revision + 1, updated_at = now()
FROM _p209 x WHERE p.id = x.preset_id;

-- job copies changed above that were on the old standard revision now match the new one
UPDATE public.takeoff_job_materials m SET from_preset_revision = x.old_revision + 1
FROM _t209 t JOIN _p209 x ON x.preset_id = t.from_preset_id
WHERE m.id = t.id AND t.from_preset_revision = x.old_revision;

-- every takeoff that changed gets a new revision, so open devices reload instead of saving over it
UPDATE public.takeoff_workspaces w SET revision = w.revision + 1, updated_at = now()
WHERE w.id IN (SELECT DISTINCT workspace_id FROM _t209);

SELECT (SELECT count(*) FROM _t209) AS job_flashings_moved_to_300, (SELECT count(*) FROM _p209) AS company_standards_moved_to_300;

COMMIT;
