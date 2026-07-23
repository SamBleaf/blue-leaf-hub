-- =============================================================================
-- Migration 154 — Tender restructure, build step 2: the quote-submission model.
-- Model A (jobs + rfqs) stays the invitation spine. This adds, on top of it:
--   • rfq_quote_submissions   — MANY versioned commercial quotes per invitation (rfq)
--   • rfq_quote_attachments   — MANY files per submission (quote PDF + exclusions + …), deduped
--   • tender_trade_scopes     — per (job, trade_category) scope: bullets / exclusions / questions
--   • tender_addenda (+ _trades junction) — addenda issued to affected trades
--   • rfqs.accepted_submission_id (+ accepted_at/by) — one enforceable award pointer
-- Model B (rfq_packages / rfq_trade_scopes / rfq_recipients / rfq_addenda) is LEFT INTACT —
-- new tables use non-colliding names; B is retired in a later migration once all reads move.
-- Spec: docs/plans/TENDER_SCHEMA_AND_MIGRATION.md. Additive + idempotent. No data migrated here
-- (the backfill is a separate, verified script — build step 3).
-- =============================================================================

-- ── rfq_quote_submissions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rfq_quote_submissions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                    uuid NOT NULL REFERENCES public.rfqs (id) ON DELETE CASCADE,
  version                   int  NOT NULL,                                  -- insertion/commercial revision order
  sub_scope_label           text,                                          -- e.g. "cabinetry" / "benchtops"
  status                    text NOT NULL DEFAULT 'received',              -- received · accepted · declined · superseded
  verification_status       text NOT NULL DEFAULT 'unverified',           -- unverified · verified · rejected
  verified_at               timestamptz,
  verified_by               uuid,
  extracted_amount_ex_gst   numeric,
  extracted_amount_inc_gst  numeric,
  extraction                jsonb,
  extraction_confidence     numeric,
  tax_basis                 text,                                          -- ex_gst · inc_gst · unknown
  confirmed_amount_ex_gst   numeric,                                       -- commercial source of truth
  confirmed_by              uuid,
  confirmed_at              timestamptz,
  correspondence_id         uuid REFERENCES public.correspondence (id) ON DELETE SET NULL,
  source_message_id         text,
  email_from                text,
  match_confidence          numeric,
  received_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, version)
);
CREATE INDEX IF NOT EXISTS rfq_quote_submissions_rfq_idx      ON public.rfq_quote_submissions (rfq_id);
CREATE INDEX IF NOT EXISTS rfq_quote_submissions_status_idx   ON public.rfq_quote_submissions (status);
CREATE INDEX IF NOT EXISTS rfq_quote_submissions_verif_idx    ON public.rfq_quote_submissions (verification_status);
CREATE INDEX IF NOT EXISTS rfq_quote_submissions_corr_idx     ON public.rfq_quote_submissions (correspondence_id);

-- ── rfq_quote_attachments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rfq_quote_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id       uuid NOT NULL REFERENCES public.rfq_quote_submissions (id) ON DELETE CASCADE,
  filename            text,
  storage_path        text,
  pdf_url             text,
  is_primary          boolean NOT NULL DEFAULT false,
  source_attachment_id text,
  mime_type           text,
  size_bytes          bigint,
  checksum            text,                                                -- sha256; dedupe key
  role                text,                                                -- quote · exclusions · schedule · insurance · other
  extraction_status   text NOT NULL DEFAULT 'pending',                     -- pending · done · failed · na
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, checksum)                                         -- duplicate protection (nulls allowed)
);
CREATE INDEX IF NOT EXISTS rfq_quote_attachments_submission_idx ON public.rfq_quote_attachments (submission_id);

-- ── tender_trade_scopes (new name — avoids the Model-B rfq_trade_scopes collision) ──
CREATE TABLE IF NOT EXISTS public.tender_trade_scopes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  trade_category_id uuid NOT NULL REFERENCES public.trade_categories (id),
  trade_label       text,
  scope_bullets     jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions        jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions         jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_notes    text,
  contractor_notes  text,
  due_date          date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, trade_category_id)
);
CREATE INDEX IF NOT EXISTS tender_trade_scopes_job_idx ON public.tender_trade_scopes (job_id);

-- ── tender_addenda + junction (replaces Model B's rfq_addenda + uuid[] array) ──
CREATE TABLE IF NOT EXISTS public.tender_addenda (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  number       int  NOT NULL,
  name         text,
  storage_path text,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, number)
);
CREATE INDEX IF NOT EXISTS tender_addenda_job_idx ON public.tender_addenda (job_id);

CREATE TABLE IF NOT EXISTS public.tender_addendum_trades (
  addendum_id       uuid NOT NULL REFERENCES public.tender_addenda (id) ON DELETE CASCADE,
  trade_category_id uuid NOT NULL REFERENCES public.trade_categories (id) ON DELETE CASCADE,
  PRIMARY KEY (addendum_id, trade_category_id)
);

-- ── rfqs: the award pointer (one enforceable accepted submission) ─────────────
ALTER TABLE public.rfqs ADD COLUMN IF NOT EXISTS accepted_submission_id uuid REFERENCES public.rfq_quote_submissions (id) ON DELETE SET NULL;
ALTER TABLE public.rfqs ADD COLUMN IF NOT EXISTS accepted_at            timestamptz;
ALTER TABLE public.rfqs ADD COLUMN IF NOT EXISTS accepted_by            uuid;

-- Integrity: the accepted submission must belong to the SAME rfq.
CREATE OR REPLACE FUNCTION public.rfq_accepted_submission_same_rfq() RETURNS trigger AS $$
BEGIN
  IF NEW.accepted_submission_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.rfq_quote_submissions s
        WHERE s.id = NEW.accepted_submission_id AND s.rfq_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'accepted_submission_id % does not belong to rfq %', NEW.accepted_submission_id, NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rfq_accepted_submission_same_rfq ON public.rfqs;
CREATE TRIGGER trg_rfq_accepted_submission_same_rfq
  BEFORE INSERT OR UPDATE OF accepted_submission_id ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION public.rfq_accepted_submission_same_rfq();

-- ── RLS (service role bypasses; authenticated staff read/write) ───────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rfq_quote_submissions','rfq_quote_attachments','tender_trade_scopes','tender_addenda','tender_addendum_trades']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'auth_users') THEN
      EXECUTE format('CREATE POLICY "auth_users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
