-- 128_lead_timeline_view.sql — Batch 1B (CRM control system)
-- Read-only unified timeline view. UNION of every per-lead history source into one
-- stream: lead_activities, lead_notes, lead_conversations, crm_interactions
-- (matched by ci.lead_id OR the contact's converted_lead_id), and email opens/clicks
-- from email_send_recipients (contact-keyed → lead via converted_lead_id).
--
-- Additive + non-destructive: no source table is altered, no data moved. The view is
-- projected to a stable shape so the API + UI read one contract:
--   (lead_id, occurred_at, kind, sub_type, actor, summary, detail, ref_id)
-- Safe to re-run (CREATE OR REPLACE VIEW).

CREATE OR REPLACE VIEW v_lead_timeline AS
  -- Activity log (immutable events + stage changes)
  SELECT
    la.lead_id                                   AS lead_id,
    la.created_at                                AS occurred_at,
    'activity'::text                             AS kind,
    la.activity_type                             AS sub_type,
    NULL::text                                   AS actor,
    la.summary                                   AS summary,
    la.detail                                    AS detail,
    la.id                                        AS ref_id
  FROM lead_activities la

  UNION ALL

  -- Notes (internal / client-facing)
  SELECT
    ln.lead_id,
    ln.created_at,
    'note'::text,
    ln.note_type,
    ln.author_name,
    ln.body,
    NULL::text,
    ln.id
  FROM lead_notes ln

  UNION ALL

  -- Conversations (transcripts analysed by Blueprint)
  SELECT
    lc.lead_id,
    lc.created_at,
    'conversation'::text,
    NULL::text,
    NULL::text,
    COALESCE(lc.title, 'Conversation'),
    LEFT(lc.transcript_text, 280),
    lc.id
  FROM lead_conversations lc

  UNION ALL

  -- CRM interactions: matched directly on lead_id, else via the contact's converted_lead_id
  SELECT
    COALESCE(ci.lead_id, cc.converted_lead_id)   AS lead_id,
    ci.created_at,
    'interaction'::text,
    ci.interaction_type,
    ci.direction,
    ci.summary,
    ci.detail,
    ci.id
  FROM crm_interactions ci
  LEFT JOIN crm_contacts cc ON cc.id = ci.contact_id
  WHERE COALESCE(ci.lead_id, cc.converted_lead_id) IS NOT NULL

  UNION ALL

  -- Email opens (contact-keyed → lead via converted_lead_id)
  SELECT
    cc.converted_lead_id                         AS lead_id,
    esr.opened_at                                AS occurred_at,
    'email_open'::text,
    es.subject,
    esr.email_address,
    COALESCE(es.subject, 'Email opened'),
    NULL::text,
    esr.id
  FROM email_send_recipients esr
  JOIN crm_contacts cc ON cc.id = esr.contact_id
  LEFT JOIN email_sends es ON es.id = esr.email_send_id
  WHERE esr.opened_at IS NOT NULL
    AND cc.converted_lead_id IS NOT NULL

  UNION ALL

  -- Email clicks (stronger engagement signal than an open)
  SELECT
    cc.converted_lead_id                         AS lead_id,
    esr.clicked_at                               AS occurred_at,
    'email_click'::text,
    es.subject,
    esr.email_address,
    COALESCE(es.subject, 'Email link clicked'),
    NULL::text,
    esr.id
  FROM email_send_recipients esr
  JOIN crm_contacts cc ON cc.id = esr.contact_id
  LEFT JOIN email_sends es ON es.id = esr.email_send_id
  WHERE esr.clicked_at IS NOT NULL
    AND cc.converted_lead_id IS NOT NULL;

COMMENT ON VIEW v_lead_timeline IS
  'Batch 1B: read-only unified per-lead history. UNION of lead_activities, lead_notes, lead_conversations, crm_interactions (direct or via converted contact), and email opens/clicks. No source table altered.';
