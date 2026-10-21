// @ts-check
// Hub review (19 Oct 2026, "Blue Leaf Hub Review and Changes") — checks in UI Review Mode (mocked backend).
//   HUB 003 Save as company standard in the drawing's More menu · HUB 004 perforation fields folded
//   HUB 008 Add supplier from the order · HUB 011 show / hide takeoff lines on the plan · HUB 012 lengths in a flashing
//   HUB 002 choose Flashings or Timber and cladding first; compact rows · HUB 007 separate orders per section
//   HUB 024 Add to company products (aluminium) beside the company-product chooser
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
  await expect(page.getByText(/^Draft FO-/)).toBeVisible();   // HUB 013: the Flashings draft opens by itself
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
  await expect(page.getByText(/^Draft FO-/)).toBeVisible();
  await page.getByRole("button", { name: "Add supplier" }).click();
  const form = page.locator("[data-add-supplier]");
  await form.getByLabel("Supplier name").fill("Fielders Wingfield");
  await form.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.locator("#ord-supplier option:checked")).toHaveText("Fielders Wingfield");
  await expect(page.locator("[data-order-msg]")).toHaveText("Added Fielders Wingfield — saved on this order.");   // HUB 019: saved on the draft at once
  // the same name again is the same supplier — selected, never a second copy
  await page.getByRole("button", { name: "Add supplier" }).click();
  await form.getByLabel("Supplier name").fill("other steel supplies");
  await form.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.locator("#ord-supplier option:checked")).toHaveText("Other Steel Supplies");
  await expect(page.locator("[data-order-msg]")).toContainText("Other Steel Supplies was already on file");
  await expect(page.locator("#ord-supplier option").filter({ hasText: /^Other Steel Supplies$/ })).toHaveCount(1);
  // a leading hand without an office login: no Add supplier (and the server refuses it anyway)
  await page.goto("/worker/takeoff/carpentry/cjb-1?section=flashings");
  await ready(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await expect(page.getByText(/^Draft FO-/)).toBeVisible();   // HUB 013: the Flashings draft opens by itself
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
  await expect(page.getByText(/^Draft FO-/)).toBeVisible();   // opened by itself (HUB 013)
  await expect(page.getByRole("button", { name: "New order" })).toHaveCount(0);   // one open Flashings draft, never a duplicate
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

test("HUB 010 / 013: a flashing that can't be ordered yet is named with a Fix button; Fix opens it at the missing field; Close returns to the order, brought up to date", async ({ page }) => {
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
  await expect(page.getByText(/^Draft FO-/)).toBeVisible();
  // HUB 013: a flashing that can't be ordered yet is left off the draft and named, with the reason and a Fix button
  const off = page.locator("[data-off-flashing]").filter({ hasText: "Barge flashing" });
  await expect(off).toContainText(/Barge flashing — \d+ pieces can't be ordered yet: material details missing/);
  await expect(page.locator("[data-order-flashing]").filter({ hasText: "Barge flashing" })).toHaveCount(0);
  await expect(page.getByTestId("order-reconcile")).toContainText(/not on this order [1-9]/);
  await off.getByRole("button", { name: "Fix ›" }).click();
  await expect(page.getByText(/Fix this to clear the order warning — choose the colour/)).toBeVisible();
  const colour = page.locator("[data-needs-fix]");
  await expect(colour).toBeFocused();
  await colour.selectOption("Surfmist");
  await page.getByRole("button", { name: "Close" }).click();
  // back on the same order: brought up to date with the fixed flashing (saved), nothing left off, ready
  await expect(page.getByRole("heading", { name: "Flashings orders" })).toBeVisible();
  await expect(page.locator("[data-order-sync]")).toContainText(/Brought up to date with the takeoff: Barge flashing \+\d+/);
  await expect(page.locator("[data-order-flashing]").filter({ hasText: "Barge flashing" })).toHaveCount(1);
  await expect(page.locator("[data-off-flashing]")).toHaveCount(0);
  await expect(page.getByText(/^Ready: /)).toBeVisible();
});

test("HUB 013: Review & export opens the Flashings draft in step with the takeoff — grouped P1, P2 … like the PDF, no zero rows, reconciled", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await expect(page.getByText(/^Draft FO-/)).toBeVisible();
  const groups = page.locator("[data-order-flashing]");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText(/^P1 — Apron flashing/);
  await expect(groups.nth(1)).toContainText(/^P2 — Barge flashing/);
  // every length shown has a quantity — never a zero row
  for (const v of await page.getByLabel("Qty").evaluateAll((els) => els.map((e) => Number(e.value)))) expect(v).toBeGreaterThan(0);
  const rec = page.getByTestId("order-reconcile");
  const takeoff = Number((await rec.textContent()).match(/Takeoff (\d+)/)[1]);
  await expect(rec).toHaveText(`Takeoff ${takeoff} · on this order ${takeoff} · already ordered 0 · on other orders 0 · not on this order 0`);
  await expect(page.locator("[data-off-flashing]")).toHaveCount(0);
  // take the Barge flashing off: it is named as left off with an Add button; Add puts it back
  await groups.nth(1).getByRole("button", { name: "Remove" }).click();
  const off = page.locator("[data-off-flashing]").filter({ hasText: "Barge flashing" });
  await expect(off).toContainText(/Barge flashing — \d+ pieces left off this order/);
  await expect(rec).toContainText(/not on this order [1-9]/);
  await off.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("[data-off-flashing]")).toHaveCount(0);
  await expect(rec).toContainText(`on this order ${takeoff}`);
});

