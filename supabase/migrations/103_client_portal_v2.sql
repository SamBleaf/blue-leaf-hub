-- ════════════════════════════════════════════════════════════════════════════
-- Migration 103 — Client Portal v2.0
-- ════════════════════════════════════════════════════════════════════════════
-- Adds: client login (project_client_users), unified action feed (client_actions),
--       documents, meetings, selections board, audit logs, notifications,
--       plus ALTERs linking the existing shadow portal tables to canonical
--       finance tables (job_variations, progress_claims) and adding the
--       fields the v2 UX needs (build_phase, builder_reasoning, confidence, etc.).
--
-- SAFETY / IDEMPOTENCY:
--   • Every CREATE TABLE uses IF NOT EXISTS.
--   • Every ALTER uses ADD COLUMN IF NOT EXISTS.
--   • Every CREATE INDEX uses IF NOT EXISTS.
--   • Every policy is preceded by DROP POLICY IF EXISTS so the whole file is
--     safe to re-paste into the Supabase SQL editor.
--
-- PREREQUISITE: migrations 099–102 must be applied first (they are ahead of the
--   live DB). Apply 099, 100, 101, 102, THEN this file, in the dashboard editor.
--
-- DESIGN NOTES (verified against real schema 027/028/031/069):
--   • Bridge between portal (project_id) and finance (job_id) is projects.job_id.
--   • portal_decisions money column is cost_delta (ex-GST delta); inc-GST is
--     sourced by joining job_variations.amount_inc_gst (a generated column).
--   • portal_decisions.type IN ('selection','variation'); status IN
--     ('pending','approved','declined','info_requested').
--   • portal_claims uses stage_name/amount/status('paid','invoiced','upcoming').
--   • All portal API enforcement is the requirePortalAuth middleware + service
--     role. RLS here is a safety net (internal authenticated users), NOT the
--     client enforcement layer. Clients never receive a Supabase session that
--     hits these tables directly.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── A. Client accounts linked to projects ──────────────────────────────────
-- One auth user ↔ one or more projects. Drives requirePortalAuth project scoping.
CREATE TABLE IF NOT EXISTS project_client_users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                text NOT NULL DEFAULT 'primary'
                      CHECK (role IN ('primary','secondary','architect','accountant')),
  invited_at          timestamptz,
  invite_accepted_at  timestamptz,
  -- NOT NULL so the auth guard can rely on a real boolean (a NULL flag must
  -- never read as "active"). See requirePortalAuth is_active check.
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);


-- ─── B. Unified client action feed ──────────────────────────────────────────
-- Every decision a client must take surfaces here. Single source for "My Actions".
CREATE TABLE IF NOT EXISTS client_actions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action_type         text NOT NULL CHECK (action_type IN (
                        'variation_approval','selection_decision','document_signature',
                        'progress_claim_review','meeting_confirmation','client_rfi',
                        'colour_approval','handover_item','weekly_update'
                      )),
  title               text NOT NULL,
  description         text,
  related_entity_type text,   -- 'portal_decision' | 'portal_meeting' | 'portal_claim' | 'client_selection'
  related_entity_id   uuid,
  due_date            date,
  priority            text DEFAULT 'normal' CHECK (priority IN ('urgent','normal','low')),
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending','viewed','responded','approved','rejected','overdue','completed'
                      )),
  notification_sent_at  timestamptz,
  notification_channel  text CHECK (notification_channel IN ('email','in_app','sms')),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);


