// @ts-check
// Hub review (19 Oct 2026, "Blue Leaf Hub Review and Changes") — checks in UI Review Mode (mocked backend).
//   HUB 003 Save as company standard in the drawing's More menu · HUB 004 perforation fields folded
//   HUB 008 Add supplier from the order · HUB 011 show / hide takeoff lines on the plan · HUB 012 lengths in a flashing
//   HUB 002 choose Flashings or Timber and cladding first; compact rows · HUB 007 separate orders per section
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
const SECTION_NAME = { flashings: "Flashings", timber_cladding: "Timber and cladding" };
async function open(page, { section = "flashings", seed = "" } = {}) {
  await page.goto(`/carpentry/cjb-1/takeoff?reviewRole=admin${seed}`);
  await ready(page);
  await page.locator(`[data-section="${section}"]`).click();
  await expect(page.getByRole("heading", { level: 1, name: SECTION_NAME[section] })).toBeVisible();
}
/** Tap a material row (by name) so its actions show, then tap one. */
async function rowAction(page, name, action) {
  const row = page.locator("[data-material-row]").filter({ hasText: name });
  if ((await row.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await row.locator("button[aria-expanded]").first().click();
  await row.locator("[data-material-actions]").getByRole("button", { name: action, exact: true }).click();
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
  await rowAction(page, "Apron flashing", "Details");
  const list = page.locator("[data-flashing-lengths]");
  await expect(list).toBeVisible();
  await expect(list.getByRole("heading")).toContainText(/pieces · .* LM/);
  await expect(list.locator("li").first()).toContainText(/\d mm/);
});

test("HUB 004: choosing Perforated keeps the custom fields folded under 'Perforation details'", async ({ page }) => {
  await open(page);
  await rowAction(page, "Apron flashing", "Details");
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
  await rowAction(page, "Apron flashing", "Profile");
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

test("HUB 002: the takeoff starts with Flashings or Timber and cladding; each section only offers its own materials", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&takeoffSeed=mixed");
  await ready(page);
  await expect(page.locator("[data-takeoff-sections] [data-section]")).toHaveCount(2);
  await page.locator('[data-section="flashings"]').click();
  // Flashings: Add flashing only — no timber / cladding / aluminium, and no timber or cladding rows
  await expect(page.getByRole("button", { name: "Add flashing" })).toBeVisible();
  for (const n of ["Add timber", "Add cladding", "Add aluminium"]) await expect(page.getByRole("button", { name: n })).toHaveCount(0);
  await expect(page.locator("[data-material-row]").filter({ hasText: "Axon cladding" })).toHaveCount(0);
  // a compact row shows its actions only once tapped; Remove sits inside More
  const apron = page.locator("[data-material-row]").filter({ hasText: "Apron flashing" });
  await expect(apron.locator("[data-material-actions]")).toHaveCount(0);
  await apron.locator("button[aria-expanded]").first().click();
  await expect(apron.getByRole("button", { name: "Details", exact: true })).toBeVisible();
  await expect(apron.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await apron.getByRole("button", { name: "More", exact: true }).click();
  await expect(apron.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await expect(page.locator("[data-material-actions]")).toHaveCount(1); // only the tapped row's actions
  // switch section (same takeoff — nothing reloads): Timber and Cladding parts, no flashing actions
  await page.getByRole("group", { name: "Takeoff section" }).getByRole("button", { name: "Timber and cladding" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Timber and cladding" })).toBeVisible();
  await expect(page.locator('[data-material-group="timber"]').getByRole("button", { name: "Add timber" })).toBeVisible();
  await expect(page.locator('[data-material-group="cladding"]').getByRole("button", { name: "Add cladding" })).toBeVisible();
  await expect(page.locator('[data-material-group="cladding"]').getByRole("button", { name: "Add aluminium" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add flashing" })).toHaveCount(0);
  await expect(page.locator('[data-material-group="timber"] [data-material-row]').filter({ hasText: "Rafters 90 × 45" })).toHaveCount(1);
  await expect(page.locator('[data-material-group="cladding"] [data-material-row]').filter({ hasText: "Window angle 50 × 50 × 3" })).toHaveCount(1); // aluminium under Cladding
  await expect(page.locator("[data-material-row]").filter({ hasText: "Apron flashing" })).toHaveCount(0);
  // and back: the flashings are all still there
  await page.getByRole("group", { name: "Takeoff section" }).getByRole("button", { name: "Flashings" }).click();
  await expect(page.locator("[data-material-row]").filter({ hasText: "Apron flashing" })).toHaveCount(1);
});

test("HUB 007: Flashings and Timber and cladding are separate orders — no line crosses between them", async ({ page }) => {
  await open(page, { seed: "&takeoffSeed=mixed" });
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await expect(page.getByRole("heading", { name: "Flashings orders" })).toBeVisible();
  await page.getByRole("button", { name: "New order" }).click();
  await expect(page.getByText("Lengths on this order")).toBeVisible();
  await expect(page.locator("[data-order-part]")).toHaveCount(0);
  await expect(page.locator("[data-order-group]")).toHaveCount(0);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("group", { name: "Takeoff section" }).getByRole("button", { name: "Timber and cladding" }).click();
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await expect(page.getByRole("heading", { name: "Timber and cladding orders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New order" })).toBeVisible(); // the flashing draft isn't shown here
  await expect(page.getByRole("heading", { name: /^Draft / })).toHaveCount(0);
  await page.getByRole("button", { name: "New order" }).click();
  await expect(page.locator('[data-order-part="timber"]')).toBeVisible();
  await expect(page.locator('[data-order-part="cladding"]')).toBeVisible();
  await expect(page.locator('[data-order-part="timber"]')).toContainText("Rafters 90 × 45");
  await expect(page.locator('[data-order-part="cladding"]')).toContainText("Axon cladding");
  await expect(page.getByText("Lengths on this order")).toHaveCount(0);
});

test("HUB 007: an accessory from a different supplier is left off the timber and cladding order and named", async ({ page }) => {
  await open(page, { section: "timber_cladding", seed: "&takeoffSeed=mixed&takeoffFixings=1" });
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  await expect(page.locator('[data-order-part="cladding"]')).toBeVisible();
  // the fixings say "Fielders"; the default supplier is "Fielders (review branch)" — same supplier, so they ride along
  await expect(page.locator('[data-order-part="cladding"]')).toContainText("Cladding fixings");
});
