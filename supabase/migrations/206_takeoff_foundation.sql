-- =============================================================================
-- Migration 206 — Takeoff foundation (R03): plan provenance, calibrations, measurements,
-- material standards, job materials, contributions, draft orders, frozen exports and
-- externally-placed order records.
--
-- Spec: docs/takeoff/R03/01-BUILD-SPEC.md §8–§12.  ADR: docs/takeoff/ADR-001-hub-takeoff.md
--
-- Additive + idempotent. Touches existing tables ONLY by adding nullable columns to
-- job_documents (structured revision label, content hash, size, archive stamp) and a BEFORE
-- UPDATE trigger that freezes the stored file/owner of HASH-ANCHORED rows only. Legacy
-- job_documents rows (content_sha256 NULL) are not constrained.
--
-- Security model:
--   * Every new table: RLS ON, no policies, and table privileges revoked from anon/authenticated.
--     All access is through the scoped Express API using the service role.
--   * RPCs are SECURITY INVOKER (the service role already bypasses RLS) with EXECUTE revoked
--     from PUBLIC/anon/authenticated and granted only to service_role.
--   * Immutable records (calibrations, preset revisions, exports, placements, allocations) are
--     protected by triggers that also stop the service role mutating them through app paths.
--
-- Job ownership: every NEW root carries exactly one of job_id / carpentry_job_id /
-- charge_up_job_id (CHECK num_nonnulls = 1). Children derive scope from their root.
-- Rollback: disable TAKEOFF_ENABLED. Do NOT drop these tables once they hold job evidence.
-- =============================================================================

BEGIN;

-- ── 0. Plan provenance on job_documents (nullable, additive) ──────────────────
ALTER TABLE public.job_documents
  ADD COLUMN IF NOT EXISTS revision_label text,
  ADD COLUMN IF NOT EXISTS content_sha256 text,
  ADD COLUMN IF NOT EXISTS byte_size bigint,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users (id);

COMMENT ON COLUMN public.job_documents.revision_label IS 'Structured plan revision label (display only, as typed by uploader). NULL for legacy rows — never inferred.';
COMMENT ON COLUMN public.job_documents.content_sha256 IS 'sha256 of the stored bytes at upload. NULL for legacy rows.';
COMMENT ON COLUMN public.job_documents.archived_at IS 'Set instead of deleting when a plan is referenced by takeoff evidence (status also → superseded).';

-- Private bucket for generated supplier-order PDFs — kept apart from source plans (job-plans).
INSERT INTO storage.buckets (id, name, public) VALUES ('takeoff-exports', 'takeoff-exports', false) ON CONFLICT (id) DO NOTHING;

-- ── helpers ───────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.takeoff_order_ref_seq START 1001;

