// @ts-check
// HUB 029 (Sam, 25 Oct 2026): "eliminate blockers where possible … make each blocker or label something you can click …
// minimal clicks". HUB 030: 90 × 35 H3 pine battens. In UI Review Mode (mocked backend computing with the REAL
// computeWorkspace and the REAL fixesFor), phone 390 × 844, on synthetic seeds shaped like the recorded job:
//   cladding-wall3          Axon on nine walls + Wall 3 (420 mm, no Wall height); a second Axon on two walls
//   support-battens-empty   a Support battens item with nothing entered (pine, 600 centres, fixings not counted)
//   converted-axon          an Axon turned into empty Support battens by the Material chip (its joint rows kept)
//   UI_REVIEW_PORT=5196 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-hub029.spec.js
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/takeoff/evidence/ui/tc-hub029";
mkdirSync(SHOTS, { recursive: true });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
const computed = (page) => page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).computed);
const material = (page, id) => page.evaluate(async (mid) => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot.materials.find((m) => m.id === mid), id);
/** Overview → a material row's Setup card. */
async function openCard(page, materialId) {
  const row = page.locator(`[data-material-row="${materialId}"]`);
  if ((await row.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await row.locator("button[aria-expanded]").first().click();
  await row.locator("[data-material-actions]").getByRole("button", { name: "Setup", exact: true }).click();
}

test("HUB 029: Wall 3 with no height — every blocked line names it as a button; one tap opens Wall 3 at Wall height; Done comes back; the order is ready", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=cladding-wall3");
  await ready(page);
  await openCard(page, "mat-axon-a");
  const preview = page.locator("[data-quantity-preview]");
  // no "not orderable yet" without a button that says why — here every line is held by Wall 3, so it is said ONCE
  await expect(preview.locator("[data-preview-line]").first()).toBeVisible();
  await expect(preview.locator("[data-line-fix]")).toHaveCount(1);
  await expect(preview.locator("[data-line-fix-all]")).toHaveText(/^Not orderable yet: Wall 3 has no Wall height›$/);
  // the card's order state: one fix row (the wall), no installation sentence among the fixes, tiles folded away
  const fixes = page.locator("[data-fix-list]");
  await expect(fixes).toContainText("1 thing to fix before ordering");
  await expect(fixes.locator("[data-fix-key]")).toHaveCount(1);
  await expect(fixes.locator("[data-fix-key]")).toHaveText(/^Wall 3: enter the Wall height›$/);
  await expect(fixes).not.toContainText("nstallation");
  await expect(page.locator("[data-status-details]")).not.toHaveAttribute("open", "");
  await expect(page.locator('[data-status="installation"]')).toHaveText(/Not checked by the app/);
  await expect(page.locator('[data-status="installation"]')).toHaveClass(/slate/);
  // a cladding with walls offers cladding types only on its Material row
  const chips = page.locator('[data-chips="family"]');
  await expect(chips.getByRole("button", { name: "Fibre cement" })).toBeVisible();
  await expect(chips.getByRole("button", { name: "Support battens" })).toHaveCount(0);
  await expect(chips.getByRole("button", { name: "Accessories" })).toHaveCount(0);
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/card-wall3-blocked-390x844.png` });
  // tap 1: the fix opens Wall 3 with Wall height focused
  await fixes.locator("[data-fix-key]").click();
  await expect(page.getByLabel("Wall height")).toBeFocused();
  await page.screenshot({ path: `${SHOTS}/wall3-height-focused-390x844.png` });
  await page.getByLabel("Wall height").fill("3600");
  await page.getByLabel("Wall height").press("Enter");
  // tap 2: Done goes straight back to the card
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("[data-quantity-preview]")).toBeVisible();
  await expect(page.locator("[data-line-fix]")).toHaveCount(0);
  await expect(page.locator("[data-fix-list]")).toHaveCount(0);
  await expect(page.locator("[data-order-ready]")).toContainText("Ready to order");
  await expect(page.locator("[data-order-ready]").getByRole("button", { name: "Review order ›" })).toBeVisible();
  await page.locator("[data-order-ready]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/card-ready-390x844.png` });
  // the engine agrees: nothing on the job's timber-and-cladding lines is held
  await expect.poll(async () => (await computed(page)).scheduleLines.filter((l) => l.generic && l.problems.length).length).toBe(0);
  // the battens are the owner's pine, bought once for both claddings (HUB 030)
  const c = await computed(page);
  const battens = c.scheduleLines.filter((l) => l.follower === "battens");
  expect(battens.length).toBeGreaterThan(0);
  expect(battens.every((l) => /^90 × 35 H3 pine batten — /.test(l.item.description))).toBe(true);
  expect(battens.some((l) => l.jobMaterialIds.includes("mat-axon-b"))).toBe(true);
  expect(JSON.stringify(c.scheduleLines)).not.toMatch(/405307|Cavity Batten/);
  // Review order › opens a Timber and cladding draft with everything orderable on it; what is left is one card of
  // chips that save at once (no Save order details): the supplier, As soon as possible, my phone; then Export
  let taps = 0;
  const tap = async (loc) => { await loc.click(); taps++; };
  await tap(page.locator("[data-order-ready]").getByRole("button", { name: "Review order ›" }));
  const card = page.locator('[data-before-order=""]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-order-group]")).toHaveCount(2);   // both Axons, with their pooled battens
  await expect(page.locator('[data-order-group] [data-status="installation"]')).toHaveCount(0);
  await expect(card.locator("[data-fix-key]")).toHaveCount(0);
  await expect(card.locator('[data-chip="supplier"]')).toHaveText("Use Other Steel Supplies (your last timber and cladding order)");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/orders-before-you-can-order-390x844.png` });
  await tap(card.locator('[data-chip="supplier"]'));
  await expect(page.locator("[data-order-msg]")).toHaveText("Saved on this order.");
  await tap(card.locator('[data-chip="asap"]'));
  await expect(card.locator('[data-chip="asap"]')).toHaveCount(0);
  await tap(card.locator('[data-chip="my-phone"]'));
  await expect(page.locator('[data-before-order="ready"]')).toContainText("Ready:");
  await expect(page.getByRole("button", { name: "Save order details" })).toHaveCount(0);
  const exp = page.getByRole("button", { name: "Export supplier PDF" });
  await expect(exp).toBeEnabled();
  await page.locator('[data-before-order="ready"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/orders-ready-390x844.png` });
  await tap(exp);
  await expect(page.getByText(/is frozen\. Nothing has been sent\./)).toBeVisible();
  // on top of the fix and Done above: Review order, three chips and Export — 7 taps from the blocked card to a supplier PDF
  expect(taps).toBe(5);
  const orders = await page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1/orders")).json()).orders);
  const o = orders.find((x) => x.category === "timber_cladding");
  expect([o.supplierId, o.delivery.asap, o.delivery.contactPhone]).toEqual(["sup-2", true, "0400 123 456"]);
});

