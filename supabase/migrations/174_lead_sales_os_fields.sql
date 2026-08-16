-- 174_lead_sales_os_fields.sql — Sales OS Slice 1 (Enquiry + Qualify)
-- Additive-only columns on public.leads. Every column is nullable / defaulted and added with
-- IF NOT EXISTS, so this is safe to re-run and safe to deploy before the app code that uses it
-- (the routes fail-soft until the columns exist). No CHECK constraints on the new enum-ish text
-- columns — the controlled vocab is enforced app-side via src/lib/constants.js (mirrors the
-- relaxed approach of migrations 170/171), so a future vocab tweak never needs a migration.
--
-- Grouped by purpose:
--   * discovery-meeting  — set by the cal.com "build conversation" webhook (no manual tick)
--   * client_folder_*    — PRE-PROVISIONED ONLY this slice (folder creation is deferred to the
--                          Discovery/Winning-Offer stage; leaving the columns here avoids a later
--                          migration when the trigger point is decided — likely concept-agreement)
--   * qualify-flow       — web pre-score confirm + the two-step qualify email sequence stamps
--   * enquiry-capture    — the tight call-script dropdown answers that don't already have a home
--                          (priority/concern live in lead_signals, not here — no duplicate columns)

ALTER TABLE public.leads
  -- discovery meeting (client-facing "build conversation")
  ADD COLUMN IF NOT EXISTS discovery_meeting_at        timestamptz,
  ADD COLUMN IF NOT EXISTS discovery_meeting_booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS discovery_meeting_source    text,
  ADD COLUMN IF NOT EXISTS calcom_booking_uid          text,
  ADD COLUMN IF NOT EXISTS calcom_reschedule_url       text,
  ADD COLUMN IF NOT EXISTS calcom_cancel_url           text,
  -- client folder (pre-provisioned, unused this slice)
  ADD COLUMN IF NOT EXISTS client_folder_path          text,
  ADD COLUMN IF NOT EXISTS client_folder_link          text,
  ADD COLUMN IF NOT EXISTS client_folder_created_at    timestamptz,
  -- qualify flow
  ADD COLUMN IF NOT EXISTS web_prescored               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS qualify_confirmed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS qualify_confirmed_by        text,
  ADD COLUMN IF NOT EXISTS qualify_email_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS qualify_intro_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS qualify_followup_sent_at    timestamptz,
  -- enquiry capture (dropdown answers)
  ADD COLUMN IF NOT EXISTS client_postal_address       text,
  ADD COLUMN IF NOT EXISTS partner_name                text,
  ADD COLUMN IF NOT EXISTS land_status                 text,
  ADD COLUMN IF NOT EXISTS finance_status              text,
  ADD COLUMN IF NOT EXISTS documents_on_hand           text;

-- The follow-up cadence + "meeting booked?" checks scan for qualify-stage leads with a booked
-- meeting; a partial index keeps those sweeps cheap.
CREATE INDEX IF NOT EXISTS leads_discovery_meeting_booked_idx
  ON public.leads (discovery_meeting_booked_at)
  WHERE discovery_meeting_booked_at IS NOT NULL;

-- DOWN (manual):
--   ALTER TABLE public.leads
--     DROP COLUMN IF EXISTS discovery_meeting_at, DROP COLUMN IF EXISTS discovery_meeting_booked_at,
--     DROP COLUMN IF EXISTS discovery_meeting_source, DROP COLUMN IF EXISTS calcom_booking_uid,
--     DROP COLUMN IF EXISTS calcom_reschedule_url, DROP COLUMN IF EXISTS calcom_cancel_url,
--     DROP COLUMN IF EXISTS client_folder_path, DROP COLUMN IF EXISTS client_folder_link,
--     DROP COLUMN IF EXISTS client_folder_created_at, DROP COLUMN IF EXISTS web_prescored,
--     DROP COLUMN IF EXISTS qualify_confirmed_at, DROP COLUMN IF EXISTS qualify_confirmed_by,
--     DROP COLUMN IF EXISTS qualify_email_sent_at, DROP COLUMN IF EXISTS qualify_intro_sent_at,
--     DROP COLUMN IF EXISTS qualify_followup_sent_at, DROP COLUMN IF EXISTS client_postal_address,
--     DROP COLUMN IF EXISTS partner_name, DROP COLUMN IF EXISTS land_status,
--     DROP COLUMN IF EXISTS finance_status, DROP COLUMN IF EXISTS documents_on_hand;
--   DROP INDEX IF EXISTS leads_discovery_meeting_booked_idx;