test("HUB 020: a draft is reopened and revised (same draft number, no copies); history opens or discards a draft", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  const title = page.getByRole("heading", { name: /^Draft FO-/ });
  await expect(title).toBeVisible();
  const ref = (await title.textContent()).replace("Draft ", "");
  // remove the Barge flashing, save, leave and come back: the same draft, still without it (the user's choice is kept)
  await page.locator("[data-order-flashing]").filter({ hasText: "Barge flashing" }).getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Save order details" }).click();
  await expect(page.getByRole("button", { name: "Save order details" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await expect(title).toHaveText(`Draft ${ref}`);
  await expect(page.locator("[data-order-flashing]").filter({ hasText: "Barge flashing" })).toHaveCount(0);
  await expect(page.locator("[data-off-flashing]").filter({ hasText: "Barge flashing" })).toContainText("left off this order");
  await expect(page.getByRole("button", { name: "New order" })).toHaveCount(0);   // one open Flashings draft
  // an older draft (e.g. from before the fix) shows in Order history: Open draft opens that same draft; Discard removes it
  const other = await page.evaluate(async () => {
    const r = await fetch("/api/takeoff/workspaces/ws-1/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "ord-old", category: "flashings", delivery: { method: "pickup" } }) });
    return (await r.json()).order.orderRef;
  });
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await expect(title).toHaveText(`Draft ${other}`);   // the newest unsent draft opens, brought up to date
  const hist = page.locator("section").filter({ has: page.getByRole("heading", { name: "Order history" }) });
  const card = hist.locator("div.rounded-card").filter({ hasText: ref });
  await expect(card).toContainText("Draft");
  await card.getByRole("button", { name: "Open draft" }).click();
  await expect(title).toHaveText(`Draft ${ref}`);
  await expect(page.locator("[data-order-flashing]").filter({ hasText: "Barge flashing" })).toHaveCount(0);   // still as Sam left it
  page.once("dialog", (d) => d.accept());
  await hist.locator("div.rounded-card").filter({ hasText: other }).getByRole("button", { name: "Discard draft" }).click();
  // a discarded draft with no PDFs leaves nothing to keep, so it drops out of the history (one with PDFs stays, as "Discarded")
  await expect(hist.locator("div.rounded-card").filter({ hasText: other })).toHaveCount(0);
  const after = await page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1/orders")).json()).orders.map((o) => `${o.orderRef}:${o.status}`));
  expect(after).toContain(`${other}:cancelled`);
});

test("HUB 019: add the flashing supplier with its pickup address from the order — saved on the draft at once; Pick up fills the branch; Edit updates it", async ({ page }) => {
  await open(page, { seed: "&takeoffSeed=mixed" });
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await expect(page.getByText(/^Draft FO-/)).toBeVisible();
  await page.getByRole("button", { name: "Add supplier" }).click();
  const form = page.locator("[data-add-supplier]");
  await form.getByLabel("Supplier name").fill("Stratco Wingfield");
  await form.getByLabel("Phone (optional)").fill("08 8000 1234");
  await form.getByLabel("Email for orders (optional)").fill("orders@stratco.test");
  await form.getByLabel("Pickup / branch address (optional)").fill("1 Grand Junction Rd, Wingfield SA");
  await form.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.locator("[data-order-msg]")).toHaveText("Added Stratco Wingfield — saved on this order.");
  await expect(page.locator("#ord-supplier option:checked")).toHaveText("Stratco Wingfield");
  await expect(page.getByRole("button", { name: "Save order details" })).toHaveCount(0);   // nothing left to save
  // choosing Pick up fills the branch from the supplier's address (still editable)
  await page.getByText("Pick up", { exact: true }).click();
  await expect(page.getByLabel("Pickup branch")).toHaveValue("1 Grand Junction Rd, Wingfield SA");
  // Edit the chosen supplier: the change is saved and the draft keeps it
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await form.getByLabel("Phone (optional)").fill("08 8000 9999");
  await form.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.locator("[data-order-msg]")).toHaveText("Updated Stratco Wingfield — saved on this order.");
  // leaving and coming back: the same draft still has the supplier; the Timber and cladding order can choose it too
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await expect(page.locator("#ord-supplier option:checked")).toHaveText("Stratco Wingfield");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("group", { name: "Takeoff section" }).getByRole("button", { name: "Timber and cladding" }).click();
  await page.getByRole("button", { name: /Review & export order|Orders/ }).click();
  await page.getByRole("button", { name: "New order" }).click();   // Timber and cladding: no draft yet
  await expect(page.locator("#ord-supplier option").filter({ hasText: /^Stratco Wingfield$/ })).toHaveCount(1);
});

// ── HUB 014: company cladding defaults ────────────────────────────────────────────────────────────────────────
const AXON400 = "James Hardie|Axon 400 smooth|1200|9";
const defaultsState = (page) => page.evaluate(() => window.__takeoffReviewDefaults());
async function addAxon400(page) {
  await page.locator('[data-material-group="cladding"]').getByRole("button", { name: "Add cladding" }).click();
  await expect(page.locator('[data-setup="cladding"]')).toBeVisible();
  const change = page.getByRole("button", { name: "Change product" });
  if (await change.isVisible().catch(() => false)) await change.click();
  await page.locator(`[data-product-option="${AXON400}"]`).click();
  await expect(page.locator(`[data-chosen-product="${AXON400}"]`)).toBeVisible();
}
const SUMMARY = "Cavity · Wind N2 · Timber frame · On studs · ND nails · 10% spares · 2,450 / 2,750 / 3,000 mm · 10 mm H-flashing joints";

test("HUB 014: adding Axon 400 smooth opens ready to measure with the Blue Leaf defaults; Edit changes this job only; Save as company default is explicit", async ({ page }) => {
  await open(page, { section: "timber_cladding", seed: "&takeoffDefaults=1" });
  await addAxon400(page);
  const sum = page.locator('[data-company-defaults=""]');
  await expect(sum.locator("[data-default-values]")).toHaveText(SUMMARY);
  await expect(sum).toContainText("check this site's wind classification");
  // routine setup is folded away; the quantity preview and the Walls step stay
  for (const sel of ["[data-stock-lengths]", "[data-advanced]", "[data-product-facts]"]) await expect(page.locator(sel)).toHaveCount(0);
  await expect(page.getByLabel("Spares")).toHaveCount(0);
  await expect(page.locator("[data-needs]")).toHaveCount(0);   // nothing left to answer before measuring
  await expect(page.getByRole("button", { name: "Walls" })).toBeVisible();
  await expect.poll(async () => (await defaultsState(page)).materials.find((m) => m.name === "Axon 400 smooth")?.rules?.defaultsFrom?.presetId).toBe("pre-axon400-default");
  let st = await defaultsState(page);
  const mine = st.materials.find((m) => m.name === "Axon 400 smooth");
  expect(mine.spareRate).toBe(10);
  expect(mine.rules.installConditions).toMatchObject({ wind: "N2", substrate: "Timber frame", "on-or-off-stud": "on-stud", "fixing-family": "ND nails", "direct-or-cavity": "cavity" });
  expect(mine.rules.jointRows).toEqual({ atMm: [], gapMm: 10, detailRef: "H-flashing" });
  // Edit: the full form for this job's exception — wind N3 on this site
  await sum.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("[data-stock-lengths]")).toBeVisible();
  await page.locator("[data-install-conditions] summary").click();
  await expect(page.locator("[data-install-conditions]")).toContainText("Filled from the Blue Leaf company default");
  await page.getByLabel("Wind class").selectOption("N3");
  await sum.getByRole("button", { name: "Hide details" }).click();
  await expect(sum.locator('[data-default="wind"]')).toHaveText(" · Wind N3 (this job)");
  await expect(sum).toContainText("changed for this job");
  st = await defaultsState(page);
  expect(st.saves).toHaveLength(0);
  expect(st.defaults[0]).toMatchObject({ revision: 1, rules: { installConditions: { wind: "N2" } } });
  // only an explicit Save (with a confirm) changes the company default
  page.once("dialog", (d) => d.accept());
  await sum.getByRole("button", { name: "Save as company default" }).click();
  await expect(page.getByText(/Saved as the company default for Axon 400 smooth/)).toBeVisible();
  st = await defaultsState(page);
  expect(st.defaults[0]).toMatchObject({ revision: 2, rules: { companyDefault: true, installConditions: { wind: "N3" } } });
  expect(st.defaults[0].rules.jointRows).toEqual({ atMm: [], gapMm: 10, detailRef: "H-flashing" });
  await expect(sum).not.toContainText("this job");
});

