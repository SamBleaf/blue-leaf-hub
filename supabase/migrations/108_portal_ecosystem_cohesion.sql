-- 108_portal_ecosystem_cohesion.sql
-- Portal ecosystem cohesion fixes (Wave 2/3 of the cohesion-audit remediation).
-- Manual-apply (Supabase dashboard SQL editor). Idempotent. Safe to re-run.
--
-- Purpose:
--   1. Widen portal_decisions status so a VOIDED variation can be WITHDRAWN from
--      the client (today the 027 CHECK only allows pending/approved/declined/
--      info_requested, so a 'withdrawn' write is rejected and silently swallowed —
--      leaving a live Approve button on a cancelled variation).
--   2. Widen portal_claims status so a VOIDED claim can be marked 'void' and a
--      partially-paid claim shows 'partially_paid' instead of being mapped to
--      'invoiced' — plus a paid_to_date column to carry the amount paid so far.
--
-- NOTE on numbering: migrations 106/107 are owned by the system-architect agent.
-- Confirm 106/107 do NOT already alter these two CHECK constraints before applying
-- this file, to avoid a conflicting constraint definition.

-- ── portal_decisions: allow 'withdrawn' ──────────────────────────────────────
ALTER TABLE portal_decisions DROP CONSTRAINT IF EXISTS portal_decisions_status_check;
ALTER TABLE portal_decisions
  ADD CONSTRAINT portal_decisions_status_check
  CHECK (status IN ('pending', 'approved', 'declined', 'info_requested', 'withdrawn'));

-- ── portal_claims: allow 'partially_paid' and 'void' + carry paid-to-date ─────
ALTER TABLE portal_claims DROP CONSTRAINT IF EXISTS portal_claims_status_check;
ALTER TABLE portal_claims
  ADD CONSTRAINT portal_claims_status_check
  CHECK (status IN ('upcoming', 'invoiced', 'partially_paid', 'paid', 'void'));

ALTER TABLE portal_claims
  ADD COLUMN IF NOT EXISTS paid_to_date numeric(12,2);
