-- =============================================================================
-- 207 — Takeoff: generic methods (timber, cladding, aluminium, continuous flashing runs)   [TC-R04]
--
-- ADDITIVE and idempotent. Requires 206. Existing flashing data, exports and placements are untouched:
--   * takeoff_measurements: new kinds (polyline, wall, opening, distribution, member, area, offcut) whose
--     inputs/points live in the existing `geometry` jsonb ({ v:2, points?, inputs?, parentId? }).
--     Constraints are widened, never loosened for the existing kinds (run/count/manual keep their rules).
--   * takeoff_contributions: roles beyond 'primary' (a wall feeds cladding/supports/accessories; a timber
--     material takes a 'distribution' and a 'member' measurement; an aluminium material takes 'opening's).
--   * takeoff_order_lines / takeoff_placement_allocations: a purchase UNIT (piece, bar, sheet, lm, box …)
--     and an `item` description; finished_length_mm becomes optional (sheets / boxes / LM have none).
--   * takeoff_save_order writes unit + item; takeoff_commit writes the contribution role.
-- Safe to re-run. ORDER: if 206 is ever re-run, re-run 207 afterwards (206 re-creates the older takeoff_save_order
-- and takeoff_commit).
-- Rollback = leave the columns (old code ignores them); never drop takeoff data.
-- =============================================================================

-- ── measurements: kinds + constraints ────────────────────────────────────────
ALTER TABLE public.takeoff_measurements DROP CONSTRAINT IF EXISTS takeoff_measurements_kind_check;
ALTER TABLE public.takeoff_measurements DROP CONSTRAINT IF EXISTS takeoff_meas_kind_207;
ALTER TABLE public.takeoff_measurements ADD CONSTRAINT takeoff_meas_kind_207
  CHECK (kind IN ('run','count','manual','polyline','wall','opening','distribution','member','area','offcut'));

-- plan-traced kinds need a page scale and a plan; walls/openings may be entered (no plan)
ALTER TABLE public.takeoff_measurements DROP CONSTRAINT IF EXISTS takeoff_meas_run_has_cal;
ALTER TABLE public.takeoff_measurements ADD CONSTRAINT takeoff_meas_run_has_cal
  CHECK (kind NOT IN ('run','polyline','distribution','member','area') OR (calibration_id IS NOT NULL AND document_id IS NOT NULL));
-- a traced wall/opening (geometry with points) must name its scale too
ALTER TABLE public.takeoff_measurements DROP CONSTRAINT IF EXISTS takeoff_meas_traced_has_cal;
ALTER TABLE public.takeoff_measurements ADD CONSTRAINT takeoff_meas_traced_has_cal
  CHECK (kind NOT IN ('wall','opening') OR geometry IS NULL OR NOT (geometry ? 'points') OR jsonb_array_length(geometry->'points') = 0
         OR (calibration_id IS NOT NULL AND document_id IS NOT NULL));
-- finished length only for the finished-length kinds (was: everything except 'run')
ALTER TABLE public.takeoff_measurements DROP CONSTRAINT IF EXISTS takeoff_meas_count_len;
ALTER TABLE public.takeoff_measurements ADD CONSTRAINT takeoff_meas_count_len
  CHECK (kind NOT IN ('count','manual') OR (finished_length_mm IS NOT NULL AND finished_length_mm > 0));
-- entered kinds carry their inputs in geometry
ALTER TABLE public.takeoff_measurements DROP CONSTRAINT IF EXISTS takeoff_meas_entered_inputs;
ALTER TABLE public.takeoff_measurements ADD CONSTRAINT takeoff_meas_entered_inputs
  CHECK (kind NOT IN ('wall','opening','offcut') OR geometry IS NOT NULL);

-- ── contributions: roles ─────────────────────────────────────────────────────
ALTER TABLE public.takeoff_contributions DROP CONSTRAINT IF EXISTS takeoff_contributions_role_check;
ALTER TABLE public.takeoff_contributions DROP CONSTRAINT IF EXISTS takeoff_contrib_role_207;
ALTER TABLE public.takeoff_contributions ADD CONSTRAINT takeoff_contrib_role_207
  CHECK (role IN ('primary','distribution','member','wall','opening','path','surface','offcut'));

