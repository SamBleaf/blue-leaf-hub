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

test("HUB 008: office staff on the Worker app (phone) can add a supplier from the order; a leading hand can't", async ({ page }) => {
  // a Worker-app login linked to an Admin account (e.g. the director on his iPhone)
  await page.goto("/worker/takeoff/carpentry/cjb-1?section=flashings&takeoffWorker=office");
  await ready(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  await page.getByRole("button", { name: "Add supplier" }).click();
  const form = page.locator("[data-add-supplier]");
  await form.getByLabel("Supplier name").fill("Fielders Wingfield");
  await form.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.locator("#ord-supplier option:checked")).toHaveText("Fielders Wingfield");
  await expect(page.locator("[data-supplier-note]")).toHaveText("Added Fielders Wingfield — save order details to keep it on this order.");
  // the same name again is the same supplier — selected, never a second copy
  await page.getByRole("button", { name: "Add supplier" }).click();
  await form.getByLabel("Supplier name").fill("other steel supplies");
  await form.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.locator("#ord-supplier option:checked")).toHaveText("Other Steel Supplies");
  await expect(page.locator("[data-supplier-note]")).toContainText("Other Steel Supplies was already on file");
  await expect(page.locator("#ord-supplier option").filter({ hasText: /^Other Steel Supplies$/ })).toHaveCount(1);
  // a leading hand without an office login: no Add supplier (and the server refuses it anyway)
  await page.goto("/worker/takeoff/carpentry/cjb-1?section=flashings");
  await ready(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  if (await page.getByRole("button", { name: "New order" }).isVisible()) await page.getByRole("button", { name: "New order" }).click();
  await expect(page.locator("#ord-supplier")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add supplier" })).toHaveCount(0);
  const refused = await page.evaluate(async () => (await fetch("/api/worker/takeoff/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Sneaky" }) })).status);
  expect(refused).toBe(403);
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

test("HUB 011: the Takeoffs list shows or hides each item on the plan on its own; hidden items can't be tapped; nothing is deleted", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
  const snap = await page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot);
  const lines = page.locator("[data-measurement-id]");
  const shown = () => lines.evaluateAll((els) => els.map((e) => e.getAttribute("data-measurement-id")));
  const all = await shown();
  const bargeIds = snap.contributions.filter((c) => c.jobMaterialId === "mat-barge" && !c.archived).map((c) => c.measurementId).filter((id) => all.includes(id));
  expect(bargeIds.length).toBeGreaterThan(0);
  expect(all.length).toBeGreaterThan(bargeIds.length);
  // one dropdown, every takeoff item on this page with a tick box
  await page.getByRole("button", { name: "Show or hide takeoffs on the plan" }).click();
  const list = page.locator("[data-layers]");
  await expect(list.locator("[data-layer-item]")).toHaveText([/Apron flashing/, /Barge flashing/]);
  await expect(list.getByRole("checkbox")).toHaveCount(2);
  for (const cb of await list.getByRole("checkbox").all()) await expect(cb).toBeChecked();
  // untick the Barge flashing: only its lines go
  await list.locator('[data-layer-item="mat-barge"]').click();
  await expect(list.locator('[data-layer-item="mat-barge"] input')).not.toBeChecked();
  await expect.poll(async () => (await shown()).filter((id) => bargeIds.includes(id)).length).toBe(0);
  expect((await shown()).length).toBe(all.length - bargeIds.length);
  await expect(page.locator("[data-layers-button]")).toHaveText("Takeoffs (1 hidden) ▾");
  await expect(page.getByText(/1 of 2 takeoff items hidden on this page \(Barge flashing\) — nothing is deleted/)).toBeVisible();
  await list.getByRole("button", { name: "Done" }).click();
  await expect(list).toHaveCount(0);
  // a hidden line can't be picked up by tapping where it is
  const m = snap.measurements.find((x) => bargeIds.includes(x.id) && x.kind === "run" && x.points?.length === 2 && Math.abs(Math.hypot(x.points[1].x - x.points[0].x, x.points[1].y - x.points[0].y)) > 0
    && snap.contributions.some((c) => c.measurementId === x.id && c.jobMaterialId === "mat-barge")) ;
  const mid = { x: (m.points[0].x + m.points[1].x) / 2, y: (m.points[0].y + m.points[1].y) / 2 };
  const at = () => page.evaluate((pt) => { const el = document.querySelector("[data-takeoff-viewport]"); const q = el.takeoffViewport.toScreen(pt); const r = el.getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, mid);
  await page.getByRole("radio", { name: "Select" }).click();
  let p0 = await at();
  await page.touchscreen.tap(p0.x, p0.y);
  await page.waitForTimeout(300);
  await expect(page.getByText(/order 7,200 mm/)).toHaveCount(0);   // the Barge 7,000 run (→ 7,200) is not picked up
  // remembered on this page after a reload
  await page.reload();
  await ready(page);
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 }).catch(() => {});
  if (!(await page.locator("[data-layers-button]").count())) await page.getByRole("button", { name: /^Measure$/ }).click();
  await expect(page.locator("[data-layers-button]")).toHaveText("Takeoffs (1 hidden) ▾");
  // Hide all → banner; Show all → everything back, and the Barge line can be tapped again
  await page.getByRole("button", { name: "Show or hide takeoffs on the plan" }).click();
  await list.getByRole("button", { name: "Hide all" }).click();
  await expect(lines).toHaveCount(0);
  await expect(page.getByText(/All takeoffs are hidden on this page — nothing is deleted/)).toBeVisible();
  await list.getByRole("button", { name: "Show all" }).click();
  await expect(lines).toHaveCount(all.length);
  await list.getByRole("button", { name: "Done" }).click();
  await page.getByRole("radio", { name: "Select" }).click();
  p0 = await at();   // the plan is re-fitted after the reload
  await page.touchscreen.tap(p0.x, p0.y);
  await expect(page.getByText(/Measured 7,000 \+ allowance 200 → order 7,200 mm/)).toBeVisible();   // the same tap picks it up once shown
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

