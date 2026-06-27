import { test, expect } from "@playwright/test";
import { loadRuntime } from "../../helpers/runtime.mjs";
import { apiAsRole, leakScan, FORBIDDEN_CLIENT_LEAKS } from "../../helpers/api.mjs";
import { getAccessToken } from "../../helpers/auth.mjs";

test.describe("Client portal API isolation", () => {
  let projectA;
  let projectB;
  let clientAToken;
  let clientBToken;

  test.beforeAll(async () => {
    const rt = loadRuntime();
    projectA = rt.seed.projectA;
    projectB = rt.seed.projectB;
    clientAToken = await getAccessToken(rt.users.client.email, rt.users.client.password);
    clientBToken = await getAccessToken(rt.users.clientB.email, rt.users.clientB.password);
  });

  test("client A can read own portal home", async () => {
    const { status, body } = await apiAsRole("client", `/api/portal/app/${projectA}/home`);
    expect(status).toBe(200);
    expect(body?.ok).toBe(true);
    expect(leakScan(body, FORBIDDEN_CLIENT_LEAKS)).toEqual([]);
  });

  test("client A blocked from client B project (403)", async () => {
    const { status } = await apiAsRole("client", `/api/portal/app/${projectB}/home`);
    expect(status).toBe(403);
  });

  test("client B blocked from client A project (403)", async () => {
    const { status } = await apiAsRole("clientB", `/api/portal/app/${projectA}/home`);
    expect(status).toBe(403);
  });

  test("my-projects returns only linked project", async () => {
    const { status, body } = await apiAsRole("client", "/api/portal/my-projects");
    expect(status).toBe(200);
    const ids = (body?.projects || []).map((p) => p.projectId);
    expect(ids).toContain(projectA);
    expect(ids).not.toContain(projectB);
  });

  test("selections hide internal notes and supplier cost", async () => {
    const { status, body } = await apiAsRole("client", `/api/portal/app/${projectA}/selections`);
    expect(status).toBe(200);
    expect(leakScan(body, [...FORBIDDEN_CLIENT_LEAKS, "SECRET_MARGIN_NOTE_E2E", "SECRET_SUPPLIER_COST_E2E"])).toEqual([]);
  });

  test("client JWT blocked from staff CRM", async () => {
    const { status } = await fetch(`http://127.0.0.1:${process.env.PORT_API || "8787"}/api/crm/contacts`, {
      headers: { Authorization: `Bearer ${clientAToken}`, "Content-Type": "application/json" },
    }).then(async (r) => ({ status: r.status }));
    expect([401, 403]).toContain(status);
  });

  test("client JWT blocked from finance jobs", async () => {
    const { status } = await fetch(`http://127.0.0.1:${process.env.PORT_API || "8787"}/api/finance/jobs`, {
      headers: { Authorization: `Bearer ${clientAToken}`, "Content-Type": "application/json" },
    }).then(async (r) => ({ status: r.status }));
    expect([401, 403]).toContain(status);
  });

  test("client blocked from portal admin v2 overview", async () => {
    const { status } = await apiAsRole("client", `/api/portal/admin/v2/${projectA}/overview`);
    expect(status).toBe(403);
  });
});
