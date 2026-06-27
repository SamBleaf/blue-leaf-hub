import { test, expect } from "@playwright/test";
import { getUser } from "../../helpers/runtime.mjs";
import { loginViaUI } from "../../helpers/auth.mjs";

test.describe("Client portal v2 navigation", () => {
  test.beforeEach(async ({ page }) => {
    const client = getUser("client");
    await loginViaUI(page, { email: client.email, password: client.password, expectPath: "/client-portal" });
  });

  const navCases = [
    { path: "/client-portal", label: /Home/i },
    { path: "/client-portal/actions", label: /Actions|My Actions/i },
    { path: "/client-portal/journey", label: /Journey|Project Journey/i },
    { path: "/client-portal/selections", label: /Selections|Select/i },
    { path: "/client-portal/documents", label: /Documents|Docs/i },
    { path: "/client-portal/messages", label: /Messages/i },
  ];

  for (const { path, label } of navCases) {
    test(`loads ${path} without error state`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText("Something went wrong");
      await expect(page.locator("body")).not.toContainText("Failed to load");
      // Nav link or heading should be present
      await expect(page.getByRole("link", { name: label }).first()).toBeVisible({ timeout: 20_000 });
    });
  }

  test("actions page shows seeded pending items", async ({ page }) => {
    await page.goto("/client-portal/actions");
    await expect(page.locator("body")).toContainText(/Splashback|Variation|Approve/i, { timeout: 20_000 });
  });

  test("journey shows current frame stage", async ({ page }) => {
    await page.goto("/client-portal/journey");
    await expect(page.locator("body")).toContainText(/Frame|Roof/i, { timeout: 20_000 });
  });

  test("no internal cost fields visible in DOM", async ({ page }) => {
    await page.goto("/client-portal/selections");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/SECRET_MARGIN|SECRET_SUPPLIER|cost_to_builder|internal_notes/i);
    expect(text).not.toMatch(/cost to builder|margin note/i);
  });
});