-- ── order lines + allocations: purchase unit and item ────────────────────────
ALTER TABLE public.takeoff_order_lines ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'piece';
ALTER TABLE public.takeoff_order_lines ADD COLUMN IF NOT EXISTS item jsonb;
ALTER TABLE public.takeoff_order_lines ALTER COLUMN finished_length_mm DROP NOT NULL;
ALTER TABLE public.takeoff_order_lines DROP CONSTRAINT IF EXISTS takeoff_order_lines_unit_check;
ALTER TABLE public.takeoff_order_lines ADD CONSTRAINT takeoff_order_lines_unit_check
  CHECK (unit IN ('piece','lm','m2','sheet','bar','box','bag','roll','pack','cartridge','ml'));
-- a BAR is always a stock length; a "piece" may be a counted item with no length (screws, clips, a set) — flashing
-- pieces always carry their finished length from the schedule
ALTER TABLE public.takeoff_order_lines DROP CONSTRAINT IF EXISTS takeoff_order_lines_len_for_pieces;
ALTER TABLE public.takeoff_order_lines ADD CONSTRAINT takeoff_order_lines_len_for_pieces
  CHECK (unit <> 'bar' OR finished_length_mm IS NOT NULL);

ALTER TABLE public.takeoff_placement_allocations ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'piece';
ALTER TABLE public.takeoff_placement_allocations ALTER COLUMN finished_length_mm DROP NOT NULL;

