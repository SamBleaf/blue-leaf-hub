// @ts-check
// Wall-by-wall plan step 4 (Sam, 21 Oct 2026): battens, foam tape and H-flashing worked out AUTOMATICALLY from the
// cladding — in UI Review Mode (mocked backend computing with the REAL computeWorkspace). Phone viewport 390 × 844.
//   acceptance 10  Axon 400 smooth from the Blue Leaf defaults: Supports shows uprights at the joins and every 600 plus
//                  the bottom, top and H-joint battens; the schedule and the order list the battens, the foam tape (rolls)
//                  and the H-flashing (lengths) with their product codes — nothing typed for them
//   check job      ?takeoffSeed=battens: every wall's own battens (the gable's sloped tops), the wall rows say how many,
//                  the schedule shows exactly what the engine worked out
//   older jobs     battens set up by hand stay; the cladding adds none on that wall and says so (never counted twice)
// The exact quantities are proved in scripts/tests/takeoff-tc-autobattens.test.mjs; the real server in takeoff-api.test.mjs.
//   UI_REVIEW_PORT=5196 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-autobattens.spec.js
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/takeoff/evidence/ui/tc-autobattens";
mkdirSync(SHOTS, { recursive: true });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
const computed = (page) => page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).computed);
const AXON400 = "James Hardie|Axon 400 smooth|1200|9";
const BATTEN = "90 × 35 H3 pine batten";   // HUB 030: never the Hardie Cavity Batten
const HFLASH = "Hardie™ 9mm Alum Horizontal H Flashing, code 305613 — 3,000 mm length";
const TAPE = "Hardie™ 50mm Foam Back Sealing Tape, 25 m roll, code 304560";
const supports = (page) => page.locator('[data-wall-elevation] [data-el-kind="line"][data-el-state="support"]');
async function clickBox(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
/** Overview → a material row's Setup → Walls (the walls list of that cladding). */
async function openWallsOf(page, name) {
  const row = page.locator("[data-material-row]").filter({ hasText: name });
  if ((await row.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await row.locator("button[aria-expanded]").first().click();
  await row.locator("[data-material-actions]").getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Walls", exact: true }).click();
  await expect(page.getByRole("region", { name: "Walls" })).toBeVisible();
}

test("step 4 / acceptance 10: Axon 400 smooth from the Blue Leaf defaults works out its own battens, foam tape and H-flashing — Supports, schedule and order, nothing typed for them", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&takeoffDefaults=1");
  await ready(page);
  await page.locator('[data-section="timber_cladding"]').click();
  await page.locator('[data-material-group="cladding"]').getByRole("button", { name: "Add cladding" }).click();
  const change = page.getByRole("button", { name: "Change product" });
  if (await change.isVisible().catch(() => false)) await change.click();
  await page.locator(`[data-product-option="${AXON400}"]`).click();
  await expect(page.locator('[data-company-defaults=""]')).toBeVisible();   // set up from the defaults: nothing else to answer
  await expect(page.locator("[data-needs]")).toHaveCount(0);
  // one line on the card instead of a setup card for the battens and extras
  await expect(page.locator("[data-followers-note]")).toHaveText("Battens, foam tape and H-flashing are worked out from your walls. Nothing to set up.");
  // one wall by numbers, taller than the 3,000 sheet so it gets an H joint: 4,000 × 3,600
  await page.getByRole("button", { name: "Walls", exact: true }).click();
  await page.getByRole("button", { name: "Wall by numbers" }).click();
  const sheet = page.getByRole("region", { name: "Wall by numbers" });
  await sheet.getByLabel("Wall name").fill("Wall 1");
  await sheet.getByLabel("Wall length").fill("4000"); await sheet.getByLabel("Wall length").press("Enter");
  await page.getByLabel("Wall height").fill("3600"); await page.getByLabel("Wall height").press("Enter");
  await expect(page.locator("[data-auto-joint]")).toContainText("Joint added automatically at 3,000 mm");
  // Supports: 8 uprights (both ends, the joins at 1,200 / 2,400 / 3,600 and every 600) of 3,600, one pine length each;
  // the bottom, the top and the H-joint batten of 4,000 each → 11 pieces, 40.80 m (HUB 030: pine up to 6,000)
  await page.getByRole("radio", { name: "Supports" }).click();
  await expect(supports(page)).toHaveCount(11);
  // the explanation folds under More (wall-by-wall step 5); the wall's short line at the top has the count
  await expect(page.locator("[data-elevation-note]")).toHaveCount(0);
  await expect(page.locator("[data-wall-line-text]")).toContainText("11 batten pieces");
  await page.locator("[data-wall-more] summary").click();
  await expect(page.locator("[data-wall-more] [data-elevation-about]").first()).toHaveText("Battens worked out from Axon 400 smooth: 11 pieces, 40.80 m on this wall. Nothing to set up. Fixings to the studs are not counted.");
  await expect(page.locator("[data-wall-more] [data-elevation-about]").first()).toBeVisible();
  await page.locator("[data-wall-more] summary").click();
  await expect(page.locator("[data-supports-empty]")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/supports-axon-defaults-390x844.png` });
  // tap a batten: what it is and what it is cut from
  await clickBox(page, supports(page).first());
  const info = page.getByRole("region", { name: /^Batten — upright at 0$/ });
  await expect(info.locator("[data-element-info]")).toContainText("Length3,600 mm");
  await expect(info.locator("[data-element-info]")).toContainText("Cut from a 3,600 mm 90 × 35 H3 pine batten");
  await expect(info).toContainText("Worked out from the cladding. Fixings to the studs are not counted.");
  await page.getByRole("button", { name: "Close panel" }).click();
  // the wall's own quantities list them (before spares): battens, H-flashing by the metre, tape in metres
  const qty = page.getByRole("region", { name: "Quantities on this wall" });
  await expect(qty).toContainText("Battens — cut from 3,600 mm lengths8 pieces · 28.80 m installed");
  await expect(qty).toContainText("Battens — cut from 4,200 mm lengths3 pieces · 12.00 m installed");
  await expect(qty).toContainText("H-flashing — cut from 3,000 mm lengths2 pieces · 4.00 m installed");
  await expect(qty).toContainText("Foam tape10.8 m");   // 3 joins × (3,000 + 590)
  // the short totals count batten PIECES (the order buys whole battens, with the offcuts shared across the walls)
  await expect(page.locator("[data-wall-result]")).toContainText(/Axon 400 smooth: \d+ sheets, 11 batten pieces$/);
  // the schedule: under the cladding, with their codes, exactly the engine's quantities (10 % spares from the default)
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect.poll(async () => (await computed(page)).scheduleLines.filter((l) => l.follower).length).toBe(4);   // saved (battens in 2 pine lengths)
  const c = await computed(page);
  const mat = c.scheduleLines.find((l) => l.follower === "battens").jobMaterialIds[0];
  const want = Object.fromEntries(c.scheduleLines.filter((l) => l.follower).map((l) => [l.follower, l.quantity]));
  expect(Object.keys(want).sort()).toEqual(["battens", "hflashing", "tape"]);
  await page.getByRole("button", { name: "Open schedule" }).click();
  const g = page.locator(`[data-generic-group="${mat}"]`);
  const bLines = c.scheduleLines.filter((l) => l.follower === "battens");
  expect(bLines.map((l) => l.finishedLengthMm).sort()).toEqual([3600, 4200]);
  for (const l of bLines) await expect(g.getByRole("button", { name: new RegExp(`^${l.quantity} pieces\\s*${l.item.description}`) })).toBeVisible();
  await expect(g.getByRole("button", { name: new RegExp(`^${want.hflashing} pieces?\\s*${HFLASH}`) })).toBeVisible();
  await expect(g.getByRole("button", { name: new RegExp(`^${want.tape} rolls?\\s*${TAPE}`) })).toBeVisible();
  await g.getByRole("button", { name: new RegExp(TAPE) }).click();
  await expect(g.locator("[data-sources-for]")).toContainText("10.77 m behind the vertical sheet joins + 10% spare = 11.85 m → 1 roll of 25 m");
  await page.screenshot({ path: `${SHOTS}/schedule-axon-followers-390x844.png`, fullPage: true });
  // the Timber and cladding order: battens and H-flashing in lengths, the tape in rolls, each with its code
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  await expect(page.getByText(/Draft FO-/)).toBeVisible();
  const og = page.locator(`[data-order-group="${mat}"]`);
  await expect(og.locator('[data-unit="roll"]')).toContainText(TAPE);
  await expect(og.locator('[data-unit="roll"]').getByLabel(/Order quantity.*\(rolls?\)/)).toHaveValue(String(want.tape));
  for (const l of bLines) await expect(og.locator('[data-unit="piece"]').filter({ hasText: l.item.description }).getByLabel(/Order quantity.*\(pieces\)/)).toHaveValue(String(l.quantity));
  await expect(og).not.toContainText("405307");
  await expect(og.locator('[data-unit="piece"]').filter({ hasText: "code 305613" }).getByLabel(/Order quantity.*\(pieces?\)/)).toHaveValue(String(want.hflashing));
  await page.screenshot({ path: `${SHOTS}/order-axon-followers-390x844.png`, fullPage: true });
});

test("step 4, the check job (?takeoffSeed=battens): each wall shows its own battens, the gable its sloped tops; the rows say how many; the schedule is the engine's", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=battens");
  await ready(page);
  const c = await computed(page);
  const res = c.materialResults["mat-axon400"];
  const pieces = (label) => res.layouts.find((L) => L.wallLabel === label).followers.battens.lines.length;
  // the engine's own per-wall pieces (exact working in takeoff-tc-autobattens.test.mjs)
  // HUB 030: pine battens up to 6,000, so a run joins only past 6,000 (fewer pieces, the same metres)
  expect(["Wall 1", "Wall 2", "Wall 3", "Wall 4", "Gable"].map(pieces)).toEqual([25, 13, 16, 10, 15]);
  await openWallsOf(page, "Axon 400 smooth");
  // the wall rows: sheets and battens — tape and H-flashing are on each wall's page
  const row = (name) => page.getByRole("button", { name: `Open ${name}` });
  // the row chips fold under the list's More (wall-by-wall step 5): hidden first, shown once More is tapped
  await expect(row("Wall 2").getByText("13 batten pieces", { exact: true })).toBeHidden();
  await page.locator("[data-rows-more]").click();
  await expect(row("Wall 2").getByText("13 batten pieces", { exact: true })).toBeVisible();
  await expect(row("Gable").getByText("15 batten pieces", { exact: true })).toBeVisible();
  await row("Gable").click();
  await page.getByRole("radio", { name: "Supports" }).click();
  await expect(supports(page)).toHaveCount(15);
  // the rakes get sloped battens (a line that is neither upright nor level)
  const sloped = await supports(page).evaluateAll((els) => els.map((g) => g.querySelector("line")).filter(Boolean)
    .filter((l) => Math.abs(Number(l.getAttribute("x1")) - Number(l.getAttribute("x2"))) > 1 && Math.abs(Number(l.getAttribute("y1")) - Number(l.getAttribute("y2"))) > 1).length);
  expect(sloped).toBe(2, "one sloped batten per rake (under 6,000)");
  const qty = page.getByRole("region", { name: "Quantities on this wall" });
  await expect(qty).toContainText("H-flashing — cut from 3,000 mm lengths1 piece · 2.95 m installed");
  await expect(qty).toContainText("Foam tape12.5 m");
  await page.screenshot({ path: `${SHOTS}/supports-gable-390x844.png` });
  // the door wall: no batten across the door, no sill under it
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await row("Wall 2").click();
  await page.getByRole("radio", { name: "Supports" }).click();
  await expect(supports(page)).toHaveCount(13);
  // Wall 1: the battens round W1 and W2 are drawn OVER the windows (they lie on the window edges), so they can be seen
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await row("Wall 1").click();
  await page.getByRole("radio", { name: "Supports" }).click();
  await expect(supports(page)).toHaveCount(25);
  const after = await page.evaluate(() => {
    const lastOpening = [...document.querySelectorAll("[data-wall-elevation] [data-opening-id]")].at(-1);
    return [...document.querySelectorAll('[data-wall-elevation] [data-el-kind="line"][data-el-state="support"]')]
      .filter((g) => lastOpening && (lastOpening.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING)).length;
  });
  expect(after, "W1 and W2: two sides, a head and a sill each, drawn over the windows").toBe(8);
  await expect(page.getByRole("list", { name: "Legend" })).toContainText("Batten");
  await expect(page.getByRole("list", { name: "Legend" })).not.toContainText("Support");
  await page.screenshot({ path: `${SHOTS}/supports-wall1-openings-390x844.png` });
  // the schedule: every follower line of the job is what the engine worked out
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Open schedule" }).click();
  const g = page.locator('[data-generic-group="mat-axon400"]');
  for (const l of c.scheduleLines.filter((x) => x.jobMaterialIds.includes("mat-axon400"))) {
    const unit = l.unit === "roll" ? (l.quantity === 1 ? "roll" : "rolls") : l.unit === "sheet" ? (l.quantity === 1 ? "sheet" : "sheets") : l.quantity === 1 ? "piece" : "pieces";
    await expect(g.getByRole("button", { name: new RegExp(`^${l.quantity} ${unit}\\s*${l.item.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeVisible();
  }
  const total = (u, one, many) => { const n = c.scheduleLines.filter((x) => x.jobMaterialIds.includes("mat-axon400") && x.unit === u).reduce((a, x) => a + x.quantity, 0); return `${n} ${n === 1 ? one : many}`; };
  await expect(g.locator("p.text-right")).toHaveText(`${total("piece", "piece", "pieces")} · ${total("sheet", "sheet", "sheets")} · ${total("roll", "roll", "rolls")}`);
  // the summary names what each spare and each cutting plan is for (never "7 pieces, 1 piece")
  const lineOf = (f) => c.scheduleLines.find((x) => x.jobMaterialIds.includes("mat-axon400") && x.follower === f);
  const bSpare = lineOf("battens").spareQuantity, hSpare = lineOf("hflashing").spareQuantity;
  await expect(g.locator("[data-spares]")).toContainText(`${bSpare} ${bSpare === 1 ? "batten" : "battens"}`);
  await expect(g.locator("[data-spares]")).toContainText(`${hSpare} ${hSpare === 1 ? "H-flashing length" : "H-flashing lengths"}`);
  await expect(g.locator('[data-alloc-summary="battens"]')).toContainText(/^Battens: cuts need [\d,]+ mm/);
  await expect(g.locator('[data-alloc-summary="hflashing"]')).toContainText(/^H-flashing: cuts need [\d,]+ mm/);
  await expect(g).toContainText(/Battens: suggested cut plan/);
  // "Show on wall" from the batten line opens the wall on its Supports
  await g.getByRole("button", { name: new RegExp(BATTEN) }).first().click();   // the battens come in several pine lengths
  await g.getByRole("button", { name: "Show on wall" }).first().click();
  await expect(page.getByRole("radio", { name: "Supports" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => supports(page).count()).toBeGreaterThan(0);
});

test("step 4: a cladding with no automatic battens says so on Supports — Matrix keeps the 'add a Support battens material' guidance; a direct-fixed Linea has none", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding");
  await ready(page);
  const addOne = async (key) => {
    await page.locator('[data-material-group="cladding"]').getByRole("button", { name: "Add cladding" }).click();
    const change = page.getByRole("button", { name: "Change product" });
    if (await change.isVisible().catch(() => false)) await change.click();
    await page.locator(`[data-product-option="${key}"]`).click();
    await expect(page.locator(`[data-chosen-product="${key}"]`)).toBeVisible();
  };
  const wallByNumbers = async (name) => {
    await page.getByRole("button", { name: "Walls", exact: true }).click();
    await page.getByRole("button", { name: "Wall by numbers" }).click();
    const sheet = page.getByRole("region", { name: "Wall by numbers" });
    await sheet.getByLabel("Wall name").fill(name);
    await sheet.getByLabel("Wall length").fill("4000"); await sheet.getByLabel("Wall length").press("Enter");
    await page.getByLabel("Wall height").fill("2700"); await page.getByLabel("Wall height").press("Enter");
    await page.getByRole("radio", { name: "Supports" }).click();
  };
  await addOne("James Hardie|Matrix|1190|8#403811");
  await wallByNumbers("Matrix wall");
  await expect(page.locator("[data-supports-empty]")).toHaveText("No support layer on this wall. Battens and rails are their own material — add one and attach it to this wall. Support spacing for the cladding stays source-pending until a reviewed rule or project detail is recorded — it is not calculated here.");
  await expect(supports(page)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/supports-matrix-empty-390x844.png` });
  // Linea fixed straight to the frame: no battens, and Supports says why
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding");
  await ready(page);
  await addOne("James Hardie|Linea|150|16");
  await page.locator('[data-chips="route"]').getByRole("button", { name: "Direct fix" }).click();
  await expect(page.locator('[data-component="Battens"]')).toContainText("Direct fix: no battens.");
  await wallByNumbers("Linea wall");
  await expect(page.locator("[data-supports-empty]")).toHaveText("Linea 150 is direct fixed, so it has no battens.");
  await expect(supports(page)).toHaveCount(0);
});

test("step 4, an older job: battens set up by hand on a wall stay as they were — the cladding adds none there, says so, and nothing is counted twice", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=mixed");
  await ready(page);
  const c = await computed(page);
  expect(c.scheduleLines.filter((l) => l.jobMaterialIds.includes("mat-axon") && l.follower === "battens")).toHaveLength(0);
  const handLines = c.materialResults["mat-bat"].layouts[0].lines.length;
  await openWallsOf(page, "Axon cladding");
  await page.getByRole("button", { name: "Open North wall" }).click();
  await page.getByRole("radio", { name: "Supports" }).click();
  // only the hand-made layer's battens are drawn — the Axon adds none of its own here
  await expect(supports(page)).toHaveCount(handLines);
  // and says how to switch to the automatic battens (a note: under More, wall-by-wall step 5)
  await page.locator("[data-wall-more] summary").click();
  const about = page.locator("[data-wall-more] [data-elevation-about]").first();
  await expect(about).toHaveText("The battens on this wall come from Cavity battens (set up by hand), so Axon cladding doesn't add its own here. To use the automatic battens instead, remove Cavity battens from this wall in Materials on this wall.");
  await expect(about).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/supports-hand-made-390x844.png` });
});