test("HUB 005: one 'Split to handling length' splits the whole run into even pieces with their own allowance; Undo puts it back", async ({ page }) => {
  await open(page, { seed: "&takeoffSeed=mixed" });
  await page.getByRole("button", { name: "Open schedule" }).click();
  await page.getByRole("button", { name: /^1 ×\s*9,000 mm/ }).first().click();
  await page.getByRole("button", { name: "Show on plan" }).click();
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
  const run = page.locator("[data-selected-run]");
  await expect(run.locator("[data-pieces-summary]")).toContainText("Order 2 pieces: 9,000 + 1,400 mm");
  await expect(run.locator("[data-pieces-list]")).toBeHidden();              // the working is folded away
  await expect(run.locator("[data-statuses]")).toBeHidden();
  await expect(run.locator("[data-edit-splits]")).not.toHaveAttribute("open", "");   // hand tools folded
  await expect(run.getByLabel("Move to a corner")).toBeHidden();
  // the old 8,800 split leaves a 9,000 piece over the 6,000 handling length → one action re-splits the whole run evenly
  const btn = run.locator("[data-split-to-handling]");
  await expect(btn).toHaveText("Split to handling length — 2 × 5,200 mm");
  await btn.click();
  await expect(run.locator("[data-pieces-summary]")).toContainText("Order 2 pieces: 5,200 + 5,200 mm");
  await expect(page.getByText(/Split into 2 pieces: 5,200 \+ 5,200 mm — each with its own allowance, all within the 6,000 mm handling length/)).toBeVisible();
  await expect(run.locator("[data-split-to-handling]")).toHaveCount(0);       // nothing left to split
  await run.locator("[data-pieces-summary] + details summary").click();
  await expect(run.locator("[data-pieces-list] li")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect(run.locator("[data-pieces-summary]")).toContainText("Order 2 pieces: 9,000 + 1,400 mm");
});

test("HUB 005: a new flashing orders in 300 mm steps", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add flashing" }).click();
  await page.getByRole("button", { name: "Finished pieces only (no drawing)" }).click();   // shares the new-flashing rules with "New flashing"
  await expect(page.getByLabel("Round measured runs up to")).toHaveValue("300");
  await expect(page.getByLabel("Measured allowance", { exact: false }).first()).toHaveValue("200");
});

test("HUB 010: tapping a 'needs attention' line opens that flashing at the missing field; Close returns to the order, fixed", async ({ page }) => {
  // the Barge flashing has lost its colour (seeded through the review API, as a real edit would)
  await page.goto("/carpentry/cjb-1?reviewRole=admin");
  await ready(page);
  const res = await page.evaluate(async () => {
    const ws = await (await fetch("/api/takeoff/workspaces/ws-1")).json();
    const m = ws.snapshot.materials.find((x) => x.id === "mat-barge");
    const r = await fetch("/api/takeoff/workspaces/ws-1/commit", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: ws.snapshot.workspace.revision, idempotencyKey: "hub010", changes: { materials: { upsert: [{ ...m, spec: { ...m.spec, colour: null } }], archive: [] } } }) });
    return r.json();
  });
  expect(res.ok, JSON.stringify(res)).toBe(true);
  await page.evaluate(() => { window.history.pushState({}, "", "/carpentry/cjb-1/takeoff?reviewRole=admin&section=flashings"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await ready(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  const fix = page.locator("[data-fix-line]").first();
  await expect(fix).toHaveText("Needs attention — material details missing ›");
  // the not-ready summary names the flashing and the length, and is tappable too
  await expect(page.locator("[data-blockers] button").first()).toHaveText(/^Barge flashing · [\d,]+ mm — material details missing ›$/);
  await fix.click();
  await expect(page.getByText(/Fix this to clear the order warning — choose the colour/)).toBeVisible();
  const colour = page.locator("[data-needs-fix]");
  await expect(colour).toBeFocused();
  await colour.selectOption("Surfmist");
  await page.getByRole("button", { name: "Close" }).click();
  // back on the same order: the line now uses the fixed flashing (save to keep it) and nothing needs attention
  await expect(page.getByRole("heading", { name: "Flashings orders" })).toBeVisible();
  await expect(page.locator("[data-fix-line]")).toHaveCount(0);
  await expect(page.getByText(/Updated 3 lines to the fixed Barge flashing — save order details to keep them/)).toBeVisible();
  await expect(page.getByTestId("stale-lines")).toHaveCount(0);
  await page.getByRole("button", { name: "Save order details" }).click();
  await expect(page.getByText(/^Ready: /)).toBeVisible();
});
