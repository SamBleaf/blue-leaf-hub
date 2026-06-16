-- ============================================================================
-- 094_rfq_recipient_subject_variant.sql
-- RFQ Engine: A/B subject-line testing for subcontractor reply rates.
--   * Adds rfq_recipients.subject_variant (text, '' default).
--     'A' = trade-led subject, 'B' = direct-question subject (see src/lib/rfqComposer.js).
--   * Lets reply rates be compared by variant later, e.g.:
--       SELECT subject_variant,
--              count(*) AS sent,
--              count(quote_received_at) AS replied,
--              round(100.0 * count(quote_received_at) / nullif(count(*),0), 1) AS reply_pct
--       FROM rfq_recipients
--       WHERE subject_variant <> ''
--       GROUP BY subject_variant;
-- Idempotent + additive. Operational module fact (not a canonical project fact).
-- ============================================================================

ALTER TABLE public.rfq_recipients
  ADD COLUMN IF NOT EXISTS subject_variant text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.rfq_recipients.subject_variant IS
  'A/B subject-line variant sent to this recipient (''A''|''B''|''''). Set by composeRfqEmail; used to compare reply rates.';
