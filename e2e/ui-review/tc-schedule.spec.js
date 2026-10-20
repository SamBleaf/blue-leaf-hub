// @ts-check
// TC-R04 schedule + supplier order (02 §6, 06 statuses/identity, 07 ORD01/ORD02/J5, 11 export, 13 data/exports) in UI
// Review Mode — mocked backend (src/ui-review/fixtures/takeoff.js) computing with the REAL computeWorkspace.
//   UI_REVIEW_PORT=5194 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-schedule.spec.js
// The ?takeoffSeed=mixed knob adds the J5 mixed-procurement job: rafters (repeated members, 30° projected), Axon
// sheets on a 4,800 × 2,700 wall with a 900 × 900 window, cavity battens (deliberately incomplete), aluminium window
// angle (kerf confirmed), random-length shiplap (LM), entered trimmers, and two continuous flashing runs.
// Evidence screenshots → docs/takeoff/evidence/ui/tc-schedule/
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/takeoff/evidence/ui/tc-schedule";
mkdirSync(SHOTS, { recursive: true });
const MIXED = "/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=mixed";
const MIXED_FL = "/carpentry/cjb-1/takeoff?reviewRole=admin&section=flashings&takeoffSeed=mixed";   // HUB 002: flashings are their own section
const FIXINGS = `${MIXED}&takeoffFixings=1`;   // + an accessory material: 3 boxes of screws, membrane by others, sealant excluded
const SCHEDULE = "Schedule";   // the focused window's title (TakeoffApp)

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
/** HUB 002 compact rows: tap a material row so its actions show (no-op when it is already open). */
async function openRow(row) {
  const t = row.locator("button[aria-expanded]").first();
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  return row;
}
async function openSchedule(page, url = MIXED) {
  await page.goto(url);
  await ready(page);
  await page.getByRole("button", { name: "Open schedule" }).tap();
  await expect(page.getByRole("dialog", { name: SCHEDULE })).toBeVisible();
}
async function openOrders(page) {
  await page.goto(MIXED);
  await ready(page);
  await page.getByRole("button", { name: /Review & export order/ }).tap();
}
/** Widest right edge of any rendered element vs the window — horizontal page scroll would show up here. */
async function overflowPx(page) {
  return page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll("[data-takeoff-focus] *")) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) max = Math.max(max, r.right);
    }
    const scroller = document.querySelector("[data-takeoff-focus] .overflow-y-auto");
    return { right: max - window.innerWidth, scroll: scroller ? scroller.scrollWidth - scroller.clientWidth : 0, doc: document.documentElement.scrollWidth - window.innerWidth };
  });
}
/** Every visible button / input inside the focused window is at least 44 CSS px tall (touch target). */
async function smallTargets(page) {
  return page.evaluate(() => [...document.querySelectorAll("[data-takeoff-focus] button, [data-takeoff-focus] input, [data-takeoff-focus] select, [data-takeoff-focus] summary")]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest(".sr-only"); })
    // a checkbox's target is its whole label row (the R04 "As soon as possible" tick box)
    .filter((el) => el.getBoundingClientRect().height < 43.5 && !(el.type === "checkbox" && (el.closest("label")?.getBoundingClientRect().height || 0) >= 43.5))
    .map((el) => `${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40)}" ${Math.round(el.getBoundingClientRect().height)}px`));
}
const group = (page, id) => page.locator(`[data-generic-group="${id}"]`);
const orderGroup = (page, id) => page.locator(`[data-order-group="${id}"]`);

