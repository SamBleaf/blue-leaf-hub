-- Role-based access control: user profiles + invitation system

CREATE TABLE IF NOT EXISTS user_profiles (
  id          uuid PRIMARY KEY,
  email       text NOT NULL,
  full_name   text,
  role        text NOT NULL DEFAULT 'employee'
              CHECK (role IN ('admin','supervisor','employee','client')),
  is_active   boolean NOT NULL DEFAULT true,
  invited_by  uuid,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  full_name   text,
  role        text NOT NULL DEFAULT 'employee'
              CHECK (role IN ('admin','supervisor','employee','client')),
  token       text NOT NULL UNIQUE,
  invited_by  uuid,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON user_profiles;
CREATE POLICY "Users read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