test("HUB 029: with Wall 3 still empty, the other cladding orders alone only with one 'Order without …' tick (named on the export); the fix button on the order opens Wall 3 and Done comes back to the order", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=cladding-wall3");
  await ready(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  const card = page.locator('[data-before-order=""]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  // only the second Axon's own sheets were pre-filled (the held lines are left off, never on the order blocked)
  const orders = async () => page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1/orders")).json()).orders.find((x) => x.category === "timber_cladding"));
  const lines0 = (await orders()).lines;
  expect(lines0.length).toBeGreaterThan(0);
  expect(lines0.every((l) => l.jobMaterialId === "mat-axon-b")).toBe(true);
  // the wall row is one button naming the item; its own problem lines aren't repeated as bullets (B33)
  await expect(card.locator("[data-fix-key]")).toHaveCount(1);
  await expect(card.locator("[data-fix-key]")).toContainText("Wall 3");
  await expect(card.locator("li", { hasText: /^Axon 400 smooth: / })).toHaveCount(0);
  for (const c of ["supplier", "asap", "my-phone"]) await card.locator(`[data-chip="${c}"]`).click();
  const without = page.locator("[data-order-without]");
  await expect(without).toContainText("Order without Axon 400 smooth (Walls 1, 3–6): Wall 3 has no Wall height");
  const exp = page.getByRole("button", { name: "Export supplier PDF" });
  await expect(exp).toBeDisabled();
  await without.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/orders-order-without-390x844.png` });
  await without.locator("input").check();
  await expect(page.locator('[data-before-order="ready"]')).toContainText("without Axon 400 smooth");
  await expect(exp).toBeEnabled();
  // the fix on the order: Wall 3 at Wall height, Done back on this order
  await without.locator("input").uncheck();
  await card.locator("[data-fix-key]").click();
  await expect(page.getByLabel("Wall height")).toBeFocused();
  await page.getByLabel("Wall height").fill("3600");
  await page.getByLabel("Wall height").press("Enter");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Timber and cladding orders" })).toBeVisible();
  // nothing is held now: the first Axon is one tap away (Add all … saves), its pooled lines are brought up to date
  await expect(page.locator("[data-order-without]")).toHaveCount(0);
  const update = page.locator("[data-update-all]");
  if (await update.isVisible().catch(() => false)) await update.click();
  await page.locator("[data-add-needed]").click();
  await expect(page.locator("[data-order-msg]")).toHaveText(/^Added \d+ lines? — saved\.$/);
  await expect(page.locator('[data-before-order="ready"]')).toBeVisible();
  await expect(exp).toBeEnabled();
  const lines1 = (await orders()).lines;
  expect(lines1.some((l) => l.jobMaterialId === "mat-axon-a")).toBe(true);
});

test("HUB 029: exporting with 'Order without …' freezes the left-off item and the mock refuses it without the tick, as the server", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=cladding-wall3");
  await ready(page);
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  const card = page.locator('[data-before-order=""]');
  for (const c of ["supplier", "asap", "my-phone"]) await card.locator(`[data-chip="${c}"]`).click();
  await expect(page.locator("[data-order-without]")).toBeVisible();
  const o = await page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1/orders")).json()).orders.find((x) => x.category === "timber_cladding"));
  const post = (body) => page.evaluate(async ([id, b]) => { const r = await fetch(`/api/takeoff/orders/${id}/exports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; }, [o.id, body]);
  const no = await post({ isDraft: false, idempotencyKey: "x-hub029-no", expectedOrderRevision: o.revision });
  expect(no.status).toBe(400);
  expect(no.body.error).toMatch(/Order without Axon 400 smooth/);
  await page.locator("[data-order-without] input").check();
  await page.getByRole("button", { name: "Export supplier PDF" }).click();
  await expect(page.getByText(/is frozen\. Nothing has been sent\./)).toBeVisible();
});

