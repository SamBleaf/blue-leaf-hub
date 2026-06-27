import { test, expect } from "@playwright/test";
import { apiFetch } from "../../helpers/api.mjs";

test.describe("API smoke", () => {
  test("GET /api/health returns ok", async () => {
    const { status, body } = await apiFetch("/api/health");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test("GET /api/integrations/status returns integration map", async () => {
    const { status, body } = await apiFetch("/api/integrations/status");
    expect(status).toBe(200);
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });

  test("unauthenticated staff sales endpoint returns 401", async () => {
    const { status } = await apiFetch("/api/sales/leads");
    expect(status).toBe(401);
  });

  test("portal v2 client route rejects no auth", async () => {
    const fake = "00000000-0000-0000-0000-000000000000";
    const { status } = await apiFetch(`/api/portal/app/${fake}/home`);
    expect(status).toBe(401);
  });

  test("portal v2 admin route rejects no auth", async () => {
    const fake = "00000000-0000-0000-0000-000000000000";
    const { status } = await apiFetch(`/api/portal/admin/v2/${fake}/overview`);
    expect(status).toBe(401);
  });
});
