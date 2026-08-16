-- ============================================================
-- Migration 182 — Xero invoices (accounts-receivable) + contact cache
-- ============================================================
-- The ONE canonical table for every client invoice the Hub raises in Xero
-- (concept fee first; progress claims / variations / design packages / deposits
-- follow as registry entries in xeroInvoices.mjs). Xero is the accounting source
-- of truth — this table records WHY/WHEN we raised it, the send lock, and a mirror
-- of Xero's identity + money fields (never recomputed locally).
--
-- Spans lead-scoped (concept fee) AND job-scoped (claims/variations): >=1 of
-- lead_id/job_id is set (CHECK). Hub-side `status` vocab lives in constants.js
-- (XERO_INVOICE_STATUSES) with NO DB CHECK — the deploy-ahead pattern, so new
-- statuses ship without a migration. Amounts are stored EX-GST (Xero adds GST via
-- LineAmountTypes=Exclusive); xero_total/amount_due/amount_paid are Xero's inc-GST
-- truth, copied on sync.
--
-- Anti-double-create: UNIQUE(source_type, source_id) + UNIQUE(xero_invoice_id) +
-- a per-row idempotency_key sent as the Xero Idempotency-Key header.
-- Anti-double-send: send_source claimed atomically before any SMTP (P2).
--
-- NOTE: Apply manually in the Supabase SQL editor. Additive + idempotent.
--
-- ROLLBACK (non-destructive to other tables):
--   DROP TABLE IF EXISTS xero_invoices;
--   DROP TABLE IF EXISTS xero_contacts;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.xero_invoices (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── What this invoice is + where it came from ─────────────────────────────
  invoice_type        text        NOT NULL,                 -- XERO_INVOICE_TYPES (concept_fee, design_package, progress_claim, job_variation, deposit)
  source_type         text        NOT NULL,                 -- lead | progress_claim | job_variation
  source_id           uuid        NOT NULL,                 -- the row in that source table (for a lead-scoped fee, the lead id)
  lead_id             uuid        NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id              uuid        NULL REFERENCES public.jobs(id)  ON DELETE SET NULL,

  -- ── Hub-side money + status (status vocab in constants.js; no DB CHECK) ────
  status              text        NOT NULL DEFAULT 'draft',  -- draft -> authorised -> sent -> part_paid -> paid (+ void, error)
  amount_ex_gst       numeric(12,2) NOT NULL,                -- what we asked Xero to bill, EX-GST
  currency            text        NOT NULL DEFAULT 'AUD',

  -- ── Xero identity + money truth (copied from Xero — never recomputed) ──────
  xero_tenant_id      text        NULL,
  xero_invoice_id     text        NULL,                      -- Xero InvoiceID (uuid) — UNIQUE below
  xero_invoice_number text        NULL,                      -- human number, e.g. INV-0042
  xero_status         text        NULL,                      -- DRAFT | SUBMITTED | AUTHORISED | PAID | VOIDED
  xero_total          numeric(12,2) NULL,                    -- inc-GST total from Xero
  amount_due          numeric(12,2) NULL,
  amount_paid         numeric(12,2) NULL,
  online_invoice_url  text        NULL,                      -- Xero pay link (AUTHORISED only)
  last_synced_at      timestamptz NULL,

  -- ── Idempotency + exactly-once send lock ──────────────────────────────────
  idempotency_key     uuid        NOT NULL DEFAULT gen_random_uuid(),
  send_source         text        NULL,                      -- null until sent; 'hub_smtp' once claimed (P2)
  sent_at             timestamptz NULL,
  sent_to_email       text        NULL,

  -- ── Storage pointers (the official Xero PDF, filed to Dropbox/portal in P2) ─
  xero_contact_id     text        NULL,
  pdf_storage_path    text        NULL,
  job_document_id     uuid        NULL,
  portal_document_id  uuid        NULL,

  -- ── Audit ─────────────────────────────────────────────────────────────────
  error_message       text        NULL,
  created_by          uuid        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT xero_invoices_scope_chk CHECK (lead_id IS NOT NULL OR job_id IS NOT NULL)
);

-- One invoice per source row (app + DB anti-double-create).
CREATE UNIQUE INDEX IF NOT EXISTS xero_invoices_source_uidx
  ON public.xero_invoices (source_type, source_id);
-- Xero InvoiceID is globally unique (partial — many rows are pre-create with NULL).
CREATE UNIQUE INDEX IF NOT EXISTS xero_invoices_xero_id_uidx
  ON public.xero_invoices (xero_invoice_id) WHERE xero_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS xero_invoices_lead_idx   ON public.xero_invoices (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS xero_invoices_job_idx    ON public.xero_invoices (job_id)  WHERE job_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS xero_invoices_status_idx ON public.xero_invoices (status);

-- ── Xero contact cache — so we don't re-create a Xero Contact each invoice ────
CREATE TABLE IF NOT EXISTS public.xero_contacts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_tenant_id    text        NOT NULL,
  xero_contact_id   text        NOT NULL,
  crm_contact_id    uuid        NULL REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  lead_id           uuid        NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id            uuid        NULL REFERENCES public.jobs(id)  ON DELETE SET NULL,
  name              text        NULL,
  email             text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xero_contacts_tenant_contact_uq UNIQUE (xero_tenant_id, xero_contact_id)
);
CREATE INDEX IF NOT EXISTS xero_contacts_email_idx ON public.xero_contacts (lower(email)) WHERE email IS NOT NULL;

-- ── RLS — match the finance-table house style (service role bypasses; the app
--    reads these only through the admin-gated API, never the browser directly) ─
ALTER TABLE public.xero_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xero_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xero_invoices' AND policyname = 'auth_users') THEN
    CREATE POLICY "auth_users" ON public.xero_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xero_contacts' AND policyname = 'auth_users') THEN
    CREATE POLICY "auth_users" ON public.xero_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