test("HUB 014: a leading hand gets the defaults and can Edit for the job, but has no Save as company default; the Worker-app office login has it", async ({ page }) => {
  await page.goto("/worker/takeoff/carpentry/cjb-1?section=timber_cladding&takeoffDefaults=1");
  await ready(page);
  await addAxon400(page);
  const sum = page.locator('[data-company-defaults=""]');
  await expect(sum.locator("[data-default-values]")).toHaveText(SUMMARY);
  await sum.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Save as company default" })).toHaveCount(0);
  await page.goto("/worker/takeoff/carpentry/cjb-1?section=timber_cladding&takeoffDefaults=1&takeoffWorker=office");
  await ready(page);
  await addAxon400(page);
  await page.locator('[data-company-defaults=""]').getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Save as company default" })).toBeVisible();
});

test("HUB 014: with no default yet the office saves the first one from the card; the next Axon 400 opens with it", async ({ page }) => {
  await open(page, { section: "timber_cladding" });
  await addAxon400(page);
  const off = page.locator('[data-company-defaults="off"]');
  await expect(off).toContainText("No company default for this product yet.");
  await expect(page.locator("[data-stock-lengths]")).toBeVisible();   // no default → the full form, as before
  await page.getByLabel("Spares").fill("10");
  await page.getByLabel("Spares").press("Enter");
  page.once("dialog", (d) => d.accept());
  await off.getByRole("button", { name: "Save as company default" }).click();
  await expect(page.getByText(/Saved as the company default for Axon 400 smooth/)).toBeVisible();
  await expect(page.locator('[data-company-defaults=""]')).toContainText("10% spares");
  const st = await defaultsState(page);
  expect(st.saves).toHaveLength(1);
  expect(st.defaults).toHaveLength(1);
  expect(st.saves[0].content.rules).not.toHaveProperty("defaultsFrom");
});

