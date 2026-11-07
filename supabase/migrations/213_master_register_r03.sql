-- 213_master_register_r03.sql — Master Register R03 · canonical write-through + readiness + issue registry
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Builds on 212 (room_scope_items + client_selections provenance/client_visible). R03 closes the
-- "snapshot-only" gap (Tab 23 Q5): once a project exists, the register reads and WRITES the canonical
-- project records directly, through ONE transaction-safe function (register_apply). The lead scratchpad
-- (leads.selections_schedule) becomes read-only history after promotion.
--
--   A. client_selections — the register-owned columns needed to round-trip a selection item without
--      loss (decision certainty, scope disposition, technical + pricing readiness, approval evidence,
--      supply responsibility, finish/manufacturer, quantity+unit, source refs, stable room id).
--   B. room_scope_items — adds the 'requirement' and 'action' item kinds (Tab 23 Q1) + the same
--      readiness fields; ADDS the deny_clients RESTRICTIVE policy that 212 omitted (D-020 — every
--      register table must deny portal clients direct PostgREST access).
--   C. projects.register_meta — canonical room list / drawing basis / resume pointer once promoted.
--   D. delivery_model — first-class Sales fact on the lead, stamped forward to the job (Tab 23 Q4).
--   E. lead_documents — immutable issue registry for register documents (AUD-032) + received
--      consultant/supplier document metadata for manual reconciliation (D-003).
--   F. updated_at version triggers — every writer (staff, portal client, nightly sweep) bumps the
--      row version, so optimistic concurrency can never silently overwrite a newer decision.
--   G. register_apply / register_issue_document — SECURITY INVOKER, executable by service_role ONLY.
--
-- SAFETY: purely ADDITIVE (new nullable columns, widened CHECKs, new functions/triggers/policy).
-- Re-runnable (IF NOT EXISTS / CREATE OR REPLACE / name-guarded constraints). ROLLBACK at the foot.
-- PREREQUISITES: 103 (client portal v2), 104 (auth_is_staff — REQUIRED: if it is absent this migration
-- ABORTS with an exception at the room_scope_items deny_clients step rather than leaving the table
-- readable by client JWTs — see section B), 188 (leads.selections_schedule), 199 (projects.is_preconstruction), 212.
-- Apply on a disposable / staging database first (scripts/tests/register-migration-213.test.mjs and
-- scripts/dev/register-sandbox). Production application requires explicit Blue Leaf sign-off.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ─── A. client_selections: register-owned columns ───────────────────────────────────────────────
ALTER TABLE public.client_selections
  ADD COLUMN IF NOT EXISTS certainty          text,            -- register decision axis (not the portal workflow status)
  ADD COLUMN IF NOT EXISTS disposition        text,            -- scope disposition of the element the choice applies to
  ADD COLUMN IF NOT EXISTS technical_status   text,            -- NULL = not assessed (legacy / portal-created rows)
  ADD COLUMN IF NOT EXISTS technical_evidence jsonb,           -- {at, by, byName, ref} — required when verified
  ADD COLUMN IF NOT EXISTS pricing_status     text,            -- NULL = not assessed
  ADD COLUMN IF NOT EXISTS pricing_ref        text,            -- LINK to an existing estimate/RFQ/fee-proposal line — never a price
  ADD COLUMN IF NOT EXISTS approval_evidence  jsonb,           -- {at, by, byName, ref, method} — required for client_approved
  ADD COLUMN IF NOT EXISTS responsibility     text,            -- decision / next-action owner
  ADD COLUMN IF NOT EXISTS supply_by          text,            -- who supplies (blue_leaf / trade / client / by_others)
  ADD COLUMN IF NOT EXISTS finish             text,
  ADD COLUMN IF NOT EXISTS manufacturer       text,
  ADD COLUMN IF NOT EXISTS quantity           numeric(12,3),   -- NULL = not measured (never shown as zero)
  ADD COLUMN IF NOT EXISTS quantity_unit      text,
  ADD COLUMN IF NOT EXISTS source_ref         text,            -- drawing sheet+rev / supplier doc no+rev / meeting note
  ADD COLUMN IF NOT EXISTS source_doc_id      uuid,            -- optional link to the received/issued lead_documents row
  ADD COLUMN IF NOT EXISTS next_action        text,
  ADD COLUMN IF NOT EXISTS source_room_id     text,            -- stable register room id (survives rename / reorder)
  ADD COLUMN IF NOT EXISTS baselined_at       timestamptz,     -- stamped when captured in a signed contract baseline (audit; selections are already product-locked post-contract)
  ADD COLUMN IF NOT EXISTS register_detail    jsonb NOT NULL DEFAULT '{}'::jsonb; -- {promptKey, categoryKey, section, level, isDefault, overridesDefaultId}

CREATE INDEX IF NOT EXISTS idx_csel_source_room ON public.client_selections (project_id, source_room_id);


