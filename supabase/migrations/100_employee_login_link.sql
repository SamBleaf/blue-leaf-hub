-- 100_employee_login_link.sql
-- Canonical employee <-> login link. An "App login invite" (Workforce → Team) can now carry the
-- employee it is for, so employees.user_id / user_profiles.employee_id are linked the moment the
-- auth user is created. Enforces ONE login per employee. Additive + idempotent (safe to re-run).

ALTER TABLE invitations   ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

-- One login per employee (NULLs allowed for logins not tied to an employee, e.g. office/admin/client).
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_employee_id_key
  ON user_profiles (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_employee_id ON invitations (employee_id);

-- Backfill: logins already linked via employees.user_id get their user_profiles.employee_id set.
UPDATE user_profiles p
   SET employee_id = e.id
  FROM employees e
 WHERE e.user_id = p.id AND p.employee_id IS NULL;

NOTIFY pgrst, 'reload schema';