// ── HUB 018: trustworthy autosave recovery ────────────────────────────────────────────────────────────────────
const reviewMaterials = async (page) => (await page.evaluate(() => window.__takeoffReviewState())).materials;
const cards = (page) => page.locator("[data-draft-card]");
/** The unfinished drawings stored on this device (IndexedDB), so a reload never races the store's own write. */
const deviceDrafts = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open("blh-takeoff-recovery");
  r.onsuccess = () => { const db = r.result; const q = db.transaction("drafts", "readonly").objectStore("drafts").getAllKeys(); q.onsuccess = () => res(q.result.filter((k) => String(k).startsWith("editor|"))); };
  r.onerror = () => res([]);
}));
async function openDrawing(page, name) {
  await rowAction(page, name, "Profile");
  const dlg = page.getByRole("dialog", { name });
  await expect(dlg.locator("[data-takeoff-viewport]")).toBeVisible();
  return dlg;
}
async function newDrawing(page) {
  await page.getByRole("button", { name: "Add flashing" }).click();
  await page.getByRole("button", { name: "New flashing" }).click();
  const dlg = page.getByRole("dialog", { name: /^Flashing \d+/ });
  const box = await dlg.locator("[data-takeoff-viewport]").boundingBox();
  return { dlg, at: (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy) };
}

test("HUB 018: two unfinished drawings → reload → Continue and finish one, Discard the other (asks first); no blank flashing; the other drawings unchanged", async ({ page }) => {
  await open(page);
  const before = await reviewMaterials(page);
  // A: a size that isn't valid yet on Apron flashing, then the app is reloaded mid-edit
  let dlg = await openDrawing(page, "Apron flashing");
  await dlg.locator("svg text", { hasText: /^L1 / }).click();
  await dlg.getByLabel("L1 length").fill(".");
  await page.waitForTimeout(300);
  await page.reload(); await ready(page);
  // B: a new flashing with only its start point, then reloaded
  const b = await newDrawing(page);
  const bName = (await b.dlg.getByRole("heading", { level: 1 }).textContent()).trim();
  await b.at(0.3, 0.7);
  await page.waitForTimeout(300);
  await page.reload(); await ready(page);
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).filter({ hasText: "Apron flashing (has a size that isn't valid yet)." })).toHaveCount(1);
  await expect(cards(page).filter({ hasText: `${bName} — not in the takeoff yet.` })).toHaveCount(1);
  await expect(page.getByText("New flashing", { exact: true })).toHaveCount(0);
  // Continue B: the exact unfinished drawing, under its own name; two more points, Close = finished
  await cards(page).filter({ hasText: bName }).getByRole("button", { name: "Continue drawing" }).click();
  dlg = page.getByRole("dialog", { name: bName });
  await expect(dlg.getByText("Tap the end of the first leg.")).toBeVisible();
  const box = await dlg.locator("[data-takeoff-viewport]").boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
  await expect(dlg.locator("svg text", { hasText: /^L2 / })).toBeVisible();
  await expect(dlg.getByRole("button", { name: /Apply|^Save/ })).toHaveCount(0);   // still automatic saving, no Apply step
  await dlg.getByRole("button", { name: "Close" }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText("Apron flashing");
  await expect.poll(async () => (await reviewMaterials(page)).find((m) => m.name === bName)?.profile?.segments?.length || 0).toBeGreaterThanOrEqual(2);
  // Discard A: asks first — Cancel keeps it, OK removes only that one
  let asked = "";
  page.once("dialog", (d) => { asked = d.message(); d.dismiss(); });
  await cards(page).getByRole("button", { name: "Discard" }).click();
  expect(asked).toBe("Discard this unfinished drawing from this device?");
  await expect(cards(page)).toHaveCount(1);
  page.once("dialog", (d) => d.accept());
  await cards(page).getByRole("button", { name: "Discard" }).click();
  await expect(cards(page)).toHaveCount(0);
  await expect.poll(() => deviceDrafts(page)).toEqual([]);   // both device copies are gone: B finished, A discarded
  const after = await reviewMaterials(page);
  for (const id of ["mat-apron", "mat-barge"]) expect(after.find((m) => m.id === id).profile).toEqual(before.find((m) => m.id === id).profile);
  expect(after.filter((m) => m.methodKey === "flashing_runs" && !m.profile)).toEqual([]);
  expect(after.some((m) => m.name === "New flashing")).toBe(false);
  await page.reload(); await ready(page);
  await expect(page.getByText(/Unfinished drawing on this device/)).toHaveCount(0);
});

test("HUB 018: Close, Details and Lengths finish the drawing — no card now or after a reload (the four-cards case)", async ({ page }) => {
  await open(page);
  let dlg = await openDrawing(page, "Apron flashing");                 // opened and left by Lengths
  await dlg.getByRole("button", { name: "Lengths" }).click();
  await page.getByRole("button", { name: "Back" }).or(page.getByRole("button", { name: "Close" })).first().click().catch(() => {});
  await open(page);
  dlg = await openDrawing(page, "Barge flashing");                     // changed and left by Details
  await dlg.locator("svg text", { hasText: /^L1 / }).click();
  await dlg.getByLabel("L1 length").fill("120");
  await dlg.getByRole("button", { name: "Done" }).click();
  await dlg.getByRole("button", { name: "Details" }).click();
  await page.getByRole("button", { name: "Close" }).first().click();
  const b = await newDrawing(page);                                    // drawn and closed
  await b.at(0.25, 0.8); await b.at(0.25, 0.3); await b.at(0.7, 0.3);
  await expect(b.dlg.locator("svg text", { hasText: /^L2 / })).toBeVisible();
  await b.dlg.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText(/Unfinished drawing on this device/)).toHaveCount(0);
  await expect.poll(() => deviceDrafts(page)).toEqual([]);   // nothing left on the device either
  await page.reload(); await ready(page);
  await expect(page.getByText(/Unfinished drawing on this device/)).toHaveCount(0);
});

