-- 131_v_crm_people.sql
--
-- Purpose: read-only unified CRM people view over leads + crm_contacts.
--   Projects both tables to a single common shape so the CRM spreadsheet
--   ("v_crm_people") can render all people — enquiries AND contacts — without
--   physically merging the underlying tables.
--
-- Non-destructive: this file creates nothing but a VIEW.
-- Rollback: DROP VIEW v_crm_people;  ← zero data impact.
--
-- NOTE: this migration must be applied manually in the Supabase SQL editor.
-- Do not attempt to run it via an automated migration runner against the live DB.

CREATE OR REPLACE VIEW v_crm_people AS

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

-- RLS note: the view inherits RLS from both base tables.  The server layer always
-- accesses via the service-role client (which bypasses RLS), so no additional
-- grant is required.  The view is read-only — no INSTEAD OF triggers or rules.

NOTIFY pgrst, 'reload schema';
