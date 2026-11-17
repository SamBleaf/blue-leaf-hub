-- 221_crm_people_firm_name.sql — CRM People: a contact with no person's name goes by its firm.
--
-- Why: the design-team route (POST /api/sales/leads/:id/design-team) saves a practice named with no person ("Studio X
-- Architects") as a firm-only crm_contacts row: first_name '', last_name NULL, company set, often no email. The view's
-- contacts half named a contact COALESCE(first + last, email), so such a contact had no name in CRM People and the
-- name search (GET /api/crm/people → name.ilike) never found it.
--
-- What: CREATE OR REPLACE VIEW public.v_crm_people with the CURRENT definition (131_v_crm_people.sql) word for word,
-- except the contacts half's name: first + last, then the firm (c.company), then the email. The leads half is unchanged.
-- Same 15 columns, same names, types and order, so nothing that reads the view changes.
--
-- Kept as it is now: CREATE OR REPLACE VIEW replaces a view's options, so it would drop security_invoker (set by 186
-- where 186 is applied). The view's options are read first and set again after, so this migration neither applies nor
-- undoes 186. Grants are kept by CREATE OR REPLACE (186's REVOKE from anon and authenticated stays as it is).
--
-- Requires: 131 (the view) and 180 (crm_contacts.company); stops with a plain message, changing nothing, without them.
-- Additive: a view only, no data is changed. Re-runnable.
--
-- Check after:
--   SELECT count(*) FROM public.v_crm_people WHERE kind = 'contact' AND name IS NULL;   -- fewer: only contacts with no name, firm or email
--   SELECT reloptions FROM pg_class WHERE oid = 'public.v_crm_people'::regclass;        -- the same as before
--
-- ROLLBACK (manual): re-run the CREATE OR REPLACE VIEW in 131_v_crm_people.sql, then, only if 186 is applied,
--   ALTER VIEW public.v_crm_people SET (security_invoker = on);
-- Then: NOTIFY pgrst, 'reload schema';

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.v_crm_people') IS NULL THEN
    RAISE EXCEPTION '221: public.v_crm_people does not exist. Apply 131_v_crm_people.sql first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'crm_contacts' AND column_name = 'company') THEN
    RAISE EXCEPTION '221: crm_contacts.company does not exist. Apply 180_crm_contacts_designer_fees.sql first. Nothing was changed.';
  END IF;
END $$;

-- The view's options now (security_invoker where 186 is applied, else none), to set again after the replace.
CREATE TEMP TABLE _m221_view_options ON COMMIT DROP AS
  SELECT reloptions FROM pg_class WHERE oid = 'public.v_crm_people'::regclass;

CREATE OR REPLACE VIEW public.v_crm_people AS

  -- ── leads half ────────────────────────────────────────────────────────────
  SELECT
    l.id                                                        AS person_id,
    'lead'::text                                                AS kind,
    COALESCE(
      NULLIF(TRIM(l.name), ''),
      NULLIF(TRIM(
        COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')
      ), ''),
      l.email
    )                                                           AS name,
    'enquiry'::text                                             AS type,
    COALESCE(l.lead_source_category, l.lead_source)            AS source,
    l.suburb                                                    AS suburb,
    l.project_type                                              AS project_type,
    l.estimated_value                                           AS budget,
    l.fit_quality                                               AS fit,
    l.readiness                                                 AS readiness,
    COALESCE(l.action_type, l.next_action)                      AS next_step,
    COALESCE(l.action_due_at, l.next_action_date::timestamptz)  AS due_date,
    l.assigned_to                                               AS owner,
    l.stage                                                     AS status,
    GREATEST(l.last_activity_at, l.updated_at)                 AS last_contact

  FROM leads l
  WHERE l.archived = false

UNION ALL

  -- ── crm_contacts half ─────────────────────────────────────────────────────
  SELECT
    c.id                                                        AS person_id,
    'contact'::text                                             AS kind,
    COALESCE(
      NULLIF(TRIM(
        COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')
      ), ''),
      NULLIF(TRIM(c.company), ''),
      c.email
    )                                                           AS name,
    c.contact_type                                              AS type,
    c.lead_source                                               AS source,
    c.suburb                                                    AS suburb,
    c.project_type                                              AS project_type,
    NULL::numeric                                               AS budget,
    NULL::text                                                  AS fit,
    NULL::text                                                  AS readiness,
    c.next_action_type                                          AS next_step,
    c.next_action_due_date::timestamptz                         AS due_date,
    NULL::text                                                  AS owner,
    c.status                                                    AS status,
    COALESCE(
      c.last_contact_date::timestamptz,
      c.updated_at
    )                                                           AS last_contact

  FROM crm_contacts c
  WHERE c.is_archived = false;

-- The options as they were (CREATE OR REPLACE cleared them).
DO $$
DECLARE v_opts text[];
BEGIN
  SELECT reloptions INTO v_opts FROM _m221_view_options;
  IF v_opts IS NOT NULL AND array_length(v_opts, 1) > 0 THEN
    EXECUTE format('ALTER VIEW public.v_crm_people SET (%s)', array_to_string(v_opts, ', '));
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
