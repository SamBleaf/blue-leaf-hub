// @ts-check
// Takeoff — viewer proof + journeys in UI Review Mode (SYNTHETIC fixtures, no backend).
//   npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/takeoff.spec.js
// Evidence screenshots → docs/takeoff/evidence/ui/
//
// Proves on real Chromium: pdf.js raster + vector overlay agree (tap at known plan geometry →
// the measured length matches the fixture to < 2 CSS px), across DPR 1/2/3 and zoom 1/4/12;
// drags/second fingers never place points; backing canvas stays bounded at max zoom.
// Real iPhone/Safari behaviour is a separate, PENDING release gate (docs/takeoff/HANDOVER.md).
import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const SHOTS = "docs/takeoff/evidence/ui";
mkdirSync(SHOTS, { recursive: true });
const meta = JSON.parse(readFileSync(new URL("../../src/ui-review/fixtures/takeoff/synthetic-plan-set.json", import.meta.url), "utf8"));
const k = meta.pages[0].pdfUnitsPerMm;
const BX = 120, BY = 150;

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
async function openMeasure(page, path = "/carpentry/cjb-1/takeoff?reviewRole=admin") {
  await page.goto(path);
  await ready(page);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
}
/** Screen (page) coordinates of a PDF point via the viewport's own transform. */
async function screenOf(page, p) {
  return page.evaluate((pt) => {
    const el = document.querySelector("[data-takeoff-viewport]");
    const s = el.takeoffViewport.toScreen(pt);
    const r = el.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }, p);
}
async function zoomCtrlWheel(page, steps) {
  const vp = page.locator("[data-takeoff-viewport]");
  const box = await vp.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < steps; i++) { await page.keyboard.down("Control"); await page.mouse.wheel(0, -100); await page.keyboard.up("Control"); }
  await page.waitForTimeout(400);
}
for (const dpr of [1, 2, 3]) {
  test.describe(`viewer geometry @ DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 860 } });
    for (const zoomSteps of [0, 6, 11]) {
      test(`tap on printed dimension → 4,312 mm run (zoom steps ${zoomSteps})`, async ({ page }) => {
        await openMeasure(page);
        if (zoomSteps) await zoomCtrlWheel(page, zoomSteps);
        const a = { x: BX + 1000 * k, y: BY + 2000 * k }, b = { x: BX + 5312 * k, y: BY + 2000 * k }; // synthetic eaves line
        // pan so both ends are on screen when zoomed
        if (zoomSteps) {
          await page.evaluate((pts) => {
            const el = document.querySelector("[data-takeoff-viewport]");
            const s0 = el.takeoffViewport.toScreen(pts[0]);
            const r = el.getBoundingClientRect();
            el.dispatchEvent(new WheelEvent("wheel", { deltaX: s0.x - 60, deltaY: s0.y - r.height / 2, bubbles: true, cancelable: true }));
          }, [a, b]);
          await page.waitForTimeout(300);
        }
        const sa = await screenOf(page, a);
        let sb = await screenOf(page, b);
        const vpBox = await page.locator("[data-takeoff-viewport]").boundingBox();
        let expected = 4312;
        if (sb.x > vpBox.x + vpBox.width - 10) {
          // at high zoom the far end is off-screen: measure a shorter span on the same line
          const visibleMm = Math.floor(((vpBox.x + vpBox.width - 40 - sa.x) / (sb.x - sa.x)) * 4312);
          sb = await screenOf(page, { x: a.x + visibleMm * k, y: a.y });
          expected = visibleMm;
        }
        await page.mouse.click(sa.x, sa.y);
        await page.mouse.click(sb.x, sb.y);
        const txt = await page.locator("section[aria-label='Measure runs']").innerText();
        const m = /Measured ([\d,]+)/.exec(txt);
        expect(m, txt).not.toBeNull();
        const measured = Number(m[1].replace(/,/g, ""));
        // a click lands on an integer CSS px → error ≤ 1 px of plan at this zoom
        const view = await page.evaluate(() => document.querySelector("[data-takeoff-viewport]").takeoffViewport.view());
        const mmPerCssPx = 1 / (view.scale * k);
        expect(Math.abs(measured - expected)).toBeLessThanOrEqual(Math.ceil(2 * mmPerCssPx) + 1);
        const stats = await page.evaluate(() => window.__takeoffViewerStats);
        expect(stats.maxBackingPixels).toBeLessThanOrEqual(4096 * 4096);
        if (dpr === 2 && zoomSteps === 11) await page.screenshot({ path: `${SHOTS}/viewer-desktop-zoomed.png` });
      });
    }
  });
}

test.describe("gestures never place stray points", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  test("drag > 8px pans; two-finger pinch places nothing; tap places", async ({ page }) => {
    await openMeasure(page, "/worker/takeoff/carpentry/cjb-1");
    const vp = page.locator("[data-takeoff-viewport]");
    const box = await vp.boundingBox();
    const before = await page.locator("[data-measurement-id]").count();
    const cdp = await page.context().newCDPSession(page);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
    // single-finger drag (pan)
    await touch("touchStart", [[cx, cy]]); for (let i = 1; i <= 6; i++) await touch("touchMove", [[cx + i * 6, cy]]); await touch("touchEnd", []);
    // two-finger pinch, first finger lifts first, remaining finger moves
    await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 6; i++) await touch("touchMove", [[cx - 30 - i * 8, cy], [cx + 30 + i * 8, cy]]);
    await touch("touchMove", [[cx + 80, cy]]);
    await touch("touchMove", [[cx + 90, cy + 5]]);
    await touch("touchEnd", []);
    await page.waitForTimeout(300);
    expect(await page.getByText("Tap the finish of this run.").count()).toBe(0); // no start point placed
    // a clean tap places a start point
    await touch("touchStart", [[cx, cy + 100]]); await touch("touchEnd", []);
    await expect(page.getByText("Tap the finish of this run.")).toBeVisible();
    expect(await page.locator("[data-measurement-id]").count()).toBe(before);
    await page.screenshot({ path: `${SHOTS}/worker-measure-390x844.png` });
  });
});

test.describe("journeys", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("calibrate two axes + check → Ready", async ({ page }) => {
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: "Scale this page" }).click();
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0);
    await page.getByRole("button", { name: "Scale the whole page" }).click();
    const tap = async (p) => { const s = await screenOf(page, p); await page.mouse.click(s.x, s.y); };
    await tap({ x: BX, y: BY - 40 }); await tap({ x: BX + 12000 * k, y: BY - 40 + 0.3 });
    await page.getByRole("textbox", { name: "Horizontal dimension" }).fill("12000"); await page.getByRole("textbox", { name: "Horizontal dimension" }).press("Enter");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await tap({ x: BX - 40, y: BY }); await tap({ x: BX - 40 + 0.3, y: BY + 8000 * k });
    await page.getByRole("textbox", { name: "Vertical dimension" }).fill("8000"); await page.getByRole("textbox", { name: "Vertical dimension" }).press("Enter");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText(/Both directions agree/)).toBeVisible();
    await page.getByRole("button", { name: /Next: check/ }).click();
    await tap({ x: BX, y: BY + 8000 * k + 30 }); await tap({ x: BX + 3000 * k, y: BY + 8000 * k + 30 });
    await page.getByRole("textbox", { name: "Printed check dimension" }).fill("3000"); await page.getByRole("textbox", { name: "Printed check dimension" }).press("Enter");
    await expect(page.getByText(/Scale is ready/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/calibrate-check-390x844.png` });
    await page.getByRole("button", { name: "Save scale" }).click();
    await expect(page.getByText("Tap the start of a straight run.")).toBeVisible();
  });

  test("R04 F08 press-and-hold shows the loupe; lifting places the point exactly there", async ({ page }) => {
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: "Scale this page" }).click();
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0);
    await page.getByRole("button", { name: "Scale the whole page" }).click();
    const s = await screenOf(page, { x: BX, y: BY - 40 });
    await page.mouse.move(s.x, s.y); await page.mouse.down();
    await page.waitForTimeout(650);                                   // hold ≥ 500 ms
    await expect(page.locator("[data-takeoff-loupe]")).toBeVisible();
    await page.mouse.move(s.x + 3, s.y + 2, { steps: 3 });            // fine-tune under the magnifier (no pan)
    await page.screenshot({ path: `${SHOTS}/loupe-390x844.png` });
    await page.mouse.up();
    await expect(page.locator("[data-takeoff-loupe]")).toHaveCount(0);
    await expect(page.getByText(/Tap the other end/)).toBeVisible();  // the hold placed the first point
  });

  test("R04 A08 a saved order line whose material changes shows as stale and blocks the supplier PDF until updated", async ({ page }) => {
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: /Review & export order/ }).click();
    if (await page.getByRole("button", { name: "New order" }).isVisible()) await page.getByRole("button", { name: "New order" }).click();
    await expect(page.getByText(/Draft FO-/)).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Details" }).first().click();
    await page.getByLabel("Colour", { exact: true }).selectOption("Basalt");
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: /Review & export order/ }).click();
    await expect(page.getByTestId("stale-lines")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export supplier PDF" })).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/stale-order-line-390x844.png`, fullPage: true });
    // every stale length is reconciled explicitly (one tap each), then the order can be saved
    for (let i = 0; i < 10 && (await page.getByRole("button", { name: "Update to current material" }).count()); i++) {
      await page.getByRole("button", { name: "Update to current material" }).first().click();
    }
    await expect(page.getByTestId("stale-lines")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save order details" })).toBeVisible();
  });

  test("schedule → split the 7,200 run (invalid then valid)", async ({ page }) => {
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: "Open schedule" }).click();
    await page.getByRole("button", { name: /7,200 mm/ }).click();
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await page.getByLabel("Piece 1 length").fill("3600"); await page.getByLabel("Piece 1 length").press("Tab");
    await page.getByLabel("Lap at joint 1").fill("200"); await page.getByLabel("Lap at joint 1").press("Tab");
    await page.getByLabel("Piece 2 length").fill("3600"); await page.getByLabel("Piece 2 length").press("Tab");
    await expect(page.getByText(/coverage 7,000 mm/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply split" })).toBeDisabled();
    await page.getByLabel("Piece 2 length").fill("3700"); await page.getByLabel("Piece 2 length").press("Tab");
    await page.getByLabel("Piece 1 length").fill("3700"); await page.getByLabel("Piece 1 length").press("Tab");
    await expect(page.getByText(/coverage 7,200 mm/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/split-390x844.png` });
    await page.getByRole("button", { name: "Apply split" }).click();
    await expect(page.getByRole("button", { name: /3,700 mm/ })).toBeVisible();
  });

  test("order: draft PDF, supplier PDF, record placed (director)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: /Review & export order/ }).click();
    await page.getByRole("button", { name: "New order" }).click();
    await expect(page.getByText(/Draft FO-/)).toBeVisible();
    await expect(page.getByText(/^Ready: \d+ pieces/)).toBeVisible();
    await page.getByRole("button", { name: "Export draft PDF" }).click();
    await expect(page.getByText(/Export 1 \(draft\) is frozen\. Nothing has been sent\./)).toBeVisible();
    await page.getByRole("button", { name: "Export supplier PDF" }).click();
    await expect(page.getByText(/Export 2 is frozen\. Nothing has been sent\./)).toBeVisible();
    await page.getByRole("button", { name: "Record order placed…" }).click();
    await page.getByLabel("Which PDF did you send?").selectOption({ label: "Export 2" });
    await page.getByRole("textbox", { name: "Supplier reference" }).fill("SO-REVIEW-1");
    await page.getByRole("button", { name: "Record order placed", exact: true }).click();
    await expect(page.getByText("Placed externally")).toBeVisible();
    await expect(page.getByText(/Placed orders are locked/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/orders-desktop.png`, fullPage: true });
  });

  test("R04 A01/A02 existing profile: live edit (no Apply), one Undo per typing session, invalid text never changes the shape, autosaves", async ({ page }) => {
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: "Profile" }).first().click();
    const dlg = page.getByRole("dialog", { name: /Apron flashing/ });
    await expect(dlg).toBeVisible();
    expect(await page.locator(".blueprint-fab:visible").count()).toBe(0); // global FAB hidden in focus mode
    // quiet default screen: Close · Undo · More · Details · Lengths — no duplicate dimension list, no Apply/Save
    await expect(dlg.getByRole("button", { name: /^(Close|Undo|More|Details|Lengths)$/ })).toHaveCount(5);
    expect(await dlg.getByRole("button").filter({ visible: true }).count()).toBeLessThanOrEqual(5);
    await expect(dlg.getByRole("button", { name: /Apply|^Save/ })).toHaveCount(0);
    const girth = (mm) => dlg.getByText(new RegExp(`indicative girth ${mm} mm`));
    await expect(girth(310)).toBeVisible();
    // tap the L2 size label on the drawing → its field, focused, applies while typing
    await dlg.locator("svg text", { hasText: "L2 150" }).click();
    const field = dlg.getByLabel("L2 length");
    await expect(field).toBeFocused();
    await field.fill("");                       // empty: a draft, never 0
    await expect(dlg.getByText(/Type a number/)).toBeVisible();
    await expect(girth(310)).toBeVisible();
    for (const bad of [".", "0", "-5", "abc"]) {
      await field.fill(bad);
      await expect(girth(310)).toBeVisible();
    }
    await field.fill("");
    await field.pressSequentially("200");       // 2 → 20 → 200: all valid, ONE undo step
    await expect(girth(360)).toBeVisible();
    await expect(dlg.locator("svg text", { hasText: "L2 200" })).toBeVisible();
    await dlg.getByRole("button", { name: "Undo" }).click();
    await expect(girth(310)).toBeVisible();      // straight back to 150, not 20
    await expect(field).toHaveValue("150");      // field and drawing agree
    await expect(dlg.getByText("Leg L2")).toBeVisible(); // still in the editor
    await dlg.getByRole("button", { name: "More" }).click();
    await dlg.getByRole("menuitem", { name: "Redo" }).click();
    await expect(girth(360)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/profile-editor-390x844.png` });
    await expect(dlg.getByRole("status").filter({ hasText: /Saved|Saving|Not synced/ })).toBeVisible();
    await dlg.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(/girth 360 mm/).first()).toBeVisible();   // autosaved to the job copy, no Save pressed
  });

  test("R04 A01/A02 new flashing: empty grid, tap the shape, correct sizes, two-tap crush fold + flip, survives reload", async ({ page }) => {
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: "Add flashing" }).click();
    await page.getByRole("button", { name: "New flashing" }).click();
    const dlg = page.getByRole("dialog", { name: /^Flashing/ });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText("Tap where the flashing starts.")).toBeVisible();
    expect(await dlg.locator("svg text").count()).toBe(0);
    expect(await dlg.locator("svg line").count()).toBeGreaterThan(10);
    await page.screenshot({ path: `${SHOTS}/new-flashing-empty-grid-390x844.png` });
    const box = await dlg.locator("[data-takeoff-viewport]").boundingBox();
    const at = (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await at(0.25, 0.8); await at(0.25, 0.3); await at(0.7, 0.3); await at(0.7, 0.45);
    await expect(dlg.locator("svg text", { hasText: /^L3 / })).toBeVisible();   // drawn — no "Done drawing" step
    await dlg.getByRole("button", { name: "Undo" }).click();
    await expect(dlg.locator("svg text", { hasText: /^L3 / })).toHaveCount(0);  // one point = one undo
    await at(0.7, 0.45);
    await expect(dlg.locator("svg text", { hasText: /^L3 / })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/new-flashing-drawn-390x844.png` });
    // correct sizes straight on the drawing
    for (const [leg, mm] of [["L1", "100"], ["L2", "150"], ["L3", "75"]]) {
      await dlg.locator("svg text", { hasText: new RegExp(`^${leg} `) }).click();
      await dlg.getByLabel(`${leg} length`).fill(mm);
      await expect(dlg.locator("svg text", { hasText: `${leg} ${mm}` })).toBeVisible();
    }
    await dlg.getByRole("button", { name: "Done" }).click();
    // crush fold: tap the end handle (where the last point went), then Crush fold — applied at once, no form
    const endBox = await dlg.locator('[data-end-handle="end"]').boundingBox();
    await page.mouse.click(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2);   // tap 1: the end
    await dlg.getByRole("button", { name: "Crush fold" }).click();                       // tap 2: crush fold
    await expect(dlg.locator("svg text", { hasText: /^Crush 10/ })).toBeVisible();
    const side = await dlg.getByText(/^Folds to the (left|right)/).textContent();
    await dlg.getByRole("button", { name: /Flip fold/ }).click();
    await expect(dlg.getByText(/^Folds to the (left|right)/)).not.toHaveText(side);
    await dlg.getByLabel("Crush width").fill("12");
    await expect(dlg.locator("svg text", { hasText: /^Crush 12/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/new-flashing-crush-390x844.png` });
    await dlg.getByRole("button", { name: "Done" }).click();
    await expect(dlg.getByRole("button", { name: /Apply|^Save/ })).toHaveCount(0);
    // autosave reaches the takeoff (server persistence across a reload is proven in the sandbox spec — this
    // backend is in-memory); close → reopen from the materials list → the same drawing
    await expect(dlg.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
    const name = (await dlg.getByRole("heading", { level: 1 }).textContent()).trim();
    await dlg.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(name).first()).toBeVisible();          // listed as a job material
    await page.getByRole("button", { name: "Profile" }).last().click();  // newest material is last
    const again = page.getByRole("dialog", { name });
    for (const t of ["L1 100", "L2 150", "L3 75", "Crush 12"]) await expect(again.locator("svg text", { hasText: t })).toBeVisible();
  });

  test("R04 A02 unfinished drawing + invalid field draft are restored after a reload (this device, this actor)", async ({ page }) => {
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: "Add flashing" }).click();
    await page.getByRole("button", { name: "New flashing" }).click();
    const dlg = page.getByRole("dialog", { name: /^Flashing/ });
    const box = await dlg.locator("[data-takeoff-viewport]").boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);          // ONE point: not a flashing yet
    await expect(dlg.getByRole("status").filter({ hasText: "On this device" })).toBeVisible();
    await page.waitForTimeout(300);
    await page.reload();
    await ready(page);
    await expect(page.getByText(/Unfinished drawing on this device/)).toBeVisible();
    await page.getByRole("button", { name: "Continue drawing" }).click();
    const back = page.getByRole("dialog", { name: /^(Flashing|New flashing)/ });
    await expect(back.getByText("Tap the end of the first leg.")).toBeVisible();          // the first point came back
    await back.locator("[data-takeoff-viewport]").click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    await back.locator("svg text", { hasText: /^L1 / }).click();
    await back.getByLabel("L1 length").fill(".");                                         // invalid → draft
    await page.waitForTimeout(300);
    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: "Continue drawing" }).first().click();
    const d3 = page.getByRole("dialog", { name: /^(Flashing|New flashing)/ });
    await expect(d3.getByText(/size isn’t valid yet/)).toBeVisible();
  });

  test("R04b R5/R19/R20 refused save is never 'Saved' and is kept; Undo with an invalid draft only clears that field; no 'Saved' before the server has the shape", async ({ page }) => {
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.getByRole("button", { name: "Profile" }).first().click();
    const dlg = page.getByRole("dialog", { name: /Apron flashing/ });
    const chip = dlg.getByRole("status").first();
    await dlg.locator("svg text", { hasText: "L2 150" }).click();
    const field = dlg.getByLabel("L2 length");
    await field.fill("180");
    await expect(chip).not.toHaveText("Saved");                         // R20: the server doesn't have 180 yet
    await expect(chip).toHaveText("Saved", { timeout: 10_000 });
    // R19: a NEW session that only holds invalid text → Undo clears just that text, the shape keeps 180
    await dlg.getByRole("button", { name: "Done" }).click();
    await dlg.locator("svg text", { hasText: "L2 180" }).click();
    await field.fill(".");
    await dlg.getByRole("button", { name: "Undo" }).click();
    await expect(field).toHaveValue("180");
    await expect(dlg.getByText(/indicative girth 340 mm/)).toBeVisible();
    // R5: a refused save (expired sign-in) → "Not saved", kept, and Try again sends it
    await page.evaluate(() => { window.__takeoffReviewRefuse = 401; });
    await field.fill("200");
    await expect(chip).toHaveText("Not saved", { timeout: 10_000 });
    await dlg.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(/Not saved: Your sign-in has expired/)).toBeVisible();
    await page.evaluate(() => { window.__takeoffReviewRefuse = 0; });
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/girth 360 mm/).first()).toBeVisible();
  });

  test("ordinary worker sees no takeoff access", async ({ page }) => {
    await page.goto("/worker/takeoff/carpentry/cjb-1?takeoffWorker=ordinary");
    await ready(page);
    await expect(page.getByText(/don't have access/)).toBeVisible();
  });

  test("hub desktop overview + measure with side panel", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
    await ready(page);
    await page.screenshot({ path: `${SHOTS}/hub-overview-desktop.png` });
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0);
    await page.screenshot({ path: `${SHOTS}/hub-measure-desktop.png` });
  });

  for (const vp of [{ w: 844, h: 390, n: "landscape-844x390" }, { w: 360, h: 780, n: "small-360x780" }]) {
    test(`overview + measure layout ${vp.n}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto("/worker/takeoff/carpentry/cjb-1");
      await ready(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow).toBe(false);
      await page.screenshot({ path: `${SHOTS}/worker-overview-${vp.n}.png` });
      await page.getByRole("button", { name: /^Measure$/ }).click();
      await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0);
      await page.screenshot({ path: `${SHOTS}/worker-measure-${vp.n}.png` });
    });
  }
});