-- ─── C. Portal documents (smart archive) ────────────────────────────────────
-- Stores storage_path only — served via short-lived signed URL endpoint, never a
-- permanent public link (so access revocation is honoured).
CREATE TABLE IF NOT EXISTS portal_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_document_id     uuid REFERENCES job_documents(id) ON DELETE SET NULL,
  folder              text NOT NULL CHECK (folder IN (
                        'contract','approved_plans','engineering','specifications',
                        'selections','variations','progress_claims','meeting_minutes',
                        'compliance','whs','warranty_handover','manuals','certificates'
                      )),
  title               text NOT NULL,
  version             text DEFAULT '1.0',
  upload_source       text DEFAULT 'manual' CHECK (upload_source IN ('manual','generated','buildexact','dropbox_sync')),
  storage_path        text,
  storage_provider    text DEFAULT 'dropbox' CHECK (storage_provider IN ('dropbox','supabase')),
  public_url          text,            -- legacy/optional; prefer signed-URL serve
  client_visible      boolean DEFAULT true,
  signature_required  boolean DEFAULT false,
  signed_at           timestamptz,
  signed_by_user_id   uuid REFERENCES auth.users(id),
  signature_data      text,
  expiry_date         date,
  related_entity_type text,            -- 'job_variation' | 'progress_claim' | 'portal_meeting'
  related_entity_id   uuid,
  uploaded_by         uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);


-- ─── D. Meetings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_meetings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                  text NOT NULL DEFAULT 'Site Meeting',
  meeting_type           text DEFAULT 'site' CHECK (meeting_type IN ('site','design','handover','defects','other')),
  -- status field (corrected per §0.4 — required for "I can't make it")
  status                 text DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled','confirmed','client_declined','rescheduled','cancelled')),
  client_visible         boolean DEFAULT true,   -- internal meetings hidden from client
  scheduled_at           timestamptz,
  proposed_times         jsonb DEFAULT '[]'::jsonb,
  confirmed_at           timestamptz,
  location               text,
  attendees              jsonb DEFAULT '[]'::jsonb,
  agenda                 text,
  minutes                text,
  decisions_made         text,
  action_items           jsonb DEFAULT '[]'::jsonb,
  client_acknowledged_at timestamptz,
  client_declined_at     timestamptz,
  google_calendar_event_id text,
  created_by             uuid REFERENCES auth.users(id),
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);


-- ─── E. Selections board ────────────────────────────────────────────────────
-- linked_variation_id → job_variations(id) (corrected per §0.4 — the canonical
-- variation table, NOT the portal_decisions shadow).
CREATE TABLE IF NOT EXISTS client_selections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category            text NOT NULL,
  item_name           text NOT NULL,
  room_area           text,
  due_date            date,
  -- §0.12.4 lead-time risk: order_by_date = fixing_start - lead_time_weeks (set by sync)
  lead_time_weeks     integer,
  order_by_date       date,
  allowance_amount    numeric(12,2),
  status              text NOT NULL DEFAULT 'not_started' CHECK (status IN (
                        'not_started','awaiting_client','in_review','approved','ordered','installed','overdue'
                      )),
  selected_product    text,
  selected_supplier   text,
  selected_model_code text,
  cost_impact         numeric(12,2),       -- delta vs allowance (positive = over)
  time_impact_days    integer DEFAULT 0,
  linked_variation_id uuid REFERENCES job_variations(id) ON DELETE SET NULL,
  client_notes        text,
  internal_notes      text,                -- NEVER returned to client
  attachments         jsonb DEFAULT '[]'::jsonb,
  inspiration_photos  jsonb DEFAULT '[]'::jsonb,
  approved_at         timestamptz,
  approved_by_user_id uuid REFERENCES auth.users(id),
  sort_order          integer DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS selection_options (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id    uuid NOT NULL REFERENCES client_selections(id) ON DELETE CASCADE,
  label           text NOT NULL,
  product_name    text,
  supplier        text,
  model_code      text,
  price_inc_gst   numeric(12,2),
  lead_time_weeks integer,
  description     text,
  image_url       text,
  internal_notes  text,            -- NEVER returned to client (§0.4)
  is_recommended  boolean DEFAULT false,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);


-- ─── F. Audit log (contractual, immutable) ──────────────────────────────────
-- INSERT + SELECT only at the RLS layer (no UPDATE/DELETE policy → immutable).
CREATE TABLE IF NOT EXISTS portal_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role       text,            -- snapshot at event time
  user_name       text,            -- snapshot
  event_type      text NOT NULL,   -- 'variation.approved' | 'document.signed' | ...
  entity_type     text,
  entity_id       uuid,
  entity_snapshot jsonb,
  ip_address      text,
  user_agent      text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  occurred_at     timestamptz DEFAULT now()
  -- no updated_at — append-only
);


