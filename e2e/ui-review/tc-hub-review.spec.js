// @ts-check
// Hub review (19 Oct 2026, "Blue Leaf Hub Review and Changes") — Batch 1 checks in UI Review Mode (mocked backend).
//   HUB 003 Save as company standard in the drawing's More menu · HUB 004 perforation fields folded
//   HUB 008 Add supplier from the order · HUB 011 show / hide takeoff lines on the plan · HUB 012 lengths in a flashing
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
async function open(page) {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
  await ready(page);
  await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();
}

test("HUB 008: office staff add a supplier from the order and it is selected straight away", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  if (await page.getByRole("button", { name: "New order" }).isVisible()) await page.getByRole("button", { name: "New order" }).click();
  await page.getByRole("button", { name: "Add supplier" }).click();
  const form = page.locator("[data-add-supplier]");
  await form.getByLabel("Supplier name").fill("Stratco Wingfield");
  await form.getByLabel("Phone (optional)").fill("08 8000 1234");
  await form.getByRole("button", { name: "Save supplier" }).click();
  await expect(form).toHaveCount(0);
  const select = page.locator("#ord-supplier");
  await expect(select.locator("option:checked")).toHaveText("Stratco Wingfield");
  await expect(page.getByText(/Added Stratco Wingfield/)).toBeVisible();
});

test("HUB 012: a flashing's details list every finished length with its quantity and source", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Details" }).first().click();
  const list = page.locator("[data-flashing-lengths]");
  await expect(list).toBeVisible();
  await expect(list.getByRole("heading")).toContainText(/pieces · .* LM/);
  await expect(list.locator("li").first()).toContainText(/\d mm/);
});

test("HUB 004: choosing Perforated keeps the custom fields folded under 'Perforation details'", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Details" }).first().click();
  await page.getByRole("radio", { name: "Perforated" }).check({ force: true }).catch(async () => page.getByText("Perforated", { exact: true }).click());
  const det = page.locator("[data-perforation-details]");
  await expect(det).toBeVisible();
  await expect(det).toContainText("Perforation details");
  await expect(page.getByLabel("Hole size")).toBeHidden();
  await det.locator("summary").click();
  await expect(page.getByLabel("Hole size")).toBeVisible();
});

test("HUB 003: 'Save as company standard' is in the drawing's More menu", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Profile" }).first().click();
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: "Save as company standard" })).toBeVisible();
});

test("HUB 011: Hide lines hides the takeoff overlays without deleting anything; Show lines brings them back", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
  const lines = page.locator("[data-measurement-id]");
  const before = await lines.count();
  expect(before).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Hide takeoffs on the plan" }).click();
  await expect(lines).toHaveCount(0);
  await expect(page.getByText(/Takeoff lines are hidden on this page — nothing is deleted/)).toBeVisible();
  await page.getByRole("button", { name: "Show takeoffs on the plan" }).click();
  await expect(lines).toHaveCount(before);
});