-- ── 1. Workspaces (job-owned root) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_workspaces (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid REFERENCES public.jobs (id),
  carpentry_job_id      uuid REFERENCES public.carpentry_jobs (id),
  charge_up_job_id      uuid REFERENCES public.charge_up_jobs (id),
  name                  text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  revision              integer NOT NULL DEFAULT 1,
  primary_document_id   uuid REFERENCES public.job_documents (id),
  primary_page_index    integer CHECK (primary_page_index IS NULL OR primary_page_index >= 0),
  state                 text NOT NULL DEFAULT 'active' CHECK (state IN ('active','needs_review','archived')),
  review_reason         text,
  created_by_type       text NOT NULL CHECK (created_by_type IN ('staff','employee')),
  created_by_user_id    uuid REFERENCES auth.users (id),
  created_by_employee_id uuid REFERENCES public.employees (id),
  updated_by_type       text CHECK (updated_by_type IN ('staff','employee')),
  updated_by_user_id    uuid REFERENCES auth.users (id),
  updated_by_employee_id uuid REFERENCES public.employees (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeoff_ws_one_job CHECK (num_nonnulls(job_id, carpentry_job_id, charge_up_job_id) = 1)
);
CREATE INDEX IF NOT EXISTS takeoff_ws_job_idx  ON public.takeoff_workspaces (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS takeoff_ws_carp_idx ON public.takeoff_workspaces (carpentry_job_id) WHERE carpentry_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS takeoff_ws_cu_idx   ON public.takeoff_workspaces (charge_up_job_id) WHERE charge_up_job_id IS NOT NULL;

-- ── 2. Calibrations (immutable; a recalibration is a new row) ─────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_calibrations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.takeoff_workspaces (id),
  document_id           uuid NOT NULL REFERENCES public.job_documents (id),
  content_sha256        text,
  page_index            integer NOT NULL CHECK (page_index >= 0),
  page_meta             jsonb NOT NULL,
  region                jsonb,
  region_label          text,
  calibration_revision  integer NOT NULL DEFAULT 1,
  supersedes_calibration_id uuid REFERENCES public.takeoff_calibrations (id),
  schema_version        integer NOT NULL DEFAULT 1,
  basis_rotation        integer NOT NULL CHECK (basis_rotation IN (0,90,180,270)),
  mode                  text NOT NULL CHECK (mode IN ('uniform','separate')),
  sx                    double precision NOT NULL CHECK (sx > 0),
  sy                    double precision NOT NULL CHECK (sy > 0),
  measured_sx           double precision NOT NULL,
  measured_sy           double precision NOT NULL,
  discrepancy           double precision NOT NULL,
  tolerance             double precision NOT NULL,
  horizontal            jsonb NOT NULL,
  vertical              jsonb NOT NULL,
  verification          jsonb,
  status                text NOT NULL CHECK (status IN ('ready','needs_review','unverified')),
  created_by_type       text NOT NULL CHECK (created_by_type IN ('staff','employee')),
  created_by_user_id    uuid REFERENCES auth.users (id),
  created_by_employee_id uuid REFERENCES public.employees (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, document_id, page_index, region_label, calibration_revision)
);
CREATE INDEX IF NOT EXISTS takeoff_cal_ws_idx  ON public.takeoff_calibrations (workspace_id);
CREATE INDEX IF NOT EXISTS takeoff_cal_doc_idx ON public.takeoff_calibrations (document_id);

-- ── 3. Material standards (stable library row + immutable revisions) ──────────
CREATE TABLE IF NOT EXISTS public.takeoff_material_presets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  current_revision      integer NOT NULL DEFAULT 1,
  is_active             boolean NOT NULL DEFAULT true,
  created_by_user_id    uuid REFERENCES auth.users (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.takeoff_material_preset_revisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id             uuid NOT NULL REFERENCES public.takeoff_material_presets (id),
  revision              integer NOT NULL,
  name                  text NOT NULL,
  method_key            text NOT NULL,
  method_version        integer NOT NULL,
  spec                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile               jsonb,
  source_review         jsonb,          -- {sourceUrl,title,edition,page,checkedAt,reviewedBy,status}
  created_by_user_id    uuid REFERENCES auth.users (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preset_id, revision)
);

-- ── 4. Job materials (independent full copies) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_job_materials (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.takeoff_workspaces (id),
  from_preset_id        uuid REFERENCES public.takeoff_material_presets (id),
  from_preset_revision  integer,
  name                  text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  method_key            text NOT NULL,
  method_version        integer NOT NULL,
  spec                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile               jsonb,
  revision              integer NOT NULL DEFAULT 1,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS takeoff_jm_ws_idx ON public.takeoff_job_materials (workspace_id);

-- Audit history of a job material's ordering rules (allowance, increment, handling flag, ceiling):
-- one immutable row per change, written by takeoff_commit.
CREATE TABLE IF NOT EXISTS public.takeoff_material_rule_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_material_id       uuid NOT NULL REFERENCES public.takeoff_job_materials (id),
  material_revision     integer NOT NULL,
  old_rules             jsonb,
  new_rules             jsonb NOT NULL,
  changed_by_type       text NOT NULL CHECK (changed_by_type IN ('staff','employee')),
  changed_by_user_id    uuid REFERENCES auth.users (id),
  changed_by_employee_id uuid REFERENCES public.employees (id),
  changed_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS takeoff_rule_hist_mat_idx ON public.takeoff_material_rule_history (job_material_id);

-- ── 5. Measurements ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_measurements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.takeoff_workspaces (id),
  kind                  text NOT NULL CHECK (kind IN ('run','count','manual')),
  document_id           uuid REFERENCES public.job_documents (id),
  page_index            integer CHECK (page_index IS NULL OR page_index >= 0),
  calibration_id        uuid REFERENCES public.takeoff_calibrations (id),
  geometry_schema       integer NOT NULL DEFAULT 1,
  geometry              jsonb,           -- {points:[{x,y}...]} unrotated PDF user space
  label                 text,
  raw_length_mm         double precision, -- server-computed provenance for runs
  finished_length_mm    double precision, -- count/manual finished length as entered
  quantity              integer CHECK (quantity IS NULL OR quantity >= 1),
  revision              integer NOT NULL DEFAULT 1,
  archived_at           timestamptz,
  created_by_type       text NOT NULL CHECK (created_by_type IN ('staff','employee')),
  created_by_user_id    uuid REFERENCES auth.users (id),
  created_by_employee_id uuid REFERENCES public.employees (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeoff_meas_manual_no_cal CHECK (kind <> 'manual' OR (calibration_id IS NULL AND geometry IS NULL)),
  CONSTRAINT takeoff_meas_run_has_cal  CHECK (kind <> 'run' OR (calibration_id IS NOT NULL AND document_id IS NOT NULL)),
  CONSTRAINT takeoff_meas_count_len    CHECK (kind = 'run' OR finished_length_mm > 0),
  CONSTRAINT takeoff_meas_manual_qty   CHECK (kind <> 'manual' OR quantity IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS takeoff_meas_ws_idx  ON public.takeoff_measurements (workspace_id);
CREATE INDEX IF NOT EXISTS takeoff_meas_doc_idx ON public.takeoff_measurements (document_id) WHERE document_id IS NOT NULL;

-- ── 6. Contributions (measurement → job material) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_contributions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.takeoff_workspaces (id),
  measurement_id        uuid NOT NULL REFERENCES public.takeoff_measurements (id),
  job_material_id       uuid NOT NULL REFERENCES public.takeoff_job_materials (id),
  role                  text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary')),
  split                 jsonb,           -- {pieces:[mm], laps:[mm], sourceFinishedMm, version}
  split_version         integer NOT NULL DEFAULT 0,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS takeoff_contrib_unique_active
  ON public.takeoff_contributions (measurement_id, job_material_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS takeoff_contrib_ws_idx ON public.takeoff_contributions (workspace_id);

-- ── 7. Draft orders (one supplier per order) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.takeoff_workspaces (id),
  order_ref             text NOT NULL UNIQUE,
  supplier_id           uuid REFERENCES public.suppliers (id),
  delivery              jsonb NOT NULL DEFAULT '{}'::jsonb, -- {method,address,requiredDate,contactName,contactPhone,notes,provenance}
  notes                 text,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','placed','cancelled')),
  revision              integer NOT NULL DEFAULT 1,
  created_by_type       text NOT NULL CHECK (created_by_type IN ('staff','employee')),
  created_by_user_id    uuid REFERENCES auth.users (id),
  created_by_employee_id uuid REFERENCES public.employees (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS takeoff_orders_ws_idx ON public.takeoff_orders (workspace_id);

CREATE TABLE IF NOT EXISTS public.takeoff_order_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.takeoff_orders (id),
  bucket_key            text NOT NULL,
  spec_key              text NOT NULL,
  job_material_id       uuid NOT NULL REFERENCES public.takeoff_job_materials (id),
  finished_length_mm    double precision NOT NULL CHECK (finished_length_mm > 0),
  quantity              integer NOT NULL CHECK (quantity >= 1),
  UNIQUE (order_id, bucket_key)
);

-- ── 8. Exports (immutable frozen snapshot; artifact state is the only mutable part) ──
CREATE TABLE IF NOT EXISTS public.takeoff_exports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.takeoff_orders (id),
  export_no             integer NOT NULL,
  is_draft              boolean NOT NULL,
  snapshot              jsonb NOT NULL,
  snapshot_sha256       text NOT NULL,
  calculation_version   text NOT NULL,
  profile_schema_version integer NOT NULL,
  workspace_revision    integer NOT NULL,
  order_revision        integer NOT NULL,
  artifact_status       text NOT NULL DEFAULT 'pending' CHECK (artifact_status IN ('pending','ready','failed')),
  artifact_error        text,
  pdf_document_id       uuid REFERENCES public.job_documents (id),
  pdf_sha256            text,
  renderer_version      text,
  created_by_type       text NOT NULL CHECK (created_by_type IN ('staff','employee')),
  created_by_user_id    uuid REFERENCES auth.users (id),
  created_by_employee_id uuid REFERENCES public.employees (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, export_no),
  CONSTRAINT takeoff_export_ready_has_pdf CHECK (artifact_status <> 'ready' OR (pdf_document_id IS NOT NULL AND pdf_sha256 IS NOT NULL))
);

-- ── 9. Externally placed orders + allocations ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_placements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.takeoff_orders (id),
  export_id             uuid NOT NULL REFERENCES public.takeoff_exports (id),
  supplier_reference    text,
  placed_on             date NOT NULL,
  status                text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed','cancelled')),
  surplus_acknowledged  boolean NOT NULL DEFAULT false,
  placed_by_user_id     uuid NOT NULL REFERENCES auth.users (id),
  cancelled_at          timestamptz,
  cancelled_by_user_id  uuid REFERENCES auth.users (id),
  cancel_reason         text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS takeoff_one_active_placement ON public.takeoff_placements (order_id) WHERE status = 'placed';

CREATE TABLE IF NOT EXISTS public.takeoff_placement_allocations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id          uuid NOT NULL REFERENCES public.takeoff_placements (id),
  contribution_id       uuid REFERENCES public.takeoff_contributions (id), -- NULL = acknowledged surplus
  bucket_key            text NOT NULL,
  finished_length_mm    double precision NOT NULL,
  quantity              integer NOT NULL CHECK (quantity >= 1)
);
CREATE INDEX IF NOT EXISTS takeoff_alloc_contrib_idx ON public.takeoff_placement_allocations (contribution_id);

-- ── 10. Idempotency ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_idempotency (
  scope_id              uuid NOT NULL,
  key                   text NOT NULL CHECK (char_length(key) BETWEEN 8 AND 120),
  operation             text NOT NULL,
  result                jsonb NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id, key)
);

-- ── 11. Immutability triggers ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.takeoff_block_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'TAKEOFF_IMMUTABLE: % rows cannot be %', TG_TABLE_NAME, lower(TG_OP) USING ERRCODE = 'P0001';
END $$;

CREATE OR REPLACE FUNCTION public.takeoff_export_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TAKEOFF_IMMUTABLE: exports cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.snapshot_sha256 IS DISTINCT FROM OLD.snapshot_sha256
     OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.export_no IS DISTINCT FROM OLD.export_no
     OR NEW.is_draft IS DISTINCT FROM OLD.is_draft OR NEW.calculation_version IS DISTINCT FROM OLD.calculation_version
     OR NEW.workspace_revision IS DISTINCT FROM OLD.workspace_revision OR NEW.order_revision IS DISTINCT FROM OLD.order_revision
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id THEN
    RAISE EXCEPTION 'TAKEOFF_IMMUTABLE: export snapshot is frozen' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.artifact_status = 'ready' THEN
    RAISE EXCEPTION 'TAKEOFF_IMMUTABLE: a ready export cannot change' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.takeoff_placement_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TAKEOFF_IMMUTABLE: placements cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status <> 'placed' OR NEW.status <> 'cancelled'
     OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.export_id IS DISTINCT FROM OLD.export_id
     OR NEW.placed_on IS DISTINCT FROM OLD.placed_on OR NEW.supplier_reference IS DISTINCT FROM OLD.supplier_reference
     OR NEW.placed_by_user_id IS DISTINCT FROM OLD.placed_by_user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.surplus_acknowledged IS DISTINCT FROM OLD.surplus_acknowledged THEN
    RAISE EXCEPTION 'TAKEOFF_IMMUTABLE: a placement can only be cancelled' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS takeoff_cal_immutable ON public.takeoff_calibrations;
CREATE TRIGGER takeoff_cal_immutable BEFORE UPDATE OR DELETE ON public.takeoff_calibrations
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();
DROP TRIGGER IF EXISTS takeoff_presetrev_immutable ON public.takeoff_material_preset_revisions;
CREATE TRIGGER takeoff_presetrev_immutable BEFORE UPDATE OR DELETE ON public.takeoff_material_preset_revisions
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();
DROP TRIGGER IF EXISTS takeoff_rule_hist_immutable ON public.takeoff_material_rule_history;
CREATE TRIGGER takeoff_rule_hist_immutable BEFORE UPDATE OR DELETE ON public.takeoff_material_rule_history
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();
DROP TRIGGER IF EXISTS takeoff_alloc_immutable ON public.takeoff_placement_allocations;
CREATE TRIGGER takeoff_alloc_immutable BEFORE UPDATE OR DELETE ON public.takeoff_placement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();
DROP TRIGGER IF EXISTS takeoff_idem_immutable ON public.takeoff_idempotency;
CREATE TRIGGER takeoff_idem_immutable BEFORE UPDATE ON public.takeoff_idempotency
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();
DROP TRIGGER IF EXISTS takeoff_export_guard ON public.takeoff_exports;
CREATE TRIGGER takeoff_export_guard BEFORE UPDATE OR DELETE ON public.takeoff_exports
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_export_guard();
DROP TRIGGER IF EXISTS takeoff_placement_guard ON public.takeoff_placements;
CREATE TRIGGER takeoff_placement_guard BEFORE UPDATE OR DELETE ON public.takeoff_placements
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_placement_guard();
-- Workspaces/measurements/materials/contributions/orders are never hard-deleted (archive instead).
DROP TRIGGER IF EXISTS takeoff_ws_nodelete ON public.takeoff_workspaces;
CREATE TRIGGER takeoff_ws_nodelete BEFORE DELETE ON public.takeoff_workspaces FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();
DROP TRIGGER IF EXISTS takeoff_meas_nodelete ON public.takeoff_measurements;
CREATE TRIGGER takeoff_meas_nodelete BEFORE DELETE ON public.takeoff_measurements FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();
DROP TRIGGER IF EXISTS takeoff_contrib_nodelete ON public.takeoff_contributions;
CREATE TRIGGER takeoff_contrib_nodelete BEFORE DELETE ON public.takeoff_contributions FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();
DROP TRIGGER IF EXISTS takeoff_orders_nodelete ON public.takeoff_orders;
CREATE TRIGGER takeoff_orders_nodelete BEFORE DELETE ON public.takeoff_orders FOR EACH ROW EXECUTE FUNCTION public.takeoff_block_mutation();

-- A hash-anchored document (mig 206 uploads + generated exports) keeps its identity: storage path,
-- content hash, size, provider and job owner can't be repointed after the fact (takeoff
-- calibrations/exports anchor to them). Legacy rows (content_sha256 NULL) are untouched.
CREATE OR REPLACE FUNCTION public.takeoff_job_document_identity_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.content_sha256 IS NOT NULL AND (
       NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.byte_size IS DISTINCT FROM OLD.byte_size OR NEW.storage_provider IS DISTINCT FROM OLD.storage_provider
    OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.carpentry_job_id IS DISTINCT FROM OLD.carpentry_job_id
    OR NEW.charge_up_job_id IS DISTINCT FROM OLD.charge_up_job_id) THEN
    RAISE EXCEPTION 'TAKEOFF_IMMUTABLE: a plan''s stored file and job cannot be changed — upload a new revision' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS takeoff_job_document_identity ON public.job_documents;
CREATE TRIGGER takeoff_job_document_identity BEFORE UPDATE ON public.job_documents
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_job_document_identity_guard();

-- ── 12. Scope helpers ─────────────────────────────────────────────────────────
-- Does job_documents row `doc` belong to the same job as workspace `ws`?
CREATE OR REPLACE FUNCTION public.takeoff_doc_in_scope(p_ws public.takeoff_workspaces, p_doc_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_documents d
    WHERE d.id = p_doc_id
      AND ( (p_ws.job_id IS NOT NULL AND d.job_id = p_ws.job_id AND d.carpentry_job_id IS NULL AND d.charge_up_job_id IS NULL)
         OR (p_ws.carpentry_job_id IS NOT NULL AND d.carpentry_job_id = p_ws.carpentry_job_id AND d.charge_up_job_id IS NULL)
         OR (p_ws.charge_up_job_id IS NOT NULL AND d.charge_up_job_id = p_ws.charge_up_job_id) )
  );
$$;

CREATE OR REPLACE FUNCTION public.takeoff_idem_get(p_scope uuid, p_key text, p_op text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r public.takeoff_idempotency;
BEGIN
  IF p_key IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.takeoff_idempotency WHERE scope_id = p_scope AND key = p_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.operation <> p_op THEN
    RAISE EXCEPTION 'TAKEOFF_INVALID: idempotency key reused for a different action' USING ERRCODE = 'P0001';
  END IF;
  RETURN r.result || jsonb_build_object('replayed', true);
END $$;

-- ── 13. Atomic workspace commit (CAS on revision) ─────────────────────────────
-- p_changes: {
--   workspace:     {name?, primaryDocumentId?, primaryPageIndex?, clearPrimary?, acknowledgeReview?},
--   calibrations:  {insert:[{id,documentId,contentSha256,pageIndex,pageMeta,region,regionLabel,supersedesCalibrationId,
--                            basisRotation,mode,sx,sy,measuredSx,measuredSy,discrepancy,tolerance,horizontal,vertical,verification,status}]},
--   materials:     {upsert:[{id,fromPresetId,fromPresetRevision,name,methodKey,methodVersion,spec,rules,profile}], archive:[id]},
--   measurements:  {upsert:[{id,kind,documentId,pageIndex,calibrationId,geometry,label,rawLengthMm,finishedLengthMm,quantity}], archive:[id]},
--   contributions: {upsert:[{id,measurementId,jobMaterialId,role,split}], archive:[id]}
-- }
-- p_actor: {type:'staff'|'employee', userId?, employeeId?}
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
        role = 'primary', split = NULLIF(item->'split','null'::jsonb),
        split_version = CASE WHEN NULLIF(item->'split','null'::jsonb) IS DISTINCT FROM split THEN split_version + 1 ELSE split_version END,
        archived_at = NULL, updated_at = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO public.takeoff_contributions (id, workspace_id, measurement_id, job_material_id, role, split, split_version)
      VALUES (v_id, ws.id, (item->>'measurementId')::uuid, (item->>'jobMaterialId')::uuid, 'primary',
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

-- ── 14. Draft order save (CAS on order revision) ──────────────────────────────
-- p_lines: [{bucketKey,specKey,jobMaterialId,finishedLengthMm,quantity}] (replaces the line set)
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
      INSERT INTO public.takeoff_order_lines (order_id, bucket_key, spec_key, job_material_id, finished_length_mm, quantity)
      VALUES (o.id, item->>'bucketKey', item->>'specKey', (item->>'jobMaterialId')::uuid, (item->>'finishedLengthMm')::float8, (item->>'quantity')::int);
    END LOOP;
  END IF;
  UPDATE public.takeoff_orders SET revision = revision + 1, updated_at = now() WHERE id = o.id RETURNING revision INTO v_rev;
  SELECT count(*) INTO n FROM public.takeoff_order_lines WHERE order_id = o.id;
  RETURN jsonb_build_object('orderId', o.id, 'revision', v_rev, 'lineCount', n);
END $$;

-- ── 15. Freeze an export (validates source revisions under lock) ──────────────
CREATE OR REPLACE FUNCTION public.takeoff_create_export(
  p_order_id uuid, p_expected_order_revision integer, p_expected_workspace_revision integer,
  p_supplier_updated_at timestamptz, p_is_draft boolean, p_snapshot jsonb, p_snapshot_sha256 text,
  p_calculation_version text, p_profile_schema_version integer, p_actor jsonb, p_idempotency_key text,
  p_company_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o public.takeoff_orders; ws public.takeoff_workspaces; prior jsonb; v_no integer; v_id uuid; s_upd timestamptz; c_upd timestamptz; result jsonb;
BEGIN
  SELECT * INTO o FROM public.takeoff_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_NOT_FOUND: order' USING ERRCODE='P0001'; END IF;
  prior := public.takeoff_idem_get(o.id, p_idempotency_key, 'export');
  IF prior IS NOT NULL THEN RETURN prior; END IF;
  SELECT * INTO ws FROM public.takeoff_workspaces WHERE id = o.workspace_id FOR SHARE;
  IF o.revision <> p_expected_order_revision OR ws.revision <> p_expected_workspace_revision THEN
    RAISE EXCEPTION 'TAKEOFF_CONFLICT: the takeoff or order changed while exporting — review and export again' USING ERRCODE='P0001';
  END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'TAKEOFF_INVALID: order is cancelled' USING ERRCODE='P0001'; END IF;
  IF NOT p_is_draft THEN
    IF o.supplier_id IS NULL THEN RAISE EXCEPTION 'TAKEOFF_INVALID: choose a supplier first' USING ERRCODE='P0001'; END IF;
    SELECT updated_at INTO s_upd FROM public.suppliers WHERE id = o.supplier_id FOR SHARE;
    IF s_upd IS DISTINCT FROM p_supplier_updated_at THEN
      RAISE EXCEPTION 'TAKEOFF_CONFLICT: supplier details changed while exporting — export again' USING ERRCODE='P0001';
    END IF;
  END IF;
  IF p_company_updated_at IS NOT NULL THEN
    SELECT max(updated_at) INTO c_upd FROM public.company_profile;
    IF c_upd IS DISTINCT FROM p_company_updated_at THEN
      RAISE EXCEPTION 'TAKEOFF_CONFLICT: company details changed while exporting — export again' USING ERRCODE='P0001';
    END IF;
  END IF;
  SELECT COALESCE(max(export_no),0) + 1 INTO v_no FROM public.takeoff_exports WHERE order_id = o.id;
  INSERT INTO public.takeoff_exports (order_id, export_no, is_draft, snapshot, snapshot_sha256, calculation_version, profile_schema_version,
    workspace_revision, order_revision, created_by_type, created_by_user_id, created_by_employee_id)
  VALUES (o.id, v_no, p_is_draft, p_snapshot, p_snapshot_sha256, p_calculation_version, p_profile_schema_version, ws.revision, o.revision,
    p_actor->>'type', NULLIF(p_actor->>'userId','')::uuid, NULLIF(p_actor->>'employeeId','')::uuid)
  RETURNING id INTO v_id;
  result := jsonb_build_object('exportId', v_id, 'exportNo', v_no);
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.takeoff_idempotency (scope_id, key, operation, result) VALUES (o.id, p_idempotency_key, 'export', result);
  END IF;
  RETURN result;
END $$;

-- ── 16. Record an externally placed order (allocation with over-allocation guard) ──
-- p_requirements: current requirement at p_expected_workspace_revision, computed by the server
--   from shared/takeoff: [{contributionId, bucketKey, quantity}]
-- p_allocations: [{contributionId|null, bucketKey, finishedLengthMm, quantity}] (null = acknowledged surplus)
CREATE OR REPLACE FUNCTION public.takeoff_place_order(
  p_order_id uuid, p_export_id uuid, p_expected_workspace_revision integer, p_requirements jsonb, p_allocations jsonb,
  p_supplier_reference text, p_placed_on date, p_surplus_acknowledged boolean, p_user_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o public.takeoff_orders; ws public.takeoff_workspaces; e public.takeoff_exports; prior jsonb; v_id uuid; item jsonb;
  over_row record; has_surplus boolean := false; result jsonb;
BEGIN
  SELECT * INTO o FROM public.takeoff_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_NOT_FOUND: order' USING ERRCODE='P0001'; END IF;
  prior := public.takeoff_idem_get(o.id, p_idempotency_key, 'place');
  IF prior IS NOT NULL THEN RETURN prior; END IF;
  -- serialise every placement in this workspace (competing orders for the same requirement)
  SELECT * INTO ws FROM public.takeoff_workspaces WHERE id = o.workspace_id FOR UPDATE;
  IF ws.revision <> p_expected_workspace_revision THEN
    RAISE EXCEPTION 'TAKEOFF_CONFLICT: the takeoff changed — reload before recording the order' USING ERRCODE='P0001';
  END IF;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'TAKEOFF_INVALID: this order is already placed or cancelled' USING ERRCODE='P0001'; END IF;
  SELECT * INTO e FROM public.takeoff_exports WHERE id = p_export_id AND order_id = o.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: export' USING ERRCODE='P0001'; END IF;
  IF e.is_draft OR e.artifact_status <> 'ready' THEN
    RAISE EXCEPTION 'TAKEOFF_INVALID: only a finished, order-ready export can be recorded as placed' USING ERRCODE='P0001';
  END IF;
  IF p_placed_on IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION 'TAKEOFF_INVALID: placed date' USING ERRCODE='P0001'; END IF;

  INSERT INTO public.takeoff_placements (order_id, export_id, supplier_reference, placed_on, surplus_acknowledged, placed_by_user_id)
  VALUES (o.id, e.id, NULLIF(p_supplier_reference,''), p_placed_on, COALESCE(p_surplus_acknowledged,false), p_user_id) RETURNING id INTO v_id;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) LOOP
    IF item->>'contributionId' IS NULL THEN
      has_surplus := true;
    ELSE
      PERFORM 1 FROM public.takeoff_contributions WHERE id = (item->>'contributionId')::uuid AND workspace_id = ws.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: contribution' USING ERRCODE='P0001'; END IF;
    END IF;
    INSERT INTO public.takeoff_placement_allocations (placement_id, contribution_id, bucket_key, finished_length_mm, quantity)
    VALUES (v_id, (item->>'contributionId')::uuid, item->>'bucketKey', (item->>'finishedLengthMm')::float8, (item->>'quantity')::int);
  END LOOP;
  IF has_surplus AND NOT COALESCE(p_surplus_acknowledged,false) THEN
    RAISE EXCEPTION 'TAKEOFF_INVALID: this order is more than is still needed — confirm the surplus to record it' USING ERRCODE='P0001';
  END IF;

  -- Over-allocation guard: for every (contribution, bucket) THIS placement allocates to, the effective
  -- (placed) commitments — including this one — must not exceed the current requirement. Pairs this
  -- placement does not touch are not re-judged (a shrunk requirement shows as surplus, never a lock-out).
  WITH req AS (
    SELECT (r->>'contributionId')::uuid AS cid, r->>'bucketKey' AS bk, sum((r->>'quantity')::int) AS q
      FROM jsonb_array_elements(COALESCE(p_requirements,'[]'::jsonb)) r GROUP BY 1, 2),
  touched AS (
    SELECT DISTINCT (a->>'contributionId')::uuid AS cid, a->>'bucketKey' AS bk
      FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) a WHERE a->>'contributionId' IS NOT NULL),
  committed AS (
    SELECT al.contribution_id AS cid, al.bucket_key AS bk, sum(al.quantity) AS q
      FROM public.takeoff_placement_allocations al
      JOIN public.takeoff_placements p ON p.id = al.placement_id AND p.status = 'placed'
      JOIN public.takeoff_orders oo ON oo.id = p.order_id AND oo.workspace_id = ws.id
     WHERE al.contribution_id IS NOT NULL GROUP BY 1, 2)
  SELECT t.cid, t.bk INTO over_row
    FROM touched t JOIN committed c ON c.cid = t.cid AND c.bk = t.bk
    LEFT JOIN req r ON r.cid = t.cid AND r.bk = t.bk
   WHERE c.q > COALESCE(r.q, 0)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'TAKEOFF_CONFLICT: another placed order already covers some of these pieces' USING ERRCODE='P0001';
  END IF;

  UPDATE public.takeoff_orders SET status = 'placed', updated_at = now() WHERE id = o.id;
  result := jsonb_build_object('placementId', v_id);
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.takeoff_idempotency (scope_id, key, operation, result) VALUES (o.id, p_idempotency_key, 'place', result);
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.takeoff_cancel_placement(p_placement_id uuid, p_reason text, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE p public.takeoff_placements;
BEGIN
  SELECT * INTO p FROM public.takeoff_placements WHERE id = p_placement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_NOT_FOUND: placement' USING ERRCODE='P0001'; END IF;
  IF p.status <> 'placed' THEN RAISE EXCEPTION 'TAKEOFF_INVALID: already cancelled' USING ERRCODE='P0001'; END IF;
  IF COALESCE(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'TAKEOFF_INVALID: give a reason for the cancellation' USING ERRCODE='P0001'; END IF;
  UPDATE public.takeoff_placements SET status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = p_user_id, cancel_reason = p_reason
   WHERE id = p.id;
  UPDATE public.takeoff_orders SET status = 'cancelled', updated_at = now() WHERE id = p.order_id;
  RETURN jsonb_build_object('placementId', p.id, 'status', 'cancelled');
END $$;

-- ── 17. Plan lifecycle: atomic new-revision insert + supersession ─────────────
-- Called AFTER the new object is stored. Validates the superseded plan is a current plan of the
-- SAME job (no self/cross-job/cycle), then inserts the new row and supersedes in one transaction,
-- and flags takeoffs that use the old plan as Needs review.
CREATE OR REPLACE FUNCTION public.takeoff_plan_insert(p_row jsonb, p_supersedes uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE old public.job_documents; v_id uuid;
BEGIN
  IF p_supersedes IS NOT NULL THEN
    SELECT * INTO old FROM public.job_documents WHERE id = p_supersedes FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_SCOPE: the plan being replaced was not found' USING ERRCODE='P0001'; END IF;
    IF old.job_id IS DISTINCT FROM NULLIF(p_row->>'job_id','')::uuid
       OR old.carpentry_job_id IS DISTINCT FROM NULLIF(p_row->>'carpentry_job_id','')::uuid
       OR old.charge_up_job_id IS DISTINCT FROM NULLIF(p_row->>'charge_up_job_id','')::uuid THEN
      RAISE EXCEPTION 'TAKEOFF_SCOPE: a plan can only replace a plan on the same job' USING ERRCODE='P0001';
    END IF;
    IF old.status <> 'current' THEN
      RAISE EXCEPTION 'TAKEOFF_CONFLICT: that plan has already been replaced — refresh and pick the current plan' USING ERRCODE='P0001';
    END IF;
    IF old.document_type NOT IN ('architectural','engineering','structural','survey','specification','plan') OR old.storage_provider IS DISTINCT FROM 'supabase' THEN
      RAISE EXCEPTION 'TAKEOFF_SCOPE: only an issued plan can be replaced by a plan upload' USING ERRCODE='P0001';
    END IF;
  END IF;
  INSERT INTO public.job_documents (job_id, carpentry_job_id, charge_up_job_id, document_type, title, revision_label, content_sha256, byte_size,
    storage_provider, storage_path, audience_layer, status, supersedes_document_id, uploaded_by, uploaded_at, version)
  VALUES (NULLIF(p_row->>'job_id','')::uuid, NULLIF(p_row->>'carpentry_job_id','')::uuid, NULLIF(p_row->>'charge_up_job_id','')::uuid,
    p_row->>'document_type', p_row->>'title', NULLIF(p_row->>'revision_label',''), p_row->>'content_sha256', (p_row->>'byte_size')::bigint,
    'supabase', p_row->>'storage_path', COALESCE(p_row->>'audience_layer','worker'), 'current', p_supersedes,
    NULLIF(p_row->>'uploaded_by','')::uuid, now(), CASE WHEN p_supersedes IS NULL THEN 1 ELSE old.version + 1 END)
  RETURNING id INTO v_id;
  IF p_supersedes IS NOT NULL THEN
    UPDATE public.job_documents SET status = 'superseded' WHERE id = p_supersedes;
    -- revision bump: an export/placement built on the old plan set can no longer be frozen/recorded
    UPDATE public.takeoff_workspaces w SET state = 'needs_review', review_reason = 'plan_superseded', revision = revision + 1, updated_at = now()
     WHERE w.state <> 'archived' AND (w.primary_document_id = p_supersedes
        OR EXISTS (SELECT 1 FROM public.takeoff_measurements m WHERE m.workspace_id = w.id AND m.document_id = p_supersedes AND m.archived_at IS NULL));
  END IF;
  RETURN jsonb_build_object('docId', v_id);
END $$;

-- Is a job_documents row referenced by takeoff evidence?
CREATE OR REPLACE FUNCTION public.takeoff_document_referenced(p_doc_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.takeoff_calibrations WHERE document_id = p_doc_id)
      OR EXISTS (SELECT 1 FROM public.takeoff_measurements WHERE document_id = p_doc_id)
      OR EXISTS (SELECT 1 FROM public.takeoff_workspaces WHERE primary_document_id = p_doc_id)
      OR EXISTS (SELECT 1 FROM public.takeoff_exports WHERE pdf_document_id = p_doc_id);
$$;

-- Archive (never delete) a referenced plan. Returns {archived:true} or {archived:false} if unreferenced.
CREATE OR REPLACE FUNCTION public.takeoff_archive_if_referenced(p_doc_id uuid, p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.job_documents WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('archived', false, 'found', false); END IF;
  IF public.takeoff_document_referenced(p_doc_id) THEN
    UPDATE public.job_documents SET status = 'superseded', archived_at = COALESCE(archived_at, now()), archived_by = COALESCE(archived_by, p_user_id)
     WHERE id = p_doc_id;
    UPDATE public.takeoff_workspaces w SET state = 'needs_review', review_reason = 'plan_removed', revision = revision + 1, updated_at = now()
     WHERE w.state <> 'archived' AND (w.primary_document_id = p_doc_id
        OR EXISTS (SELECT 1 FROM public.takeoff_measurements m WHERE m.workspace_id = w.id AND m.document_id = p_doc_id AND m.archived_at IS NULL));
    RETURN jsonb_build_object('archived', true, 'found', true);
  END IF;
  RETURN jsonb_build_object('archived', false, 'found', true);
END $$;

-- ── 17b. Company standards: create / new immutable revision (CAS on current_revision) ──
-- p_content: {name, methodKey, methodVersion, spec, rules, profile, sourceReview}
CREATE OR REPLACE FUNCTION public.takeoff_save_preset(p_preset_id uuid, p_expected_revision integer, p_content jsonb, p_user_id uuid, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE pr public.takeoff_material_presets; v_rev integer; v_id uuid;
BEGIN
  IF p_preset_id IS NULL THEN
    INSERT INTO public.takeoff_material_presets (name, current_revision, is_active, created_by_user_id)
    VALUES (p_content->>'name', 1, COALESCE(p_active, true), p_user_id) RETURNING id INTO v_id;
    v_rev := 1;
  ELSE
    SELECT * INTO pr FROM public.takeoff_material_presets WHERE id = p_preset_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAKEOFF_NOT_FOUND: standard' USING ERRCODE='P0001'; END IF;
    IF pr.current_revision <> p_expected_revision THEN
      RAISE EXCEPTION 'TAKEOFF_CONFLICT: this standard was changed by someone else — reload it' USING ERRCODE='P0001';
    END IF;
    v_id := pr.id;
    IF p_content IS NULL THEN
      UPDATE public.takeoff_material_presets SET is_active = COALESCE(p_active, is_active), updated_at = now() WHERE id = v_id;
      RETURN jsonb_build_object('presetId', v_id, 'revision', pr.current_revision);
    END IF;
    v_rev := pr.current_revision + 1;
    UPDATE public.takeoff_material_presets SET name = p_content->>'name', current_revision = v_rev, is_active = COALESCE(p_active, is_active), updated_at = now()
     WHERE id = v_id;
  END IF;
  INSERT INTO public.takeoff_material_preset_revisions (preset_id, revision, name, method_key, method_version, spec, rules, profile, source_review, created_by_user_id)
  VALUES (v_id, v_rev, p_content->>'name', p_content->>'methodKey', (p_content->>'methodVersion')::int, COALESCE(p_content->'spec','{}'),
    COALESCE(p_content->'rules','{}'), NULLIF(p_content->'profile','null'::jsonb), NULLIF(p_content->'sourceReview','null'::jsonb), p_user_id);
  RETURN jsonb_build_object('presetId', v_id, 'revision', v_rev);
END $$;

-- ── 18. Lock down ─────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['takeoff_workspaces','takeoff_calibrations','takeoff_material_presets','takeoff_material_preset_revisions',
    'takeoff_job_materials','takeoff_measurements','takeoff_contributions','takeoff_orders','takeoff_order_lines','takeoff_exports',
    'takeoff_placements','takeoff_placement_allocations','takeoff_idempotency','takeoff_material_rule_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.takeoff_order_ref_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.takeoff_order_ref_seq TO service_role;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'takeoff_block_mutation()', 'takeoff_export_guard()', 'takeoff_placement_guard()', 'takeoff_job_document_identity_guard()',
    'takeoff_doc_in_scope(public.takeoff_workspaces, uuid)', 'takeoff_idem_get(uuid, text, text)',
    'takeoff_commit(uuid, integer, jsonb, jsonb, text)', 'takeoff_save_order(uuid, integer, jsonb, jsonb)',
    'takeoff_create_export(uuid, integer, integer, timestamptz, boolean, jsonb, text, text, integer, jsonb, text, timestamptz)',
    'takeoff_place_order(uuid, uuid, integer, jsonb, jsonb, text, date, boolean, uuid, text)',
    'takeoff_cancel_placement(uuid, text, uuid)', 'takeoff_plan_insert(jsonb, uuid)',
    'takeoff_document_referenced(uuid)', 'takeoff_archive_if_referenced(uuid, uuid)',
    'takeoff_save_preset(uuid, integer, jsonb, uuid, boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- Next order reference (distinct FO-namespace; never the shared PO sequence).
CREATE OR REPLACE FUNCTION public.takeoff_next_order_ref() RETURNS text
LANGUAGE sql SET search_path = public, pg_temp AS $$ SELECT 'FO-' || lpad(nextval('public.takeoff_order_ref_seq')::text, 6, '0'); $$;
REVOKE ALL ON FUNCTION public.takeoff_next_order_ref() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.takeoff_next_order_ref() TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify (read-only):
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'takeoff_%';
--   SELECT has_function_privilege('anon','public.takeoff_commit(uuid,integer,jsonb,jsonb,text)','EXECUTE');  -- false
--   SELECT column_name FROM information_schema.columns WHERE table_name='job_documents' AND column_name IN ('revision_label','content_sha256','archived_at');