-- ─── G. Notification events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type   text NOT NULL CHECK (notification_type IN (
                        'action_required','selection_due','variation_issued','document_ready',
                        'progress_claim_issued','meeting_reminder','weekly_update','schedule_change','message_reply'
                      )),
  title               text NOT NULL,
  body                text,
  related_entity_type text,
  related_entity_id   uuid,
  channel             text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','in_app','sms')),
  -- dedup_day: the calendar day used for the one-per-day unique index below.
  -- Set by the application on insert (current_date) — a timestamptz::date cast is
  -- NOT IMMUTABLE and therefore cannot be used in the index expression directly.
  dedup_day           date DEFAULT (now() AT TIME ZONE 'utc')::date,
  sent_at             timestamptz,
  read_at             timestamptz,
  created_at          timestamptz DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- H. ALTER existing tables — link shadows to canonical + add v2 UX fields
-- ════════════════════════════════════════════════════════════════════════════

-- Portal decisions: link to canonical job_variations + approval/photo/dual-approval
-- + builder_reasoning (§0.12.5). NOTE: money stays on existing cost_delta column;
-- inc-GST is read from the joined job_variations row, not stored here.
ALTER TABLE portal_decisions
  ADD COLUMN IF NOT EXISTS job_variation_id            uuid REFERENCES job_variations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requires_photo_evidence     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_evidence_urls         jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS signed_pdf_url              text,
  ADD COLUMN IF NOT EXISTS client_user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason            text,
  ADD COLUMN IF NOT EXISTS resubmitted_from_decision_id uuid REFERENCES portal_decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requires_dual_approval      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS second_approval_user_id     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS second_approval_at          timestamptz,
  ADD COLUMN IF NOT EXISTS builder_reasoning           text;

-- Portal claims: link to canonical progress_claims + client payment feedback
ALTER TABLE portal_claims
  ADD COLUMN IF NOT EXISTS progress_claim_id           uuid REFERENCES progress_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_document_id         uuid REFERENCES portal_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_instructions        text,
  ADD COLUMN IF NOT EXISTS viewed_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS client_payment_notified_at  timestamptz;

-- Portal updates: draft/publish workflow + builder reasoning (§0.12.2) + structure
ALTER TABLE portal_updates
  ADD COLUMN IF NOT EXISTS status              text DEFAULT 'published' CHECK (status IN ('draft','reviewed','published')),
  ADD COLUMN IF NOT EXISTS published_at        timestamptz,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS drafted_by          uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS published_by        uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS builder_reasoning   text,
  ADD COLUMN IF NOT EXISTS decisions_needed    text,
  ADD COLUMN IF NOT EXISTS risks_blockers      text,
  ADD COLUMN IF NOT EXISTS schedule_note       text,
  ADD COLUMN IF NOT EXISTS next_week_preview   text;

-- Portal milestones: schedule auto-mapping + confidence + stage preview + current flag
-- (confidence / is_current / schedule_phase / stage_preview / confidence_note do NOT
--  pre-exist — added here; the Home "current stage" query relies on is_current.)
ALTER TABLE portal_milestones
  ADD COLUMN IF NOT EXISTS schedule_phase   text,
  ADD COLUMN IF NOT EXISTS auto_synced      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_current       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confidence       text CHECK (confidence IN ('on_track','watch','delayed')),
  ADD COLUMN IF NOT EXISTS confidence_note  text,
  ADD COLUMN IF NOT EXISTS stage_preview    text;

-- Projects: v2 enablement flag, build phase, team directory
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS portal_v2_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS build_phase       text DEFAULT 'pre_construction'
                           CHECK (build_phase IN ('pre_construction','on_site','practical_completion')),
  ADD COLUMN IF NOT EXISTS team_members      jsonb DEFAULT '[]'::jsonb;


