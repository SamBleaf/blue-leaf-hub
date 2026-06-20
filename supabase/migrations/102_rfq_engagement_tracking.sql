-- Migration 102: RFQ engagement tracking + subcontractor email MX-validation columns
-- Additive + idempotent. Mirrors the DO-block / IF NOT EXISTS style of 101.
--
-- FEATURE 1 — RFQ engagement tracking (webhook-only):
--   Per-trade engagement on the Tender Board (Sent → Delivered → Opened → Clicked-docs →
--   Received, plus Bounced/Suppressed) driven entirely by Resend webhook events matched to the
--   RFQ via a captured Resend email id (rfqs.resend_email_id). No email body is modified; no
--   redirect route is added — Resend's own delivered/opened/clicked events drive the strip.
--     - rfq_events: append-only event log, one row per Resend event (idempotent via UNIQUE).
--     - rfqs.*: denormalised first-touch timestamps + last_event for cheap rendering (no join).
--
-- FEATURE 2 — subcontractor email MX-validation guard:
--   When staff create/update a subcontractor email, an MX check on the domain WARNS (never blocks)
--   and the result is persisted so a red "undeliverable email" badge can show.
--     - subcontractors.email_mx_valid (true/false/null=not-checked) + email_mx_checked_at.

-- ─── rfq_events: append-only Resend-event log per RFQ ─────────────────────────
CREATE TABLE IF NOT EXISTS public.rfq_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id        uuid NOT NULL REFERENCES public.rfqs (id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  source_event_id text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  meta          jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfq_events_rfq_occurred
  ON public.rfq_events (rfq_id, occurred_at);

-- Idempotent webhook upserts: the same Resend event (same rfq + type + source id) inserts once.
-- A NULL source_event_id does NOT participate in a UNIQUE constraint (Postgres treats NULLs as
-- distinct), so events without a stable id are never blocked — they simply aren't de-duped.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_events_dedupe
  ON public.rfq_events (rfq_id, event_type, source_event_id);

-- ─── rfqs: captured Resend id + denormalised first-touch engagement columns ───
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS resend_email_id     text,
  ADD COLUMN IF NOT EXISTS email_delivered_at  timestamptz,
  ADD COLUMN IF NOT EXISTS email_opened_at     timestamptz,
  ADD COLUMN IF NOT EXISTS email_clicked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS docs_viewed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at          timestamptz,
  ADD COLUMN IF NOT EXISTS suppressed          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_event          text;

-- Partial index — the webhook looks up only rows that actually have a captured Resend id.
CREATE INDEX IF NOT EXISTS idx_rfqs_resend_email_id
  ON public.rfqs (resend_email_id)
  WHERE resend_email_id IS NOT NULL;

-- ─── subcontractors: email MX-validation result (Feature 2) ──────────────────
ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS email_mx_valid      boolean,
  ADD COLUMN IF NOT EXISTS email_mx_checked_at timestamptz;

-- Reload PostgREST schema cache so the new columns are queryable immediately.
NOTIFY pgrst, 'reload schema';