test.describe("saving + recovery (A18–A20)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const runOnPlan = async (page, y = 4000) => {
    const a = await screenOf(page, { x: BX + 500 * k, y: BY + y * k }), b = await screenOf(page, { x: BX + 3500 * k, y: BY + y * k });
    await page.mouse.click(a.x, a.y); await page.mouse.click(b.x, b.y);
  };

  test("A18 network loss: visible Not synced, edit kept, saves when back online", async ({ page }) => {
    await openMeasure(page);
    const before = await page.locator("[data-measurement-id]").count();
    await page.evaluate(() => { window.__takeoffReviewOffline = true; });
    await runOnPlan(page);
    await expect(page.getByRole("status").filter({ hasText: "Not synced" })).toBeVisible();
    await expect(page.getByText(/No connection — your changes are kept/)).toBeVisible();
    expect(await page.locator("[data-measurement-id]").count()).toBe(before + 1);
    expect(await page.getByText("Saved", { exact: true }).count()).toBe(0);
    await page.evaluate(() => { window.__takeoffReviewOffline = false; window.dispatchEvent(new Event("online")); });
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    expect((await page.evaluate(() => window.__takeoffReviewState())).measurements).toBe(7);
  });

  test("A19 reload recovery: same base → Restore re-applies; older base → conflict, never auto-saved", async ({ page }) => {
    await openMeasure(page);
    await page.evaluate(() => { window.__takeoffReviewOffline = true; });
    await runOnPlan(page, 4200);
    await expect(page.getByText(/No connection — your changes are kept/)).toBeVisible(); // save attempted + failed
    await page.reload(); // in-memory fixture resets to revision 7 — same base as the draft
    await ready(page);
    await expect(page.getByText(/Unsaved changes from .* were found on this device\./)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/recovery-offer-390x844.png` });
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    expect((await page.evaluate(() => window.__takeoffReviewState())).measurements).toBe(7);
    // now plant a draft based on an OLD revision
    await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open("blh-takeoff-recovery", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      await new Promise((res) => { const t = db.transaction("drafts", "readwrite"); t.objectStore("drafts").put({ key: "staff:review-admin|ws-1", actorKey: "staff:review-admin", workspaceId: "ws-1", baseRevision: 3, savedAt: Date.now(),
        changes: { calibrations: { insert: [] }, materials: { upsert: [], archive: [] }, measurements: { upsert: [{ id: "00000000-0000-4000-8000-00000000abcd", kind: "manual", finishedLengthMm: 999, quantity: 1 }], archive: [] }, contributions: { upsert: [], archive: [] } } }); t.oncomplete = res; });
    });
    await page.reload(); await ready(page);
    await expect(page.getByText(/made on an older version/)).toBeVisible();
    const commitsBefore = (await page.evaluate(() => window.__takeoffReviewState())).commits;
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Conflict" })).toBeVisible();
    await page.waitForTimeout(1200);
    expect((await page.evaluate(() => window.__takeoffReviewState())).commits).toBe(commitsBefore); // nothing overwritten
  });

  test("A20 storage unavailable: Recovery unavailable shown, edits stay in memory and save", async ({ page }) => {
    await page.addInitScript(() => { const orig = indexedDB.open.bind(indexedDB); indexedDB.open = (...a) => { if (a[0] === "blh-takeoff-recovery") throw new DOMException("quota", "QuotaExceededError"); return orig(...a); }; });
    await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin"); await ready(page);
    await expect(page.getByText(/Recovery unavailable on this device/)).toBeVisible();
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0);
    await runOnPlan(page, 4400);
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  });
});
