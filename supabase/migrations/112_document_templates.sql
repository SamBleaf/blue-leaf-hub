-- 112_document_templates.sql
-- Documents & Templates registry (Workstream B). One row per template/doc the Hub knows about —
-- existing, app-generated, and required-but-not-built. The code catalogue (server/lib/templateCatalog.mjs)
-- is the canonical list; this table stores editable metadata + Dropbox sync/health state + any
-- custom/admin-added rows, merged over the catalogue by `catalog_key`.
--
-- Dropbox is the source of truth for editable masters (per-module folders under
-- BLUE LEAF BUILDING/ADMINISTRATION/TEMPLATES). The Hub is the index + access control + health monitor.
--
-- Access: all reads/writes go through /api/templates (requireRole "admin") using the service client,
-- so RLS is enabled with NO authenticated policy = deny-all to anon/authenticated (service role bypasses).
--
-- DOWN:
--   DROP TABLE IF EXISTS public.document_templates;

CREATE TABLE IF NOT EXISTS public.document_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_key           text UNIQUE,                         -- stable key to merge with the code catalogue
  module                text NOT NULL,                       -- sales|tender|operations|whs|finance|contract|handover|marketing|admin
  category              text,                                -- client-journey stage (for the journey view)
  title                 text NOT NULL,
  description           text,
  kind                  text NOT NULL CHECK (kind IN ('docx_template','pdf_generator','email_md','whs_markdown','reference_doc')),
  storage               text NOT NULL DEFAULT 'dropbox' CHECK (storage IN ('dropbox','supabase','code')),
  storage_path          text,                                -- Dropbox path / bucket key / code module
  edit_method           text,                                -- "Edit in Dropbox" / "Edit in Hub" / "App-generated" / "Edit in code: <file>"
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','planned','draft','archived')),
  purpose               text,                                -- staff-facing "what it does in the software"
  owner_role            text NOT NULL DEFAULT 'admin',
  version               int  NOT NULL DEFAULT 1,
  -- Dropbox sync + template health (B7 — columns added now, populated later)
  dropbox_rev           text,
  content_hash          text,
  expected_merge_fields jsonb,
  validation_status     text DEFAULT 'unknown' CHECK (validation_status IN ('ok','broken','unknown')),
  validation_message    text,
  last_validated_at     timestamptz,
  audit_ref             text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_templates_module_idx ON public.document_templates (module);
CREATE INDEX IF NOT EXISTS document_templates_status_idx ON public.document_templates (status);

-- Server-only access (service role bypasses RLS); deny anon/authenticated entirely.
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
