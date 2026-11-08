-- ════════════════════════════════════════════════════════════════════════════
-- Blue Leaf Hub — LOCAL REGISTER SANDBOX — seed (DEV / TEST ONLY)
-- ════════════════════════════════════════════════════════════════════════════
-- Applied by sandbox.mjs AFTER all migrations. Idempotent.
-- Passwords are random per sandbox and passed in as psql variables; they live
-- only in ~/.blh-register-sandbox/credentials.local.json (never in the repo).
--
-- psql variables: staff_id staff_email staff_password client_id client_email client_password
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
SET search_path = public, extensions;

-- ── auth.users (GoTrue shape; bcrypt via pgcrypto exactly like GoTrue) ───────
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-0000-0000-000000000000', :'staff_id', 'authenticated', 'authenticated',
   lower(:'staff_email'), extensions.crypt(:'staff_password', extensions.gen_salt('bf', 10)), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Register Sandbox (staff)"}'::jsonb, now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', :'client_id', 'authenticated', 'authenticated',
   lower(:'client_email'), extensions.crypt(:'client_password', extensions.gen_salt('bf', 10)), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Client Sandbox (portal)"}'::jsonb, now(), now(), false, false)
ON CONFLICT (id) DO UPDATE
  SET email              = EXCLUDED.email,
      encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      raw_user_meta_data = EXCLUDED.raw_user_meta_data,
      deleted_at         = NULL,
      banned_until       = NULL,
      updated_at         = now();

-- ── public.user_profiles (mig 028 + 100 + 158 columns; role CHECK from 028) ─
INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
VALUES
  (:'staff_id',  lower(:'staff_email'),  'Register Sandbox (staff)', 'admin',  true),
  (:'client_id', lower(:'client_email'), 'Client Sandbox (portal)',  'client', true)
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, full_name = EXCLUDED.full_name,
      role = EXCLUDED.role, is_active = EXCLUDED.is_active, updated_at = now();

-- ── Storage buckets the app uses (all private; migrations already create some) ─
INSERT INTO storage.buckets (id, name, public) VALUES
  ('lead-documents',    'lead-documents',    false),
  ('templates',         'templates',         false),
  ('job-plans',         'job-plans',         false),
  ('site-media',        'site-media',        false),
  ('marketing-media',   'marketing-media',   false),
  ('branding',          'branding',          false),
  ('job-cost-receipts', 'job-cost-receipts', false),
  ('takeoff-exports',   'takeoff-exports',   false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
