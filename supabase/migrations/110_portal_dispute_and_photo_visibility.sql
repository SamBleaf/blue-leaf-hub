-- 110_portal_dispute_and_photo_visibility.sql
-- Manual-apply (Supabase dashboard SQL editor). Idempotent. Safe to re-run.
--
-- B2: a DISPUTED progress claim must be representable in the portal so the client
--     stops seeing a live 'I've transferred payment' button on it. portal_claims'
--     CHECK (migration 108) omits 'disputed', so a dispute write is silently rejected.
-- B8: project_photos has NO client-visibility flag, so the moment any photo gets a
--     matching milestone_key it shows on the client's Journey UNCONDITIONALLY —
--     including a defect photo a staffer buckets to a stage. Default to PRIVATE.
--
-- (Migrations 106/107 = architect, 108 = portal ecosystem, 109 = carpentry. This is 110.)

-- ── B2: disputed claim state ─────────────────────────────────────────────────
ALTER TABLE portal_claims DROP CONSTRAINT IF EXISTS portal_claims_status_check;
ALTER TABLE portal_claims
  ADD CONSTRAINT portal_claims_status_check
  CHECK (status IN ('upcoming', 'invoiced', 'partially_paid', 'paid', 'void', 'disputed'));

ALTER TABLE portal_claims
  ADD COLUMN IF NOT EXISTS dispute_reason text;

-- ── B8: client-visibility flag on photos (default PRIVATE) ────────────────────
ALTER TABLE project_photos
  ADD COLUMN IF NOT EXISTS client_visible boolean DEFAULT false;

-- ── B6: notify the client when a payment is received / variation approved ─────
-- The 103 notification_type CHECK omits these, so notifyClient would fail silently.
ALTER TABLE portal_notifications DROP CONSTRAINT IF EXISTS portal_notifications_notification_type_check;
ALTER TABLE portal_notifications
  ADD CONSTRAINT portal_notifications_notification_type_check
  CHECK (notification_type IN (
    'action_required', 'selection_due', 'variation_issued', 'document_ready',
    'progress_claim_issued', 'meeting_reminder', 'weekly_update', 'schedule_change',
    'message_reply', 'claim_paid', 'variation_approved'
  ));