-- ─── B. room_scope_items: requirement/action kinds + readiness + deny_clients ───────────────────
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'room_scope_items' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%item_kind%'
  LOOP EXECUTE format('ALTER TABLE public.room_scope_items DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE public.room_scope_items
  ADD CONSTRAINT room_scope_items_item_kind_check
  CHECK (item_kind IN ('scope','selection','requirement','action'));

ALTER TABLE public.room_scope_items
  ADD COLUMN IF NOT EXISTS technical_status   text,
  ADD COLUMN IF NOT EXISTS technical_evidence jsonb,
  ADD COLUMN IF NOT EXISTS pricing_status     text,
  ADD COLUMN IF NOT EXISTS pricing_ref        text,
  ADD COLUMN IF NOT EXISTS approval_evidence  jsonb,
  ADD COLUMN IF NOT EXISTS supply_by          text,
  ADD COLUMN IF NOT EXISTS manufacturer       text,
  ADD COLUMN IF NOT EXISTS supplier           text,
  ADD COLUMN IF NOT EXISTS quantity           numeric(12,3),
  ADD COLUMN IF NOT EXISTS quantity_unit      text,
  ADD COLUMN IF NOT EXISTS source_doc_id      uuid,
  ADD COLUMN IF NOT EXISTS source_room_id     text,
  ADD COLUMN IF NOT EXISTS baselined_at       timestamptz,   -- stamped when captured in a signed contract baseline (P0 — protect baselined scope)
  ADD COLUMN IF NOT EXISTS register_detail    jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_rsi_source_room ON public.room_scope_items (project_id, source_room_id);

-- Controlled vocabularies (shared by both stores). NOT VALID: enforced for every new/changed row
-- without failing on any pre-existing data; NULL stays allowed (legacy / not assessed).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csel_certainty_check') THEN
    ALTER TABLE public.client_selections ADD CONSTRAINT csel_certainty_check
      CHECK (certainty IS NULL OR certainty IN ('not_considered','preference','proposed','client_approved')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csel_disposition_check') THEN
    ALTER TABLE public.client_selections ADD CONSTRAINT csel_disposition_check
      CHECK (disposition IS NULL OR disposition IN ('new','included','alter','retain','remove','make_good','by_others','excluded','deferred','na','undecided')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csel_technical_status_check') THEN
    ALTER TABLE public.client_selections ADD CONSTRAINT csel_technical_status_check
      CHECK (technical_status IS NULL OR technical_status IN ('not_required','needs_verification','verified')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csel_pricing_status_check') THEN
    ALTER TABLE public.client_selections ADD CONSTRAINT csel_pricing_status_check
      CHECK (pricing_status IS NULL OR pricing_status IN ('not_reviewed','allowance_or_estimate','quoted_or_confirmed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rsi_disposition_check') THEN
    ALTER TABLE public.room_scope_items ADD CONSTRAINT rsi_disposition_check
      CHECK (disposition IS NULL OR disposition IN ('new','included','alter','retain','remove','make_good','by_others','excluded','deferred','na','undecided')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rsi_certainty_check') THEN
    ALTER TABLE public.room_scope_items ADD CONSTRAINT rsi_certainty_check
      CHECK (certainty IS NULL OR certainty IN ('not_considered','preference','proposed','client_approved')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rsi_technical_status_check') THEN
    ALTER TABLE public.room_scope_items ADD CONSTRAINT rsi_technical_status_check
      CHECK (technical_status IS NULL OR technical_status IN ('not_required','needs_verification','verified')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rsi_pricing_status_check') THEN
    ALTER TABLE public.room_scope_items ADD CONSTRAINT rsi_pricing_status_check
      CHECK (pricing_status IS NULL OR pricing_status IN ('not_reviewed','allowance_or_estimate','quoted_or_confirmed')) NOT VALID;
  END IF;
END $$;

-- D-020 (P0 — FAIL CLOSED): 212 shipped room_scope_items with only the permissive auth_internal
-- policy, so a portal client holding a real `authenticated` JWT could read it straight through
-- PostgREST. Add the same RESTRICTIVE staff-only policy migration 104 applies to every other RLS
-- table. If auth_is_staff() is absent (migration 104 not applied) this migration ABORTS rather than
-- succeeding with room_scope_items left client-readable — there must be no window where the internal
-- scope store is exposed. Apply 104 first, then re-run 213.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'auth_is_staff') THEN
    RAISE EXCEPTION 'register R03: public.auth_is_staff() is missing — apply migration 104 before 213. Aborting so room_scope_items is never left readable by client JWTs.';
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS deny_clients ON public.room_scope_items';
  EXECUTE 'CREATE POLICY deny_clients ON public.room_scope_items AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff())';
  -- Independently assert the restrictive policy is now present before the migration proceeds.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'room_scope_items' AND policyname = 'deny_clients' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'register R03: deny_clients RESTRICTIVE policy was not created on room_scope_items — aborting.';
  END IF;
END $$;


-- ─── C. projects.register_meta ──────────────────────────────────────────────────────────────────
-- {rev, planRev, occupancy, renovationOverlay, scopeAreas[], rooms[{id,level,name,roomType,scope,order,sheet}],
--  lastRoomId, lastStep, promotion:{status, at, leadId, selections, scopeItems}}. NULL = not promoted yet.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS register_meta jsonb;


-- ─── D. delivery_model — commercial delivery, separate from physical project_type ──────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS delivery_model text;
ALTER TABLE public.jobs  ADD COLUMN IF NOT EXISTS delivery_model text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_delivery_model_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_delivery_model_check
      CHECK (delivery_model IS NULL OR delivery_model IN ('design_build','build_only','construction_management','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_delivery_model_check') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_delivery_model_check
      CHECK (delivery_model IS NULL OR delivery_model IN ('design_build','build_only','construction_management','other'));
  END IF;
END $$;

-- One-time backfill from the R02 register meta (meta.deliveryModel, 'cm' = construction management).
-- R02 was never deployed, so on production this is expected to touch 0 rows. Idempotent.
UPDATE public.leads l
   SET delivery_model = CASE m.dm WHEN 'cm' THEN 'construction_management' ELSE m.dm END
  FROM (
    SELECT l2.id, e->>'deliveryModel' AS dm
      FROM public.leads l2,
           jsonb_array_elements(CASE WHEN jsonb_typeof(l2.selections_schedule) = 'array' THEN l2.selections_schedule ELSE '[]'::jsonb END) e
     WHERE e->>'kind' = 'meta' AND COALESCE(e->>'deliveryModel', '') <> ''
  ) m
 WHERE l.id = m.id AND l.delivery_model IS NULL
   AND m.dm IN ('cm','design_build','build_only','construction_management','other');


-- ─── E. lead_documents — immutable issue registry + received-document metadata ─────────────────
ALTER TABLE public.lead_documents
  ADD COLUMN IF NOT EXISTS version                integer,
  ADD COLUMN IF NOT EXISTS status                 text,
  ADD COLUMN IF NOT EXISTS supersedes_document_id uuid REFERENCES public.lead_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_sha256         text,
  ADD COLUMN IF NOT EXISTS revision_label         text,
  ADD COLUMN IF NOT EXISTS template_key           text,
  ADD COLUMN IF NOT EXISTS template_version       text,
  ADD COLUMN IF NOT EXISTS source_snapshot        jsonb,      -- the exact payload + register versions the PDF was rendered from
  ADD COLUMN IF NOT EXISTS issued_at              timestamptz, -- NOT NULL ⇒ an immutable issued record
  ADD COLUMN IF NOT EXISTS issued_by              uuid,
  ADD COLUMN IF NOT EXISTS issued_by_name         text,
  ADD COLUMN IF NOT EXISTS recipient_name         text,
  ADD COLUMN IF NOT EXISTS recipient_email        text,
  ADD COLUMN IF NOT EXISTS audience               text,
  ADD COLUMN IF NOT EXISTS job_id                 uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id             uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  -- received consultant / supplier documents (the original PDF is kept intact; staff reconcile manually)
  ADD COLUMN IF NOT EXISTS discipline             text,       -- architect / routleys / tli / windows / engineer / energy / other
  ADD COLUMN IF NOT EXISTS issuer                 text,
  ADD COLUMN IF NOT EXISTS doc_number             text,
  ADD COLUMN IF NOT EXISTS received_at            date,
  ADD COLUMN IF NOT EXISTS review_status          text,       -- received / under_review / reconciled / superseded
  ADD COLUMN IF NOT EXISTS review_notes           text,
  ADD COLUMN IF NOT EXISTS outstanding_question   text,
  ADD COLUMN IF NOT EXISTS register_item_ids      text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_documents_issue_status_check') THEN
    ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_issue_status_check
      CHECK (status IS NULL OR status IN ('current','superseded'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_documents_review_status_check') THEN
    ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_review_status_check
      CHECK (review_status IS NULL OR review_status IN ('received','under_review','reconciled','superseded'));
  END IF;
END $$;

-- document_type: add the register outputs + received coordination documents (name-agnostic swap, as 194).
-- P1 (Tab 25 issue 7): the replacement CHECK is NOT marked NOT VALID, so it validates every existing row
-- at apply time. Before swapping it, assert every DISTINCT existing document_type is covered by the new
-- allowed list and ABORT with the offending values named if not — the migration can never fail mid-apply
-- on live data, and the fix (widen the list or reconcile the data) is explicit. Run the read-only
-- preflight in docs/master_register/RELEASE_BLOCKER_REVIEW.md on production first.
DO $$
DECLARE c text; v_bad text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'lead_documents' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%document_type%'
  LOOP EXECUTE format('ALTER TABLE public.lead_documents DROP CONSTRAINT %I', c); END LOOP;

  SELECT string_agg(DISTINCT document_type, ', ') INTO v_bad
  FROM public.lead_documents
  WHERE document_type IS NOT NULL AND document_type NOT IN (
    'brief','blueprint','survey','quote','contract','ptsa_signed',
    'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other',
    'client_brief','architect_brief','selections_schedule','register_baseline',
    'consultant_document','supplier_document');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'register R03: existing lead_documents.document_type values are not in the new allowed list: % — widen the CHECK list in migration 213 or reconcile the data before applying.', v_bad;
  END IF;
END $$;
ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_document_type_check
  CHECK (document_type IN (
    'brief','blueprint','survey','quote','contract','ptsa_signed',
    'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other',
    'client_brief','architect_brief','selections_schedule','register_baseline',
    'consultant_document','supplier_document'
  ));

-- One CURRENT issued revision per lead + document type; revision numbers unique per type.
CREATE UNIQUE INDEX IF NOT EXISTS lead_documents_one_current_issue
  ON public.lead_documents (lead_id, document_type) WHERE issued_at IS NOT NULL AND status = 'current';
CREATE UNIQUE INDEX IF NOT EXISTS lead_documents_issue_version_uq
  ON public.lead_documents (lead_id, document_type, version) WHERE issued_at IS NOT NULL;

-- Immutability: an issued row's identity, file and snapshot can never change, and it can never be
-- deleted directly (a cascade from deleting the whole lead is still allowed — pg_trigger_depth > 1).
-- Only status (current→superseded), project/job links and review fields may be updated.
CREATE OR REPLACE FUNCTION public.lead_documents_issue_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.issued_at IS NOT NULL AND pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'Issued document % is immutable and cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.issued_at IS NOT NULL AND (
       NEW.storage_path     IS DISTINCT FROM OLD.storage_path
    OR NEW.filename         IS DISTINCT FROM OLD.filename
    OR NEW.content_sha256   IS DISTINCT FROM OLD.content_sha256
    OR NEW.source_snapshot  IS DISTINCT FROM OLD.source_snapshot
    OR NEW.version          IS DISTINCT FROM OLD.version
    OR NEW.revision_label   IS DISTINCT FROM OLD.revision_label
    OR NEW.issued_at        IS DISTINCT FROM OLD.issued_at
    OR NEW.document_type    IS DISTINCT FROM OLD.document_type
    OR NEW.lead_id          IS DISTINCT FROM OLD.lead_id
    OR NEW.template_key     IS DISTINCT FROM OLD.template_key
    OR NEW.template_version IS DISTINCT FROM OLD.template_version
    OR NEW.recipient_name   IS DISTINCT FROM OLD.recipient_name
    OR NEW.recipient_email  IS DISTINCT FROM OLD.recipient_email
    OR (OLD.status = 'superseded' AND NEW.status IS DISTINCT FROM OLD.status)
  ) THEN
    RAISE EXCEPTION 'Issued document % is immutable', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_documents_issue_guard ON public.lead_documents;
CREATE TRIGGER trg_lead_documents_issue_guard
  BEFORE UPDATE OR DELETE ON public.lead_documents
  FOR EACH ROW EXECUTE FUNCTION public.lead_documents_issue_guard();


-- ─── F. Row-version triggers ────────────────────────────────────────────────────────────────────
-- Every UPDATE (staff register, portal client choice, admin board, nightly overdue sweep) stamps a fresh
-- updated_at, which is the optimistic-concurrency version register_apply checks.
CREATE OR REPLACE FUNCTION public.register_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_csel_touch_updated_at ON public.client_selections;
CREATE TRIGGER trg_csel_touch_updated_at BEFORE UPDATE ON public.client_selections
  FOR EACH ROW EXECUTE FUNCTION public.register_touch_updated_at();
DROP TRIGGER IF EXISTS trg_rsi_touch_updated_at ON public.room_scope_items;
CREATE TRIGGER trg_rsi_touch_updated_at BEFORE UPDATE ON public.room_scope_items
  FOR EACH ROW EXECUTE FUNCTION public.register_touch_updated_at();


-- ─── G. Functions ───────────────────────────────────────────────────────────────────────────────

-- Shallow diff of two row snapshots → {column: {from, to}} (timestamps ignored). Used for history.
CREATE OR REPLACE FUNCTION public.register_jsonb_diff(a jsonb, b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('from', a -> k, 'to', b -> k)), '{}'::jsonb)
    FROM (SELECT jsonb_object_keys(COALESCE(a, '{}'::jsonb)) AS k
          UNION SELECT jsonb_object_keys(COALESCE(b, '{}'::jsonb))) keys
   WHERE k NOT IN ('updated_at', 'created_at') AND (a -> k) IS DISTINCT FROM (b -> k);
$$;

-- The ONE writer of register data on a project (JS service: server/lib/registerStore.mjs).
--
-- p_ops is an array of operations computed by the service:
--   {op:'meta_init', meta}                                  (promote-only) seed the initial register_meta exactly once
--   {op:'meta_set',  meta, base_rev}                       replace register_meta (rev-checked; room renames propagate)
--   {op:'sel_insert'|'scope_insert', item_id, row}           create (promote mode: ON CONFLICT DO NOTHING)
--   {op:'sel_update'|'scope_update', item_id, row_id, base_version, row}
--   {op:'sel_delete'|'scope_delete', item_id, row_id, base_version}
--   {op:'sel_issue'|'sel_withdraw'|'sel_return', item_id, row_id, base_version, note}
-- p_mode = 'edit' (default) | 'promote' (one-time, insert-if-absent, no-op if already promoted).
--
-- Two passes: PASS 1 locks every touched row and validates versions + business guards, collecting
-- conflicts; if any, NOTHING is written and {ok:false, conflicts} is returned. PASS 2 applies all ops.
-- Any SQL error in pass 2 aborts the whole call (one transaction) — there is no partial write.
-- Guards (D-028/D-030/D-041 + Tab 23):
--   • an issued (client_visible) selection can't be deleted or moved to the scope store — withdraw first;
--   • an approved/ordered/installed selection is locked after contract (variation path), ordered/installed always;
--   • client_approved needs approval evidence {at, by}; technical 'verified' needs technical evidence;
--   • register writes never touch portal/finance-owned columns (client_notes, cost_impact, allowance_amount,
--     due dates, attachments, linked_variation_id, client_visible except via issue/withdraw).
CREATE OR REPLACE FUNCTION public.register_apply(
  p_project_id uuid,
  p_lead_id    uuid,
  p_ops        jsonb,
  p_actor      jsonb DEFAULT '{}'::jsonb,
  p_mode       text  DEFAULT 'edit'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_proj        record;
  v_actor_id    uuid;
  v_actor_name  text := COALESCE(p_actor ->> 'name', '');
  v_post        boolean;                 -- post-contract (the project is a live Ops project)
  v_op          jsonb;
  v_kind        text;
  v_item        text;
  v_row         jsonb;
  v_sel         public.client_selections%ROWTYPE;
  v_new         public.client_selections%ROWTYPE;
  v_rsi         public.room_scope_items%ROWTYPE;
  v_rnew        public.room_scope_items%ROWTYPE;
  v_conflicts   jsonb := '[]'::jsonb;
  v_results     jsonb := '[]'::jsonb;
  v_deleting    text[] := '{}';
  v_status      text;
  v_cert        text;
  v_ev          jsonb;
  v_tev         jsonb;
  v_meta        jsonb;
  v_n_sel       integer := 0;
  v_n_rsi       integer := 0;
  v_rows        integer;
  v_locked      boolean;
  v_changed     boolean;
  v_was_approved boolean;
  v_was_verified boolean;
  v_prod_changed boolean;
BEGIN
  IF p_mode NOT IN ('edit', 'promote') THEN RAISE EXCEPTION 'register_apply: bad mode %', p_mode; END IF;
  IF jsonb_typeof(COALESCE(p_ops, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'register_apply: p_ops must be an array'; END IF;

  SELECT id, job_id, COALESCE(is_preconstruction, false) AS is_pre, register_meta
    INTO v_proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'register_apply: project % not found', p_project_id; END IF;
  v_post := NOT v_proj.is_pre;

  -- A real staff user id or NULL (FK to auth.users) — never a dangling id. Checked against the staff
  -- profile (one row per auth user) because an invoker function can't read auth.users; the FK itself is
  -- enforced by Postgres regardless of the caller's privileges.
  IF COALESCE(p_actor ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT up.id INTO v_actor_id FROM public.user_profiles up WHERE up.id = (p_actor ->> 'id')::uuid;
  END IF;

  IF p_mode = 'promote' AND v_proj.register_meta IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_promoted', true, 'results', '[]'::jsonb);
  END IF;

  -- Items whose current row is deleted in this same call (a reclassification = delete + insert).
  SELECT COALESCE(array_agg(o ->> 'item_id'), '{}') INTO v_deleting
    FROM jsonb_array_elements(COALESCE(p_ops, '[]'::jsonb)) o
   WHERE o ->> 'op' IN ('sel_delete', 'scope_delete');

  -- ═══ PASS 1 — lock + validate; nothing is written ════════════════════════════════════════════
  FOR v_op IN SELECT * FROM jsonb_array_elements(COALESCE(p_ops, '[]'::jsonb)) LOOP
    v_kind := v_op ->> 'op';
    v_item := v_op ->> 'item_id';
    v_row  := COALESCE(v_op -> 'row', '{}'::jsonb);
    v_ev   := NULLIF(v_row -> 'approval_evidence', 'null'::jsonb);
    v_tev  := NULLIF(v_row -> 'technical_evidence', 'null'::jsonb);

    IF v_kind = 'meta_init' THEN
      IF p_mode <> 'promote' THEN RAISE EXCEPTION 'register_apply: meta_init is promote-only'; END IF;
      CONTINUE;
    END IF;

    IF v_kind = 'meta_set' THEN
      IF v_proj.register_meta IS NOT NULL
         AND COALESCE((v_proj.register_meta ->> 'rev')::int, 0) <> COALESCE(NULLIF(v_op ->> 'base_rev', '')::int, -1) THEN
        v_conflicts := v_conflicts || jsonb_build_object('item_id', '__meta__', 'reason', 'meta_stale',
                         'current', v_proj.register_meta);
      END IF;
      CONTINUE;
    END IF;

    IF v_kind IN ('sel_insert', 'scope_insert') THEN
      -- The evidence/verification guards apply only when STAFF CREATE a new already-approved/verified
      -- item in the office (edit mode). They must NOT apply to PROMOTION, which mechanically copies the
      -- lead's already-captured items into the project once: a single unevidenced approval in the
      -- scratchpad must never block (and silently strand) the whole promotion — it is copied forward,
      -- surfaced as a flagged item, and still blocked at document issue, where evidence actually matters.
      IF p_mode = 'edit' THEN
        IF v_row ->> 'certainty' = 'client_approved'
           AND (v_ev IS NULL OR COALESCE(v_ev ->> 'at', '') = '' OR COALESCE(v_ev ->> 'by', '') = '') THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'evidence_required');
        END IF;
        IF v_row ->> 'technical_status' = 'verified'
           AND (v_tev IS NULL OR COALESCE(v_tev ->> 'at', '') = '' OR COALESCE(v_tev ->> 'ref', '') = '') THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'technical_evidence_required');
        END IF;
        IF EXISTS (SELECT 1 FROM public.client_selections WHERE project_id = p_project_id AND source_register_item_id = v_item)
           AND NOT (v_kind = 'scope_insert' AND v_item = ANY (v_deleting)) THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'exists');
        END IF;
        IF EXISTS (SELECT 1 FROM public.room_scope_items WHERE project_id = p_project_id AND source_register_item_id = v_item)
           AND NOT (v_kind = 'sel_insert' AND v_item = ANY (v_deleting)) THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'exists');
        END IF;
      END IF;
      CONTINUE;
    END IF;

    IF v_kind IN ('sel_update', 'sel_delete', 'sel_issue', 'sel_withdraw', 'sel_return') THEN
      SELECT * INTO v_sel FROM public.client_selections
       WHERE id = NULLIF(v_op ->> 'row_id', '')::uuid AND project_id = p_project_id FOR UPDATE;
      IF NOT FOUND THEN
        v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'missing');
        CONTINUE;
      END IF;
      IF v_sel.updated_at IS DISTINCT FROM NULLIF(v_op ->> 'base_version', '')::timestamptz THEN
        v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'stale',
                         'current', to_jsonb(v_sel) - 'internal_notes');
        CONTINUE;
      END IF;
      v_was_approved := v_sel.status IN ('approved', 'ordered', 'installed');
      -- ordered/installed are always locked; an approval is locked once the contract is signed.
      v_locked := v_sel.status IN ('ordered', 'installed') OR (v_post AND v_sel.status = 'approved');

      IF v_kind = 'sel_delete' THEN
        IF v_sel.client_visible THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'issued_locked');
        ELSIF v_locked THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'post_contract_locked');
        END IF;
      ELSIF v_kind = 'sel_update' THEN
        IF v_row ->> 'certainty' = 'client_approved' AND NOT v_was_approved
           AND (v_ev IS NULL OR COALESCE(v_ev ->> 'at', '') = '' OR COALESCE(v_ev ->> 'by', '') = '') THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'evidence_required');
        END IF;
        IF v_row ->> 'technical_status' = 'verified' AND v_sel.technical_status IS DISTINCT FROM 'verified'
           AND (v_tev IS NULL OR COALESCE(v_tev ->> 'at', '') = '' OR COALESCE(v_tev ->> 'ref', '') = '') THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'technical_evidence_required');
        END IF;
        v_changed :=
             NULLIF(v_row ->> 'selected_product', '')    IS DISTINCT FROM NULLIF(v_sel.selected_product, '')
          OR NULLIF(v_row ->> 'selected_model_code', '') IS DISTINCT FROM NULLIF(v_sel.selected_model_code, '')
          OR NULLIF(v_row ->> 'selected_supplier', '')   IS DISTINCT FROM NULLIF(v_sel.selected_supplier, '')
          OR NULLIF(v_row ->> 'finish', '')              IS DISTINCT FROM NULLIF(v_sel.finish, '')
          OR NULLIF(v_row ->> 'manufacturer', '')        IS DISTINCT FROM NULLIF(v_sel.manufacturer, '')
          OR NULLIF(v_row ->> 'item_name', '')           IS DISTINCT FROM NULLIF(v_sel.item_name, '')
          OR NULLIF(v_row ->> 'quantity', '')::numeric   IS DISTINCT FROM v_sel.quantity
          OR NULLIF(v_row ->> 'disposition', '')         IS DISTINCT FROM NULLIF(v_sel.disposition, '')
          OR (v_was_approved AND v_row ->> 'certainty' IS DISTINCT FROM 'client_approved');
        IF v_locked AND v_changed THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'post_contract_locked');
        END IF;
        -- An approval covers a specific product: changing it while keeping "client_approved" needs a NEW
        -- approval (fresh evidence) — otherwise the item must step back to proposed (Tab 18 §7).
        v_prod_changed :=
             NULLIF(v_row ->> 'selected_product', '')    IS DISTINCT FROM NULLIF(v_sel.selected_product, '')
          OR NULLIF(v_row ->> 'selected_model_code', '') IS DISTINCT FROM NULLIF(v_sel.selected_model_code, '')
          OR NULLIF(v_row ->> 'selected_supplier', '')   IS DISTINCT FROM NULLIF(v_sel.selected_supplier, '')
          OR NULLIF(v_row ->> 'finish', '')              IS DISTINCT FROM NULLIF(v_sel.finish, '')
          OR NULLIF(v_row ->> 'manufacturer', '')        IS DISTINCT FROM NULLIF(v_sel.manufacturer, '');
        IF NOT v_locked AND v_was_approved AND v_prod_changed AND v_row ->> 'certainty' = 'client_approved'
           AND (v_ev IS NULL OR v_ev IS NOT DISTINCT FROM v_sel.approval_evidence OR COALESCE(v_ev ->> 'method', '') = 'board') THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'reapproval_required');
        END IF;
      ELSIF v_kind = 'sel_withdraw' THEN
        IF v_was_approved THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'approved_locked');
        END IF;
      ELSIF v_kind = 'sel_return' THEN
        IF v_sel.status <> 'in_review' THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'not_in_review');
        END IF;
      END IF;
      CONTINUE;
    END IF;

    IF v_kind IN ('scope_update', 'scope_delete') THEN
      SELECT * INTO v_rsi FROM public.room_scope_items
       WHERE id = NULLIF(v_op ->> 'row_id', '')::uuid AND project_id = p_project_id FOR UPDATE;
      IF NOT FOUND THEN
        v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'missing');
        CONTINUE;
      END IF;
      IF v_rsi.updated_at IS DISTINCT FROM NULLIF(v_op ->> 'base_version', '')::timestamptz THEN
        v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'stale', 'current', to_jsonb(v_rsi));
        CONTINUE;
      END IF;
      -- P0: a scope/requirement row captured in a signed contract baseline is protected. Deleting it,
      -- or substantively changing it (description, disposition, kind, category, measured quantity), needs
      -- an explicit variation reference (v_op->>'variation_ref'). Clerical fields — owner, next action,
      -- technical/pricing status and refs, source, supplier, notes — stay editable for site coordination.
      IF v_rsi.baselined_at IS NOT NULL AND COALESCE(NULLIF(v_op ->> 'variation_ref', ''), '') = '' THEN
        IF v_kind = 'scope_delete'
           OR NULLIF(v_row ->> 'description', '')  IS DISTINCT FROM NULLIF(v_rsi.description, '')
           OR NULLIF(v_row ->> 'disposition', '')  IS DISTINCT FROM NULLIF(v_rsi.disposition, '')
           OR NULLIF(v_row ->> 'item_kind', '')    IS DISTINCT FROM NULLIF(v_rsi.item_kind, '')
           OR NULLIF(v_row ->> 'category', '')     IS DISTINCT FROM NULLIF(v_rsi.category, '')
           OR NULLIF(v_row ->> 'quantity', '')::numeric IS DISTINCT FROM v_rsi.quantity THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'baseline_locked');
          CONTINUE;
        END IF;
      END IF;
      IF v_kind = 'scope_update' THEN
        IF v_row ->> 'certainty' = 'client_approved' AND v_rsi.certainty IS DISTINCT FROM 'client_approved'
           AND (v_ev IS NULL OR COALESCE(v_ev ->> 'at', '') = '' OR COALESCE(v_ev ->> 'by', '') = '') THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'evidence_required');
        END IF;
        IF v_row ->> 'technical_status' = 'verified' AND v_rsi.technical_status IS DISTINCT FROM 'verified'
           AND (v_tev IS NULL OR COALESCE(v_tev ->> 'at', '') = '' OR COALESCE(v_tev ->> 'ref', '') = '') THEN
          v_conflicts := v_conflicts || jsonb_build_object('item_id', v_item, 'reason', 'technical_evidence_required');
        END IF;
      END IF;
      CONTINUE;
    END IF;

    RAISE EXCEPTION 'register_apply: unknown op %', v_kind;
  END LOOP;

  IF jsonb_array_length(v_conflicts) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'conflicts', v_conflicts);
  END IF;

  -- ═══ PASS 2 — apply (deletes first so a reclassification's insert never collides) ════════════
  FOR v_op IN
    SELECT o FROM jsonb_array_elements(COALESCE(p_ops, '[]'::jsonb)) WITH ORDINALITY AS t(o, i)
     ORDER BY CASE WHEN o ->> 'op' IN ('sel_delete', 'scope_delete') THEN 0 ELSE 1 END, i
  LOOP
    v_kind := v_op ->> 'op';
    v_item := v_op ->> 'item_id';
    v_row  := COALESCE(v_op -> 'row', '{}'::jsonb);
    v_ev   := NULLIF(v_row -> 'approval_evidence', 'null'::jsonb);
    v_tev  := NULLIF(v_row -> 'technical_evidence', 'null'::jsonb);

    IF v_kind = 'meta_init' THEN CONTINUE; END IF;          -- applied after the loop (promote mode)

    IF v_kind = 'meta_set' THEN
      v_meta := COALESCE(v_op -> 'meta', '{}'::jsonb) - 'promotion' - 'rev';
      UPDATE public.projects
         SET register_meta = v_meta
               || jsonb_build_object('rev', COALESCE((register_meta ->> 'rev')::int, 0) + 1)
               || CASE WHEN register_meta ? 'promotion' THEN jsonb_build_object('promotion', register_meta -> 'promotion') ELSE '{}'::jsonb END
       WHERE id = p_project_id;
      -- A room rename flows to every item in that room (a label only — identity is source_room_id).
      UPDATE public.client_selections cs SET room_area = r.name
        FROM jsonb_to_recordset(COALESCE(v_meta -> 'rooms', '[]'::jsonb)) AS r(id text, name text)
       WHERE cs.project_id = p_project_id AND cs.source_room_id = r.id AND cs.room_area IS DISTINCT FROM r.name;
      UPDATE public.room_scope_items ri SET room_area = r.name
        FROM jsonb_to_recordset(COALESCE(v_meta -> 'rooms', '[]'::jsonb)) AS r(id text, name text)
       WHERE ri.project_id = p_project_id AND ri.source_room_id = r.id AND ri.room_area IS DISTINCT FROM r.name;
      v_results := v_results || jsonb_build_object('item_id', '__meta__', 'op', v_kind);
      CONTINUE;
    END IF;

    -- ── client_selections ──────────────────────────────────────────────────────────────────────
    IF v_kind = 'sel_insert' THEN
      v_cert := NULLIF(v_row ->> 'certainty', '');
      INSERT INTO public.client_selections (
        project_id, source_register_item_id, source_lead_id, promoted_at, client_visible, status,
        category, item_name, room_area, selected_product, selected_model_code, selected_supplier,
        finish, manufacturer, certainty, disposition, technical_status, technical_evidence,
        pricing_status, pricing_ref, responsibility, supply_by, quantity, quantity_unit,
        source_ref, source_doc_id, next_action, source_room_id, register_detail, internal_notes,
        approved_at, approved_by_user_id, approval_evidence, sort_order)
      VALUES (
        p_project_id, v_item, p_lead_id, CASE WHEN p_mode = 'promote' THEN now() END, false,
        CASE WHEN v_cert = 'client_approved' THEN 'approved' ELSE 'not_started' END,
        COALESCE(NULLIF(v_row ->> 'category', ''), 'Selection'),
        COALESCE(NULLIF(v_row ->> 'item_name', ''), 'Selection'),
        NULLIF(v_row ->> 'room_area', ''), NULLIF(v_row ->> 'selected_product', ''),
        NULLIF(v_row ->> 'selected_model_code', ''), NULLIF(v_row ->> 'selected_supplier', ''),
        NULLIF(v_row ->> 'finish', ''), NULLIF(v_row ->> 'manufacturer', ''), v_cert, NULLIF(v_row ->> 'disposition', ''),
        NULLIF(v_row ->> 'technical_status', ''), v_tev, NULLIF(v_row ->> 'pricing_status', ''), NULLIF(v_row ->> 'pricing_ref', ''),
        NULLIF(v_row ->> 'responsibility', ''), NULLIF(v_row ->> 'supply_by', ''),
        NULLIF(v_row ->> 'quantity', '')::numeric, NULLIF(v_row ->> 'quantity_unit', ''),
        NULLIF(v_row ->> 'source_ref', ''), NULLIF(v_row ->> 'source_doc_id', '')::uuid,
        NULLIF(v_row ->> 'next_action', ''), NULLIF(v_row ->> 'source_room_id', ''),
        COALESCE(NULLIF(v_row -> 'register_detail', 'null'::jsonb), '{}'::jsonb), NULLIF(v_row ->> 'internal_notes', ''),
        CASE WHEN v_cert = 'client_approved' THEN COALESCE(NULLIF(v_ev ->> 'at', '')::timestamptz, now()) END,
        CASE WHEN v_cert = 'client_approved' THEN v_actor_id END,
        CASE WHEN v_cert = 'client_approved' THEN v_ev END,
        COALESCE(NULLIF(v_row ->> 'sort_order', '')::int, 0))
      ON CONFLICT (project_id, source_register_item_id) DO NOTHING
      RETURNING * INTO v_new;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        IF p_mode = 'edit' THEN RAISE EXCEPTION 'REGISTER_CONFLICT exists %', v_item; END IF;
        CONTINUE;                                               -- promote: already there, never clobbered
      END IF;
      v_n_sel := v_n_sel + 1;
      INSERT INTO public.job_events (job_id, event_type, actor_id, source, entity_type, entity_id, metadata)
      VALUES (v_proj.job_id, CASE WHEN p_mode = 'promote' THEN 'register.item.promoted' ELSE 'register.item.created' END,
              v_actor_id, 'register', 'client_selection', v_new.id,
              jsonb_build_object('item_id', v_item, 'lead_id', p_lead_id, 'project_id', p_project_id, 'store', 'client_selections',
                                 'actor_name', v_actor_name, 'post_contract', v_post, 'after', to_jsonb(v_new) - 'internal_notes'));
      v_results := v_results || jsonb_build_object('item_id', v_item, 'op', v_kind, 'table', 'client_selections',
                     'row_id', v_new.id, 'version', v_new.updated_at, 'status', v_new.status, 'client_visible', v_new.client_visible);
      CONTINUE;
    END IF;

    IF v_kind IN ('sel_update', 'sel_delete', 'sel_issue', 'sel_withdraw', 'sel_return') THEN
      SELECT * INTO v_sel FROM public.client_selections WHERE id = (v_op ->> 'row_id')::uuid AND project_id = p_project_id;

      IF v_kind = 'sel_delete' THEN
        DELETE FROM public.client_selections WHERE id = v_sel.id;
        INSERT INTO public.job_events (job_id, event_type, actor_id, source, entity_type, entity_id, metadata)
        VALUES (v_proj.job_id, 'register.item.deleted', v_actor_id, 'register', 'client_selection', v_sel.id,
                jsonb_build_object('item_id', v_item, 'lead_id', p_lead_id, 'project_id', p_project_id, 'store', 'client_selections',
                                   'actor_name', v_actor_name, 'post_contract', v_post, 'before', to_jsonb(v_sel) - 'internal_notes'));
        v_results := v_results || jsonb_build_object('item_id', v_item, 'op', v_kind, 'table', 'client_selections', 'row_id', v_sel.id);
        CONTINUE;
      END IF;

      IF v_kind = 'sel_update' THEN
        v_cert := NULLIF(v_row ->> 'certainty', '');
        v_was_approved := v_sel.status IN ('approved', 'ordered', 'installed');
        v_status := v_sel.status;
        IF v_cert = 'client_approved' THEN
          IF NOT v_was_approved THEN v_status := 'approved'; END IF;
        ELSIF v_sel.status = 'approved' THEN
          -- staff stepping an approval back (pre-contract only — guarded in pass 1)
          v_status := CASE WHEN v_sel.client_visible THEN 'awaiting_client' ELSE 'not_started' END;
        END IF;
        UPDATE public.client_selections SET
          category            = COALESCE(NULLIF(v_row ->> 'category', ''), category),
          item_name           = COALESCE(NULLIF(v_row ->> 'item_name', ''), item_name),
          room_area           = NULLIF(v_row ->> 'room_area', ''),
          selected_product    = NULLIF(v_row ->> 'selected_product', ''),
          selected_model_code = NULLIF(v_row ->> 'selected_model_code', ''),
          selected_supplier   = NULLIF(v_row ->> 'selected_supplier', ''),
          finish              = NULLIF(v_row ->> 'finish', ''),
          manufacturer        = NULLIF(v_row ->> 'manufacturer', ''),
          certainty           = v_cert,
          disposition         = NULLIF(v_row ->> 'disposition', ''),
          technical_status    = NULLIF(v_row ->> 'technical_status', ''),
          technical_evidence  = CASE WHEN NULLIF(v_row ->> 'technical_status', '') = 'verified' THEN COALESCE(v_tev, technical_evidence) ELSE v_tev END,
          pricing_status      = NULLIF(v_row ->> 'pricing_status', ''),
          pricing_ref         = NULLIF(v_row ->> 'pricing_ref', ''),
          responsibility      = NULLIF(v_row ->> 'responsibility', ''),
          supply_by           = NULLIF(v_row ->> 'supply_by', ''),
          quantity            = NULLIF(v_row ->> 'quantity', '')::numeric,
          quantity_unit       = NULLIF(v_row ->> 'quantity_unit', ''),
          source_ref          = NULLIF(v_row ->> 'source_ref', ''),
          source_doc_id       = NULLIF(v_row ->> 'source_doc_id', '')::uuid,
          next_action         = NULLIF(v_row ->> 'next_action', ''),
          source_room_id      = NULLIF(v_row ->> 'source_room_id', ''),
          register_detail     = COALESCE(NULLIF(v_row -> 'register_detail', 'null'::jsonb), '{}'::jsonb),
          sort_order          = COALESCE(NULLIF(v_row ->> 'sort_order', '')::int, sort_order),
          status              = v_status,
          approved_at         = CASE WHEN v_status = 'approved' AND NOT v_was_approved
                                       THEN COALESCE(NULLIF(v_ev ->> 'at', '')::timestamptz, now())
                                     WHEN v_status IN ('approved', 'ordered', 'installed') THEN approved_at
                                     ELSE NULL END,
          approved_by_user_id = CASE WHEN v_status = 'approved' AND NOT v_was_approved THEN v_actor_id
                                     WHEN v_status IN ('approved', 'ordered', 'installed') THEN approved_by_user_id
                                     ELSE NULL END,
          approval_evidence   = CASE WHEN v_status IN ('approved', 'ordered', 'installed') THEN COALESCE(v_ev, approval_evidence) ELSE NULL END,
          source_register_item_id = COALESCE(source_register_item_id, v_item),  -- adopt a board-created row
          source_lead_id      = COALESCE(source_lead_id, p_lead_id)
        WHERE id = v_sel.id
        RETURNING * INTO v_new;
        -- An approval resolves the client's "Select …" task, exactly as the admin board does.
        IF v_new.status = 'approved' AND NOT v_was_approved THEN
          UPDATE public.client_actions SET status = 'completed', updated_at = now()
           WHERE project_id = p_project_id AND related_entity_type = 'client_selection' AND related_entity_id = v_new.id
             AND status IN ('pending', 'viewed', 'responded', 'overdue');
        END IF;
      ELSIF v_kind = 'sel_issue' THEN
        UPDATE public.client_selections SET
          client_visible = true,
          status = CASE WHEN status IN ('approved', 'ordered', 'installed', 'in_review') THEN status ELSE 'awaiting_client' END
        WHERE id = v_sel.id RETURNING * INTO v_new;
        IF v_new.status = 'awaiting_client' AND NOT EXISTS (
             SELECT 1 FROM public.client_actions WHERE project_id = p_project_id AND related_entity_type = 'client_selection'
                AND related_entity_id = v_new.id AND status IN ('pending', 'viewed', 'overdue')) THEN
          INSERT INTO public.client_actions (project_id, action_type, title, description, related_entity_type, related_entity_id, due_date, status)
          VALUES (p_project_id, 'selection_decision', 'Select ' || v_new.item_name, v_new.category, 'client_selection', v_new.id, v_new.due_date, 'pending');
        END IF;
      ELSIF v_kind = 'sel_withdraw' THEN
        UPDATE public.client_selections SET
          client_visible = false,
          status = CASE WHEN status IN ('awaiting_client', 'in_review', 'overdue') THEN 'not_started' ELSE status END
        WHERE id = v_sel.id RETURNING * INTO v_new;
        DELETE FROM public.client_actions
         WHERE project_id = p_project_id AND related_entity_type = 'client_selection' AND related_entity_id = v_new.id
           AND status IN ('pending', 'viewed', 'overdue');
      ELSIF v_kind = 'sel_return' THEN
        UPDATE public.client_selections SET status = 'awaiting_client' WHERE id = v_sel.id RETURNING * INTO v_new;
        UPDATE public.client_actions SET status = 'pending', updated_at = now()
         WHERE project_id = p_project_id AND related_entity_type = 'client_selection' AND related_entity_id = v_new.id
           AND status = 'responded';
      END IF;

      INSERT INTO public.job_events (job_id, event_type, actor_id, source, entity_type, entity_id, metadata)
      VALUES (v_proj.job_id,
              CASE v_kind WHEN 'sel_update' THEN 'register.item.updated' WHEN 'sel_issue' THEN 'register.item.issued'
                          WHEN 'sel_withdraw' THEN 'register.item.withdrawn' ELSE 'register.item.returned' END,
              v_actor_id, 'register', 'client_selection', v_new.id,
              jsonb_build_object('item_id', v_item, 'lead_id', p_lead_id, 'project_id', p_project_id, 'store', 'client_selections',
                                 'actor_name', v_actor_name, 'post_contract', v_post, 'note', v_op ->> 'note',
                                 'changes', public.register_jsonb_diff(to_jsonb(v_sel) - 'internal_notes', to_jsonb(v_new) - 'internal_notes')));
      v_results := v_results || jsonb_build_object('item_id', v_item, 'op', v_kind, 'table', 'client_selections',
                     'row_id', v_new.id, 'version', v_new.updated_at, 'status', v_new.status, 'client_visible', v_new.client_visible);
      CONTINUE;
    END IF;

    -- ── room_scope_items ───────────────────────────────────────────────────────────────────────
    IF v_kind = 'scope_insert' THEN
      INSERT INTO public.room_scope_items (
        project_id, source_register_item_id, source_lead_id, promoted_at, room_area, category, item_kind,
        disposition, certainty, responsibility, description, product, model, colour, source_ref, next_action,
        notes, sort_order, technical_status, technical_evidence, pricing_status, pricing_ref, approval_evidence,
        supply_by, manufacturer, supplier, quantity, quantity_unit, source_doc_id, source_room_id, register_detail)
      VALUES (
        p_project_id, v_item, p_lead_id, CASE WHEN p_mode = 'promote' THEN now() ELSE NULL END,
        NULLIF(v_row ->> 'room_area', ''), NULLIF(v_row ->> 'category', ''), COALESCE(NULLIF(v_row ->> 'item_kind', ''), 'scope'),
        NULLIF(v_row ->> 'disposition', ''), NULLIF(v_row ->> 'certainty', ''), NULLIF(v_row ->> 'responsibility', ''),
        NULLIF(v_row ->> 'description', ''), NULLIF(v_row ->> 'product', ''), NULLIF(v_row ->> 'model', ''),
        NULLIF(v_row ->> 'colour', ''), NULLIF(v_row ->> 'source_ref', ''), NULLIF(v_row ->> 'next_action', ''),
        NULLIF(v_row ->> 'notes', ''), COALESCE(NULLIF(v_row ->> 'sort_order', '')::int, 0),
        NULLIF(v_row ->> 'technical_status', ''), v_tev, NULLIF(v_row ->> 'pricing_status', ''), NULLIF(v_row ->> 'pricing_ref', ''),
        CASE WHEN v_row ->> 'certainty' = 'client_approved' THEN v_ev END,
        NULLIF(v_row ->> 'supply_by', ''), NULLIF(v_row ->> 'manufacturer', ''), NULLIF(v_row ->> 'supplier', ''),
        NULLIF(v_row ->> 'quantity', '')::numeric, NULLIF(v_row ->> 'quantity_unit', ''),
        NULLIF(v_row ->> 'source_doc_id', '')::uuid, NULLIF(v_row ->> 'source_room_id', ''),
        COALESCE(NULLIF(v_row -> 'register_detail', 'null'::jsonb), '{}'::jsonb))
      ON CONFLICT (project_id, source_register_item_id) DO NOTHING
      RETURNING * INTO v_rnew;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        IF p_mode = 'edit' THEN RAISE EXCEPTION 'REGISTER_CONFLICT exists %', v_item; END IF;
        CONTINUE;
      END IF;
      v_n_rsi := v_n_rsi + 1;
      INSERT INTO public.job_events (job_id, event_type, actor_id, source, entity_type, entity_id, metadata)
      VALUES (v_proj.job_id, CASE WHEN p_mode = 'promote' THEN 'register.item.promoted' ELSE 'register.item.created' END,
              v_actor_id, 'register', 'room_scope_item', v_rnew.id,
              jsonb_build_object('item_id', v_item, 'lead_id', p_lead_id, 'project_id', p_project_id, 'store', 'room_scope_items',
                                 'actor_name', v_actor_name, 'post_contract', v_post, 'after', to_jsonb(v_rnew)));
      v_results := v_results || jsonb_build_object('item_id', v_item, 'op', v_kind, 'table', 'room_scope_items',
                     'row_id', v_rnew.id, 'version', v_rnew.updated_at);
      CONTINUE;
    END IF;

    IF v_kind IN ('scope_update', 'scope_delete') THEN
      SELECT * INTO v_rsi FROM public.room_scope_items WHERE id = (v_op ->> 'row_id')::uuid AND project_id = p_project_id;
      IF v_kind = 'scope_delete' THEN
        DELETE FROM public.room_scope_items WHERE id = v_rsi.id;
        INSERT INTO public.job_events (job_id, event_type, actor_id, source, entity_type, entity_id, metadata)
        VALUES (v_proj.job_id, 'register.item.deleted', v_actor_id, 'register', 'room_scope_item', v_rsi.id,
                jsonb_build_object('item_id', v_item, 'lead_id', p_lead_id, 'project_id', p_project_id, 'store', 'room_scope_items',
                                   'actor_name', v_actor_name, 'post_contract', v_post, 'baselined', (v_rsi.baselined_at IS NOT NULL),
                                   'variation_ref', NULLIF(v_op ->> 'variation_ref', ''), 'before', to_jsonb(v_rsi)));
        v_results := v_results || jsonb_build_object('item_id', v_item, 'op', v_kind, 'table', 'room_scope_items', 'row_id', v_rsi.id);
        CONTINUE;
      END IF;
      v_was_verified := v_rsi.technical_status = 'verified';
      UPDATE public.room_scope_items SET
        room_area          = NULLIF(v_row ->> 'room_area', ''),
        category           = NULLIF(v_row ->> 'category', ''),
        item_kind          = COALESCE(NULLIF(v_row ->> 'item_kind', ''), item_kind),
        disposition        = NULLIF(v_row ->> 'disposition', ''),
        certainty          = NULLIF(v_row ->> 'certainty', ''),
        responsibility     = NULLIF(v_row ->> 'responsibility', ''),
        description        = NULLIF(v_row ->> 'description', ''),
        product            = NULLIF(v_row ->> 'product', ''),
        model              = NULLIF(v_row ->> 'model', ''),
        colour             = NULLIF(v_row ->> 'colour', ''),
        source_ref         = NULLIF(v_row ->> 'source_ref', ''),
        next_action        = NULLIF(v_row ->> 'next_action', ''),
        sort_order         = COALESCE(NULLIF(v_row ->> 'sort_order', '')::int, sort_order),
        technical_status   = NULLIF(v_row ->> 'technical_status', ''),
        technical_evidence = CASE WHEN NULLIF(v_row ->> 'technical_status', '') = 'verified' THEN COALESCE(v_tev, technical_evidence) ELSE v_tev END,
        pricing_status     = NULLIF(v_row ->> 'pricing_status', ''),
        pricing_ref        = NULLIF(v_row ->> 'pricing_ref', ''),
        approval_evidence  = CASE WHEN v_row ->> 'certainty' = 'client_approved' THEN COALESCE(v_ev, approval_evidence) ELSE NULL END,
        supply_by          = NULLIF(v_row ->> 'supply_by', ''),
        manufacturer       = NULLIF(v_row ->> 'manufacturer', ''),
        supplier           = NULLIF(v_row ->> 'supplier', ''),
        quantity           = NULLIF(v_row ->> 'quantity', '')::numeric,
        quantity_unit      = NULLIF(v_row ->> 'quantity_unit', ''),
        source_doc_id      = NULLIF(v_row ->> 'source_doc_id', '')::uuid,
        source_room_id     = NULLIF(v_row ->> 'source_room_id', ''),
        register_detail    = COALESCE(NULLIF(v_row -> 'register_detail', 'null'::jsonb), '{}'::jsonb)
      WHERE id = v_rsi.id
      RETURNING * INTO v_rnew;
      INSERT INTO public.job_events (job_id, event_type, actor_id, source, entity_type, entity_id, metadata)
      VALUES (v_proj.job_id, 'register.item.updated', v_actor_id, 'register', 'room_scope_item', v_rnew.id,
              jsonb_build_object('item_id', v_item, 'lead_id', p_lead_id, 'project_id', p_project_id, 'store', 'room_scope_items',
                                 'actor_name', v_actor_name, 'post_contract', v_post, 'baselined', (v_rsi.baselined_at IS NOT NULL),
                                 'variation_ref', NULLIF(v_op ->> 'variation_ref', ''),
                                 'changes', public.register_jsonb_diff(to_jsonb(v_rsi), to_jsonb(v_rnew))));
      v_results := v_results || jsonb_build_object('item_id', v_item, 'op', v_kind, 'table', 'room_scope_items',
                     'row_id', v_rnew.id, 'version', v_rnew.updated_at);
      CONTINUE;
    END IF;
  END LOOP;

  -- Promotion: initialise the canonical meta exactly once and record the outcome (observable).
  IF p_mode = 'promote' THEN
    SELECT o -> 'meta' INTO v_meta FROM jsonb_array_elements(COALESCE(p_ops, '[]'::jsonb)) o WHERE o ->> 'op' = 'meta_init' LIMIT 1;
    UPDATE public.projects
       SET register_meta = (COALESCE(v_meta, '{}'::jsonb) - 'promotion' - 'rev')
             || jsonb_build_object('rev', 1, 'promotion', jsonb_build_object(
                  'status', 'complete', 'at', now(), 'leadId', p_lead_id, 'selections', v_n_sel, 'scopeItems', v_n_rsi))
     WHERE id = p_project_id;
    INSERT INTO public.job_events (job_id, event_type, actor_id, source, entity_type, entity_id, metadata)
    VALUES (v_proj.job_id, 'register.promoted', v_actor_id, 'register', 'project', p_project_id,
            jsonb_build_object('lead_id', p_lead_id, 'project_id', p_project_id, 'selections', v_n_sel, 'scope_items', v_n_rsi,
                               'actor_name', v_actor_name));
  END IF;

  RETURN jsonb_build_object('ok', true, 'results', v_results,
                            'promoted', CASE WHEN p_mode = 'promote' THEN jsonb_build_object('selections', v_n_sel, 'scopeItems', v_n_rsi) END);
END $$;

-- Issue one immutable revision of a register document: supersede the current one and insert the new
-- row in ONE transaction. p_expected_version guards against two people issuing at once (the PDF already
-- carries its revision number, so a mismatch returns a conflict and the caller re-renders).
CREATE OR REPLACE FUNCTION public.register_issue_document(
  p_lead_id          uuid,
  p_document_type    text,
  p_expected_version integer,
  p_row              jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cur   public.lead_documents%ROWTYPE;
  v_next  integer;
  v_new   public.lead_documents%ROWTYPE;
BEGIN
  IF p_document_type NOT IN ('client_brief', 'architect_brief', 'selections_schedule', 'register_baseline') THEN
    RAISE EXCEPTION 'register_issue_document: % is not a register document type', p_document_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'register_issue_document: lead % not found', p_lead_id;
  END IF;
  -- serialise concurrent issues of the same document for the same lead (no lead-row lock contention)
  PERFORM pg_advisory_xact_lock(hashtext('register_issue:' || p_lead_id::text || ':' || p_document_type));

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next FROM public.lead_documents
   WHERE lead_id = p_lead_id AND document_type = p_document_type AND issued_at IS NOT NULL;
  IF p_expected_version IS DISTINCT FROM v_next THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'version_conflict', 'next_version', v_next);
  END IF;

  SELECT * INTO v_cur FROM public.lead_documents
   WHERE lead_id = p_lead_id AND document_type = p_document_type AND issued_at IS NOT NULL AND status = 'current'
   FOR UPDATE;
  IF FOUND THEN
    UPDATE public.lead_documents SET status = 'superseded' WHERE id = v_cur.id;
  END IF;

  INSERT INTO public.lead_documents (
    lead_id, filename, file_size, mime_type, storage_path, document_type, uploaded_by,
    version, status, supersedes_document_id, content_sha256, revision_label, template_key, template_version,
    source_snapshot, issued_at, issued_by, issued_by_name, recipient_name, recipient_email, audience, job_id, project_id)
  VALUES (
    p_lead_id, p_row ->> 'filename', NULLIF(p_row ->> 'file_size', '')::int, p_row ->> 'mime_type', p_row ->> 'storage_path',
    p_document_type, COALESCE(NULLIF(p_row ->> 'uploaded_by', ''), 'register'),
    v_next, 'current', v_cur.id, p_row ->> 'content_sha256', p_row ->> 'revision_label', p_row ->> 'template_key',
    p_row ->> 'template_version', p_row -> 'source_snapshot', now(), NULLIF(p_row ->> 'issued_by', '')::uuid,
    p_row ->> 'issued_by_name', p_row ->> 'recipient_name', p_row ->> 'recipient_email', p_row ->> 'audience',
    NULLIF(p_row ->> 'job_id', '')::uuid, NULLIF(p_row ->> 'project_id', '')::uuid)
  RETURNING * INTO v_new;

  RETURN jsonb_build_object('ok', true, 'document', to_jsonb(v_new) - 'source_snapshot', 'superseded_id', v_cur.id);
END $$;

-- Only the service-role API may call these (never a browser client / portal JWT through PostgREST).
REVOKE ALL ON FUNCTION public.register_apply(uuid, uuid, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_issue_document(uuid, text, integer, jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.register_apply(uuid, uuid, jsonb, jsonb, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.register_issue_document(uuid, text, integer, jsonb) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.register_apply(uuid, uuid, jsonb, jsonb, text) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.register_issue_document(uuid, text, integer, jsonb) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.register_apply(uuid, uuid, jsonb, jsonb, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.register_issue_document(uuid, text, integer, jsonb) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after applying; every row should read true)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   SELECT 'register_apply exists' AS check, to_regprocedure('public.register_apply(uuid,uuid,jsonb,jsonb,text)') IS NOT NULL AS ok
--   UNION ALL SELECT 'issue fn exists', to_regprocedure('public.register_issue_document(uuid,text,integer,jsonb)') IS NOT NULL
--   UNION ALL SELECT 'rsi deny_clients', EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_scope_items' AND policyname='deny_clients')
--   UNION ALL SELECT 'csel version trigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_csel_touch_updated_at')
--   UNION ALL SELECT 'issue guard trigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_lead_documents_issue_guard')
--   UNION ALL SELECT 'register_apply not executable by authenticated',
--                    NOT has_function_privilege('authenticated','public.register_apply(uuid,uuid,jsonb,jsonb,text)','EXECUTE');
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (reversible — run manually to undo; verified by scripts/tests/register-migration-213.test.mjs)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS public.register_issue_document(uuid, text, integer, jsonb);
--   DROP FUNCTION IF EXISTS public.register_apply(uuid, uuid, jsonb, jsonb, text);
--   DROP FUNCTION IF EXISTS public.register_jsonb_diff(jsonb, jsonb);
--   DROP TRIGGER IF EXISTS trg_csel_touch_updated_at ON public.client_selections;
--   DROP TRIGGER IF EXISTS trg_rsi_touch_updated_at ON public.room_scope_items;
--   DROP FUNCTION IF EXISTS public.register_touch_updated_at();
--   DROP TRIGGER IF EXISTS trg_lead_documents_issue_guard ON public.lead_documents;
--   DROP FUNCTION IF EXISTS public.lead_documents_issue_guard();
--   DROP INDEX IF EXISTS public.lead_documents_one_current_issue;
--   DROP INDEX IF EXISTS public.lead_documents_issue_version_uq;
--   ALTER TABLE public.lead_documents DROP CONSTRAINT IF EXISTS lead_documents_issue_status_check;
--   ALTER TABLE public.lead_documents DROP CONSTRAINT IF EXISTS lead_documents_review_status_check;
--   ALTER TABLE public.lead_documents DROP CONSTRAINT IF EXISTS lead_documents_document_type_check;
--   ALTER TABLE public.lead_documents ADD CONSTRAINT lead_documents_document_type_check CHECK (document_type IN ('brief','blueprint','survey','quote','contract','ptsa_signed','concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other')) NOT VALID;
--   ALTER TABLE public.lead_documents DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS supersedes_document_id, DROP COLUMN IF EXISTS content_sha256, DROP COLUMN IF EXISTS revision_label, DROP COLUMN IF EXISTS template_key, DROP COLUMN IF EXISTS template_version, DROP COLUMN IF EXISTS source_snapshot, DROP COLUMN IF EXISTS issued_at, DROP COLUMN IF EXISTS issued_by, DROP COLUMN IF EXISTS issued_by_name, DROP COLUMN IF EXISTS recipient_name, DROP COLUMN IF EXISTS recipient_email, DROP COLUMN IF EXISTS audience, DROP COLUMN IF EXISTS job_id, DROP COLUMN IF EXISTS project_id, DROP COLUMN IF EXISTS discipline, DROP COLUMN IF EXISTS issuer, DROP COLUMN IF EXISTS doc_number, DROP COLUMN IF EXISTS received_at, DROP COLUMN IF EXISTS review_status, DROP COLUMN IF EXISTS review_notes, DROP COLUMN IF EXISTS outstanding_question, DROP COLUMN IF EXISTS register_item_ids;
--   ALTER TABLE public.jobs  DROP CONSTRAINT IF EXISTS jobs_delivery_model_check;
--   ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_delivery_model_check;
--   ALTER TABLE public.jobs  DROP COLUMN IF EXISTS delivery_model;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS delivery_model;
--   ALTER TABLE public.projects DROP COLUMN IF EXISTS register_meta;
--   DROP POLICY IF EXISTS deny_clients ON public.room_scope_items;
--   ALTER TABLE public.room_scope_items DROP CONSTRAINT IF EXISTS rsi_disposition_check, DROP CONSTRAINT IF EXISTS rsi_certainty_check, DROP CONSTRAINT IF EXISTS rsi_technical_status_check, DROP CONSTRAINT IF EXISTS rsi_pricing_status_check;
--   DELETE FROM public.room_scope_items WHERE item_kind IN ('requirement','action');
--   ALTER TABLE public.room_scope_items DROP CONSTRAINT IF EXISTS room_scope_items_item_kind_check;
--   ALTER TABLE public.room_scope_items ADD CONSTRAINT room_scope_items_item_kind_check CHECK (item_kind IN ('scope','selection'));
--   DROP INDEX IF EXISTS public.idx_rsi_source_room;
--   ALTER TABLE public.room_scope_items DROP COLUMN IF EXISTS technical_status, DROP COLUMN IF EXISTS technical_evidence, DROP COLUMN IF EXISTS pricing_status, DROP COLUMN IF EXISTS pricing_ref, DROP COLUMN IF EXISTS approval_evidence, DROP COLUMN IF EXISTS supply_by, DROP COLUMN IF EXISTS manufacturer, DROP COLUMN IF EXISTS supplier, DROP COLUMN IF EXISTS quantity, DROP COLUMN IF EXISTS quantity_unit, DROP COLUMN IF EXISTS source_doc_id, DROP COLUMN IF EXISTS source_room_id, DROP COLUMN IF EXISTS baselined_at, DROP COLUMN IF EXISTS register_detail;
--   ALTER TABLE public.client_selections DROP CONSTRAINT IF EXISTS csel_certainty_check, DROP CONSTRAINT IF EXISTS csel_disposition_check, DROP CONSTRAINT IF EXISTS csel_technical_status_check, DROP CONSTRAINT IF EXISTS csel_pricing_status_check;
--   DROP INDEX IF EXISTS public.idx_csel_source_room;
--   ALTER TABLE public.client_selections DROP COLUMN IF EXISTS certainty, DROP COLUMN IF EXISTS disposition, DROP COLUMN IF EXISTS technical_status, DROP COLUMN IF EXISTS technical_evidence, DROP COLUMN IF EXISTS pricing_status, DROP COLUMN IF EXISTS pricing_ref, DROP COLUMN IF EXISTS approval_evidence, DROP COLUMN IF EXISTS responsibility, DROP COLUMN IF EXISTS supply_by, DROP COLUMN IF EXISTS finish, DROP COLUMN IF EXISTS manufacturer, DROP COLUMN IF EXISTS quantity, DROP COLUMN IF EXISTS quantity_unit, DROP COLUMN IF EXISTS source_ref, DROP COLUMN IF EXISTS source_doc_id, DROP COLUMN IF EXISTS next_action, DROP COLUMN IF EXISTS source_room_id, DROP COLUMN IF EXISTS baselined_at, DROP COLUMN IF EXISTS register_detail;
--   NOTIFY pgrst, 'reload schema';
-- ════════════════════════════════════════════════════════════════════════════════════════════════