-- ════════════════════════════════════════════════════════════════════════════
-- I. Indexes
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_pcu_project   ON project_client_users(project_id);
CREATE INDEX IF NOT EXISTS idx_pcu_user      ON project_client_users(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_project    ON client_actions(project_id);
CREATE INDEX IF NOT EXISTS idx_ca_status     ON client_actions(status);
CREATE INDEX IF NOT EXISTS idx_ca_type       ON client_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_ca_entity     ON client_actions(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_pdoc_project  ON portal_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_pdoc_folder   ON portal_documents(folder);
CREATE INDEX IF NOT EXISTS idx_pmtg_project  ON portal_meetings(project_id);
CREATE INDEX IF NOT EXISTS idx_csel_project  ON client_selections(project_id);
CREATE INDEX IF NOT EXISTS idx_csel_status   ON client_selections(status);
CREATE INDEX IF NOT EXISTS idx_sopt_selection ON selection_options(selection_id);
CREATE INDEX IF NOT EXISTS idx_pal_project   ON portal_audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_pal_event     ON portal_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_pnotif_user   ON portal_notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_pnotif_unread ON portal_notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pdec_variation ON portal_decisions(job_variation_id);
CREATE INDEX IF NOT EXISTS idx_pclaim_pc      ON portal_claims(progress_claim_id);
CREATE INDEX IF NOT EXISTS idx_pmile_current  ON portal_milestones(project_id, is_current) WHERE is_current = true;

-- Notification dedup: at most one per (user, type, entity, channel, day).
-- Plain columns only (timestamptz::date is not IMMUTABLE so it cannot be indexed
-- as an expression). The app sets dedup_day = current_date and inserts with
-- ON CONFLICT (target_user_id, notification_type, related_entity_id, channel, dedup_day) DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pnotif_dedup ON portal_notifications
  (target_user_id, notification_type, related_entity_id, channel, dedup_day);


-- ════════════════════════════════════════════════════════════════════════════
-- J. Row Level Security
-- ════════════════════════════════════════════════════════════════════════════
-- All portal API routes use the service-role key (bypasses RLS). These policies
-- are a safety net for internal authenticated users only. Clients are enforced at
-- the requirePortalAuth middleware layer, never via a client Supabase session.

ALTER TABLE project_client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_actions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_meetings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_selections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_options    ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_notifications ENABLE ROW LEVEL SECURITY;

-- New tables: full access for internal authenticated users.
DROP POLICY IF EXISTS "auth_internal" ON project_client_users;
CREATE POLICY "auth_internal" ON project_client_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON client_actions;
CREATE POLICY "auth_internal" ON client_actions       FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON portal_documents;
CREATE POLICY "auth_internal" ON portal_documents     FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON portal_meetings;
CREATE POLICY "auth_internal" ON portal_meetings      FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON client_selections;
CREATE POLICY "auth_internal" ON client_selections    FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON selection_options;
CREATE POLICY "auth_internal" ON selection_options    FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON portal_notifications;
CREATE POLICY "auth_internal" ON portal_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Audit logs: INSERT + SELECT only — NO update/delete policy (immutable).
DROP POLICY IF EXISTS "audit_insert" ON portal_audit_logs;
CREATE POLICY "audit_insert" ON portal_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "audit_select" ON portal_audit_logs;
CREATE POLICY "audit_select" ON portal_audit_logs FOR SELECT TO authenticated USING (true);

-- Existing portal tables (027 enabled RLS but created ZERO policies → silent deny).
-- Add internal-user policies so dev errors surface as data, not empty arrays.
DROP POLICY IF EXISTS "auth_internal" ON portal_decisions;
CREATE POLICY "auth_internal" ON portal_decisions  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON portal_claims;
CREATE POLICY "auth_internal" ON portal_claims     FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON portal_updates;
CREATE POLICY "auth_internal" ON portal_updates    FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON portal_milestones;
CREATE POLICY "auth_internal" ON portal_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_internal" ON portal_messages;
CREATE POLICY "auth_internal" ON portal_messages   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- End Migration 103
-- ════════════════════════════════════════════════════════════════════════════