test.describe("TC-R04 schedule", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("J5 generic groups: units kept apart, three statuses, LM is an estimate, problems vs notes, flashing groups intact", async ({ page }) => {
    const errors = watchErrors(page);
    await openSchedule(page);
    const dlg = page.getByRole("dialog", { name: SCHEDULE });
    // flashing groups are still the length schedule (Qty × finished length), with an LM total for flashing only; the
    // heading says it is more than lengths (REV-8: it read "Length schedule" under the "Schedule" window title)
    // HUB 002: the Timber and cladding section lists its materials only — the flashings are in their own section
    await expect(dlg.getByRole("heading", { level: 2, name: "Materials to order" })).toBeVisible();
    await expect(dlg.getByText(/LM flashing$/)).toHaveCount(0);
    await expect(dlg.getByRole("button", { name: /^2 ×\s*4,600 mm/ })).toHaveCount(0);
    // rafters (J1): 18 × 5,400 — section manually specified, no structural claim
    const raf = group(page, "mat-raf");
    await expect(raf.getByRole("button", { name: /18 pieces\s*90 × 45 MGP10 H2 — 5,400 mm length/ })).toBeVisible();
    await expect(raf.locator('[data-status="quantity"]')).toHaveText("Quantity: Calculated");
    await expect(raf.locator('[data-status="installation"]')).toHaveText("Installation: Not specified");
    await expect(raf.locator('[data-status="procurement"]')).toHaveText("Ordering: Ready to order");
    await expect(raf.getByText("Quantities only — installation details are not verified by the app.")).toBeVisible();
    await expect(raf.getByText(/^Note: The longest available stock isn't set/)).toBeVisible();        // advisory, not blocking
    await raf.getByText("How this was worked out").tap();
    await expect(raf.getByText(/manually specified — not structurally verified/)).toBeVisible();
    // Axon (J2): 4 sheets, net 12.15 m², generated elevation labelled honestly
    const axon = group(page, "mat-axon");
    await expect(axon.getByRole("button", { name: /^4 sheets\s*James Hardie Axon 133 smooth SKU \d+ — 2,750 × 1,200 mm/ })).toBeVisible();
    // a wall typed in by numbers says so — "Derived from plan" only when its length was traced on the plan (REV-7)
    await expect(axon.getByText(/North wall: net 12\.15 m² \(gross 12\.96 − openings 0\.81\) · Entered length and heights/)).toBeVisible();
    // aluminium (11): pooled bars, honest cut-plan label
    const al = group(page, "mat-al");
    await expect(al.getByRole("button", { name: /^2 bars\s*equal-angle 50 × 50 × 3 — 6,500 mm length \(no joins\)/ })).toBeVisible();
    await expect(al.getByText(/minimum stock proven/)).toBeVisible();
    // random-length shiplap: LM, labelled as an estimate (never a piece count)
    const tc = group(page, "mat-tc");
    await expect(tc.getByRole("button", { name: /^57 LM\s*Shiplap 19 thick — random lengths \(LM\)\s*estimate — not a piece count/ })).toBeVisible();
    await expect(tc.locator('[data-status="quantity"]')).toHaveText("Quantity: Estimate");
    // battens: blocking problems listed, ordering blocked — never shown as ready
    const bat = group(page, "mat-bat");
    await expect(bat.getByRole("alert")).toContainText("Needs before ordering:");
    await expect(bat.getByRole("alert")).toContainText("fixings not quantified — detail required");
    // the batten product itself is complete (no cladding cover asked of a batten) — its fixings keep it a draft
    await expect(bat.locator('[data-status="procurement"]')).toHaveText("Ordering: Draft");
    await expect(bat.locator('[data-status="quantity"]')).toHaveText("Quantity: Incomplete");
    // per-material totals are per unit — never "pieces + sheets"
    await expect(axon.locator("p.text-right")).toHaveText("4 sheets");
    await expect(raf.locator("p.text-right")).toHaveText("18 pieces");
    await expect(tc.locator("p.text-right")).toHaveText("57 LM");
    for (const g of [raf, axon, al, tc, bat]) await expect(g.locator("p.text-right")).not.toContainText(/pieces.*sheets|sheets.*pieces|LM.*pieces|bars.*LM/);
    await page.screenshot({ path: `${SHOTS}/schedule-mixed-390x844.png`, fullPage: true });
    const o = await overflowPx(page);
    expect(o.right, "content wider than the 390 px screen").toBeLessThanOrEqual(1);
    expect(o.scroll).toBeLessThanOrEqual(0);
    expect(await smallTargets(page)).toEqual([]);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(200);
    const o2 = await overflowPx(page);
    expect(o2.right, "content wider than the 375 px screen").toBeLessThanOrEqual(1);
    expect(o2.scroll).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/schedule-mixed-375x812.png` });
    expect(errors).toEqual([]);
  });

  test("tap a row → its sources are listed by name and kind (member line, wall + window, entered lengths); Show on plan / wall only where there is something to show", async ({ page }) => {
    await openSchedule(page);
    const raf = group(page, "mat-raf");
    await raf.getByRole("button", { name: /18 pieces/ }).tap();
    const rs = raf.locator("[data-sources-for]");
    await expect(rs.getByText("Comes from")).toBeVisible();
    await expect(rs.locator('[data-source-id="m-dist"]')).toContainText(/Distribution run — Distribution run · 10,000 mm/);
    await expect(rs.locator('[data-source-id="m-mem"]')).toContainText(/Member line — Member line · 4,500 mm · projected/);
    await expect(raf.getByRole("button", { name: /18 pieces/ })).toHaveAttribute("aria-expanded", "true");
    const axon = group(page, "mat-axon");
    await axon.getByRole("button", { name: /4 sheets/ }).tap();
    await expect(raf.locator("[data-sources-for]")).toHaveCount(0);  // one row open at a time
    const as = axon.locator("[data-sources-for]");
    await expect(as.locator('[data-source-id="m-wn"]')).toHaveText(/North wall — Wall · 4,800 × 2,700 mm/);
    await expect(as.locator('[data-source-id="m-w1"]')).toHaveText(/W1 — Window · 900 × 900 mm in North wall/);
    await expect(as.locator("[data-source-id]")).toHaveCount(2);
    const al = group(page, "mat-al");
    await al.getByRole("button", { name: /2 bars/ }).tap();
    await expect(al.locator("[data-source-id]")).toHaveText([/W1 — Window · 900 × 900 mm in North wall/, /W2 — Window · 1,800 × 1,200 mm in East wall/]);
    const trim = group(page, "mat-trim");
    await trim.getByRole("button", { name: /4 pieces/ }).tap();
    await expect(trim.locator('[data-source-id="m-man"]')).toHaveText(/Entered lengths — Entered · 4 × 2,350 mm/);
    const tc = group(page, "mat-tc");
    await tc.getByRole("button", { name: /57 LM/ }).tap();
    await expect(tc.getByText(/no piece count is claimed/)).toBeVisible();
    // 02 §6: random-length LM comes with its minimum-length / joint requirements — the app has none, and says so
    await expect(tc.getByText(/Minimum board length, end-joint and stagger rules aren't set in the app/)).toBeVisible();
    await expect(tc.locator("[data-source-id]")).toHaveText([/East wall — Wall · 3,000 × 3,000 mm/, /W2 — Window/]);
    // the shell passes onShowSource: plan-traced sources → "Show on plan", walls / openings → "Show on wall"; typed-in
    // lengths have nowhere to show, so no button (never one that does nothing)
    await expect(tc.getByRole("button", { name: "Show on wall" })).toBeVisible();
    await expect(trim.getByRole("button", { name: /^Show / })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/schedule-sources-390x844.png` });
    expect(await smallTargets(page)).toEqual([]);
  });

  test("Show on wall opens that wall's elevation; Show on plan opens the plan with the material (rafters, a flashing run)", async ({ page }) => {
    const errors = watchErrors(page);
    await openSchedule(page);
    await group(page, "mat-axon").getByRole("button", { name: /4 sheets/ }).tap();
    await group(page, "mat-axon").getByRole("button", { name: "Show on wall" }).tap();
    await expect(page.getByRole("dialog", { name: "North wall" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "North wall" }).getByText("Axon cladding · Entered")).toBeVisible();
    await page.goto(MIXED);
    await ready(page);
    await page.getByRole("button", { name: "Open schedule" }).tap();
    await group(page, "mat-raf").getByRole("button", { name: /18 pieces/ }).tap();
    await group(page, "mat-raf").getByRole("button", { name: "Show on plan" }).tap();
    await expect(page.getByRole("dialog", { name: "Rafters 90 × 45" })).toBeVisible();
    await expect(page.getByText("Material: Rafters 90 × 45")).toBeVisible();
    await page.goto(MIXED_FL);
    await ready(page);
    await page.getByRole("button", { name: "Open schedule" }).tap();
    const dlg = page.getByRole("dialog", { name: SCHEDULE });
    await dlg.getByRole("button", { name: /^1 ×\s*9,000 mm/ }).tap();
    await dlg.getByRole("button", { name: "Show on plan" }).tap();
    await expect(page.getByRole("dialog", { name: "Apron flashing" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("continuous flashing run: one row per resulting finished length (never per plan leg), pieces listed, no lap-split form on a path", async ({ page }) => {
    await openSchedule(page, MIXED_FL);
    const dlg = page.getByRole("dialog", { name: SCHEDULE });
    const apron = dlg.locator("section").filter({ has: page.getByRole("heading", { name: /Apron flashing/ }) });
    // 6,000 + 4,000 tight path split at 8,800 → 9,000 + 1,400; four 750 legs → ONE 3,200 (corners add nothing)
    await expect(apron.getByRole("button", { name: /^1 ×\s*9,000 mm/ })).toBeVisible();
    await expect(apron.getByRole("button", { name: /^1 ×\s*1,400 mm/ })).toBeVisible();
    await expect(apron.getByRole("button", { name: /^1 ×\s*3,200 mm/ })).toBeVisible();
    await expect(apron.getByRole("button", { name: /×\s*(750|950|6,200|4,200) mm/ })).toHaveCount(0);
    await apron.getByRole("button", { name: /^1 ×\s*9,000 mm/ }).tap();
    const run = apron.locator('[data-path-run="m-pl1"]');
    await expect(run).toContainText("Run R-m-pl1: 10,000 mm tight along the path · 1 corner(s) at 6,000 mm — cut/folded on site, no extra pieces");
    await expect(run.getByText("Piece 1: 0 → 8,800 mm, tight 8,800 → order 9,000 mm")).toBeVisible();
    await expect(run.getByText("Piece 2: 8,800 → 10,000 mm, tight 1,200 → order 1,400 mm")).toBeVisible();
    await expect(run.getByText("long piece")).toBeVisible();   // 9,000 > 6,000 handling length: amber advisory only
    await expect(apron.getByRole("button", { name: "Split", exact: true })).toHaveCount(0);   // split on the plan, not with laps
    await apron.getByRole("button", { name: /^1 ×\s*3,200 mm/ }).tap();
    const run2 = apron.locator('[data-path-run="m-pl2"]');
    await expect(run2).toContainText("3,000 mm tight along the path · 3 corner(s) at 750, 1,500, 2,250 mm");
    await expect(run2.locator("li")).toHaveCount(1);
    await expect(run2.getByText("Piece 1: 0 → 3,000 mm, tight 3,000 → order 3,200 mm")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/schedule-flashing-run-390x844.png` });
    // ordinary straight runs keep the R04 explicit lap split
    await apron.getByRole("button", { name: /^2 ×\s*4,600 mm/ }).tap();
    await expect(apron.getByRole("button", { name: "Split", exact: true }).first()).toBeVisible();
  });
});

test.describe("TC-R04 supplier order", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  /** New draft → leave battens (incomplete) off → save; returns once the order is Ready. */
  async function readyOrder(page) {
    await openOrders(page);
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(page.getByText(/Draft FO-/)).toBeVisible();
    const bat = orderGroup(page, "mat-bat");
    await bat.getByLabel(/Order quantity.*\(pieces\)/).fill("0");
    await bat.getByLabel(/Order quantity.*\(pieces\)/).press("Enter");
    await page.getByRole("button", { name: "Save order details" }).tap();
    await expect(page.getByText(/^Ready: /)).toBeVisible();
  }

  test("ORD02/J5: generic lines selectable with unit steppers, totals by unit, subset export, site appendix from the frozen snapshot", async ({ page }) => {
    const errors = watchErrors(page);
    await openOrders(page);
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(page.getByText(/Draft FO-/)).toBeVisible();
    // unit-aware labels — never "mm length" wording for sheets / LM / bars
    const axon = orderGroup(page, "mat-axon");
    const sheets = axon.getByLabel(/Order quantity.*\(sheets\)/);
    await expect(sheets).toHaveValue("4");
    await expect(orderGroup(page, "mat-tc").getByLabel(/Order quantity.*\(LM\)/)).toHaveValue("57");
    await expect(orderGroup(page, "mat-al").getByLabel(/Order quantity.*\(bars\)/)).toHaveValue("2");
    await expect(orderGroup(page, "mat-tc").getByText("estimate — not a piece count")).toBeVisible();
    // the visible label is the unit word only (the screen-reader hint names the item)
    const labels = await page.locator("[data-order-group] label").evaluateAll((els) => els.map((el) => [...el.childNodes].filter((n) => !n.classList?.contains("sr-only")).map((n) => n.textContent).join("")));
    expect(labels.length).toBe(6);   // rafters, trimmers, Axon, battens, aluminium, shiplap
    for (const t of labels) expect(t).toMatch(/^Order quantity \((pieces|sheets|bars|LM)\)$/);
    await expect(axon.locator('[data-status="procurement"]')).toHaveText("Ordering: Ready to order");
    // stepper: + / − change by one whole unit, never above what the takeoff needs (the export would refuse it);
    // an invalid typed value stays a draft and is never committed
    await expect(axon.getByRole("button", { name: "More sheets" })).toBeDisabled();
    // − / + say which line they change (several groups had an identical "Fewer pieces" — REV-17)
    await expect(axon.getByRole("button", { name: /^Fewer sheets of James Hardie Axon 133 smooth SKU \d+ — 2,750 × 1,200 mm$/ })).toBeVisible();
    await expect(orderGroup(page, "mat-raf").getByRole("button", { name: "Fewer pieces of 90 × 45 MGP10 H2 — 5,400 mm length" })).toBeVisible();
    await axon.getByRole("button", { name: "Fewer sheets" }).tap();
    await expect(sheets).toHaveValue("3");
    await axon.getByRole("button", { name: "More sheets" }).tap();
    await expect(sheets).toHaveValue("4");
    await sheets.fill("2.5");
    await sheets.press("Enter");
    await expect(axon.getByRole("alert")).toHaveText(/Enter a whole number of sheets/);
    await sheets.fill("5");
    await sheets.press("Enter");
    await expect(axon.getByRole("alert")).toHaveText("The takeoff needs 4 sheets — an order line can't be more than that.");
    await sheets.fill("4");
    await sheets.press("Enter");
    await expect(axon.getByRole("alert")).toHaveCount(0);
    // export a SUBSET: battens (incomplete) stay off this order
    const bat = orderGroup(page, "mat-bat");
    await expect(bat.getByText("needs attention")).toBeVisible();
    await bat.getByLabel(/Order quantity.*\(pieces\)/).fill("0");
    await bat.getByLabel(/Order quantity.*\(pieces\)/).press("Enter");
    const totals = page.getByTestId("order-totals");
    // timber pieces (18 rafters + 4 trimmers), sheets, bars and LM each on their own (flashings are their own order — HUB 007)
    await expect(totals).toHaveText(/^On this order: 22 pieces · 4 sheets · 2 bars · 57 LM$/);
    await page.screenshot({ path: `${SHOTS}/order-generic-390x844.png`, fullPage: true });
    expect(await smallTargets(page)).toEqual([]);
    const o = await overflowPx(page);
    expect(o.right, "order wider than the 390 px screen").toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(200);
    const o2 = await overflowPx(page);
    expect(o2.right, "order wider than the 375 px screen").toBeLessThanOrEqual(1);
    expect(o2.scroll).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Save order details" }).tap();
    await expect(page.getByText(/^Ready: 22 pieces · 4 sheets · 2 bars · 57 LM to Fielders \(review branch\)\.$/)).toBeVisible();
    await page.getByRole("button", { name: "Export supplier PDF" }).tap();
    await expect(page.getByText(/Export 1 is frozen\. Nothing has been sent\./)).toBeVisible();
    // site appendix sits next to the supplier PDF and opens separately
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("status").filter({ hasText: "Export 1 is frozen" }).getByRole("button", { name: "Site appendix (cutting & setout)" }).tap(),
    ]);
    await expect.poll(async () => (await page.evaluate(() => window.__takeoffReviewState().appendixRequests)).length).toBe(1);
    expect(popup).toBeTruthy();   // opened in its own tab (headless Chromium has no PDF viewer, so the tab is not inspected)
    await expect(page.getByText(/Couldn't open the site appendix/)).toHaveCount(0);
    const exportId = (await page.evaluate(() => window.__takeoffReviewState().appendixRequests))[0];
    const raw = await page.evaluate(async (id) => new TextDecoder().decode(await (await fetch(`/api/takeoff/exports/${id}/appendix`)).arrayBuffer()), exportId);
    expect(raw.startsWith("%PDF-")).toBe(true);
    const text = raw.replace(/\\([()\\])/g, "$1");   // PDF string escapes → plain text
    for (const t of ["Window angle 50 x 50 x 3 - cutting sheet (6,500 mm bars)", "Bar 1: W2 bottom 1,800 | W2 left jamb 1,300", "proven minimum",
      "Rafters 90 x 45 - timber cut list", "18 x cut 5,196 mm from 5,400 mm stock", "Axon cladding - North wall setout", "net 12.15 m2"]) expect(text, `appendix missing "${t}"`).toContain(t);
    expect(text).not.toContain("Cavity battens");   // not on this order → not in its appendix
    expect(text).not.toContain("Apron flashing run");   // the flashing run is on the Flashings order's appendix (HUB 007)
    // order history lists the appendix next to each export's PDF
    const hist = page.locator("section").filter({ has: page.getByRole("heading", { name: "Order history" }) });
    await expect(hist.getByRole("button", { name: "Open", exact: true })).toBeVisible();
    await expect(hist.getByRole("button", { name: "Site appendix (cutting & setout)" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/order-exported-appendix-390x844.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test("ORD01: export, then change the rafter grade → the line is stale and blocks the supplier PDF; the frozen appendix is unchanged; Update to current material reconciles", async ({ page }) => {
    await readyOrder(page);
    await page.getByRole("button", { name: "Export supplier PDF" }).tap();
    await expect(page.getByText(/Export 1 is frozen/)).toBeVisible();
    const exportId = await page.evaluate(async () => {
      const o = await (await fetch("/api/takeoff/workspaces/ws-1/orders")).json();
      return o.orders.at(-1).exports.at(-1).id;
    });
    const appendix = (id) => page.evaluate(async (x) => new TextDecoder().decode(await (await fetch(`/api/takeoff/exports/${x}/appendix`)).arrayBuffer()), id);
    const before = await appendix(exportId);
    // change what is bought (grade) on the job material
    await page.getByRole("button", { name: "Back" }).tap();
    const li = page.locator("li").filter({ hasText: "Rafters 90 × 45" }).first();
    await (await openRow(li)).getByRole("button", { name: "Setup" }).tap();
    const setup = page.getByRole("dialog", { name: "Timber" });
    await setup.getByLabel("Grade (e.g. MGP10)").fill("MGP12");
    await expect(setup.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
    await setup.getByRole("button", { name: "Close" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    const stale = page.getByTestId("stale-lines");
    await expect(stale).toBeVisible();
    await expect(stale).toContainText("90 × 45 MGP10 H2 — 5,400 mm length — 18 pieces — needs updating");
    await expect(stale).not.toContainText(/5,400 mm × 18/);
    await expect(stale).toContainText("This line is no longer in the takeoff (its measurements, product or stock changed)");
    await expect(stale).toContainText("The takeoff now needs: 18 pieces — 90 × 45 MGP12 H2 — 5,400 mm length (Rafters 90 × 45).");
    await expect(page.getByRole("button", { name: "Export supplier PDF" })).toBeDisabled();
    // the readiness list words it as a material line too, not a flashing "length"
    await expect(page.getByText(/^Not ready to order yet:/)).toBeVisible();
    await expect(page.getByText("This length is no longer in the takeoff", { exact: false })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/order-stale-generic-390x844.png`, fullPage: true });
    // the frozen export is history: same bytes after the edit
    expect(await appendix(exportId)).toBe(before);
    await page.getByRole("button", { name: "Update to what's needed now" }).tap();
    await expect(stale).toHaveCount(0);
    await expect(orderGroup(page, "mat-raf").locator("p", { hasText: "90 × 45 MGP12 H2 — 5,400 mm length" })).toBeVisible();
    await expect(orderGroup(page, "mat-raf").getByLabel(/Order quantity.*\(pieces\)/).first()).toHaveValue("18");
    await page.getByRole("button", { name: "Save order details" }).tap();
    await expect(page.getByText(/^Ready: /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Export supplier PDF" })).toBeEnabled();
    expect(await appendix(exportId)).toBe(before);
  });

  test("J5: record the subset as placed → schedule shows ordered / left per unit; the next order defaults to what is still needed only", async ({ page }) => {
    await readyOrder(page);
    await page.getByRole("button", { name: "Export supplier PDF" }).tap();
    await expect(page.getByText(/Export 1 is frozen/)).toBeVisible();
    await page.getByRole("button", { name: "Record order placed…" }).tap();
    await page.getByLabel("Which PDF did you send?").selectOption({ label: "Export 1" });
    await page.getByRole("textbox", { name: "Supplier reference" }).fill("SO-TC-1");
    await page.getByRole("button", { name: "Record order placed", exact: true }).tap();
    await expect(page.getByText("Placed externally")).toBeVisible();
    // next order: only the battens are still needed (everything else was placed)
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(page.getByText(/Draft FO-001002/)).toBeVisible();
    await expect(orderGroup(page, "mat-bat").getByLabel(/Order quantity.*\(pieces\)/)).toHaveValue("10");
    await expect(orderGroup(page, "mat-axon").getByLabel(/Order quantity.*\(sheets\)/)).toHaveValue("0");
    await expect(orderGroup(page, "mat-axon").getByText(/need 4 sheets · ordered 4 sheets · left 0/)).toBeVisible();
    await expect(orderGroup(page, "mat-tc").getByText(/need 57 LM · ordered 57 LM · left 0/)).toBeVisible();
    // the schedule shows the placed quantities per unit (from placed records only) straight away — it reads the orders
    // when it opens (the shell passes `api`), with no takeoff save in between
    const commits = await page.evaluate(() => window.__takeoffReviewState().commits);
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("button", { name: "Open schedule" }).tap();
    expect(await page.evaluate(() => window.__takeoffReviewState().commits)).toBe(commits);
    await expect(group(page, "mat-axon").getByText("4 sheets ordered · 0 left")).toBeVisible();
    await expect(group(page, "mat-raf").getByText("18 pieces ordered · 0 left")).toBeVisible();
    await expect(group(page, "mat-al").getByText("2 bars ordered · 0 left")).toBeVisible();
    await expect(group(page, "mat-bat").getByText("not ordered")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/schedule-after-placed-390x844.png`, fullPage: true });
  });
});

// ── Adversarial review regressions (REV-n) ─────────────────────────────────────
/** Commit straight to the mocked server (as another device would), bypassing this page's workspace state. */
async function serverEdit(page, changes) {
  const r = await page.evaluate(async (ch) => {
    const body = { expectedRevision: window.__takeoffReviewState().revision, idempotencyKey: `rev-${Math.random()}`, changes: ch };
    return (await fetch("/api/takeoff/workspaces/ws-1/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  }, changes);
  expect(r.ok, r.error).toBe(true);
}
/** Leave the takeoff and come back inside the SPA (the mocked server keeps its state; a reload would re-seed it). */
async function reopen(page) {
  await page.evaluate(() => { history.pushState({}, "", "/carpentry/cjb-1"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(300);
  await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, MIXED);
  await expect(page.getByRole("button", { name: "Open schedule" })).toBeVisible();
}
/** Re-scale the plan page: a newer calibration revision supersedes the one every traced measurement uses. */
async function rescalePage(page) {
  const cal = await page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot.calibrations[0]);
  await serverEdit(page, { calibrations: { insert: [{ id: "cal-rev2", documentId: cal.documentId, pageIndex: cal.pageIndex, pageMeta: cal.pageMeta, basisRotation: 0, horizontal: cal.horizontal, vertical: cal.vertical }] } });
}
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  return errors;
}

test.describe("TC-R04 schedule + order — adversarial review regressions", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  async function readyOrder(page) {
    await openOrders(page);
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(page.getByText(/Draft FO-/)).toBeVisible();
    const bat = orderGroup(page, "mat-bat");
    await bat.getByLabel(/Order quantity.*\(pieces\)/).fill("0");
    await bat.getByLabel(/Order quantity.*\(pieces\)/).press("Enter");
    await page.getByRole("button", { name: "Save order details" }).tap();
    await expect(page.getByText(/^Ready: /)).toBeVisible();
  }

  test("REV-1 an invalid typed quantity blocks Save and both exports (never sends the old number while the field shows another); the review lists what the subset leaves off; the focused field clears the keyboard", async ({ page }) => {
    const errors = watchErrors(page);
    await readyOrder(page);
    const supplierPdf = page.getByRole("button", { name: "Export supplier PDF" });
    const draftPdf = page.getByRole("button", { name: "Export draft PDF" });
    await expect(supplierPdf).toBeEnabled();
    // J5 subset: the review names what is still needed but left off this order
    await expect(page.getByTestId("not-on-order")).toHaveText(/Still needed but not on this order:\s*Cavity battens — 10 pieces/);
    const axon = orderGroup(page, "mat-axon");
    const sheets = axon.getByLabel(/Order quantity.*\(sheets\)/);
    await sheets.fill("abc");
    await sheets.press("Enter");
    await expect(axon.getByRole("alert")).toHaveText(/Enter a whole number of sheets/);
    await expect(page.getByText(/A quantity above isn't a valid number, so it hasn't been used/)).toBeVisible();
    await expect(supplierPdf).toBeDisabled();
    await expect(draftPdf).toBeDisabled();
    await expect(page.getByTestId("order-totals")).toContainText("· 4 sheets ·");   // totals show what WOULD be ordered (the saved 4)
    await page.screenshot({ path: `${SHOTS}/order-invalid-blocks-export-390x844.png`, fullPage: true });
    // − / + resolve the draft to a real number; back at the saved 4 the order is exportable again
    await axon.getByRole("button", { name: "Fewer sheets" }).tap();
    await expect(sheets).toHaveValue("3");
    await expect(page.getByRole("button", { name: "Save order details" })).toBeVisible();
    await axon.getByRole("button", { name: "More sheets" }).tap();
    await expect(sheets).toHaveValue("4");
    await expect(page.getByText(/A quantity above isn't a valid number/)).toHaveCount(0);
    await expect(supplierPdf).toBeEnabled();
    // a focused quantity low on the screen scrolls into the upper part (an on-screen keyboard covers the lower ~40%)
    const lm = orderGroup(page, "mat-al").getByLabel(/Order quantity.*\(bars\)/);   // mid-page (the last group can't scroll higher than the page end)
    await lm.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await lm.focus();
    await expect.poll(async () => { const b = await lm.boundingBox(); return b ? b.y + b.height : 9999; }, { timeout: 3000 }).toBeLessThan(844 * 0.6);
    // same guard for the R04 flashing Qty field — on the Flashings order (HUB 007: its own order)
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("group", { name: "Takeoff section" }).getByRole("button", { name: "Flashings" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await expect(page.getByText(/^Draft FO-/)).toBeVisible();   // HUB 013: the Flashings draft opens by itself
    await expect(page.getByText(/^Ready: /)).toBeVisible();
    const qty = page.getByLabel("Qty").first();
    const was = await qty.inputValue();
    await qty.fill("1.5");
    await qty.press("Tab");
    await expect(page.getByText(/A quantity above isn't a valid number/)).toBeVisible();
    await expect(supplierPdf).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save order details" })).toHaveCount(0);   // nothing changed, nothing to save
    await qty.fill(was);
    await qty.press("Tab");
    await expect(page.getByText(/A quantity above isn't a valid number/)).toHaveCount(0);
    await expect(supplierPdf).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test("REV-5 subset exported, not yet placed: the review still lists what this order leaves off (its own exported lines aren't counted twice) and the next order defaults to the rest", async ({ page }) => {
    await readyOrder(page);
    const raf = orderGroup(page, "mat-raf").getByLabel(/Order quantity.*\(pieces\)/);
    await raf.fill("10");
    await raf.press("Enter");
    await page.getByRole("button", { name: "Save order details" }).tap();
    await expect(page.getByText(/^Ready: /)).toBeVisible();
    await expect(page.getByTestId("not-on-order")).toHaveText(/Still needed but not on this order:\s*Rafters 90 × 45 — 8 pieces\s*Cavity battens — 10 pieces/);
    await page.getByRole("button", { name: "Export supplier PDF" }).tap();
    await expect(page.getByText(/Export 1 is frozen/)).toBeVisible();
    // after the export the same 8 rafters + 10 battens are still not on any order — still listed
    await expect(page.getByTestId("not-on-order")).toHaveText(/Still needed but not on this order:\s*Rafters 90 × 45 — 8 pieces\s*Cavity battens — 10 pieces/);
    await page.getByRole("button", { name: "New order" }).tap();
    await page.getByLabel("Choose draft order").selectOption({ label: "FO-001002" });
    await expect(page.getByText("Draft FO-001002")).toBeVisible();
    await expect(orderGroup(page, "mat-raf").getByLabel(/Order quantity.*\(pieces\)/)).toHaveValue("8");   // 18 − 10 on the exported order
    await expect(orderGroup(page, "mat-axon").getByLabel(/Order quantity.*\(sheets\)/)).toHaveValue("0");
    await expect(orderGroup(page, "mat-bat").getByLabel(/Order quantity.*\(pieces\)/)).toHaveValue("10");
    // a material with nothing orderable yet is named in the review too (never silently missing from the order)
    await serverEdit(page, { materials: { upsert: [{ id: "mat-new", name: "Linea boards", methodKey: "sheet_layout", methodVersion: 2, spec: { family: "cladding", layout: "sheet", product: {} }, rules: {} }] } });
    await reopen(page);
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await expect(page.getByTestId("not-on-order")).toContainText("Linea boards — nothing to order yet (Choose the product.)");
  });

  test("REV-6 schedule split edits auto-apply and the curved arrows undo / redo them (each a real save)", async ({ page }) => {
    const errors = watchErrors(page);
    await openSchedule(page, MIXED_FL);
    const dlg = page.getByRole("dialog", { name: SCHEDULE });
    await expect(dlg.getByRole("button", { name: "Undo" })).toHaveCount(0);   // nothing to undo yet
    await dlg.getByRole("button", { name: /^1 ×\s*7,200 mm/ }).tap();
    await dlg.getByRole("button", { name: "Split", exact: true }).tap();
    for (const [label, v] of [["Piece 1 length", "3700"], ["Lap at joint 1", "200"], ["Piece 2 length", "3700"]]) {
      await page.getByLabel(label).fill(v);
      await page.getByLabel(label).press("Enter");
    }
    await page.getByRole("button", { name: "Apply split" }).tap();
    await expect(dlg.getByRole("button", { name: /^2 ×\s*3,700 mm/ })).toBeVisible();
    const commits = async () => (await page.evaluate(() => window.__takeoffReviewState().commits));
    await expect.poll(commits).toBe(1);
    await dlg.getByRole("button", { name: "Undo" }).tap();
    await expect(dlg.getByRole("button", { name: /^1 ×\s*7,200 mm/ })).toBeVisible();
    await expect(dlg.getByRole("button", { name: /3,700 mm/ })).toHaveCount(0);
    await expect.poll(commits).toBe(2);
    await dlg.getByRole("button", { name: "Redo" }).tap();
    await expect(dlg.getByRole("button", { name: /^2 ×\s*3,700 mm/ })).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Redo" })).toBeDisabled();
    // Remove split is one undoable step too
    await dlg.getByRole("button", { name: /^2 ×\s*3,700 mm/ }).tap();
    await dlg.getByRole("button", { name: "Remove split" }).tap();
    await expect(dlg.getByRole("button", { name: /^1 ×\s*7,200 mm/ })).toBeVisible();
    await dlg.getByRole("button", { name: "Undo" }).tap();
    await expect(dlg.getByRole("button", { name: /^2 ×\s*3,700 mm/ })).toBeVisible();
    await expect(dlg.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
    expect(await smallTargets(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("REV-2 placed, then the product changes: the schedule lists the placed quantity as no longer in the takeoff (what it was), the new grade is not ordered, the placed order is untouched", async ({ page }) => {
    const errors = watchErrors(page);
    await readyOrder(page);
    await page.getByRole("button", { name: "Export supplier PDF" }).tap();
    await expect(page.getByText(/Export 1 is frozen/)).toBeVisible();
    await page.getByRole("button", { name: "Record order placed…" }).tap();
    await page.getByLabel("Which PDF did you send?").selectOption({ label: "Export 1" });
    await page.getByRole("button", { name: "Record order placed", exact: true }).tap();
    await expect(page.getByText("Placed externally")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).tap();
    await (await openRow(page.locator("li").filter({ hasText: "Rafters 90 × 45" }).first())).getByRole("button", { name: "Setup" }).tap();
    const setup = page.getByRole("dialog", { name: "Timber" });
    await setup.getByLabel("Grade (e.g. MGP10)").fill("MGP12");
    await expect(setup.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
    await setup.getByRole("button", { name: "Close" }).tap();
    await page.getByRole("button", { name: "Open schedule" }).tap();
    let placed = page.getByTestId("placed-surplus");
    await expect(placed).toContainText("Placed, but no longer in the takeoff");
    // what was BOUGHT (the old grade) and the order it is on — never the material's current name
    await expect(placed.locator("li")).toHaveText(["18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length · placed on FO-001001"]);
    await expect(group(page, "mat-raf").getByRole("button", { name: /18 pieces\s*90 × 45 MGP12 H2 — 5,400 mm length\s*not ordered/ })).toBeVisible();
    await expect(group(page, "mat-axon").getByText("4 sheets ordered · 0 left")).toBeVisible();   // unchanged products stay reconciled
    await page.screenshot({ path: `${SHOTS}/schedule-placed-surplus-390x844.png`, fullPage: true });
    // the placed order itself is history: still the old export, still placed
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await expect(page.getByText("Placed externally")).toBeVisible();
    await expect(page.getByText(/Placed .* \(export 1\)/)).toBeVisible();
    // and a flashing whose colour changes after its pieces were placed (R04 buckets reconcile the same way) — the
    // flashings are their own order (HUB 007)
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("group", { name: "Takeoff section" }).getByRole("button", { name: "Flashings" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await expect(page.getByText(/^Draft FO-/)).toBeVisible();   // HUB 013: the Flashings draft opens by itself
    await expect(page.getByText(/^Ready: /)).toBeVisible();
    await page.getByRole("button", { name: "Export supplier PDF" }).tap();
    await expect(page.getByText(/Export 1 is frozen/)).toBeVisible();
    await page.getByRole("button", { name: "Record order placed…" }).tap();
    await page.getByLabel("Which PDF did you send?").selectOption({ label: "Export 1" });
    await page.getByRole("button", { name: "Record order placed", exact: true }).tap();
    await expect(page.getByText("Placed externally")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).tap();
    await (await openRow(page.locator("li").filter({ hasText: "Barge flashing" }).first())).getByRole("button", { name: "Details" }).tap();
    await page.getByLabel("Colour", { exact: true }).selectOption("Basalt");
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Close" }).tap();
    await page.getByRole("button", { name: "Open schedule" }).tap();
    placed = page.getByTestId("placed-surplus");
    // (REV-16: with the orders read on open it said "7,200 mm flashing · Barge flashing", now Basalt)
    await expect(placed.locator("li")).toHaveText(["18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length · placed on FO-001001",
      "1 piece · 7,200 mm flashing · Surfmist · 0.55 BMT · placed on FO-001002", "1 piece · 6,100 mm flashing · Surfmist · 0.55 BMT · placed on FO-001002",
      "2 pieces · 2,400 mm flashing · Surfmist · 0.55 BMT · placed on FO-001002"]);
    expect(errors).toEqual([]);
  });

  test("REV-3 a re-scaled plan page: Ordering never shows Ready while a purchase line needs attention (schedule and order), entered walls are unaffected", async ({ page }) => {
    await page.goto(MIXED);
    await ready(page);
    await rescalePage(page);
    await reopen(page);
    await page.getByRole("button", { name: "Open schedule" }).tap();
    const raf = group(page, "mat-raf");
    await expect(raf.locator('[data-status="procurement"]')).toHaveText("Ordering: Not ready — a line needs attention");
    await raf.getByRole("button", { name: /18 pieces/ }).tap();
    await expect(raf.getByText("This page has been re-scaled since this run was measured — review it with the new scale.")).toBeVisible();
    await expect(group(page, "mat-axon").locator('[data-status="procurement"]')).toHaveText("Ordering: Ready to order");   // numeric wall, no plan scale involved
    await page.screenshot({ path: `${SHOTS}/schedule-rescaled-not-ready-390x844.png` });
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(orderGroup(page, "mat-raf").locator('[data-status="procurement"]')).toHaveText("Ordering: Not ready — a line needs attention");
    await expect(page.getByText(/Not ready to order yet:/)).toBeVisible();
  });

  test("REV-4 needed cuts vs selected stock, existing offcuts actually used, saw loss / left-over and the objective; sizing and cutting provenance (02 §6, 06, 11)", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(MIXED);
    await ready(page);
    const dist = await page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot.measurements.find((m) => m.id === "m-dist"));
    await serverEdit(page, {
      measurements: { upsert: [
        { id: "m-off", kind: "offcut", documentId: null, pageIndex: null, calibrationId: null, points: null, label: null, inputs: { lengthMm: 1000, materialId: "mat-al", label: "Rack A", status: "available" } },
        { id: "m-bad", kind: "offcut", documentId: null, pageIndex: null, calibrationId: null, points: null, label: null, inputs: { lengthMm: 0, materialId: "mat-al", label: "Typo", status: "available" } },
        // a wall whose length is traced on the plan (the 10,000 mm distribution line's points) + an entered height
        { id: "m-ws", kind: "wall", documentId: dist.documentId, pageIndex: dist.pageIndex, calibrationId: dist.calibrationId, points: dist.points, label: null, inputs: { kind: "rect", heightMm: 2400, name: "South wall" } },
      ] },
      contributions: { upsert: [
        { id: "c-off", measurementId: "m-off", jobMaterialId: "mat-al", role: "offcut" },
        { id: "c-bad", measurementId: "m-bad", jobMaterialId: "mat-al", role: "offcut" },
        { id: "c-ws", measurementId: "m-ws", jobMaterialId: "mat-axon", role: "wall" },
      ] },
    });
    await reopen(page);
    await page.getByRole("button", { name: "Open schedule" }).tap();
    const raf = group(page, "mat-raf");
    await expect(raf.locator("[data-provenance]")).toHaveText("Size: manual selection (not structurally checked)");
    await raf.getByRole("button", { name: /18 pieces/ }).tap();
    await expect(raf.locator("[data-cut-list]")).toHaveText("Cuts: 18 × 5,196.2 mm — one cut from each 5,400 mm length");
    const trim = group(page, "mat-trim");
    await trim.getByRole("button", { name: /4 pieces/ }).tap();
    await expect(trim.locator("[data-cut-list]")).toHaveText("Cuts: 4 × 2,350 mm — one cut from each 2,400 mm length");
    // aluminium: the 1,000 offcut takes a jamb, so ONE new bar instead of two — and it says so
    const al = group(page, "mat-al");
    await expect(al.locator("[data-provenance]")).toHaveText("Cutting: 3 mm kerf, 0 mm end trim");
    await expect(al.locator("[data-offcuts-used]")).toHaveText(/Existing offcuts used — not re-ordered:\s*Rack A 1,000 mm → W1 left jamb 1,000 mm/);
    await expect(al.locator("[data-alloc-summary]")).toHaveText("Cuts need 7,300 mm · saw loss 15 mm · left over 185 mm (keep 0 · scrap 185) — planned, not cut yet");
    // an offcut the allocator had to ignore is said out loud, not silently dropped
    await expect(al.getByText("Note: Existing offcut m-bad ignored: its measured length must be greater than 0.")).toBeVisible();
    await expect(group(page, "mat-axon").locator('[data-wall-area="m-ws"]')).toHaveText(/^South wall: net 24\.00 m² \(gross 24\.00 − openings 0\.00\) · Derived from plan \+ entered heights$/);
    await expect(group(page, "mat-axon").locator('[data-wall-area="m-wn"]')).toHaveText(/· Entered length and heights$/);
    // a wall traced on the plan still opens its elevation — the button says so (REV-15: it said "Show on plan")
    await group(page, "mat-axon").getByRole("button", { name: /^\d+ sheets/ }).first().tap();
    await expect(group(page, "mat-axon").locator("[data-sources-for]").getByRole("button", { name: "Show on wall" })).toBeVisible();
    await expect(group(page, "mat-axon").getByRole("button", { name: "Show on plan" })).toHaveCount(0);
    await group(page, "mat-axon").getByRole("button", { name: /^\d+ sheets/ }).first().tap();
    await al.getByRole("button", { name: /^1 bar\s*equal-angle 50 × 50 × 3 — 6,500 mm length/ }).tap();
    await expect(al.locator("[data-cut-list]")).toHaveText(/Cut plan \(planned — not cut yet\):\s*Bar 1: W2 bottom 1,800 \+ W2 left jamb 1,300 \+ W2 right jamb 1,300 \+ W1 right jamb 1,000 \+ W1 bottom 900 mm → left over 185 mm \(scrap\)/);
    await al.getByText("How this was worked out").tap();
    await expect(al.getByText(/^Objective: Minimise new bars/)).toBeVisible();
    await expect(al.getByText("Buy 1 × 6500 mm; use 1 existing offcut.")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/schedule-cuts-offcut-390x844.png`, fullPage: true });
    expect(await smallTargets(page)).toEqual([]);
    const o = await overflowPx(page);
    expect(o.right, "content wider than the 390 px screen").toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(200);
    expect((await overflowPx(page)).right, "content wider than the 375 px screen").toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  /** A fake on-screen keyboard: window.__keyboard(px) shrinks the visual viewport like iOS / Android do. */
  async function fakeKeyboard(page) {
    await page.addInitScript(() => {
      const vv = new EventTarget();
      let h = window.innerHeight;
      Object.defineProperties(vv, { height: { get: () => h }, width: { get: () => window.innerWidth }, offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 } });
      Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
      window.__keyboard = (px) => { h = window.innerHeight - px; vv.dispatchEvent(new Event("resize")); };
    });
  }

  test("REV-9 split sheet: the focused piece length stays above the keyboard; in phone landscape the whole sheet (title, close, Apply) stays on screen", async ({ page }) => {
    const errors = watchErrors(page);
    await fakeKeyboard(page);
    await openSchedule(page, MIXED_FL);
    const dlg = page.getByRole("dialog", { name: SCHEDULE });
    await dlg.getByRole("button", { name: /^1 ×\s*7,200 mm/ }).tap();
    await dlg.getByRole("button", { name: "Split", exact: true }).tap();
    const f = page.getByLabel("Piece 2 length");
    await f.focus();
    await page.evaluate(() => window.__keyboard(354));
    // before the fix the field sat at y≈728, under a keyboard whose top is at 844 − 354 = 490
    await expect.poll(async () => { const b = await f.boundingBox(); return b.y + b.height; }, { timeout: 3000 }).toBeLessThanOrEqual(844 - 354);
    await f.fill("3700");
    await f.press("Enter");
    await expect(page.getByRole("dialog", { name: "Split piece" }).getByRole("alert")).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/split-keyboard-390x844.png` });
    await page.evaluate(() => window.__keyboard(0));
    // phone landscape: the sheet used to be 510 px tall on a 390 px screen with its title and ✕ off the top
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const split = page.getByRole("dialog", { name: "Split piece" });
    const title = split.getByRole("heading", { name: "Split this run" });
    await title.scrollIntoViewIfNeeded();   // reachable: the sheet scrolls inside the screen (before: cut off, not scrollable)
    await expect(title).toBeInViewport();
    expect((await title.boundingBox()).y).toBeGreaterThanOrEqual(0);
    await expect(split.getByRole("button", { name: "Close panel" })).toBeInViewport();
    const box = await split.locator("[data-split-sheet]").boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(390 + 0.5);
    await split.getByRole("button", { name: "Apply split" }).scrollIntoViewIfNeeded();
    await expect(split.getByRole("button", { name: "Apply split" })).toBeInViewport();
    await page.screenshot({ path: `${SHOTS}/split-landscape-844x390.png` });
    await split.getByRole("button", { name: "Close panel" }).tap();
    await expect(split).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("REV-10 J5 with fixings boxes: boxes stay boxes from schedule to order; accessory scope (by others / excluded / not decided) is in the schedule and the order review; groups follow the job's material order", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(FIXINGS);
    await ready(page);
    await page.getByRole("button", { name: "Open schedule" }).tap();
    const fix = group(page, "mat-fix");
    await expect(fix.getByRole("button", { name: /^3 boxes\s*Cladding screws 8g × 40 \(entered, Supplier quote Q-123\)/ })).toBeVisible();
    await expect(fix.locator("p.text-right")).toHaveText("3 boxes");
    // an accessory SET needs only its name (each item carries its own identity) — boxes of screws can be ordered
    await expect(fix.locator('[data-status="procurement"]')).toHaveText("Ordering: Ready to order");
    const sc = fix.locator("[data-accessory-scopes]");
    await expect(sc.locator('[data-scope="by-others"]')).toHaveText("By others: Membrane / wrap (Wrap by the framer), Tape");
    await expect(sc.locator('[data-scope="exclude"]')).toHaveText("Excluded: Sealant (Painter seals the joints)");
    await expect(sc.locator('[data-scope="unresolved"]')).toHaveText("Not decided: Corner trims");
    await expect(sc.locator('[data-scope="include"]')).toHaveText("Included: Cladding screws 8g × 40");
    await page.screenshot({ path: `${SHOTS}/schedule-fixings-boxes-390x844.png`, fullPage: true });
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(page.getByText(/Draft FO-/)).toBeVisible();
    // the job's material order (not the purchase-line order), in the Timber part then the Cladding part (HUB 007)
    await expect(page.locator("[data-order-group]")).toHaveCount(7);
    expect(await page.locator("[data-order-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-order-group"))))
      .toEqual(["mat-raf", "mat-trim", "mat-axon", "mat-bat", "mat-al", "mat-tc", "mat-fix"]);
    const boxes = orderGroup(page, "mat-fix").getByLabel(/Order quantity.*\(boxes\)/);
    await expect(boxes).toHaveValue("3");
    await expect(page.getByTestId("order-totals")).toHaveText(/^On this order: 32 pieces · 4 sheets · 2 bars · 57 LM · 3 boxes$/);
    const review = page.getByTestId("accessory-scope-review");
    await expect(review).toContainText("Accessories not supplied on this order:");
    await expect(review.locator('[data-scope-material="mat-fix"] [data-scope="by-others"]')).toHaveText("By others: Membrane / wrap (Wrap by the framer), Tape");
    await expect(review.locator('[data-scope-material="mat-fix"] [data-scope="exclude"]')).toHaveText("Excluded: Sealant (Painter seals the joints)");
    await expect(review.locator('[data-scope-material="mat-fix"] [data-scope="unresolved"]')).toHaveText("Not decided: Corner trims");
    await expect(review.locator('[data-scope="include"]')).toHaveCount(0);   // only what is NOT supplied
    // supplier subset: leave the blocked battens and boxes off → ready; the review names both as still needed
    for (const [id, unit] of [["mat-bat", "pieces"], ["mat-fix", "boxes"]]) {
      const q = orderGroup(page, id).getByLabel(new RegExp(`Order quantity.*\\(${unit}\\)`));
      await q.fill("0");
      await q.press("Enter");
    }
    await expect(page.getByTestId("order-totals")).toHaveText(/: 22 pieces · 4 sheets · 2 bars · 57 LM$/);
    await page.getByRole("button", { name: "Save order details" }).tap();
    await expect(page.getByText(/^Ready: 22 pieces · 4 sheets · 2 bars · 57 LM to Fielders/)).toBeVisible();
    await expect(page.getByTestId("not-on-order")).toHaveText(/Cavity battens — 10 pieces\s*Cladding fixings — 3 boxes/);
    await page.screenshot({ path: `${SHOTS}/order-fixings-review-390x844.png`, fullPage: true });
    expect(await smallTargets(page)).toEqual([]);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(200);
    expect((await overflowPx(page)).right, "order wider than the 375 px screen").toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Export supplier PDF" }).tap();
    await expect(page.getByText(/Export 1 is frozen/)).toBeVisible();
    await page.getByRole("button", { name: "Record order placed…" }).tap();
    await page.getByLabel("Which PDF did you send?").selectOption({ label: "Export 1" });
    await page.getByRole("button", { name: "Record order placed", exact: true }).tap();
    await expect(page.getByText("Placed externally")).toBeVisible();
    // the next order defaults to what is still needed: battens (pieces) and fixings (boxes) only
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(page.getByText(/Draft FO-001002/)).toBeVisible();
    await expect(orderGroup(page, "mat-fix").getByLabel(/Order quantity.*\(boxes\)/)).toHaveValue("3");
    await expect(orderGroup(page, "mat-bat").getByLabel(/Order quantity.*\(pieces\)/)).toHaveValue("10");
    await expect(page.getByTestId("order-totals")).toHaveText("On this order: 10 pieces · 3 boxes");
    expect(errors).toEqual([]);
  });

  test("REV-11 a pitch change moves the rafters to a new stock length: the stale line offers the line the takeoff needs now (not only Remove), worded as a material line; the frozen appendix is unchanged", async ({ page }) => {
    const errors = watchErrors(page);
    await readyOrder(page);
    await page.getByRole("button", { name: "Export supplier PDF" }).tap();
    await expect(page.getByText(/Export 1 is frozen/)).toBeVisible();
    const exportId = await page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1/orders")).json()).orders.at(-1).exports.at(-1).id);
    const appendix = (id) => page.evaluate(async (x) => new TextDecoder().decode(await (await fetch(`/api/takeoff/exports/${x}/appendix`)).arrayBuffer()), id);
    const before = await appendix(exportId);
    await page.getByRole("button", { name: "Back" }).tap();
    await (await openRow(page.locator("li").filter({ hasText: "Rafters 90 × 45" }).first())).getByRole("button", { name: "Setup" }).tap();
    const setup = page.getByRole("dialog", { name: "Timber" });
    await setup.getByLabel("Pitch").fill("45");
    await setup.getByLabel("Pitch").press("Enter");
    await expect(setup.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
    await setup.getByRole("button", { name: "Close" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    const stale = page.getByTestId("stale-lines");
    await expect(stale).toContainText("90 × 45 MGP10 H2 — 5,400 mm length — 18 pieces — needs updating");
    await expect(stale).toContainText("The takeoff now needs: 18 pieces — 90 × 45 MGP10 H2 — 6,600 mm length (Rafters 90 × 45).");
    await expect(page.getByText(/^Not ready to order yet:/)).toBeVisible();
    await expect(page.getByText("This line is no longer in the takeoff (its measurements, product or stock changed) — update or remove it.")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Export supplier PDF" })).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/order-stale-new-stock-390x844.png`, fullPage: true });
    await page.getByRole("button", { name: "Update to what's needed now" }).tap();
    await expect(stale).toHaveCount(0);
    await expect(orderGroup(page, "mat-raf").getByLabel(/Order quantity.*\(pieces\)/)).toHaveValue("18");
    await expect(orderGroup(page, "mat-raf").locator("p", { hasText: "90 × 45 MGP10 H2 — 6,600 mm length" })).toBeVisible();
    await page.getByRole("button", { name: "Save order details" }).tap();
    await expect(page.getByText(/^Ready: /)).toBeVisible();
    await expect(page.getByTestId("not-on-order")).not.toContainText("Rafters");
    expect(await appendix(exportId)).toBe(before);   // the export is history
    expect(errors).toEqual([]);
  });

  test("REV-12 quantities typed but not saved survive leaving and reopening Orders (this device); Discard returns to the saved order; a draft for an older revision is not applied", async ({ page }) => {
    const errors = watchErrors(page);
    await openOrders(page);
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(page.getByText(/Draft FO-/)).toBeVisible();
    const sheets = orderGroup(page, "mat-axon").getByLabel(/Order quantity.*\(sheets\)/);
    await orderGroup(page, "mat-axon").getByRole("button", { name: "Fewer sheets" }).tap();
    await page.getByLabel("Notes for supplier").fill("Leave at the gate");
    await expect(page.getByRole("button", { name: "Save order details" })).toBeVisible();
    // leave without saving (before: everything typed was lost)
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await expect(page.getByTestId("order-draft-restored")).toBeVisible();
    await expect(sheets).toHaveValue("3");
    await expect(page.getByLabel("Notes for supplier")).toHaveValue("Leave at the gate");
    await expect(page.getByRole("button", { name: "Export supplier PDF" })).toBeDisabled();   // still unsaved
    await page.screenshot({ path: `${SHOTS}/order-draft-restored-390x844.png` });
    await page.getByRole("button", { name: "Discard", exact: true }).tap();
    await expect(sheets).toHaveValue("4");
    await expect(page.getByLabel("Notes for supplier")).toHaveValue("");
    await expect(page.getByTestId("order-draft-restored")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save order details" })).toHaveCount(0);
    // a draft made against revision N is not applied once the order was saved elsewhere (revision N+1)
    await orderGroup(page, "mat-axon").getByRole("button", { name: "Fewer sheets" }).tap();
    await expect(page.getByRole("button", { name: "Save order details" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).tap();
    await page.evaluate(async () => {
      const o = (await (await fetch("/api/takeoff/workspaces/ws-1/orders")).json()).orders.at(-1);
      await fetch(`/api/takeoff/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: o.revision, notes: "Saved on another phone" }) });
    });
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await expect(page.getByTestId("order-draft-dropped")).toBeVisible();
    await expect(sheets).toHaveValue("4");
    await expect(page.getByLabel("Notes for supplier")).toHaveValue("Saved on another phone");
    // once saved there is nothing to restore
    await orderGroup(page, "mat-axon").getByRole("button", { name: "Fewer sheets" }).tap();
    await page.getByRole("button", { name: "Save order details" }).tap();
    await expect(page.getByRole("button", { name: "Save order details" })).toHaveCount(0);
    await expect(page.getByTestId("order-draft-dropped")).toHaveCount(0);
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await expect(sheets).toHaveValue("3");
    await expect(page.getByTestId("order-draft-restored")).toHaveCount(0);
    await expect(page.getByTestId("order-draft-dropped")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("REV-13 orders: the last quantity on the page, focused, sits above the on-screen keyboard", async ({ page }) => {
    await fakeKeyboard(page);
    await openOrders(page);
    await page.getByRole("button", { name: "New order" }).tap();
    await expect(page.getByText(/Draft FO-/)).toBeVisible();
    await page.getByRole("button", { name: "Back" }).tap();   // no history yet: the draft is the end of the page
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    const last = orderGroup(page, "mat-trim").getByLabel(/Order quantity.*\(pieces\)/);
    await last.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await last.focus();
    await page.evaluate(() => window.__keyboard(360));
    await expect(page.locator("[data-keyboard-spacer]")).toHaveCount(1);
    await expect.poll(async () => { const b = await last.boundingBox(); return b ? b.y + b.height : 9999; }, { timeout: 3000 }).toBeLessThanOrEqual(844 - 360);
    // the flashing Qty field too — on the Flashings order (HUB 007)
    await page.evaluate(() => window.__keyboard(0));
    await page.getByRole("button", { name: "Back" }).tap();
    await page.getByRole("group", { name: "Takeoff section" }).getByRole("button", { name: "Flashings" }).tap();
    await page.getByRole("button", { name: /Review & export order/ }).tap();
    await expect(page.getByText(/^Draft FO-/)).toBeVisible();   // HUB 013: the Flashings draft opens by itself
    const qty = page.getByLabel("Qty").last();
    await qty.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await qty.focus();
    await page.evaluate(() => window.__keyboard(360));
    await expect.poll(async () => { const b = await qty.boundingBox(); return b ? b.y + b.height : 9999; }, { timeout: 3000 }).toBeLessThanOrEqual(844 - 360);
  });

  test("REV-14 added spares are shown only as the engine applied them: LM spare included; sheet spares added on top of the layout and named", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(MIXED);
    await ready(page);
    const mats = await page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot.materials);
    const tc = mats.find((m) => m.id === "mat-tc"), axon = mats.find((m) => m.id === "mat-axon");
    await serverEdit(page, { materials: { upsert: [{ ...tc, spec: { ...tc.spec, spareRate: 10 } }, { ...axon, spec: { ...axon.spec, spareRate: 5 } }] } });
    await reopen(page);
    await page.getByRole("button", { name: "Open schedule" }).tap();
    // 6.84 m² ÷ 0.12 m = 57.00 LM + 10 % = 62.70 → 63 LM (1 m increment)
    await expect(group(page, "mat-tc").getByRole("button", { name: /^63 LM/ })).toBeVisible();
    await expect(group(page, "mat-tc").locator("[data-spares]")).toHaveText("Spare included: 5.70 LM (10%) — already in the LM above.");
    // 4 layout sheets + ceil(4 × 5 %) = 1 spare → 5, the spare named separately (02 §6)
    await expect(group(page, "mat-axon").getByRole("button", { name: /^5 sheets/ })).toBeVisible();
    await expect(group(page, "mat-axon").locator("[data-spares]")).toHaveText("Spares added: 1 sheet (5%) — included in the quantities above, on top of the layout.");
    await expect(group(page, "mat-raf").locator("[data-spares]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
