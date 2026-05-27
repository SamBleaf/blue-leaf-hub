-- Migration 060: Lead notes and lead documents
-- Adds two tables for the Sales Manager lead detail:
--   lead_notes  — persistent internal/external text notes on a lead (distinct from the activity timeline)
--   lead_documents — references to files uploaded against a lead (stored in Supabase Storage bucket 'lead-documents')
-- Safe to re-run (CREATE TABLE IF NOT EXISTS + policy existence guards).

-- ─── LEAD NOTES ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_notes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  body         text        NOT NULL,
  note_type    text        NOT NULL DEFAULT 'internal',  -- 'internal' | 'client_facing'
  author_name  text        NOT NULL DEFAULT 'Sam Morris',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_notes_note_type_check'
  ) THEN
    ALTER TABLE lead_notes
      ADD CONSTRAINT lead_notes_note_type_check
      CHECK (note_type IN ('internal', 'client_facing'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lead_notes_lead_id_idx ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS lead_notes_created_at_idx ON lead_notes(created_at DESC);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_notes' AND policyname = 'lead_notes_auth_all'
  ) THEN
    CREATE POLICY "lead_notes_auth_all" ON lead_notes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── LEAD DOCUMENTS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  filename      text        NOT NULL,
  file_size     integer,                          -- bytes
  mime_type     text,
  storage_path  text        NOT NULL,             -- path within 'lead-documents' Supabase Storage bucket
  document_type text        NOT NULL DEFAULT 'other',  -- 'brief' | 'blueprint' | 'survey' | 'quote' | 'contract' | 'other'
  uploaded_by   text        NOT NULL DEFAULT 'Sam Morris',
  created_at    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_documents_document_type_check'
  ) THEN
    ALTER TABLE lead_documents
      ADD CONSTRAINT lead_documents_document_type_check
      CHECK (document_type IN ('brief', 'blueprint', 'survey', 'quote', 'contract', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lead_documents_lead_id_idx ON lead_documents(lead_id);

ALTER TABLE lead_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_documents' AND policyname = 'lead_documents_auth_all'
  ) THEN
    CREATE POLICY "lead_documents_auth_all" ON lead_documents
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── SUPABASE STORAGE RLS for 'lead-documents' bucket ────────────────────────
-- Note: The 'lead-documents' bucket must be created manually in Supabase dashboard
-- (Storage → New bucket → Name: lead-documents → Private).
-- These policies govern object-level access within that bucket.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lead_documents_authenticated_upload'
  ) THEN
    CREATE POLICY "lead_documents_authenticated_upload"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'lead-documents');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lead_documents_authenticated_read'
  ) THEN
    CREATE POLICY "lead_documents_authenticated_read"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'lead-documents');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lead_documents_authenticated_delete'
  ) THEN
    CREATE POLICY "lead_documents_authenticated_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'lead-documents');
  END IF;
END $$;