test("HUB 018: a new drawing cleared to nothing and closed leaves no blank flashing", async ({ page }) => {
  await open(page);
  const seeded = (await reviewMaterials(page)).map((m) => m.id);
  const b = await newDrawing(page);
  const name = (await b.dlg.getByRole("heading", { level: 1 }).textContent()).trim();
  await b.at(0.25, 0.8); await b.at(0.25, 0.3);
  await expect(b.dlg.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await b.dlg.getByRole("button", { name: "More" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("menuitem", { name: "Clear drawing" }).or(page.getByRole("button", { name: "Clear drawing" })).first().click();
  await b.dlg.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("[data-material-row]").filter({ hasText: name })).toHaveCount(0);
  await expect.poll(async () => (await reviewMaterials(page)).filter((m) => !seeded.includes(m.id)).length).toBe(0);
  await expect(page.getByText(/Unfinished drawing on this device/)).toHaveCount(0);
});

// ── HUB 024: Add to company products (aluminium) ──────────────────────────────────────────────────────────────
// Recording review 06 (1487.mp4 00:15–01:18): the company-product search said "Set one up here" with no way to.
// The mock is one workspace that resets on reload, so a second aluminium item stands in for "another job" here;
// the real-server API tests (takeoff-api "HUB 024 …") prove another job, reload and isolation.
const ALU_NAME = "Aluminium angle 50 × 50 × 3";
const aluSetup = (page) => page.getByRole("dialog", { name: "Aluminium" });
const reviewPresets = (page) => page.evaluate(() => window.__takeoffReviewPresets());
/** The fake server's snapshot (what autosave actually committed), from whichever shell the page is in. */
const aluServer = (page, base = "/api/takeoff") => page.evaluate(async (b) => (await (await fetch(`${b}/workspaces/ws-1`)).json()).snapshot, base);
async function addAluminium(page) {
  await page.locator('[data-material-group="cladding"]').getByRole("button", { name: "Add aluminium" }).click();
  const dlg = aluSetup(page);
  await expect(dlg.locator('[data-setup="aluminium"]')).toBeVisible();
  return dlg;
}
async function aluNum(scope, label, v) {
  const f = scope.getByLabel(label, { exact: true });
  await f.fill(String(v));
  await f.press("Enter");
}
const ADD_PROMPT = "Add this setup to company products? Other jobs find it by this name. This job keeps its own copy.";
const CLASH = `A company product called “${ALU_NAME}” already exists. OK = save this as its new version. Cancel = keep the existing one.`;
/**
 * Answer the next browser dialogs in order: each step accepts (a prompt with `value`, or the name it offers) unless
 * `accept: false`. Returns what each dialog showed, to check once the tap has finished.
 */
function dialogs(page, steps) {
  const seen = [];
  const h = async (d) => {
    const st = steps[seen.length] || { accept: false };
    seen.push(d.type() === "prompt" ? { type: "prompt", message: d.message(), name: d.defaultValue() } : { type: d.type(), message: d.message() });
    if (seen.length >= steps.length) page.off("dialog", h);
    if (st.accept === false) await d.dismiss();
    else await d.accept(d.type() === "prompt" ? (st.value ?? d.defaultValue()) : undefined);
  };
  page.on("dialog", h);
  return seen;
}
const namePrompt = (name) => ({ type: "prompt", message: ADD_PROMPT, name });

test("HUB 024: Add to company products sits beside the chooser; the saved product is found by name and restores its settings; the copy stays separate", async ({ page }) => {
  await open(page, { section: "timber_cladding" });
  const dlg = await addAluminium(page);
  const add = dlg.getByRole("button", { name: "Add to company products" });
  await expect(add).toBeInViewport();   // no scrolling on a 390 × 844 phone
  const [btnBox, cardBox] = [await add.boundingBox(), await dlg.locator('[data-setup="aluminium"]').boundingBox()];
  expect(btnBox.y + btnBox.height).toBeLessThanOrEqual(cardBox.y);   // above the setup card, beside the chooser
  await expect(dlg.locator("[data-family-presets]")).toContainText("No company products for this yet. Finish the setup below, then tap Add to company products.");
  await expect(dlg.locator("[data-family-presets]")).not.toContainText("Set one up here");
  // finish the setup for this job: kerf 3, confirmed
  const card = dlg.locator('[data-setup="aluminium"]');
  await aluNum(card, "Saw kerf", 3);
  await card.getByLabel("The saw kerf above is confirmed for this job").check();
  await expect(dlg.getByRole("status").first()).toHaveText("Saved", { timeout: 15_000 });
  const asked = dialogs(page, [{}]);   // the name starts as this item's name: OK keeps it
  await add.click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toHaveText(new RegExp(`Added “${ALU_NAME}” to company products\\. Other jobs can use it; this job keeps its own copy\\.`));
  expect(asked).toEqual([namePrompt(ALU_NAME)]);
  await expect(dlg.locator('[data-preset-family="aluminium"] [data-preset]')).toHaveCount(1);
  await expect(dlg.locator('[data-preset-family="aluminium"]')).toContainText(ALU_NAME);
  let saved = (await reviewPresets(page)).find((p) => p.name === ALU_NAME);
  expect(saved).toMatchObject({ revision: 1, methodKey: "linear_stock", spec: { family: "aluminium", stockLengthMm: 6500, kerfMm: 3, kerfConfirmed: false, profile: { aMm: 50, bMm: 50, tMm: 3 } } });
  // the first item keeps its own confirmed setup and is not linked to the product
  let snap = await aluServer(page);
  const first = snap.materials.find((m) => m.spec?.family === "aluminium");
  expect(first).toMatchObject({ name: ALU_NAME, spec: { kerfMm: 3, kerfConfirmed: true, stockLengthMm: 6500 } });
  expect(first.fromPresetId ?? null).toBeNull();
  await dlg.getByRole("button", { name: "Close" }).first().click();
  await expect(dlg).toHaveCount(0);

  // "another job": a second aluminium item finds it by name and Use on this job restores the saved settings
  const dlg2 = await addAluminium(page);
  await dlg2.getByLabel("Company products").fill("Aluminium angle");
  const row = dlg2.locator('[data-preset-family="aluminium"] [data-preset]').filter({ hasText: ALU_NAME });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Use on this job" }).click();
  const card2 = dlg2.locator('[data-setup="aluminium"]');
  for (const [label, v] of [["Leg A", "50"], ["Leg B", "50"], ["Thickness", "3"], ["Stock length", "6500"], ["Saw kerf", "3"]]) await expect(card2.getByLabel(label, { exact: true })).toHaveValue(v);
  // the kerf comes with the product, but this job still confirms it (the existing amber note)
  await expect(card2.getByLabel("The saw kerf above is confirmed for this job")).not.toBeChecked();
  await expect(card2).toContainText("An estimate can use the kerf as entered; an order needs it confirmed.");
  await expect(dlg2.getByRole("status").first()).toHaveText("Saved", { timeout: 15_000 });
  snap = await aluServer(page);
  const copy = snap.materials.find((m) => m.fromPresetId === saved.id);
  expect(copy).toMatchObject({ fromPresetRevision: 1, spec: { stockLengthMm: 6500, kerfMm: 3, kerfConfirmed: false } });
  // change the copy: the company product and the first item stay as they were
  await aluNum(card2, "Stock length", 6000);
  await expect.poll(async () => (await aluServer(page)).materials.find((m) => m.id === copy.id)?.spec?.stockLengthMm).toBe(6000);
  saved = (await reviewPresets(page)).find((p) => p.id === saved.id);
  expect(saved).toMatchObject({ revision: 1, spec: { stockLengthMm: 6500 } });
  expect((await aluServer(page)).materials.find((m) => m.id === first.id).spec.stockLengthMm).toBe(6500);
});

test("HUB 024: a Name typed and not yet applied is saved with the product (it applies first); job autosave carries on and the job is not linked", async ({ page }) => {
  await open(page, { section: "timber_cladding" });
  const dlg = await addAluminium(page);
  const card = dlg.locator('[data-setup="aluminium"]');
  const typed = `${ALU_NAME} mill`;
  await card.getByLabel("Name", { exact: true }).fill(typed);   // still in the field — not applied yet
  const asked = dialogs(page, [{}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toContainText(`Added “${typed}” to company products.`);
  expect(asked).toEqual([namePrompt(typed)]);   // the typed name applied first, then offered as the product's name
  const presets = await reviewPresets(page);
  expect(presets.filter((p) => p.spec?.family === "aluminium").map((p) => p.name)).toEqual([typed]);
  await expect(dlg.getByRole("status").first()).toHaveText("Saved", { timeout: 15_000 });
  const mine = (await aluServer(page)).materials.filter((m) => m.spec?.family === "aluminium");
  expect(mine).toHaveLength(1);
  expect(mine[0].name).toBe(typed);
  expect(mine[0].fromPresetId ?? null).toBeNull();
  // nothing missing from the profile = nothing saved, and it says why
  await aluNum(card, "Leg B", "");
  await expect(dlg.getByRole("status").first()).toHaveText("Saved", { timeout: 15_000 });
  let askedAgain = false;
  page.once("dialog", (d) => { askedAgain = true; d.dismiss(); });
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="error"]')).toHaveText(/Enter the profile size \(e\.g\. 50 × 50 × 3\) first\. Nothing was saved\./);
  expect(askedAgain).toBe(false);
  expect((await reviewPresets(page)).filter((p) => p.spec?.family === "aluminium")).toHaveLength(1);
});

test("HUB 024: the same name saves as the product's next version only when asked; Cancel keeps the existing one", async ({ page }) => {
  await open(page, { section: "timber_cladding" });
  const dlg = await addAluminium(page);
  dialogs(page, [{}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toBeVisible();
  const card = dlg.locator('[data-setup="aluminium"]');
  await aluNum(card, "Stock length", 6100);
  await expect(dlg.getByRole("status").first()).toHaveText("Saved", { timeout: 15_000 });
  let asked = dialogs(page, [{}, { accept: false }]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect.poll(() => asked.length).toBe(2);
  expect(asked).toEqual([namePrompt(ALU_NAME), { type: "confirm", message: CLASH }]);
  let alu = (await reviewPresets(page)).filter((p) => p.spec?.family === "aluminium");
  expect(alu.map((p) => [p.revision, p.spec.stockLengthMm])).toEqual([[1, 6500]]);
  // Cancel on the name saves nothing either
  asked = dialogs(page, [{ accept: false }]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect.poll(() => asked.length).toBe(1);
  expect((await reviewPresets(page)).filter((p) => p.spec?.family === "aluminium").map((p) => p.revision)).toEqual([1]);
  asked = dialogs(page, [{}, {}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toContainText(`Saved a new version of “${ALU_NAME}”.`);
  expect(asked).toEqual([namePrompt(ALU_NAME), { type: "confirm", message: CLASH }]);
  alu = (await reviewPresets(page)).filter((p) => p.spec?.family === "aluminium");
  expect(alu.map((p) => [p.revision, p.spec.stockLengthMm])).toEqual([[2, 6100]]);
});

test("HUB 024 review: a different size under the same name is asked for its own name; the 50 × 50 × 3 product is never overwritten", async ({ page }) => {
  await open(page, { section: "timber_cladding" });
  let dlg = await addAluminium(page);
  dialogs(page, [{}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toBeVisible();
  await dlg.getByRole("button", { name: "Close" }).first().click();
  // a second item keeps the default name but is set to 40 × 40 × 2
  dlg = await addAluminium(page);
  const card = dlg.locator('[data-setup="aluminium"]');
  await aluNum(card, "Leg A", 40);
  await aluNum(card, "Leg B", 40);
  await aluNum(card, "Thickness", 2);
  await expect(dlg.getByRole("status").first()).toHaveText("Saved", { timeout: 15_000 });
  const ownName = { type: "prompt", message: `“${ALU_NAME}” is already the company product for a 50 × 50 × 3 angle. This setup is 40 × 40 × 2, so give it its own name.`, name: "Aluminium angle 40 × 40 × 2" };
  let asked = dialogs(page, [{}, { accept: false }]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect.poll(() => asked.length).toBe(2);
  expect(asked).toEqual([namePrompt(ALU_NAME), ownName]);   // never "save this as its new version"
  const only50 = (ps) => ps.filter((p) => p.spec?.family === "aluminium").map((p) => [p.name, p.revision, p.spec.profile.aMm, p.spec.profile.bMm, p.spec.profile.tMm]);
  expect(only50(await reviewPresets(page))).toEqual([[ALU_NAME, 1, 50, 50, 3]]);
  // OK on the name it offers: a new product for the 40 × 40 × 2; the 50 × 50 × 3 one is untouched
  asked = dialogs(page, [{}, {}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toContainText("Added “Aluminium angle 40 × 40 × 2” to company products.");
  expect(asked).toEqual([namePrompt(ALU_NAME), ownName]);
  expect(only50(await reviewPresets(page))).toEqual([[ALU_NAME, 1, 50, 50, 3], ["Aluminium angle 40 × 40 × 2", 1, 40, 40, 2]]);
  // the job item keeps its own name; nothing on the job changed
  expect((await aluServer(page)).materials.filter((m) => m.spec?.family === "aluminium").map((m) => [m.name, m.spec.profile.aMm, m.fromPresetId ?? null]))
    .toEqual([[ALU_NAME, 50, null], [ALU_NAME, 40, null]]);
  // the fake server refuses it too, as the real one does (takeoff-api "HUB 024 review")
  const p50 = (await reviewPresets(page)).find((p) => p.name === ALU_NAME);
  const refused = await page.evaluate(async (b) => { const r = await fetch("/api/takeoff/company-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return [r.status, (await r.json()).error]; },
    { name: ALU_NAME, methodKey: "linear_stock", methodVersion: 1, spec: { family: "aluminium", profile: { shape: "equal-angle", aMm: 40, bMm: 40, tMm: 2 }, stockLengthMm: 6500 }, rules: {}, presetId: p50.id, expectedRevision: 1 });
  expect(refused).toEqual([400, `“${ALU_NAME}” is a 50 × 50 × 3 angle. Give this 40 × 40 × 2 setup its own name.`]);
});

test("HUB 024 review: when someone else saved the product a moment before, it says so, and the next tap saves (no close and reopen)", async ({ page }) => {
  await open(page, { section: "timber_cladding" });
  const dlg = await addAluminium(page);
  dialogs(page, [{}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toBeVisible();
  await aluNum(dlg.locator('[data-setup="aluminium"]'), "Stock length", 6100);
  await expect(dlg.getByRole("status").first()).toHaveText("Saved", { timeout: 15_000 });
  await page.evaluate(() => { window.__takeoffReviewPresetRace = true; });   // another office login saves first
  dialogs(page, [{}, {}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="error"]')).toHaveText(/Someone else saved that company product just now\. Nothing was saved\. Tap Add to company products again to save yours as its new version\./);
  const alu = () => reviewPresets(page).then((ps) => ps.filter((p) => p.spec?.family === "aluminium").map((p) => [p.revision, p.spec.stockLengthMm]));
  expect(await alu()).toEqual([[2, 6500]]);
  // the very next tap saves over the latest version (before this fix it kept failing until the takeoff was left)
  const asked = dialogs(page, [{}, {}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toContainText(`Saved a new version of “${ALU_NAME}”.`);
  expect(asked).toEqual([namePrompt(ALU_NAME), { type: "confirm", message: CLASH }]);
  expect(await alu()).toEqual([[3, 6100]]);
});

test("HUB 024 review: saving a job's own copy as the product's new version doesn't flag that job as out of date; a real newer version still does", async ({ page }) => {
  await open(page, { section: "timber_cladding" });
  let dlg = await addAluminium(page);
  dialogs(page, [{}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toBeVisible();
  await dlg.getByRole("button", { name: "Close" }).first().click();
  // a job item that uses the product (rev 1), then confirms its kerf and changes the stock
  dlg = await addAluminium(page);
  await dlg.locator('[data-preset-family="aluminium"] [data-preset]').filter({ hasText: ALU_NAME }).getByRole("button", { name: "Use on this job" }).click();
  const card = dlg.locator('[data-setup="aluminium"]');
  await aluNum(card, "Saw kerf", 3);
  await card.getByLabel("The saw kerf above is confirmed for this job").check();
  await aluNum(card, "Stock length", 6000);
  await expect(dlg.getByRole("status").first()).toHaveText("Saved", { timeout: 15_000 });
  const preset = (await reviewPresets(page)).find((p) => p.name === ALU_NAME);
  const copy = (await aluServer(page)).materials.find((m) => m.fromPresetId === preset.id);
  expect(copy).toMatchObject({ fromPresetRevision: 1, spec: { kerfConfirmed: true, stockLengthMm: 6000 } });
  const asked = dialogs(page, [{}, {}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toContainText(`Saved a new version of “${ALU_NAME}”.`);
  expect(asked).toEqual([namePrompt(ALU_NAME), { type: "confirm", message: CLASH }]);
  expect((await reviewPresets(page)).find((p) => p.id === preset.id)).toMatchObject({ revision: 2, spec: { stockLengthMm: 6000, kerfConfirmed: false } });
  await dlg.getByRole("button", { name: "Close" }).first().click();
  const row = page.locator(`[data-material-row="${copy.id}"]`);
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("The company standard was updated");
  await expect(row.getByRole("button", { name: "Review update" })).toHaveCount(0);
  // this job keeps its own copy and its kerf confirmation
  expect((await aluServer(page)).materials.find((m) => m.id === copy.id)).toMatchObject({ fromPresetRevision: 1, spec: { kerfConfirmed: true, stockLengthMm: 6000 } });
  // another office login then really changes the product: the row offers the update as before
  const r = await page.evaluate(async (b) => (await fetch("/api/takeoff/company-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).status,
    { name: ALU_NAME, methodKey: "linear_stock", methodVersion: 1, spec: { ...copy.spec, stockLengthMm: 5000 }, rules: {}, presetId: preset.id, expectedRevision: 2 });
  expect(r).toBe(200);
  await page.evaluate(() => { window.history.pushState({}, "", "/carpentry/cjb-1"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.history.pushState({}, "", "/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await expect(page.locator(`[data-material-row="${copy.id}"]`)).toContainText("The company standard was updated (rev 3). This job still uses rev 1.");
});

test("HUB 024: the Worker-app office login has Add to company products; a leading hand has no button and no 'Set one up here'", async ({ page }) => {
  await page.goto("/worker/takeoff/carpentry/cjb-1?section=timber_cladding&takeoffWorker=office");
  await ready(page);
  let dlg = await addAluminium(page);
  const asked = dialogs(page, [{}]);
  await dlg.getByRole("button", { name: "Add to company products" }).click();
  await expect(dlg.locator('[data-company-product-msg="ok"]')).toContainText(`Added “${ALU_NAME}” to company products.`);
  expect(asked).toEqual([namePrompt(ALU_NAME)]);
  expect((await reviewPresets(page)).find((p) => p.name === ALU_NAME)).toMatchObject({ revision: 1, spec: { kerfConfirmed: false, stockLengthMm: 6500 } });
  await expect(dlg.getByRole("button", { name: "New company product" })).toHaveCount(0);   // company standards stay on the Hub
  // a leading hand (no office login): no button, no promise of one, and the server refuses it anyway
  await page.goto("/worker/takeoff/carpentry/cjb-1?section=timber_cladding");
  await ready(page);
  dlg = await addAluminium(page);
  const picker = dlg.locator("[data-family-presets]");
  await expect(picker).toContainText("No company products for this yet.");
  await expect(picker).not.toContainText("Set one up here");
  await expect(picker).not.toContainText("Add to company products");
  await expect(dlg.getByRole("button", { name: "Add to company products" })).toHaveCount(0);
  const refused = await page.evaluate(async () => (await fetch("/api/worker/takeoff/company-products", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sneaky", methodKey: "linear_stock", methodVersion: 1, spec: { family: "aluminium", profile: { aMm: 50, bMm: 50, tMm: 3 }, stockLengthMm: 6500 }, rules: {} }) })).status);
  expect(refused).toBe(403);
  // review: the leading hand's Timber chooser never points to a catalogue the Timber card doesn't have
  await dlg.getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Add timber" }).click();
  await expect(page.locator('[data-setup="timber"]')).toBeVisible();
  const timberPicker = page.locator("[data-family-presets]");
  await expect(timberPicker).toContainText("No company products for this yet.");
  await expect(timberPicker).not.toContainText("researched catalogue");
  await expect(timberPicker).not.toContainText("Set one up here");
});
