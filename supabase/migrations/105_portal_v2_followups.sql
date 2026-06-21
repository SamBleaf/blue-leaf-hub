-- ════════════════════════════════════════════════════════════════════════════
-- Migration 105 — Client Portal v2.0 fast-follows
-- ════════════════════════════════════════════════════════════════════════════
-- 1. projects.payment_instructions — the "how to pay" block shown to the client
--    on a progress claim (bank details / reference). Set per-project by the admin
--    in the Portal v2 admin console; copied onto each portal_claim when a claim is
--    issued. (There was no stored bank-detail source before — claims couldn't show
--    payment instructions.)
-- 2. portal_audit_logs immutability — a trigger that blocks UPDATE/DELETE for ALL
--    roles (including service-role, which bypasses RLS). Makes the contractual
--    audit trail genuinely append-only at the DB level.
--
-- Idempotent; safe to re-paste.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS payment_instructions text;

-- ── Audit-log immutability (append-only enforced for every role) ─────────────
CREATE OR REPLACE FUNCTION block_portal_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'portal_audit_logs is append-only — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS portal_audit_logs_immutable ON portal_audit_logs;
CREATE TRIGGER portal_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON portal_audit_logs
  FOR EACH ROW EXECUTE FUNCTION block_portal_audit_mutation();

-- ════════════════════════════════════════════════════════════════════════════
-- End Migration 105
-- ════════════════════════════════════════════════════════════════════════════
