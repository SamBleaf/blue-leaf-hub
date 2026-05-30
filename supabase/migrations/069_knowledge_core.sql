-- =============================================================================
-- 069_knowledge_core.sql — Phase 0: Universal Data Architecture foundation
-- See docs/agent_knowledge/MASTER_DATA_DICTIONARY.md (Parts 2-5) + IMPLEMENTATION_PLAN.md.
--
-- PURELY ADDITIVE. Nothing existing is modified or rewired. New tables + new
-- columns only. Safe to apply at any time; no module reads/writes these until
-- the Phase 1+ cutover (done with the app running, verified).
--
-- Knowledge Core = Facts (state) + Events (log) + Documents (provenance source).
-- Provenance authority = the latest job_fact_history row per (job_id, fact_key)
-- (single source — no duplicated provenance column to drift).
-- =============================================================================

-- ── 1. job_documents — the document registry (provenance backbone) ────────────
-- Everything references a document; nothing owns it. A fact's source points here.
CREATE TABLE IF NOT EXISTS public.job_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  document_type         text NOT NULL,            -- architectural|structural|specification|geotech|
                                                   -- survey|bal_report|energy_report|contract|variation_doc|
                                                   -- quote|fee_proposal|buildxact_estimate|addendum|
                                                   -- progress_claim|supplier_invoice|client_invoice|purchase_order|
                                                   -- remittance|whs_plan|emp|site_safety_plan|swms|permit|register|
                                                   -- site_board|induction_pdf|compliance_doc|toolbox|rescue_plan|
                                                   -- client_guide|weekly_update|handover_pack|photo|other
  direction             text CHECK (direction IN ('inbound','outbound','internal')),
  title                 text,
  source                text DEFAULT 'upload' CHECK (source IN ('upload','email','buildexact','generated')),
  version               integer NOT NULL DEFAULT 1,
  supersedes_document_id uuid REFERENCES public.job_documents(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'current' CHECK (status IN ('draft','current','superseded')),
  storage_provider      text CHECK (storage_provider IN ('dropbox','supabase')),
  storage_path          text,
  template_key          text,                      -- for generated docs (WHS plans etc.)
  template_version      text,
  audience_layer        text CHECK (audience_layer IN ('management','site','worker')),
  is_stale              boolean NOT NULL DEFAULT false,
  uploaded_by           uuid REFERENCES auth.users(id),
  uploaded_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_documents_job  ON public.job_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_job_documents_type ON public.job_documents(job_id, document_type);

-- ── 2. job_fact_history — append-only fact change log + provenance authority ──
CREATE TABLE IF NOT EXISTS public.job_fact_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spine               text NOT NULL DEFAULT 'job' CHECK (spine IN ('party','lead','job')),
  job_id              uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  fact_key            text NOT NULL,               -- canonical name from jobFactRegistry.mjs
  old_value           text,
  new_value           text,
  value_type          text DEFAULT 'text' CHECK (value_type IN ('text','number','boolean','json')),
  source              text,                        -- manual|extraction|system|lookup|buildexact
  source_document_id  uuid REFERENCES public.job_documents(id) ON DELETE SET NULL,
  confidence          numeric(5,2),
  status              text DEFAULT 'manual' CHECK (status IN ('extracted_applied','extracted_flagged','confirmed','manual')),
  reason              text,
  changed_by          uuid REFERENCES auth.users(id),
  changed_at          timestamptz NOT NULL DEFAULT now()
);
-- Latest row per (job_id, fact_key) = current provenance.
CREATE INDEX IF NOT EXISTS idx_fact_history_lookup ON public.job_fact_history(job_id, fact_key, changed_at DESC);

-- ── 3. job_events — business event stream (job spine) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.job_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  event_type   text NOT NULL,                      -- e.g. fact.changed, contract.signed, claim.issued,
                                                    -- variation.signed, invoice.approved, document.uploaded,
                                                    -- whs_document.generated, milestone.reached, ...
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid REFERENCES auth.users(id),
  source       text DEFAULT 'system',              -- system|manual|extraction|buildexact|resend
  entity_type  text,                               -- claim|variation|document|fact|...
  entity_id    uuid,
  metadata     jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON public.job_events(job_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_events_type ON public.job_events(event_type);

-- ── 4. contact_events — party event stream (CRM + Spam-Act consent, append-only)
CREATE TABLE IF NOT EXISTS public.contact_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  event_type  text NOT NULL,                       -- interaction|email.delivered|email.opened|
                                                    -- consent.granted|consent.withdrawn|unsubscribed
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES auth.users(id),
  source      text DEFAULT 'system',
  metadata    jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_contact_events_contact ON public.contact_events(contact_id, occurred_at DESC);

-- ── 5. company_profile — single-company config layer (merged into documents) ──
CREATE TABLE IF NOT EXISTS public.company_profile (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL DEFAULT 'Blue Leaf Building',
  abn              text,
  building_licence text,
  address          text,
  phone            text,
  email            text,
  logo_url         text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 6. project_metrics — expanded building-fact columns (register-all, §31) ───
-- Existing already: storeys, site_slope, roof_type, wall_type, roof_complexity,
-- has_suspended_slab, has_retaining_walls, bal_rating, energy_rating, areas.
ALTER TABLE public.project_metrics
  ADD COLUMN IF NOT EXISTS frame_type            text,   -- timber|steel|mixed
  ADD COLUMN IF NOT EXISTS roof_structure_type   text,   -- trusses|conventional|flat|skillion
  ADD COLUMN IF NOT EXISTS roof_cladding         text,
  ADD COLUMN IF NOT EXISTS wall_cladding         text,
  ADD COLUMN IF NOT EXISTS foundation_type       text,
  ADD COLUMN IF NOT EXISTS has_basement          boolean,
  ADD COLUMN IF NOT EXISTS has_structural_steel  boolean,
  ADD COLUMN IF NOT EXISTS has_demolition        boolean,
  ADD COLUMN IF NOT EXISTS building_age          integer,
  ADD COLUMN IF NOT EXISTS site_coverage_pct     numeric(5,2),
  ADD COLUMN IF NOT EXISTS building_height_m     numeric(6,2),
  ADD COLUMN IF NOT EXISTS has_pool              boolean,
  ADD COLUMN IF NOT EXISTS has_lift              boolean,
  ADD COLUMN IF NOT EXISTS has_solar             boolean,
  ADD COLUMN IF NOT EXISTS has_battery           boolean,
  ADD COLUMN IF NOT EXISTS has_rainwater_tank    boolean,
  ADD COLUMN IF NOT EXISTS bushfire_overlay      boolean,
  ADD COLUMN IF NOT EXISTS flood_overlay         boolean,
  ADD COLUMN IF NOT EXISTS heritage_overlay      boolean;

-- ── 7. RLS (match existing convention: authenticated full access) ─────────────
ALTER TABLE public.job_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_fact_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profile  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON public.job_documents    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON public.job_fact_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON public.job_events       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON public.contact_events   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON public.company_profile  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- Verify:
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--     AND table_name IN ('job_documents','job_fact_history','job_events','contact_events','company_profile');
-- =============================================================================
