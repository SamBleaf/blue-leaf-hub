-- ════════════════════════════════════════════════════════════════════════════
-- Blue Leaf Hub — LOCAL REGISTER SANDBOX — Supabase platform compatibility SHIM
-- ════════════════════════════════════════════════════════════════════════════
-- DEV / TEST ONLY. Applied by scripts/dev/register-sandbox/sandbox.mjs to a
-- disposable local Postgres 17 database BEFORE supabase/migrations/*.sql.
--
-- Emulates the parts of the Supabase platform the migrations (and PostgREST /
-- the sandbox gateway) rely on:
--   • roles   anon / authenticated / service_role (BYPASSRLS) / authenticator
--   • schemas auth / storage / extensions (+ private sandbox_meta)
--   • extensions pgcrypto + uuid-ossp in schema `extensions` (Supabase layout)
--   • auth.users (GoTrue column set), auth.refresh_tokens, auth.one_time_tokens
--   • auth.uid() / auth.role() / auth.email() / auth.jwt() (read the claims
--     PostgREST sets in `request.jwt.claims`, plus the legacy per-claim GUCs)
--   • storage.buckets / storage.objects (RLS enabled) + foldername/filename/
--     extension helpers
--   • Supabase-style grants + ALTER DEFAULT PRIVILEGES so every table/sequence/
--     function created by later migrations is granted to anon/authenticated/
--     service_role exactly as on a hosted project (RLS is what protects data).
--
-- Idempotent: safe to re-run. Must be run as the cluster superuser (`postgres`)
-- connected to the sandbox database.
--
-- psql variable required:  -v authenticator_password=...
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── 1. Roles (cluster-global; created only if missing) ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT;
  END IF;
END $$;

ALTER ROLE service_role BYPASSRLS;
ALTER ROLE authenticator LOGIN NOINHERIT PASSWORD :'authenticator_password';

GRANT anon          TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role  TO authenticator;

-- Supabase per-role timeouts (PostgREST applies impersonated-role settings).
ALTER ROLE anon          SET statement_timeout = '3s';
ALTER ROLE authenticated SET statement_timeout = '8s';
ALTER ROLE authenticator SET statement_timeout = '8s';

-- ── 2. Schemas ──────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
-- Private bookkeeping for the sandbox runner (NOT exposed via PostgREST, no grants).
CREATE SCHEMA IF NOT EXISTS sandbox_meta;
REVOKE ALL ON SCHEMA sandbox_meta FROM PUBLIC;

-- ── 3. Extensions (Supabase installs them into `extensions`) ────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Supabase database search_path: "$user", public, extensions
-- (so un-qualified uuid_generate_v4() / crypt() resolve, as on a hosted project).
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = "$user", public, extensions', current_database());
END $$;
SET search_path = "$user", public, extensions;

-- ── 4. auth schema (GoTrue-compatible subset) ───────────────────────────────
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id                 uuid,
  id                          uuid        NOT NULL PRIMARY KEY,
  aud                         varchar(255),
  role                        varchar(255),
  email                       varchar(255),
  encrypted_password          varchar(255),
  email_confirmed_at          timestamptz,
  invited_at                  timestamptz,
  confirmation_token          varchar(255),
  confirmation_sent_at        timestamptz,
  recovery_token              varchar(255),
  recovery_sent_at            timestamptz,
  email_change_token_new      varchar(255),
  email_change                varchar(255),
  email_change_sent_at        timestamptz,
  last_sign_in_at             timestamptz,
  raw_app_meta_data           jsonb,
  raw_user_meta_data          jsonb,
  is_super_admin              boolean,
  created_at                  timestamptz,
  updated_at                  timestamptz,
  phone                       text        DEFAULT NULL UNIQUE,
  phone_confirmed_at          timestamptz,
  phone_change                text        DEFAULT '',
  phone_change_token          varchar(255) DEFAULT '',
  phone_change_sent_at        timestamptz,
  confirmed_at                timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
  email_change_token_current  varchar(255) DEFAULT '',
  email_change_confirm_status smallint    DEFAULT 0,
  banned_until                timestamptz,
  reauthentication_token      varchar(255) DEFAULT '',
  reauthentication_sent_at    timestamptz,
  is_sso_user                 boolean     NOT NULL DEFAULT false,
  deleted_at                  timestamptz,
  is_anonymous                boolean     NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_partial_key ON auth.users (email) WHERE (is_sso_user = false);
CREATE INDEX IF NOT EXISTS users_instance_id_idx ON auth.users (instance_id);

-- Sessions (GoTrue: a JWT whose session_id has no row → 403 session_not_found).
CREATE TABLE IF NOT EXISTS auth.sessions (
  id         uuid        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aal        text        NOT NULL DEFAULT 'aal1',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  not_after  timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON auth.sessions (user_id);

-- Refresh tokens issued by the sandbox gateway (GoTrue keeps them in this table too).
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id         bigserial   PRIMARY KEY,
  token      varchar(255) UNIQUE,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid,
  revoked    boolean     NOT NULL DEFAULT false,
  parent     varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON auth.refresh_tokens (user_id);

-- One-time tokens for admin.generateLink / verify (magic link, recovery, invite).
CREATE TABLE IF NOT EXISTS auth.one_time_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_type text        NOT NULL,
  token_hash text        NOT NULL UNIQUE,
  email_otp  text,
  redirect_to text,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Supabase's helpers (same bodies as the hosted auth schema).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- ── 5. storage schema (storage-api compatible subset) ───────────────────────
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text        NOT NULL PRIMARY KEY,
  name               text        NOT NULL,
  owner              uuid,
  owner_id           text,
  public             boolean     DEFAULT false,
  avif_autodetection boolean     DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  type               text        NOT NULL DEFAULT 'STANDARD',
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bname ON storage.buckets (name);

CREATE TABLE IF NOT EXISTS storage.objects (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_id        text        REFERENCES storage.buckets(id),
  name             text,
  owner            uuid,
  owner_id         text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata         jsonb,
  user_metadata    jsonb,
  version          text,
  path_tokens      text[]      GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
);
CREATE UNIQUE INDEX IF NOT EXISTS bucketid_objname ON storage.objects (bucket_id, name);
CREATE INDEX IF NOT EXISTS name_prefix_search ON storage.objects (name text_pattern_ops);

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END $$;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[array_length(_parts, 1)];
END $$;

CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[]; _filename text;
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  SELECT _parts[array_length(_parts, 1)] INTO _filename;
  RETURN reverse(split_part(reverse(_filename), '.', 1));
END $$;

-- ── 6. Grants (Supabase platform defaults) ──────────────────────────────────
GRANT USAGE ON SCHEMA public     TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth       TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage    TO anon, authenticated, service_role;

-- auth: helper functions callable by every API role (RLS policies use them);
-- auth tables are NOT granted to API roles (as on Supabase).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- storage: Supabase grants the tables to the API roles; RLS decides.
GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon, authenticated, service_role;

-- public: everything granted, RLS protects (exact Supabase behaviour).
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

-- Objects created later by migrations (run as `postgres`) inherit the grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;

-- ── 7. Sandbox bookkeeping ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sandbox_meta.sandbox_migrations (
  filename    text        PRIMARY KEY,
  checksum    text        NOT NULL,
  workarounds text[]      NOT NULL DEFAULT '{}',
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 8. PostgREST schema-cache reload ────────────────────────────────────────
-- PostgREST LISTENs on channel `pgrst` (db-channel-enabled), so
-- NOTIFY pgrst, 'reload schema' works exactly as on Supabase.
-- Hosted Supabase ALSO installs these two event triggers that NOTIFY on DDL;
-- reproduced verbatim so schema-cache behaviour matches the platform.
CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
        'CREATE SCHEMA', 'ALTER SCHEMA'
      , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
      , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
      , 'CREATE VIEW', 'ALTER VIEW'
      , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
      , 'CREATE FUNCTION', 'ALTER FUNCTION'
      , 'CREATE TRIGGER'
      , 'CREATE TYPE', 'ALTER TYPE'
      , 'CREATE RULE'
      , 'COMMENT'
    )
    AND cmd.schema_name IS DISTINCT FROM 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN ('schema', 'table', 'foreign table', 'view', 'materialized view',
                           'function', 'trigger', 'type', 'rule')
       AND obj.is_temporary IS false
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'pgrst_ddl_watch') THEN
    CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end EXECUTE PROCEDURE extensions.pgrst_ddl_watch();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'pgrst_drop_watch') THEN
    CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop EXECUTE PROCEDURE extensions.pgrst_drop_watch();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
