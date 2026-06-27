import { test, expect } from "@playwright/test";
import { getUser } from "../../helpers/runtime.mjs";
import { loginViaUI, dismissRolePicker } from "../../helpers/auth.mjs";

test.describe("Authentication & route protection", () => {
  test("unauthenticated user is redirected to login from /sales", async ({ page }) => {
    await page.goto("/sales");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("unauthenticated user is redirected from /finance", async ({ page }) => {
    await page.goto("/finance");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user is redirected from /client-portal", async ({ page }) => {
    await page.goto("/client-portal");
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin can reach sales pipeline after login", async ({ page }) => {
    const admin = getUser("admin");
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("blhub_role", "director"));
    await loginViaUI(page, { email: admin.email, password: admin.password });
    await dismissRolePicker(page, "director");
    await page.goto("/sales");
    await expect(page).toHaveURL(/\/sales/);
    await expect(page.locator("body")).not.toContainText("Invalid email or password");
  });

  test("client login lands on client portal", async ({ page }) => {
    const client = getUser("client");
    await loginViaUI(page, { email: client.email, password: client.password, expectPath: "/client-portal" });
    await expect(page.getByRole("link", { name: /Home/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("client cannot access admin finance route", async ({ page }) => {
    const client = getUser("client");
    await loginViaUI(page, { email: client.email, password: client.password });
    await page.goto("/finance");
    // RoleRoute redirects client away — should not show finance manager content
    await expect(page).not.toHaveURL(/\/finance\/jobs/);
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).not.toMatch(/invoice inbox|director portfolio/);
  });

  test("employee is redirected to supervisor home", async ({ page }) => {
    const emp = getUser("employee");
    await loginViaUI(page, { email: emp.email, password: emp.password });
    await expect(page).toHaveURL(/\/(supervisor|operations)/);
  });
});