test("HUB 029: the second cladding's card shows the same Wall 3 row (its pooled lines are held by it) and the tap opens that wall under the first cladding", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=cladding-wall3");
  await ready(page);
  await openCard(page, "mat-axon-b");
  const fixes = page.locator("[data-fix-list]");
  await expect(fixes.locator("[data-fix-key]")).toHaveCount(1);
  await expect(fixes).toContainText("Wall 3");
  await fixes.locator("[data-fix-key]").click();
  await expect(page.getByLabel("Wall height")).toBeFocused();
});

test("HUB 030: Support battens with nothing entered — the Blue Leaf default pine, 600 centres, fixings not counted, a quantity and nothing to fix; Change and back to the default", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=support-battens-empty");
  await ready(page);
  await openCard(page, "mat-sb");
  await expect(page.locator("[data-batten-default]")).toContainText("Blue Leaf default: 90 × 35 H3 pine batten");
  await expect(page.locator('[data-component="Supports"]')).toContainText("600 centres (Blue Leaf default)");
  await expect(page.locator('[data-component="Fixings"]')).toContainText("Not counted (Blue Leaf default)");
  await expect(page.locator("[data-needs]")).toHaveCount(0);
  await expect(page.locator("[data-fix-list]")).toHaveCount(0);
  await expect(page.locator("[data-quantity-preview] [data-preview-line]").first()).toContainText("90 × 35 H3 pine batten");
  await expect(page.locator("[data-line-fix]")).toHaveCount(0);
  await page.locator("[data-batten-default]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/support-battens-default-390x844.png` });
  // Change → a Hardie pick on purpose → "Use Blue Leaf default" gives the pine batten back
  await page.locator("[data-batten-default]").getByRole("button", { name: "Change" }).click();
  await page.locator('[data-product-option="James Hardie|Hardie Cavity Batten|70|19"]').click();
  await expect.poll(async () => (await material(page, "mat-sb")).spec.product?.name).toBe("Hardie Cavity Batten");
  await page.locator("[data-use-default]").click();
  await expect(page.locator("[data-batten-default]")).toBeVisible();
  await expect.poll(async () => { const p = (await material(page, "mat-sb")).spec.product || {}; return p.name || null; }).not.toBe("Hardie Cavity Batten");
});

test("HUB 029: the mis-tapped Axon comes back in 3 taps with this job's own joint rows (Support battens → Fibre cement → Axon 400 smooth)", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=converted-axon");
  await ready(page);
  await openCard(page, "mat-conv");
  // a batten item still shows every chip, so it can be turned back
  await page.locator('[data-chips="family"]').getByRole("button", { name: "Fibre cement" }).click();
  const change = page.getByRole("button", { name: "Change product" });
  if (await change.isVisible().catch(() => false)) await change.click();
  await page.locator('[data-product-option="James Hardie|Axon 400 smooth|1200|9"]').click();
  await expect.poll(async () => (await material(page, "mat-conv")).rules.jointRows).toEqual({ atMm: [2990], gapMm: 5, detailRef: "02" });
  await expect.poll(async () => (await material(page, "mat-conv")).rules.carried?.jointRows ?? null).toBeNull();
  await expect.poll(async () => (await material(page, "mat-conv")).spec.family).toBe("cladding");
});
