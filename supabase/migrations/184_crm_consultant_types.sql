-- 184_crm_consultant_types.sql — CRM: add interior_designer + engineer consultant disciplines
-- Sam: architects/designers carry default concept + full-design fees + a company (mig 180 added
-- those columns). Add two more design-partner disciplines so the CRM contact type and the
-- lead-scoped design-lead role can name them. Additive-only, re-runnable, no data change.
--
-- Both CHECKs below were created inline (mig 061 / mig 083) so Postgres auto-named them. We drop
-- ANY check constraint referencing the target column by definition (name-agnostic) then re-add the
-- widened list — so a differently-named constraint can't silently survive and reject the new values.

-- ── crm_contacts.contact_type ──────────────────────────────────────────────
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'crm_contacts' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%contact_type%'
  LOOP EXECUTE format('ALTER TABLE public.crm_contacts DROP CONSTRAINT %I', c); END LOOP;
END $$;

ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_contact_type_check
  CHECK (contact_type IN (
    'prospect','referrer','past_client','architect','designer',
    'interior_designer','engineer','developer','agent','supplier','other'
  ));

-- ── job_contact_roles.role (already has engineer/consultant; add interior_designer) ─────────
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'job_contact_roles' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP EXECUTE format('ALTER TABLE public.job_contact_roles DROP CONSTRAINT %I', c); END LOOP;
END $$;

ALTER TABLE public.job_contact_roles ADD CONSTRAINT job_contact_roles_role_check
  CHECK (role IN (
    'referrer','consultant','architect','designer','interior_designer',
    'agent','engineer','other'
  ));
