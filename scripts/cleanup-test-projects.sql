-- ════════════════════════════════════════════════════════════════════════════
-- Finish the test-data clean: remove the remaining TEST PROJECTS.
-- ════════════════════════════════════════════════════════════════════════════
-- Why this needs SQL (not the Node cleanup script):
--   Deleting a project cascades to portal_audit_logs, which migration 105 makes
--   APPEND-ONLY via a trigger that blocks DELETE for EVERY role — including the
--   service-role the cleanup script uses. So those projects can only be removed
--   by briefly lifting that trigger, which requires DDL privilege (this editor).
--
-- Safety:
--   * Scoped strictly to test-marked addresses ('__E2E', '__DEMO', '__DRYRUN').
--     The regex ^__ matches a LITERAL double-underscore prefix (no real address
--     starts with "__"), so no real project can match.
--   * Wrapped in a single transaction; the trigger is restored before COMMIT.
--   * Run the SELECT first (uncommented) to eyeball the list before deleting.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — run this on its own first and confirm every row is test data:
-- SELECT id, address, status FROM projects WHERE address ~ '^__(E2E|DEMO|DRYRUN)';

-- 2) DELETE:
BEGIN;

ALTER TABLE portal_audit_logs DISABLE TRIGGER portal_audit_logs_immutable;

-- Remove the test projects' audit logs (now permitted), then the projects.
DELETE FROM portal_audit_logs
 WHERE project_id IN (SELECT id FROM projects WHERE address ~ '^__(E2E|DEMO|DRYRUN)');

DELETE FROM projects
 WHERE address ~ '^__(E2E|DEMO|DRYRUN)';

-- Restore append-only immutability.
ALTER TABLE portal_audit_logs ENABLE TRIGGER portal_audit_logs_immutable;

COMMIT;

-- 3) VERIFY (should return 0):
-- SELECT count(*) FROM projects WHERE address ~ '^__(E2E|DEMO|DRYRUN)';
