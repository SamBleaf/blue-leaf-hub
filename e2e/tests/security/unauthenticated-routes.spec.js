/**
 * QA-001 / SEC-01–04 — Security route baseline
 *
 * Asserts secure *target* behaviour (401/403). Failures document proven gaps
 * until Tier-0 fixes land — see docs/qa/QA_001_SECURITY_ROUTE_BASELINE_PLAN.md
 */
import { test, expect } from "@playwright/test";
import { apiFetch, apiAsRole } from "../../helpers/api.mjs";

const FAKE_RFQ_ID = "00000000-0000-4000-8000-000000000001";
const FAKE_PROJECT_ID = "00000000-0000-4000-8000-000000000002";

/** Secure rejection: unauthenticated callers must not reach handler with 2xx/404-as-auth. */
function expectAuthRejected(status) {
  expect([401, 403]).toContain(status);
}

test.describe("QA-SEC-01 — private staff routes reject unauthenticated", () => {
  test("GET /api/mail/inbox → 401/403", async () => {
    const { status } = await apiFetch("/api/mail/inbox");
    expectAuthRejected(status);
  });

  test("GET /api/quote-tracker/unmatched → 401/403", async () => {
    const { status } = await apiFetch("/api/quote-tracker/unmatched");
    expectAuthRejected(status);
  });

  test("POST /api/imap/quote-poll → 401/403", async () => {
    const { status } = await apiFetch("/api/imap/quote-poll", { method: "POST", body: {} });
    expectAuthRejected(status);
  });

  test("POST /api/rfq/extract → 401/403", async () => {
    const { status } = await apiFetch("/api/rfq/extract", { method: "POST", body: {} });
    expectAuthRejected(status);
  });
});

test.describe("QA-SEC-02 — public-by-design routes behave safely", () => {
  test("GET /api/health → 200", async () => {
    const { status, body } = await apiFetch("/api/health");
    expect(status).toBe(200);
    expect(body?.ok ?? true).toBeTruthy();
  });

  test("POST /api/public/enquiry without name/email → 400", async () => {
    const { status, body } = await apiFetch("/api/public/enquiry", {
      method: "POST",
      body: { phone: "0400000000" },
    });
    expect(status).toBe(400);
    expect(String(body?.error || "")).toMatch(/name|email/i);
  });

  test("GET /api/induction/:projectId/info unknown UUID → 404", async () => {
    const { status } = await apiFetch(`/api/induction/${FAKE_PROJECT_ID}/info`);
    expect(status).toBe(404);
  });

  test("GET /api/track/email/pixel-test → 200 gif (public pixel)", async () => {
    const res = await fetch(`${process.env.E2E_API_URL || "http://127.0.0.1:8787"}/api/track/email/qa-sec-baseline-pixel`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/gif/i);
  });
});

test.describe("QA-SEC-03 — side-effect routes reject unauthenticated", () => {
  test("POST /api/dropbox/ensure-job-folders → 401/403", async () => {
    const { status } = await apiFetch("/api/dropbox/ensure-job-folders", {
      method: "POST",
      body: { jobAddress: "BLH TEST QA SEC Baseline" },
    });
    expectAuthRejected(status);
  });

  test("POST /api/dropbox/upload-tender-document → 401/403", async () => {
    const { status } = await apiFetch("/api/dropbox/upload-tender-document", {
      method: "POST",
      body: { jobAddress: "BLH TEST", fileName: "x.pdf", dataBase64: "AA==" },
    });
    expectAuthRejected(status);
  });

  test("POST /api/cron/rfq-reminders → 401/403", async () => {
    const { status } = await apiFetch("/api/cron/rfq-reminders", { method: "POST", body: {} });
    expectAuthRejected(status);
  });

  test("POST /api/cron/lead-time-notifications → 401/403", async () => {
    const { status } = await apiFetch("/api/cron/lead-time-notifications", { method: "POST", body: {} });
    expectAuthRejected(status);
  });

  test("POST /api/rfq/:id/reextract-amount → 401/403 (not open handler)", async () => {
    const { status } = await apiFetch(`/api/rfq/${FAKE_RFQ_ID}/reextract-amount`, {
      method: "POST",
      body: {},
    });
    expectAuthRejected(status);
  });

  test("POST /api/subcontractors/csv-template-sheet → 401/403", async () => {
    const { status } = await apiFetch("/api/subcontractors/csv-template-sheet", {
      method: "POST",
      body: { csv: "name,email\nBLH TEST,test@example.com" },
    });
    expectAuthRejected(status);
  });

  test("POST /api/blueprint/learn → 401/403", async () => {
    const { status } = await apiFetch("/api/blueprint/learn", {
      method: "POST",
      body: { content: "BLH TEST security baseline" },
    });
    expectAuthRejected(status);
  });

  test("POST /api/blueprint/review-document → 401/403", async () => {
    const { status } = await apiFetch("/api/blueprint/review-document", {
      method: "POST",
      body: { documentText: "BLH TEST" },
    });
    expectAuthRejected(status);
  });
});

test.describe("QA-SEC-04 — admin-only routes reject lower roles / unauthenticated", () => {
  test("employee GET /api/quote-tracker/unmatched → 403", async () => {
    const { status } = await apiAsRole("employee", "/api/quote-tracker/unmatched");
    expect(status).toBe(403);
  });

  test("employee GET /api/mail/inbox → 403", async () => {
    const { status } = await apiAsRole("employee", "/api/mail/inbox");
    expect(status).toBe(403);
  });

  test("employee POST /api/imap/quote-poll → 403", async () => {
    const { status } = await apiAsRole("employee", "/api/imap/quote-poll", {
      method: "POST",
      body: {},
    });
    expect(status).toBe(403);
  });
});

test.describe("QA-SEC-05 — portal admin requires staff auth", () => {
  test("unauthenticated POST /api/portal/admin/generate-token → 401", async () => {
    const { status } = await apiFetch("/api/portal/admin/generate-token", {
      method: "POST",
      body: { projectId: FAKE_PROJECT_ID },
    });
    expect(status).toBe(401);
  });

  test("employee POST /api/portal/admin/generate-token → 403 (W18-SEC-02 / QA-001-GAP-10)", async () => {
    const { status } = await apiAsRole("employee", "/api/portal/admin/generate-token", {
      method: "POST",
      body: { projectId: FAKE_PROJECT_ID },
    });
    expect(status).toBe(403);
  });

  test("supervisor POST /api/portal/admin/generate-token → 403 (admin-only policy)", async () => {
    const { status } = await apiAsRole("supervisor", "/api/portal/admin/generate-token", {
      method: "POST",
      body: { projectId: FAKE_PROJECT_ID },
    });
    expect(status).toBe(403);
  });

  test("admin POST /api/portal/admin/generate-token → not 403", async () => {
    const { status } = await apiAsRole("admin", "/api/portal/admin/generate-token", {
      method: "POST",
      body: { projectId: FAKE_PROJECT_ID },
    });
    expect(status).not.toBe(403);
    expect(status).not.toBe(401);
  });
});