-- ── save order: unit + item ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.takeoff_save_order(p_order_id uuid, p_expected_revision integer, p_fields jsonb, p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o public.takeoff_orders; item jsonb; v_rev integer; n integer;
BEGIN
  SELECT * INTO o FROM public.takeoff_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_NOT_FOUND: order' USING ERRCODE='P0001'; END IF;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'TAKEOFF_INVALID: a placed or cancelled order cannot be edited — create an additional order' USING ERRCODE='P0001'; END IF;
  IF o.revision <> p_expected_revision THEN RAISE EXCEPTION 'TAKEOFF_CONFLICT: order revision % expected, % current', p_expected_revision, o.revision USING ERRCODE='P0001'; END IF;
  IF p_fields IS NOT NULL THEN
    UPDATE public.takeoff_orders SET
      supplier_id = CASE WHEN p_fields ? 'supplierId' THEN (p_fields->>'supplierId')::uuid ELSE supplier_id END,
      delivery = CASE WHEN p_fields ? 'delivery' THEN p_fields->'delivery' ELSE delivery END,
      notes = CASE WHEN p_fields ? 'notes' THEN p_fields->>'notes' ELSE notes END
    WHERE id = o.id;
  END IF;
  IF p_lines IS NOT NULL THEN
    IF jsonb_array_length(p_lines) > 200 THEN RAISE EXCEPTION 'TAKEOFF_LIMIT: an order can have at most 200 lines' USING ERRCODE='P0001'; END IF;
    DELETE FROM public.takeoff_order_lines WHERE order_id = o.id;
    FOR item IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      PERFORM 1 FROM public.takeoff_job_materials WHERE id = (item->>'jobMaterialId')::uuid AND workspace_id = o.workspace_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: material' USING ERRCODE='P0001'; END IF;
      INSERT INTO public.takeoff_order_lines (order_id, bucket_key, spec_key, job_material_id, finished_length_mm, quantity, unit, item)
      VALUES (o.id, item->>'bucketKey', item->>'specKey', (item->>'jobMaterialId')::uuid, NULLIF(item->>'finishedLengthMm','')::float8,
              (item->>'quantity')::int, COALESCE(NULLIF(item->>'unit',''), 'piece'), NULLIF(item->'item','null'::jsonb));
    END LOOP;
  END IF;
  UPDATE public.takeoff_orders SET revision = revision + 1, updated_at = now() WHERE id = o.id RETURNING revision INTO v_rev;
  SELECT count(*) INTO n FROM public.takeoff_order_lines WHERE order_id = o.id;
  RETURN jsonb_build_object('orderId', o.id, 'revision', v_rev, 'lineCount', n);
END $$;

-- ── commit: contribution ROLE from the change-set (206 always wrote 'primary') ──
-- Identical to 206's takeoff_commit except the two role assignments. The server validates role ↔ measurement kind.
CREATE OR REPLACE FUNCTION public.takeoff_commit(p_workspace_id uuid, p_expected_revision integer, p_changes jsonb, p_actor jsonb, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  ws public.takeoff_workspaces;
  prior jsonb;
  item jsonb;
  v_id uuid;
  v_owner uuid;
  a_type text := p_actor->>'type';
  a_user uuid := NULLIF(p_actor->>'userId','')::uuid;
  a_emp uuid := NULLIF(p_actor->>'employeeId','')::uuid;
  v_rev integer;
  v_count integer;
  result jsonb;
BEGIN
  IF a_type NOT IN ('staff','employee') THEN RAISE EXCEPTION 'TAKEOFF_INVALID: actor' USING ERRCODE='P0001'; END IF;
  SELECT * INTO ws FROM public.takeoff_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_NOT_FOUND: workspace' USING ERRCODE='P0001'; END IF;
  prior := public.takeoff_idem_get(p_workspace_id, p_idempotency_key, 'commit');
  IF prior IS NOT NULL THEN RETURN prior; END IF;
  IF ws.state = 'archived' THEN RAISE EXCEPTION 'TAKEOFF_INVALID: this takeoff is archived' USING ERRCODE='P0001'; END IF;
  IF ws.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'TAKEOFF_CONFLICT: revision % expected, % current', p_expected_revision, ws.revision USING ERRCODE='P0001';
  END IF;

  -- workspace fields
  IF p_changes ? 'workspace' THEN
    item := p_changes->'workspace';
    IF item ? 'primaryDocumentId' AND item->>'primaryDocumentId' IS NOT NULL THEN
      IF NOT public.takeoff_doc_in_scope(ws, (item->>'primaryDocumentId')::uuid) THEN
        RAISE EXCEPTION 'TAKEOFF_SCOPE: plan is not on this job' USING ERRCODE='P0001';
      END IF;
    END IF;
    UPDATE public.takeoff_workspaces SET
      name = COALESCE(NULLIF(item->>'name',''), name),
      primary_document_id = CASE WHEN (item->>'clearPrimary')::boolean THEN NULL ELSE COALESCE((item->>'primaryDocumentId')::uuid, primary_document_id) END,
      primary_page_index  = CASE WHEN (item->>'clearPrimary')::boolean THEN NULL ELSE COALESCE((item->>'primaryPageIndex')::int, primary_page_index) END,
      state = CASE WHEN (item->>'acknowledgeReview')::boolean AND state = 'needs_review' THEN 'active' ELSE state END,
      review_reason = CASE WHEN (item->>'acknowledgeReview')::boolean THEN NULL ELSE review_reason END
    WHERE id = ws.id;
  END IF;

  -- calibrations (insert-only)
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes#>'{calibrations,insert}','[]'::jsonb)) LOOP
    IF NOT public.takeoff_doc_in_scope(ws, (item->>'documentId')::uuid) THEN
      RAISE EXCEPTION 'TAKEOFF_SCOPE: plan is not on this job' USING ERRCODE='P0001';
    END IF;
    IF item->>'supersedesCalibrationId' IS NOT NULL THEN
      SELECT workspace_id INTO v_owner FROM public.takeoff_calibrations WHERE id = (item->>'supersedesCalibrationId')::uuid;
      IF v_owner IS DISTINCT FROM ws.id THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: calibration' USING ERRCODE='P0001'; END IF;
    END IF;
    SELECT COALESCE(max(calibration_revision),0) + 1 INTO v_rev FROM public.takeoff_calibrations
      WHERE workspace_id = ws.id AND document_id = (item->>'documentId')::uuid AND page_index = (item->>'pageIndex')::int
        AND region_label IS NOT DISTINCT FROM NULLIF(item->>'regionLabel','');
    INSERT INTO public.takeoff_calibrations (id, workspace_id, document_id, content_sha256, page_index, page_meta, region, region_label,
      calibration_revision, supersedes_calibration_id, basis_rotation, mode, sx, sy, measured_sx, measured_sy, discrepancy, tolerance,
      horizontal, vertical, verification, status, created_by_type, created_by_user_id, created_by_employee_id)
    VALUES ((item->>'id')::uuid, ws.id, (item->>'documentId')::uuid, item->>'contentSha256', (item->>'pageIndex')::int, item->'pageMeta',
      NULLIF(item->'region','null'::jsonb), NULLIF(item->>'regionLabel',''), v_rev, (item->>'supersedesCalibrationId')::uuid,
      (item->>'basisRotation')::int, item->>'mode', (item->>'sx')::float8, (item->>'sy')::float8, (item->>'measuredSx')::float8,
      (item->>'measuredSy')::float8, (item->>'discrepancy')::float8, (item->>'tolerance')::float8, item->'horizontal', item->'vertical',
      NULLIF(item->'verification','null'::jsonb), item->>'status', a_type, a_user, a_emp);
  END LOOP;

  -- materials
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes#>'{materials,upsert}','[]'::jsonb)) LOOP
    v_id := (item->>'id')::uuid;
    SELECT workspace_id INTO v_owner FROM public.takeoff_job_materials WHERE id = v_id;
    IF FOUND THEN
      IF v_owner <> ws.id THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: material' USING ERRCODE='P0001'; END IF;
      INSERT INTO public.takeoff_material_rule_history (job_material_id, material_revision, old_rules, new_rules, changed_by_type, changed_by_user_id, changed_by_employee_id)
        SELECT m.id, m.revision + 1, m.rules, COALESCE(item->'rules','{}'), a_type, a_user, a_emp
          FROM public.takeoff_job_materials m WHERE m.id = v_id AND m.rules IS DISTINCT FROM COALESCE(item->'rules','{}');
      UPDATE public.takeoff_job_materials SET name = item->>'name', spec = COALESCE(item->'spec','{}'), rules = COALESCE(item->'rules','{}'),
        profile = NULLIF(item->'profile','null'::jsonb), method_key = item->>'methodKey', method_version = (item->>'methodVersion')::int,
        revision = revision + 1, archived_at = NULL, updated_at = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO public.takeoff_job_materials (id, workspace_id, from_preset_id, from_preset_revision, name, method_key, method_version, spec, rules, profile)
      VALUES (v_id, ws.id, (item->>'fromPresetId')::uuid, (item->>'fromPresetRevision')::int, item->>'name', item->>'methodKey',
        (item->>'methodVersion')::int, COALESCE(item->'spec','{}'), COALESCE(item->'rules','{}'), NULLIF(item->'profile','null'::jsonb));
      INSERT INTO public.takeoff_material_rule_history (job_material_id, material_revision, old_rules, new_rules, changed_by_type, changed_by_user_id, changed_by_employee_id)
      VALUES (v_id, 1, NULL, COALESCE(item->'rules','{}'), a_type, a_user, a_emp);
    END IF;
  END LOOP;

  -- measurements
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes#>'{measurements,upsert}','[]'::jsonb)) LOOP
    v_id := (item->>'id')::uuid;
    IF item->>'documentId' IS NOT NULL AND NOT public.takeoff_doc_in_scope(ws, (item->>'documentId')::uuid) THEN
      RAISE EXCEPTION 'TAKEOFF_SCOPE: plan is not on this job' USING ERRCODE='P0001';
    END IF;
    IF item->>'calibrationId' IS NOT NULL THEN
      PERFORM 1 FROM public.takeoff_calibrations c WHERE c.id = (item->>'calibrationId')::uuid AND c.workspace_id = ws.id
        AND c.document_id = (item->>'documentId')::uuid AND c.page_index = (item->>'pageIndex')::int;
      IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: calibration does not match this plan page' USING ERRCODE='P0001'; END IF;
    END IF;
    SELECT workspace_id INTO v_owner FROM public.takeoff_measurements WHERE id = v_id;
    IF FOUND THEN
      IF v_owner <> ws.id THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: measurement' USING ERRCODE='P0001'; END IF;
      UPDATE public.takeoff_measurements SET kind = item->>'kind', document_id = (item->>'documentId')::uuid, page_index = (item->>'pageIndex')::int,
        calibration_id = (item->>'calibrationId')::uuid, geometry = NULLIF(item->'geometry','null'::jsonb), label = item->>'label',
        raw_length_mm = (item->>'rawLengthMm')::float8, finished_length_mm = (item->>'finishedLengthMm')::float8, quantity = (item->>'quantity')::int,
        revision = revision + 1, archived_at = NULL, updated_at = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO public.takeoff_measurements (id, workspace_id, kind, document_id, page_index, calibration_id, geometry, label, raw_length_mm,
        finished_length_mm, quantity, created_by_type, created_by_user_id, created_by_employee_id)
      VALUES (v_id, ws.id, item->>'kind', (item->>'documentId')::uuid, (item->>'pageIndex')::int, (item->>'calibrationId')::uuid,
        NULLIF(item->'geometry','null'::jsonb), item->>'label', (item->>'rawLengthMm')::float8, (item->>'finishedLengthMm')::float8,
        (item->>'quantity')::int, a_type, a_user, a_emp);
    END IF;
  END LOOP;

  -- contributions
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes#>'{contributions,upsert}','[]'::jsonb)) LOOP
    v_id := (item->>'id')::uuid;
    PERFORM 1 FROM public.takeoff_measurements WHERE id = (item->>'measurementId')::uuid AND workspace_id = ws.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: measurement' USING ERRCODE='P0001'; END IF;
    PERFORM 1 FROM public.takeoff_job_materials WHERE id = (item->>'jobMaterialId')::uuid AND workspace_id = ws.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: material' USING ERRCODE='P0001'; END IF;
    SELECT workspace_id INTO v_owner FROM public.takeoff_contributions WHERE id = v_id;
    IF FOUND THEN
      IF v_owner <> ws.id THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: contribution' USING ERRCODE='P0001'; END IF;
      UPDATE public.takeoff_contributions SET measurement_id = (item->>'measurementId')::uuid, job_material_id = (item->>'jobMaterialId')::uuid,
        role = COALESCE(NULLIF(item->>'role',''), 'primary'), split = NULLIF(item->'split','null'::jsonb),
        split_version = CASE WHEN NULLIF(item->'split','null'::jsonb) IS DISTINCT FROM split THEN split_version + 1 ELSE split_version END,
        archived_at = NULL, updated_at = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO public.takeoff_contributions (id, workspace_id, measurement_id, job_material_id, role, split, split_version)
      VALUES (v_id, ws.id, (item->>'measurementId')::uuid, (item->>'jobMaterialId')::uuid, COALESCE(NULLIF(item->>'role',''), 'primary'),
        NULLIF(item->'split','null'::jsonb), CASE WHEN NULLIF(item->'split','null'::jsonb) IS NULL THEN 0 ELSE 1 END);
    END IF;
  END LOOP;

  -- archives (soft) — scoped to this workspace only
  UPDATE public.takeoff_contributions SET archived_at = now(), updated_at = now()
   WHERE workspace_id = ws.id AND archived_at IS NULL
     AND id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(p_changes#>'{contributions,archive}','[]'::jsonb)) x);
  UPDATE public.takeoff_measurements SET archived_at = now(), updated_at = now()
   WHERE workspace_id = ws.id AND archived_at IS NULL
     AND id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(p_changes#>'{measurements,archive}','[]'::jsonb)) x);
  -- archiving a measurement archives its contributions too
  UPDATE public.takeoff_contributions c SET archived_at = now(), updated_at = now()
   FROM public.takeoff_measurements m WHERE c.measurement_id = m.id AND m.archived_at IS NOT NULL AND c.archived_at IS NULL AND c.workspace_id = ws.id;
  UPDATE public.takeoff_job_materials SET archived_at = now(), updated_at = now()
   WHERE workspace_id = ws.id AND archived_at IS NULL
     AND id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(p_changes#>'{materials,archive}','[]'::jsonb)) x);
  UPDATE public.takeoff_contributions c SET archived_at = now(), updated_at = now()
   FROM public.takeoff_job_materials m WHERE c.job_material_id = m.id AND m.archived_at IS NOT NULL AND c.archived_at IS NULL AND c.workspace_id = ws.id;

  SELECT count(*) INTO v_count FROM public.takeoff_measurements WHERE workspace_id = ws.id AND archived_at IS NULL;
  IF v_count > 500 THEN RAISE EXCEPTION 'TAKEOFF_LIMIT: a takeoff can hold at most 500 measurements' USING ERRCODE='P0001'; END IF;

  UPDATE public.takeoff_workspaces SET revision = revision + 1, updated_at = now(),
    updated_by_type = a_type, updated_by_user_id = a_user, updated_by_employee_id = a_emp
  WHERE id = ws.id RETURNING revision INTO v_rev;

  result := jsonb_build_object('workspaceId', ws.id, 'revision', v_rev);
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.takeoff_idempotency (scope_id, key, operation, result) VALUES (ws.id, p_idempotency_key, 'commit', result);
  END IF;
  RETURN result;
END $$;

-- keep the 206 privilege model: service role only
REVOKE ALL ON FUNCTION public.takeoff_save_order(uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.takeoff_save_order(uuid, integer, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.takeoff_commit(uuid, integer, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.takeoff_commit(uuid, integer, jsonb, jsonb, text) TO service_role;
