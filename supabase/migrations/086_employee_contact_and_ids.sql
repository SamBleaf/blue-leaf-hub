-- 086_employee_contact_and_ids.sql
-- Employee record additions (Team Directory + Buildexact Work Order labour push):
--   email, phone            — contact details (urgent out-of-app notification, comms)
--   staff_code              — human-readable internal staff ID (e.g. EMP-001), unique. Foundation
--                             for a system-wide staff ID independent of any external system.
--   buildexact_contact_id   — the Buildexact CONTACT this worker maps to. A labour Work Order's
--                             "Assigned To" is a Buildexact contact; this is how the Hub will set it.
--                             (Distinct from buildexact_employee_id, which the labour push does NOT
--                             use — Buildexact labour is name + Work Order, not an employee-ID match.)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS staff_code text,
  ADD COLUMN IF NOT EXISTS buildexact_contact_id text;

-- staff_code unique among non-null values.
CREATE UNIQUE INDEX IF NOT EXISTS employees_staff_code_key
  ON employees(staff_code) WHERE staff_code IS NOT NULL;

NOTIFY pgrst, 'reload schema';
