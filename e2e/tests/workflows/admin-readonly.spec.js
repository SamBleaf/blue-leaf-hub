import { test, expect } from "@playwright/test";
import { getUser } from "../../helpers/runtime.mjs";
import { loginViaUI, dismissRolePicker } from "../../helpers/auth.mjs";
import { apiAsRole } from "../../helpers/api.mjs";

test.describe("Admin workflow reads", () => {
  test.beforeEach(async ({ page }) => {
    const admin = getUser("admin");
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("blhub_role", "director"));
    await loginViaUI(page, { email: admin.email, password: admin.password });
    await dismissRolePicker(page, "director");
  });

  test("sales pipeline loads", async ({ page }) => {
    await page.goto("/sales");
    await expect(page).toHaveURL(/\/sales/);
    await expect(page.locator("body")).not.toContainText("Failed to load");
  });

  test("operations list loads", async ({ page }) => {
    await page.goto("/operations");
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });

  test("finance manager loads", async ({ page }) => {
    await page.goto("/finance");
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });

  test("workforce page loads for admin", async ({ page }) => {
    await page.goto("/workforce");
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });

  test("API: sales leads returns array for admin", async () => {
    const { status, body } = await apiAsRole("admin", "/api/sales/leads");
    expect(status).toBe(200);
    expect(body?.ok).toBe(true);
    expect(Array.isArray(body?.leads)).toBe(true);
  });

  test("API: finance jobs returns data for admin", async () => {
    const { status, body } = await apiAsRole("admin", "/api/finance/jobs");
    expect(status).toBe(200);
    expect(body).toBeTruthy();
  });

  test("API: E2E lead exists in pipeline", async () => {
    const { loadRuntime } = await import("../../helpers/runtime.mjs");
    const leadId = loadRuntime().seed.leadId;
    const { status, body } = await apiAsRole("admin", `/api/sales/leads/${leadId}`);
    expect(status).toBe(200);
    expect(body?.lead?.id || body?.id).toBeTruthy();
  });
});

test.describe("Supervisor boundaries", () => {
  test("supervisor cannot access sales (redirected)", async ({ page }) => {
    const sup = getUser("supervisor");
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("blhub_role", "supervisor"));
    await loginViaUI(page, { email: sup.email, password: sup.password });
    await page.goto("/sales");
    // Sales is admin-only — supervisor must be redirected away
    await expect(page).toHaveURL(/\/(home|supervisor|operations)/);
  });

  test("supervisor can access operations", async ({ page }) => {
    const sup = getUser("supervisor");
    await loginViaUI(page, { email: sup.email, password: sup.password });
    await page.goto("/operations");
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });

  test("API: supervisor blocked from finance jobs", async () => {
    const { status } = await apiAsRole("supervisor", "/api/finance/jobs");
    expect([401, 403]).toContain(status);
  });
});
