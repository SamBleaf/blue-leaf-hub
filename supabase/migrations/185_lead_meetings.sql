-- ============================================================
-- Migration 185 — lead_meetings (sales pipeline scheduling spine)
-- ============================================================
-- Today the only calendar-scheduled meeting is the Qualify "build conversation",
-- stored as columns bolted onto the lead (leads.discovery_meeting_* / calcom_*),
-- which only fits ONE meeting. To schedule EVERY pipeline meeting (enquiry call,
-- build conversation, designer concept meeting, winning-offer presentation) we
-- give a lead MANY meetings: one row per meeting here.
--
-- The cal.com webhook (calcomWebhook.mjs) is the single write path — it upserts a
-- row keyed (lead_id, meeting_type). For the build conversation it ALSO keeps
-- stamping the legacy leads.discovery_meeting_* columns so the Discovery HARD gate
-- + QualifyActions keep working unchanged (belt-and-braces during transition).
--
-- meeting_type + status have NO DB CHECK (deploy-ahead pattern, vocab in
-- constants.js MEETING_TYPES / MEETING_STATUSES) so new meeting types ship without
-- a migration. Additive + idempotent. Apply manually in the Supabase SQL editor.
--
-- ROLLBACK: DROP TABLE IF EXISTS public.lead_meetings;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lead_meetings (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  -- What meeting this is (MEETING_TYPES in constants.js): enquiry_call | build_conversation
  -- | designer_meeting | winning_offer_presentation. Denormalised stage for the agenda.
  meeting_type       text        NOT NULL,
  stage              text        NULL,
  title              text        NULL,

  -- When + how long
  scheduled_at       timestamptz NULL,
  duration_mins      integer     NULL,
  location           text        NULL,          -- phone | video | in_person | free text
  attendees          text        NULL,

  -- Lifecycle (MEETING_STATUSES in constants.js): scheduled | rescheduled | cancelled
  -- | completed | no_show. How it was set: self (client link) | on_behalf (Hub via
  -- cal.com API) | manual (Hub-recorded, no cal.com booking).
  status             text        NOT NULL DEFAULT 'scheduled',
  booking_source     text        NULL,

  -- cal.com identity + client self-service links (cal.com is the booking source of truth)
  cal_event_type_id  text        NULL,
  cal_event_slug     text        NULL,
  cal_booking_uid    text        NULL,
  cal_reschedule_url text        NULL,
  cal_cancel_url     text        NULL,

  notes              text        NULL,
  created_by         uuid        NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- A lead has at most one meeting of each type — the webhook upserts on this key
-- (a reschedule/cancel updates the same row rather than piling up duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS lead_meetings_lead_type_uidx
  ON public.lead_meetings (lead_id, meeting_type);

-- The agenda query: upcoming, still-live meetings by time.
CREATE INDEX IF NOT EXISTS lead_meetings_scheduled_idx
  ON public.lead_meetings (scheduled_at)
  WHERE status IN ('scheduled', 'rescheduled');

-- cal.com booking uid is globally unique (partial — Hub-recorded rows have NULL).
CREATE UNIQUE INDEX IF NOT EXISTS lead_meetings_booking_uid_uidx
  ON public.lead_meetings (cal_booking_uid) WHERE cal_booking_uid IS NOT NULL;

-- ── RLS — sales-table house style + the migration-104 client lockdown ─────────
-- Portal CLIENTS have real `authenticated` accounts and the anon key ships in the
-- browser, so a permissive USING(true) alone would expose every lead's meetings.
-- Migration 104 was a one-time loop; tables created after it must re-add the
-- RESTRICTIVE deny_clients policy themselves (same as migs 121/182).
ALTER TABLE public.lead_meetings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_meetings' AND policyname = 'auth_users') THEN
    CREATE POLICY "auth_users" ON public.lead_meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_meetings' AND policyname = 'deny_clients') THEN
    CREATE POLICY deny_clients ON public.lead_meetings AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
