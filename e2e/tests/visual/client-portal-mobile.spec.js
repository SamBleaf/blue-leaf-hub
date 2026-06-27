import { test, expect } from "@playwright/test";
import { getUser } from "../../helpers/runtime.mjs";
import { loginViaUI } from "../../helpers/auth.mjs";

test.describe("Client portal mobile layout", () => {
  test.beforeEach(async ({ page }) => {
    const client = getUser("client");
    await loginViaUI(page, { email: client.email, password: client.password, expectPath: "/client-portal" });
  });

  test("home fits mobile viewport without horizontal scroll", async ({ page }) => {
    await page.goto("/client-portal");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    await expect(page).toHaveScreenshot("client-portal-home-mobile.png", { maxDiffPixelRatio: 0.08 });
  });

  test("actions page readable on mobile", async ({ page }) => {
    await page.goto("/client-portal/actions");
    await expect(page.locator("body")).toContainText(/Splashback|Variation|Action/i, { timeout: 20_000 });
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth + 5;
    });
    expect(overflow).toBe(false);
  });
});
