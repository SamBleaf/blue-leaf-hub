-- Minimal Supabase-shaped base schema for ISOLATED takeoff DB tests (never run against a real
-- project). Mirrors only the columns migration 206 + the takeoff service touch, taken from
-- migrations 001/059/069/085/092/145/152/172.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO service_role;
-- Supabase grants table privileges to anon/authenticated by default; reproduce that so the
-- REVOKEs in 206 are actually exercised.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE TABLE public.jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), address text);
CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES public.jobs(id), address text, status text DEFAULT 'active');
CREATE TABLE public.carpentry_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), address text, client_name text, status text DEFAULT 'active');
CREATE TABLE public.charge_up_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carpentry_job_id uuid REFERENCES public.carpentry_jobs(id), status text DEFAULT 'active', address text);
CREATE TABLE public.employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text, is_leading_hand boolean DEFAULT false, is_active boolean DEFAULT true, worker_token text);
CREATE TABLE public.suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text, phone text, contact_name text, abn text,
  notes text, account_terms text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.company_profile (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'Blue Leaf Building', abn text,
  building_licence text, address text, phone text, email text, logo_url text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.job_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  direction text,
  title text,
  source text DEFAULT 'upload',
  version integer NOT NULL DEFAULT 1,
  supersedes_document_id uuid REFERENCES public.job_documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'current' CHECK (status IN ('draft','current','superseded')),
  storage_provider text CHECK (storage_provider IN ('dropbox','supabase')),
  storage_path text,
  template_key text,
  template_version text,
  audience_layer text CHECK (audience_layer IN ('management','site','worker')),
  is_stale boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  carpentry_job_id uuid REFERENCES public.carpentry_jobs(id) ON DELETE CASCADE,
  charge_up_job_id uuid REFERENCES public.charge_up_jobs(id) ON DELETE CASCADE
);
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users" ON public.job_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.user_profiles (id uuid PRIMARY KEY, role text NOT NULL, is_active boolean NOT NULL DEFAULT true, full_name text);
CREATE TABLE public.timesheets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid, project_id uuid, carpentry_job_id uuid, date date DEFAULT current_date);
-- real-schema columns used by order contact prefill (migrations 086 + rbac employee link)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS employee_id uuid;
