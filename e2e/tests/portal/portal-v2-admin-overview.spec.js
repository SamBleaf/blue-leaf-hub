/**
 * W18-UI-01 — PortalV2Admin overview E2E smoke
 *
 * Proves staff/admin UI supports client portal onboarding workflow:
 * - route reachable (admin only)
 * - overview loads with project + v2 settings + invite + linked clients
 * - non-admin blocked from route
 * - invite UI uses proven /api/auth/invite path
 * - no legacy contractual-approval affordance on v2 admin
 */
import { test, expect } from "@playwright/test";
import { getUser, loadRuntime } from "../../helpers/runtime.mjs";
import { loginViaUI, dismissRolePicker } from "../../helpers/auth.mjs";
import { apiAsRole } from "../../helpers/api.mjs";

function v2AdminPath(projectId) {
  return `/portal-admin/${projectId}/v2`;
}

async function loginAdmin(page) {
  const admin = getUser("admin");
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("blhub_role", "director"));
  await loginViaUI(page, { email: admin.email, password: admin.password });
  await dismissRolePicker(page, "director");
}

test.describe("W18-UI-01 PortalV2Admin overview", () => {
  let projectId;
  let addressSnippet;

  test.beforeAll(() => {
    const rt = loadRuntime();
    projectId = rt.seed.projectA;
    addressSnippet = "Folkstone";
  });

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("admin route reachable and overview loads", async ({ page }) => {
    await page.goto(v2AdminPath(projectId));
    await expect(page.getByRole("heading", { name: /Client Portal v2 — Admin/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText("Failed to load");
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    await expect(page.getByText(addressSnippet, { exact: false }).first()).toBeVisible();
  });

  test("shows Portal v2 enabled settings control", async ({ page }) => {
    await page.goto(v2AdminPath(projectId));
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Portal v2 enabled (client login)")).toBeVisible();
    const v2Checkbox = page.getByRole("checkbox").first();
    await expect(v2Checkbox).toBeChecked();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeVisible();
  });

  test("shows client invite section and linked client state", async ({ page }) => {
    await page.goto(v2AdminPath(projectId));
    await expect(page.getByRole("heading", { name: "Client access" }).first()).toBeVisible();
    await expect(page.getByPlaceholder("client@email.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite client" })).toBeVisible();
    // Seeded E2E client linked to project A
    await expect(page.locator("body")).toContainText(/primary.*active|active/i);
  });

  test("shows revoke/restore client access controls when clients linked", async ({ page }) => {
    await page.goto(v2AdminPath(projectId));
    await expect(page.getByRole("heading", { name: "Client access" }).nth(1)).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke" })).toBeVisible();
  });

  test("shows operational sections (milestones, selections) for readiness check", async ({ page }) => {
    await page.goto(v2AdminPath(projectId));
    await expect(page.getByRole("heading", { name: "Milestones (Project Journey)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Selections" })).toBeVisible();
    await expect(page.locator("body")).toContainText(/Frame|Splashback/i);
  });

  test("invite button calls proven /api/auth/invite API", async ({ page }) => {
    await page.goto(v2AdminPath(projectId));
    const inviteReq = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().includes("/api/auth/invite"),
      { timeout: 15_000 }
    );
    await page.getByPlaceholder("Client name").fill("__BLH TEST__ UI01 Probe");
    await page.getByPlaceholder("client@email.com").fill(`blh.test.ui01.${Date.now()}@blueleafbuilding.test`);
    await page.getByRole("button", { name: "Invite client" }).click();
    const req = await inviteReq;
    const body = req.postDataJSON();
    expect(body.role).toBe("client");
    expect(body.projectId).toBe(projectId);
    expect(body.email).toMatch(/@blueleafbuilding\.test$/);
  });

  test("no legacy token contractual approval affordance on v2 admin", async ({ page }) => {
    await page.goto(v2AdminPath(projectId));
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/approve variation.*token|token.*approve variation/i);
    expect(text).not.toMatch(/Regenerate link/i);
    await expect(page.getByRole("button", { name: /Invite client/i })).toBeVisible();
  });

  test("link back to legacy portal admin list", async ({ page }) => {
    await page.goto(v2AdminPath(projectId));
    await expect(page.getByRole("link", { name: /← Portal admin/i })).toBeVisible();
  });
});

test.describe("W18-UI-01 role gating", () => {
  let projectId;

  test.beforeAll(() => {
    projectId = loadRuntime().seed.projectA;
  });

  test("supervisor redirected from PortalV2Admin (admin-only route)", async ({ page }) => {
    const sup = getUser("supervisor");
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("blhub_role", "supervisor"));
    await loginViaUI(page, { email: sup.email, password: sup.password });
    await page.goto(v2AdminPath(projectId));
    await expect(page).toHaveURL(/\/(home|supervisor|operations)/);
    await expect(page.getByRole("heading", { name: /Client Portal v2 — Admin/i })).not.toBeVisible();
  });

  test("employee redirected from PortalV2Admin", async ({ page }) => {
    const emp = getUser("employee");
    await loginViaUI(page, { email: emp.email, password: emp.password });
    await page.goto(v2AdminPath(projectId));
    await expect(page).toHaveURL(/\/(home|worker|operations)/);
  });

  test("W18-SEC-02 API: employee cannot generate-token", async () => {
    const { status } = await apiAsRole("employee", "/api/portal/admin/generate-token", {
      method: "POST",
      body: { projectId },
    });
    expect(status).toBe(403);
  });
});
