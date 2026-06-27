import { test, expect } from "@playwright/test";

test.describe("Login page layout", () => {
  test("desktop login form renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page).toHaveScreenshot("login-desktop.png", { maxDiffPixelRatio: 0.05 });
  });
});
