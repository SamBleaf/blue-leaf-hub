-- 123 — Admin data-cleanup: privileged project delete.
--
-- Deleting a project cascades into portal_audit_logs, which is append-only (migration 105's
-- portal_audit_logs_immutable trigger blocks DELETE for EVERY role, including the service role).
-- So the app can never hard-delete a project that has any portal audit history.
--
-- This SECURITY DEFINER function (owned by the migration role) briefly disables ONLY that one
-- immutability trigger around the delete, then re-enables it. It runs inside the RPC's
-- transaction, so any failure ROLLS BACK with the trigger restored — the audit log can never be
-- left mutable. It is used solely by the admin "Data Cleanup" tool, which re-validates that every
-- id is a test-marked record before calling this.

CREATE OR REPLACE FUNCTION admin_delete_projects(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Lift audit-log immutability ONLY for this transaction's cascade. Cascade + FK checks still
  -- apply (we disable a single user trigger, not session_replication_role).
  ALTER TABLE portal_audit_logs DISABLE TRIGGER portal_audit_logs_immutable;

  DELETE FROM projects WHERE id = ANY(p_ids);
  GET DIAGNOSTICS n = ROW_COUNT;

  ALTER TABLE portal_audit_logs ENABLE TRIGGER portal_audit_logs_immutable;
  RETURN n;
END;
$$;

-- Backend (service_role) only — never callable by portal clients or staff sessions.
REVOKE ALL ON FUNCTION admin_delete_projects(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_projects(uuid[]) TO service_role;
