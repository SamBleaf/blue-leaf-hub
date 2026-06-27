import { test, expect } from "@playwright/test";
import { apiAsRole } from "../../helpers/api.mjs";

/**
 * W22-SEC-001 — CRM bulk-email + bulk-import must be admin-only.
 * Outbound customer email (Spam Act) + bulk PII import are not employee/supervisor capabilities.
 * These routes were `requireAuth` only (any staff token); the fix adds inline requireRole("admin").
 *
 * Payloads below intentionally fail validation BEFORE any DB write, so the admin "passes the gate"
 * assertions create no test data — they only prove the role middleware lets admin through (the
 * follow-on 400/404/503 is expected and not a role rejection).
 */
const FAKE = "00000000-0000-0000-0000-000000000000";

const ROUTES = [
  { name: "create send", path: "/api/crm/sends", body: {} },               // admin → 400 (mailingListId required)
  { name: "trigger send", path: `/api/crm/sends/${FAKE}/send`, body: {} },  // admin → 503/404 (not 403)
  { name: "csv import", path: `/api/crm/lists/${FAKE}/import`, body: {} },  // admin → 400 (rows[] required)
];

test.describe("W22-SEC-001 — CRM send/import is admin-only", () => {
  for (const r of ROUTES) {
    test(`employee is forbidden: ${r.name}`, async () => {
      const { status } = await apiAsRole("employee", r.path, { method: "POST", body: r.body });
      expect(status).toBe(403);
    });

    test(`supervisor is forbidden: ${r.name}`, async () => {
      const { status } = await apiAsRole("supervisor", r.path, { method: "POST", body: r.body });
      expect(status).toBe(403);
    });

    test(`admin passes the role gate: ${r.name}`, async () => {
      const { status } = await apiAsRole("admin", r.path, { method: "POST", body: r.body });
      expect(status).not.toBe(403);
      expect(status).not.toBe(401);
    });
  }
});
