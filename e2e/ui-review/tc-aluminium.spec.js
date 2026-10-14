// @ts-check
// TC-R04 11 — aluminium openings → three-edge window cuts → shared 6500 bar cutting sheet, in UI Review Mode
// (SYNTHETIC fixtures; src/ui-review/fixtures/takeoff.js computes with the real computeWorkspace).
//   UI_REVIEW_PORT=5193 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-aluminium.spec.js
// Phone journeys (375/390 px, touch). Evidence screenshots go to this run's test output folder only.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true };

// every test fails on an uncaught page error or a console error (React warnings included)
let consoleErrors = [];
test.beforeEach(({ page }) => {
  consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
});
test.afterEach(() => { expect(consoleErrors).toEqual([]); });

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
async function openTakeoff(page, seed) {
  await page.goto(`/carpentry/cjb-1/takeoff?reviewRole=admin${seed ? `&takeoffSeed=${seed}` : ""}`);
  await ready(page);
  await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();
}
const setupDialog = (page) => page.getByRole("dialog", { name: "Aluminium" });
const aluScreen = (page, name = /Aluminium angle/) => page.getByRole("dialog", { name });

/** In the aluminium setup card: enter the kerf and tick "confirmed". */
async function confirmKerf(page, kerf) {
  const setup = setupDialog(page);
  const f = setup.getByLabel("Saw kerf", { exact: true });
  await f.fill(String(kerf));
  await f.press("Enter");
  await setup.getByLabel(/saw kerf above is confirmed/).check();
}
async function toCutting(page, name) {
  await setupDialog(page).getByRole("button", { name: "Openings & cutting" }).click();
  const screen = aluScreen(page, name);
  await expect(screen.getByTestId("aluminium-screen")).toBeVisible();
  return screen;
}
/** Overview → Add aluminium → (setup: optional kerf) → Openings & cutting. */
async function addAluminium(page, { kerf } = {}) {
  await page.getByRole("button", { name: "Add aluminium" }).click();
  await expect(setupDialog(page)).toBeVisible();
  if (kerf != null) await confirmKerf(page, kerf);
  return toCutting(page);
}
async function num(scope, label, v) {
  const f = scope.getByLabel(label, { exact: true });
  await f.fill(String(v));
  await f.press("Enter");
}
/** Openings by size apply as soon as width and height are valid (no Add step); more of a size go on the added card. */
async function addOpening(screen, { label = "", w, h, count = 1 }) {
  if (label) await screen.getByLabel("Opening label (optional)").fill(label);
  await num(screen, "Opening width", w);
  await num(screen, "Opening height", h);
  if (count !== 1) await num(screen.getByTestId("alu-just-added-opening"), "How many of this size", count);
}
/** A straight cut is added once its length is valid; the quantity is set on the added cut. */
async function addCut(screen, { len, qty = 1, label = "" }) {
  if (label) await screen.getByLabel("Cut label (optional)").fill(label);
  await num(screen, "Finished cut length", len);
  if (qty !== 1) await num(screen.getByTestId("alu-just-added-cut"), "Cut quantity", qty);
}
/** An offcut is recorded once its measured length is valid; identical pieces go on the recorded card. */
async function recordOffcut(screen, { label, location, len, count = 1 }) {
  if (label != null) await screen.getByLabel("Offcut label").fill(label);
  if (location) await screen.getByLabel("Where it is (optional)").fill(location);
  await num(screen, "Measured offcut length", len);
  if (count !== 1) await num(screen.getByTestId("alu-just-added-offcut"), "Identical pieces", count);
}
const opening = (screen, label) => screen.locator(`[data-testid="alu-opening"][data-label="${label}"]`);

/** Every visible control in the screen is ≥ 44 CSS px (checkboxes: their label row). */
async function smallTargets(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-takeoff-focus]");
    const out = [];
    for (const el of root.querySelectorAll("button, input, select, summary, a[href]")) {
      const target = el instanceof HTMLInputElement && el.type === "checkbox" ? el.closest("label") : el;
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
}

test.describe("TC-R04 aluminium cutting (phone)", () => {
  test.use(PHONE);

  test("AL-1 exact example at 375 px: kerf estimate → setup; 600 × 2400 → 2500 + 2500 + 600 on ONE 6500 bar (9 cut loss, 891 remainder); +800 keeps one bar (88); undo/redo; tap a cut highlights its opening", async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openTakeoff(page);
    let screen = await addAluminium(page);
    // unconfirmed kerf: visible amber estimate with a way into setup
    await expect(screen.getByTestId("alu-kerf-estimate")).toContainText("Estimate");
    await expect(screen.getByTestId("alu-statuses")).toContainText("Installation: not specified — not checked");
    await screen.getByRole("button", { name: "Confirm saw kerf" }).click();
    await expect(setupDialog(page)).toBeVisible();
    await confirmKerf(page, 3);
    screen = await toCutting(page);
    await expect(screen.getByTestId("alu-kerf-estimate")).toHaveCount(0);

    await addOpening(screen, { label: "W01", w: 600, h: 2400 });
    const w01 = opening(screen, "W01");
    // nominal size and finished cuts are shown separately
    await expect(w01.getByTestId("alu-nominal")).toContainText("Opening 600 × 2,400 mm (nominal W × H)");
    await expect(w01.getByRole("button", { name: "W01 Left jamb 2,500 mm — Bar 1" })).toBeVisible();
    await expect(w01.getByRole("button", { name: "W01 Right jamb 2,500 mm — Bar 1" })).toBeVisible();
    await expect(w01.getByRole("button", { name: "W01 Bottom 600 mm — Bar 1" })).toBeVisible();
    await expect(w01.getByTestId("alu-cuts").getByRole("button")).toHaveCount(3); // head excluded by the preset

    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-required")).toHaveText("5,600 mm");
    await expect(screen.getByTestId("alu-cut-loss")).toHaveText("9 mm");
    await expect(screen.getByTestId("alu-reusable")).toHaveText("891 mm");
    await expect(screen.getByTestId("alu-scrap")).toHaveText("0 mm");
    await expect(screen.getByTestId("alu-proof")).toHaveText("Minimum proven");
    await expect(screen.getByTestId("alu-lower-bound")).toHaveText("Lower bound: 1 bar");
    await expect(screen.getByTestId("alu-objective")).toContainText("Minimise new bars");
    await expect(screen.getByTestId("alu-statuses")).toContainText("Quantity: calculated");

    // the bar expands to its ordered cuts and a PLANNED remainder (not stock)
    await screen.getByRole("button", { name: /^Bar 1/ }).click();
    const cuts = screen.getByRole("list", { name: "Bar 1 cuts in order" });
    await expect(cuts.getByRole("button")).toHaveCount(3);
    await expect(cuts.getByRole("button").nth(0)).toHaveAccessibleName("Cut 1: W01 left jamb 2,500 mm");
    await expect(cuts.getByRole("button").nth(1)).toHaveAccessibleName("Cut 2: W01 right jamb 2,500 mm");
    await expect(cuts.getByRole("button").nth(2)).toHaveAccessibleName("Cut 3: W01 bottom 600 mm");
    await expect(screen.getByTestId("alu-bar-remainder")).toContainText("Planned remainder 891 mm — reusable");
    await expect(screen.getByTestId("alu-bar-remainder")).toContainText("Not stock until this bar is actually cut");
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(0); // a plan never creates inventory

    // tapping a cut highlights its opening
    await expect(w01).toHaveAttribute("data-highlight", "false");
    await cuts.getByRole("button", { name: "Cut 3: W01 bottom 600 mm" }).tap();
    await expect(w01).toHaveAttribute("data-highlight", "true");

    // + an 800 square cut: still one bar, four pieces, 12 cut loss, 88 remainder (scrap below the 300 keep-from)
    await addCut(screen, { len: 800 });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-cut-loss")).toHaveText("12 mm");
    await expect(screen.getByTestId("alu-scrap")).toHaveText("88 mm");
    await expect(screen.getByTestId("alu-reusable")).toHaveText("0 mm");
    await expect(screen.getByTestId("alu-balance")).toContainText("6,500 mm = 6,400 mm cuts + 12 mm cut loss + 88 mm remainder");
    // evidence: the screen scrolls inside the focused window, so capture each section
    for (const [name, sel] of [["summary", "section:has(h2:text-is('Summary'))"], ["openings", "section:has(h2:text-matches('^Openings'))"], ["sheet", "#alu-cutting-sheet"]]) {
      await screen.locator(sel).screenshot({ path: info.outputPath(`aluminium-${name}-375.png`) });
    }

    // undo restores the previous calculation; redo re-applies it (no Apply button anywhere)
    await screen.getByRole("button", { name: "Undo" }).click();
    await expect(screen.getByTestId("alu-reusable")).toHaveText("891 mm");
    await expect(screen.getByTestId("alu-cut-loss")).toHaveText("9 mm");
    await screen.getByRole("button", { name: "Redo" }).click();
    await expect(screen.getByTestId("alu-scrap")).toHaveText("88 mm");
    await expect(screen.getByRole("button", { name: /^(Apply|Save)\b/ })).toHaveCount(0);

    // 900 instead of 800: the pieces no longer share one bar
    await screen.getByRole("button", { name: "Edit cut 800 mm" }).click();
    await num(screen.getByTestId("alu-extra-cut"), "Length", 900);
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");

    // phone layout: no horizontal scroll at 375 px, every control ≥ 44 px
    const o = await page.evaluate(() => {
      const el = document.querySelector("[data-testid=aluminium-screen]");
      return { doc: document.documentElement.scrollWidth, vw: window.innerWidth, inner: el.scrollWidth - el.clientWidth };
    });
    expect(o.doc).toBeLessThanOrEqual(o.vw);
    expect(o.inner).toBeLessThanOrEqual(0);
    expect(await smallTargets(page)).toEqual([]);
    await expect(screen.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  });

  test("AL-2 three 3400 cuts need THREE bars (not ceil(LM/6.5)); a 6600 cut is unavailable, never split, and blocks ordering", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    await addCut(screen, { len: 3400, qty: 3, label: "Long sill" });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 3 × 6,500 mm");
    await expect(screen.getByTestId("alu-required")).toHaveText("10,200 mm");
    await expect(screen.getByTestId("alu-lower-bound")).toHaveText("Lower bound: 3 bars");
    await expect(screen.getByTestId("alu-bar")).toHaveCount(3);

    await addCut(screen, { len: 6600, label: "Too long" });
    const un = screen.getByTestId("alu-unavailable");
    await expect(un).toContainText("Can't be cut from the 6,500 mm stock — pieces are never joined");
    await expect(un.getByRole("button", { name: "Too long — 6,600 mm" })).toBeVisible();
    await expect(un.getByTestId("alu-unavailable-reason")).toHaveText("Longer than the 6,500 mm length — can't be cut, never joined.");
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 3 × 6,500 mm"); // never a 4th bar from a split
    await expect(screen.getByTestId("alu-buy-blocked")).toHaveText("+ 1 piece can't be cut from stock — not in this count");
    await expect(screen.getByTestId("alu-statuses")).toContainText("Ordering: unavailable stock");
    const row = screen.getByTestId("alu-extra-cut").filter({ hasText: "Too long" });
    await expect(row.getByTestId("alu-cut-unavailable")).toHaveText("Longer than the 6,500 mm length — can't be cut, never joined.");
    // tapping the unavailable piece highlights its row
    await un.getByRole("button", { name: "Too long — 6,600 mm" }).click();
    await expect(row).toHaveAttribute("data-highlight", "true");

    await row.getByRole("button", { name: /^Edit cut/ }).click();
    await row.getByRole("button", { name: "Remove cut" }).click();
    await expect(screen.getByTestId("alu-unavailable")).toHaveCount(0);
    await expect(screen.getByTestId("alu-buy-blocked")).toHaveCount(0);
    await expect(screen.getByTestId("alu-statuses")).toContainText("Ordering: ready to order");
  });

  test("AL-3 existing offcuts: a 600 cut uses a recorded 891 offcut (288 left), consumed offcuts are not used, a bar's remainder is only recorded by hand", async ({ page }, info) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    await addCut(screen, { len: 600 });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(0);

    await recordOffcut(screen, { label: "Rack A", location: "Ute", len: 891 });
    const rack = screen.locator('[data-testid="alu-offcut"][data-offcut="Rack A"]');
    await expect(rack).toContainText("891 mm · Ute");
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy nothing new");
    await expect(screen.getByTestId("alu-offcuts-used")).toHaveText("+ uses 1 existing offcut");
    await expect(rack.getByTestId("alu-offcut-status")).toHaveText("In this plan: Cut 600");
    await screen.getByRole("button", { name: /^Offcut Rack A/ }).click();
    await expect(screen.getByTestId("alu-bar-remainder")).toContainText("Planned remainder 288 mm");

    // consumed → no longer stock
    await rack.getByRole("button", { name: "Mark consumed" }).click();
    await expect(rack.getByTestId("alu-offcut-status")).toHaveText("Consumed");
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-offcuts-used")).toHaveCount(0);

    // the planned 5,897 remainder of Bar 1 is NOT inventory until recorded with a measured length
    await screen.getByRole("button", { name: /^Bar 1/ }).click();
    await expect(screen.getByTestId("alu-bar-remainder")).toContainText("Planned remainder 5,897 mm — reusable");
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(1);
    await screen.getByRole("button", { name: "Record remaining offcut" }).click();
    const form = screen.locator("#alu-offcut-form");
    await expect(form).toContainText("Bar 1: planned remainder 5,897 mm");
    await expect(form.getByLabel("Offcut label")).toHaveValue("Bar 1 remainder");
    await expect(form.getByLabel("Measured offcut length")).toHaveValue("");
    // nothing is recorded until the real piece is measured — never assumed from the plan
    await expect(form).toContainText("Recorded as soon as you enter the measured length — never taken from the plan.");
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(1);
    await num(form, "Measured offcut length", 5890);
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(2);
    await expect(screen.getByTestId("alu-just-added-offcut")).toContainText("Recorded Bar 1 remainder · 5,890 mm");
    await expect(screen.getByTestId("alu-just-added-offcut").getByLabel("Identical pieces")).toHaveCount(0); // one real piece
    await expect(screen.locator('[data-testid="alu-offcut"][data-offcut="Bar 1 remainder"]')).toContainText("5,890 mm");
    await page.screenshot({ path: info.outputPath("aluminium-offcuts-390.png"), fullPage: true });
  });

  test("AL-4 openings already on walls (mixed seed): pooled across windows, each cut keeps its window label; untick / tick back; reopening keeps the plan", async ({ page }) => {
    await openTakeoff(page, "mixed");
    const row = page.getByRole("listitem").filter({ hasText: "Window angle 50 × 50 × 3" });
    await row.getByRole("button", { name: "Setup" }).click();
    let screen = await toCutting(page, /Window angle/);
    const walls = screen.getByTestId("alu-wall-openings");
    await expect(walls.getByRole("checkbox")).toHaveCount(2);
    await expect(walls.getByRole("checkbox", { name: /W1 · 900 × 900 mm/ })).toBeChecked();
    await expect(walls.getByRole("checkbox", { name: /W2 · 1,800 × 1,200 mm/ })).toBeChecked();
    await expect(opening(screen, "W1").getByTestId("alu-nominal")).toContainText("on wall North wall");
    await expect(opening(screen, "W1").getByRole("button", { name: /^W1 Left jamb 1,000 mm — Bar \d$/ })).toBeVisible();
    await expect(opening(screen, "W2").getByRole("button", { name: /^W2 Bottom 1,800 mm — Bar \d$/ })).toBeVisible();
    // 7,300 mm of cuts from two windows: pooled into two bars, never one bar per window; each cut keeps its window label
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    await expect(screen.getByTestId("alu-required")).toHaveText("7,300 mm");
    await screen.getByRole("button", { name: /^Bar 1/ }).click();
    const cuts = screen.getByRole("list", { name: "Bar 1 cuts in order" }).getByRole("button");
    await expect(cuts.filter({ hasText: "W1 " }).first()).toBeVisible();
    await expect(cuts.filter({ hasText: "W2 " }).first()).toBeVisible();
    await screen.getByRole("button", { name: /^Bar 2/ }).click();
    const all = screen.getByTestId("alu-sheet").getByRole("list", { name: /cuts in order/ }).getByRole("button");
    await expect(all).toHaveCount(6);

    // untick W2: its cuts leave the plan (the wall keeps the opening)
    await walls.getByRole("checkbox", { name: /W2/ }).uncheck();
    await expect(opening(screen, "W2")).toHaveCount(0);
    await expect(screen.getByTestId("alu-required")).toHaveText("2,900 mm");
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(walls.getByRole("checkbox")).toHaveCount(2);
    await walls.getByRole("checkbox", { name: /W2/ }).check();
    await expect(screen.getByTestId("alu-required")).toHaveText("7,300 mm");

    // leave and come back: the plan is read from the takeoff, not held by the screen
    await screen.getByRole("button", { name: "Back" }).click();
    await page.getByRole("listitem").filter({ hasText: "Window angle 50 × 50 × 3" }).getByRole("button", { name: "Setup" }).click();
    screen = await toCutting(page, /Window angle/);
    await expect(screen.getByTestId("alu-required")).toHaveText("7,300 mm");
    await expect(screen.getByTestId("alu-opening")).toHaveCount(2);
  });

  test("AL-5 openings by count get their own labels; editing a size refreshes cuts and undo restores; remove + undo; window detail head edge", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    await addOpening(screen, { w: 900, h: 1200, count: 3 });
    await expect(screen.getByTestId("alu-opening")).toHaveCount(3);
    for (const l of ["W01", "W02", "W03"]) await expect(opening(screen, l).getByRole("button", { name: `${l} Left jamb 1,300 mm`, exact: false })).toBeVisible();

    const w02 = opening(screen, "W02");
    await w02.getByRole("button", { name: "Edit W02" }).click();
    await num(w02, "Height", 1500);
    await expect(w02.getByTestId("alu-nominal")).toContainText("Opening 900 × 1,500 mm");
    await expect(w02.getByRole("button", { name: /^W02 Left jamb 1,600 mm/ })).toBeVisible();
    await expect(opening(screen, "W01").getByRole("button", { name: /^W01 Left jamb 1,300 mm/ })).toBeVisible(); // only W02 changed
    await screen.getByRole("button", { name: "Undo" }).click();
    await expect(w02.getByRole("button", { name: /^W02 Left jamb 1,300 mm/ })).toBeVisible();

    const w03 = opening(screen, "W03");
    await w03.getByRole("button", { name: "Edit W03" }).click();
    await w03.getByRole("button", { name: "Remove opening" }).click();
    await expect(screen.getByTestId("alu-opening")).toHaveCount(2);
    await screen.getByRole("button", { name: "Undo" }).click();
    await expect(screen.getByTestId("alu-opening")).toHaveCount(3);

    // the window detail is explicit per edge: switch the head on → every opening gains a head cut
    await screen.getByText("Window detail (all openings):").click();
    await screen.getByRole("button", { name: "Head", exact: true }).click();
    await expect(opening(screen, "W01").getByRole("button", { name: /^W01 Head 900 mm/ })).toBeVisible();
    await expect(screen.getByTestId("alu-opening").getByRole("button", { name: / Head / })).toHaveCount(3);
    await screen.getByRole("button", { name: "Undo" }).click();
    await expect(screen.getByTestId("alu-opening").getByRole("button", { name: / Head / })).toHaveCount(0);

    // a labelled size: copies are numbered from the label, and going back to one restores the plain label
    await addOpening(screen, { label: "Bay", w: 600, h: 600, count: 2 });
    await expect(opening(screen, "Bay-1")).toHaveCount(1);
    await expect(opening(screen, "Bay-2")).toHaveCount(1);
    await num(screen.getByTestId("alu-just-added-opening"), "How many of this size", 1);
    await expect(opening(screen, "Bay")).toHaveCount(1);
    await expect(screen.getByTestId("alu-opening")).toHaveCount(4);
  });

  test("AL-6 site cutting sheet export: CSV cut-to-opening lookup and copied text agree with the plan", async ({ page, context, browserName }) => {
    // Chromium: the real clipboard. WebKit (iPhone engine) has no clipboard permissions to grant: capture the write.
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    else await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; }, readText: async () => window.__copied } }));
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    await addOpening(screen, { label: "W01", w: 600, h: 2400 });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");

    const dl = page.waitForEvent("download");
    await screen.getByRole("button", { name: "Download CSV" }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe("aluminium-angle-50-50-3-cutting-sheet.csv");
    const csv = readFileSync(await file.path(), "utf8").split("\n");
    expect(csv[0]).toBe("Bar,Source,Stock length (mm),Cut order,Cut,Opening,Wall,Edge,Length (mm),Saw cut after (mm),Planned remainder (mm),Remainder");
    expect(csv.slice(1)).toEqual([
      "Bar 1,new,6500,1,W01 left jamb,W01,,Left jamb,2500,3,,",
      "Bar 1,new,6500,2,W01 right jamb,W01,,Right jamb,2500,3,,",
      "Bar 1,new,6500,3,W01 bottom,W01,,Bottom,600,3,891,reusable (planned)",
    ]);

    await screen.getByRole("button", { name: "Copy cutting sheet" }).click();
    await expect(screen.getByText("Cutting sheet copied.")).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("Buy 1 × 6,500 mm.");
    expect(text).toContain("Minimum proven (lower bound 1 bar).");
    expect(text).toContain("Saw kerf 3 mm (confirmed)");
    expect(text).toContain("  3. W01 bottom — 600 mm");
    expect(text).toContain("Planned remainder 891 mm (reusable) — not stock until cut");
    expect(text).toContain("W01 (600 × 2,400): Left jamb 2,500 mm → Bar 1; Right jamb 2,500 mm → Bar 1; Bottom 600 mm → Bar 1");
  });
});

test.describe("TC-R04 aluminium honest search label", () => {
  test.use(PHONE);
  // 23 distinct cuts (found by probing engine/allocator.js): first-fit-decreasing gives 9 bars, the bound is 8 and the
  // 50,000-node search cannot close the gap — the screen must say so, never "minimum".
  const CUTS = [1570, 1490, 2190, 1930, 2940, 2220, 3350, 2920, 2210, 3280, 1910, 2420, 3210, 2100, 1780, 2830, 3240, 3170, 1370, 1540, 1790, 1030, 1250];
  test("AL-9 an exhausted search is labelled 'Best plan found — minimum not proven' with its lower bound", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    for (const len of CUTS) await addCut(screen, { len });
    await expect(screen.getByTestId("alu-extra-cut")).toHaveCount(CUTS.length);
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 9 × 6,500 mm");
    await expect(screen.getByTestId("alu-proof")).toHaveText("Best plan found — minimum not proven");
    await expect(screen.getByTestId("alu-lower-bound")).toHaveText("Lower bound: 8 bars");
    await expect(screen.getByTestId("alu-required")).toHaveText(`${CUTS.reduce((a, b) => a + b, 0).toLocaleString("en-AU")} mm`);
    await screen.getByText("How this was worked out").click();
    await expect(screen.getByText("Best plan found — minimum not proven.", { exact: true })).toBeVisible();
  });
});

test.describe("TC-R04 aluminium layout", () => {
  test("AL-7 desktop: the cutting sheet sits beside the openings (one screen, no page scroll sideways)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    await addOpening(screen, { label: "W01", w: 600, h: 2400 });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    const a = await opening(screen, "W01").boundingBox();
    const b = await screen.locator("#alu-cutting-sheet").boundingBox();
    expect(b.x).toBeGreaterThan(a.x + a.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test.describe("phone keyboard", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test("AL-8 a focused numeric field near the bottom is moved up into the visible area (room for the keyboard)", async ({ page }) => {
      await openTakeoff(page);
      const screen = await addAluminium(page, { kerf: 3 });
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const box = screen.getByTestId("aluminium-screen");
      const field = screen.getByLabel("Measured offcut length");
      // put the field at the very bottom edge of the scroll area, then focus it like a tap would
      await field.evaluate((el) => { const c = el.closest("[data-testid=aluminium-screen]"); c.scrollTop += el.getBoundingClientRect().bottom - c.getBoundingClientRect().bottom + 4; });
      await field.focus();
      const centre = async () => { const r = await field.boundingBox(), c = await box.boundingBox(); return (r.y + r.height / 2 - c.y) / c.height; };
      await expect.poll(centre, { timeout: 3000 }).toBeLessThan(0.5);
      // the same through a real tap (pointerdown → focus): still lifted
      await field.blur();
      await field.evaluate((el) => { const c = el.closest("[data-testid=aluminium-screen]"); c.scrollTop += el.getBoundingClientRect().bottom - c.getBoundingClientRect().bottom + 4; });
      expect(await centre()).toBeGreaterThan(0.8);
      await field.tap();
      await expect.poll(centre, { timeout: 3000 }).toBeLessThan(0.5);
    });
  });
});

// ── adversarial review regressions (each proves a defect found in review and fixed) ──────────────────────────
const openMixedAluminium = async (page) => {
  await page.getByRole("listitem").filter({ hasText: "Window angle 50 × 50 × 3" }).getByRole("button", { name: "Setup" }).click();
  return toCutting(page, /Window angle/);
};

test.describe("TC-R04 aluminium review regressions (phone)", () => {
  test.use(PHONE);

  test("AL-10 exact fill 2500+2500+1494 uses the bar end (no third kerf); a 5 mm end trim makes an exact 6500 piece unavailable FOR THE TRIM (never 'longer than stock'); 6501 is longer than stock", async ({ page }) => {
    await openTakeoff(page);
    let screen = await addAluminium(page, { kerf: 3 });
    await addCut(screen, { len: 2500, qty: 2 });
    await addCut(screen, { len: 1494 });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-cut-loss")).toHaveText("6 mm");
    await expect(screen.getByTestId("alu-balance")).toContainText("6,500 mm = 6,494 mm cuts + 6 mm cut loss + 0 mm remainder");
    await screen.getByRole("button", { name: /^Bar 1/ }).click();
    await expect(screen.getByRole("list", { name: "Bar 1 cuts in order" }).getByRole("button").nth(2)).toContainText("uses bar end");
    await expect(screen.getByTestId("alu-bar-remainder")).toContainText("Planned remainder 0 mm — none — exact fit");

    // with no end trim an exact 6500 piece takes a bar of its own; 6501 never fits and is never split
    await addCut(screen, { len: 6500, label: "Exact" });
    await addCut(screen, { len: 6501, label: "Over" });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    let un = screen.getByTestId("alu-unavailable");
    await expect(un.getByRole("listitem")).toHaveCount(1);
    await expect(un.getByRole("button", { name: "Over — 6,501 mm" })).toBeVisible();
    await expect(un.getByTestId("alu-unavailable-reason")).toHaveText("Longer than the 6,500 mm length — can't be cut, never joined.");

    // 5 mm end trim: the exact fill needs two bars, and the 6500 piece is unavailable because of the TRIM
    await screen.getByRole("button", { name: "Profile & cutting settings" }).click();
    await num(setupDialog(page), "End trim", 5);
    screen = await toCutting(page);
    un = screen.getByTestId("alu-unavailable");
    await expect(un.getByRole("listitem")).toHaveCount(2);
    await expect(un.getByRole("listitem").filter({ hasText: "Exact — 6,500 mm" }).getByTestId("alu-unavailable-reason"))
      .toHaveText("Fits the 6,500 mm length only without the 5 mm end trim. Not split: change the end trim or detail, or choose a longer stock.");
    const exactRow = screen.getByTestId("alu-extra-cut").filter({ hasText: "Exact" });
    await expect(exactRow.getByTestId("alu-cut-unavailable")).toHaveText("Fits the 6,500 mm length only without the 5 mm end trim. Not split: change the end trim or detail, or choose a longer stock.");
    await expect(exactRow).not.toContainText("Longer than");
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    await expect(screen.getByTestId("alu-buy-blocked")).toHaveText("+ 2 pieces can't be cut from stock — not in this count");
  });

  test("AL-11 honest headline: an unconfirmed kerf reads 'saw kerf not confirmed' (not 'product details missing'); 'Buy nothing new' never hides a piece that can't be cut", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page); // kerf left unconfirmed
    await addOpening(screen, { label: "W01", w: 600, h: 2400 });
    const st = screen.getByTestId("alu-statuses");
    await expect(st.locator('[data-status="quantity"]')).toHaveText("Quantity: incomplete — saw kerf not confirmed");
    await expect(st.locator('[data-status="procurement"]')).toHaveText("Ordering: not ready — saw kerf not confirmed");
    await expect(st).not.toContainText("product details missing");
    await expect(screen.getByTestId("alu-reusable")).toHaveText("900 mm"); // the 0 mm estimate, labelled as such
    await expect(screen.getByTestId("alu-kerf-estimate")).toContainText("this plan uses 0 mm");
    // a site sheet exported before the kerf is confirmed says ESTIMATE in its name and in the table itself
    const dl = page.waitForEvent("download");
    await screen.getByRole("button", { name: "Download CSV" }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe("aluminium-angle-50-50-3-cutting-sheet-ESTIMATE.csv");
    expect(readFileSync(await file.path(), "utf8").split("\n")[0]).toContain("Saw cut after (mm) — ESTIMATE: kerf not confirmed");

    const w01 = opening(screen, "W01");
    await w01.getByRole("button", { name: "Edit W01" }).click();
    await w01.getByRole("button", { name: "Remove opening" }).click();
    await addCut(screen, { len: 7000, label: "Gate rail" });
    await expect(screen.getByTestId("alu-buy-summary")).toHaveText("Buy nothing new");
    await expect(screen.getByTestId("alu-buy-summary-blocked")).toHaveText("+ 1 piece can't be cut from stock");
    await expect(screen.getByTestId("alu-buy-blocked")).toBeVisible();
    await expect(screen.getByTestId("alu-proof")).toHaveText("Minimum proven for the pieces that fit");
    await expect(st.locator('[data-status="procurement"]')).toHaveText("Ordering: unavailable stock · saw kerf not confirmed");
  });

  test("AL-12 375 px with long unbroken labels: nothing overflows and every control is ≥ 44 px; entries apply from the keyboard's return key (no Add step); duplicate labels are flagged", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    const LONG = "NORTHELEVATIONGARAGEWINDOWSETABCDEFGHIJKLMNOPQRSTUVWXYZ0123456";
    // the phone keyboard's return key (Enter) commits each number; the entry applies at once
    await addOpening(screen, { label: LONG, w: 600, h: 2400 });
    await expect(screen.getByTestId("alu-opening")).toHaveCount(1);
    await expect(screen.getByTestId("alu-nominal")).toContainText("Opening 600 × 2,400 mm");
    await addCut(screen, { label: LONG, len: 1200 });
    await expect(screen.getByTestId("alu-extra-cut")).toHaveCount(1);
    await recordOffcut(screen, { label: LONG, location: LONG, len: 891 });
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(1);
    await expect(screen.getByTestId("alu-offcut")).toContainText("891 mm");
    await addCut(screen, { len: 7000, label: LONG });
    await expect(screen.getByTestId("alu-offcuts-used")).toBeVisible();
    const closed = screen.getByTestId("alu-bar").getByRole("button", { expanded: false });
    while (await closed.count()) await closed.first().click();
    await expect(screen.getByTestId("alu-bar-remainder")).toHaveCount(2);

    const over = await page.evaluate(() => {
      const root = document.querySelector("[data-testid=aluminium-screen]");
      const vw = window.innerWidth;
      const out = [];
      for (const el of root.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > vw + 0.5 || r.left < -0.5)) out.push(`${el.tagName} "${(el.textContent || "").slice(0, 30)}" ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return { doc: document.documentElement.scrollWidth - vw, inner: root.scrollWidth - root.clientWidth, out };
    });
    expect(over).toEqual({ doc: 0, inner: 0, out: [] });
    expect(await smallTargets(page)).toEqual([]);

    // two openings with the same label are flagged until one is renamed
    await addOpening(screen, { label: "Kitchen", w: 900, h: 1200 });
    await expect(opening(screen, "Kitchen")).toHaveCount(1);
    await expect(screen.getByTestId("alu-duplicate-label")).toHaveCount(0);
    await addOpening(screen, { label: "Kitchen", w: 900, h: 1200 });
    await expect(opening(screen, "Kitchen")).toHaveCount(2);
    await expect(opening(screen, "Kitchen").getByTestId("alu-duplicate-label")).toHaveCount(2);
    const second = opening(screen, "Kitchen").nth(1);
    await second.getByRole("button", { name: "Edit Kitchen" }).click();
    const label = second.getByLabel("Label", { exact: true });
    await label.fill("Kitchen 2");
    await label.press("Enter");
    await expect(opening(screen, "Kitchen 2")).toHaveCount(1);
    await expect(screen.getByTestId("alu-duplicate-label")).toHaveCount(0);
  });

  test("AL-13 cross-window pooling (11 acceptance 5): 4000 + 2400 + 2500 + 2500 + 600 fits TWO bars with 3 mm kerf and every piece keeps its own label", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    await addOpening(screen, { label: "W01", w: 600, h: 2400 });
    await addCut(screen, { len: 4000, label: "W02 head" });
    await addCut(screen, { len: 2400, label: "W03 sill" });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    await expect(screen.getByTestId("alu-required")).toHaveText("12,000 mm");
    await expect(screen.getByTestId("alu-lower-bound")).toHaveText("Lower bound: 2 bars");
    await expect(screen.getByTestId("alu-cut-loss")).toHaveText("15 mm");
    for (const b of ["Bar 1", "Bar 2"]) await screen.getByRole("button", { name: new RegExp(`^${b}`) }).click();
    const names = await screen.getByTestId("alu-sheet").getByRole("list", { name: /cuts in order/ }).getByRole("button")
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").replace(/^Cut \d+: /, "")).sort());
    expect(names).toEqual(["W01 bottom 600 mm", "W01 left jamb 2,500 mm", "W01 right jamb 2,500 mm", "W02 head 4,000 mm", "W03 sill 2,400 mm"]);
  });

  test("AL-14 wall-owned openings carry their wall on every cut: bar rows and the CSV lookup name the wall", async ({ page }) => {
    await openTakeoff(page, "mixed");
    const screen = await openMixedAluminium(page);
    await screen.getByRole("button", { name: /^Bar 1/ }).click();
    const bar1 = screen.getByRole("list", { name: "Bar 1 cuts in order" }).getByRole("button");
    await expect(bar1.filter({ hasText: "W2 " }).first()).toHaveAccessibleName(/· wall East wall$/);
    await expect(bar1.filter({ hasText: "W2 " }).first()).toContainText("East wall");
    const dl = page.waitForEvent("download");
    await screen.getByRole("button", { name: "Download CSV" }).click();
    const csv = readFileSync(await (await dl).path(), "utf8").split("\n").slice(1).map((r) => r.split(","));
    expect(csv).toHaveLength(6);
    for (const r of csv) expect(r[6]).toBe(r[5] === "W1" ? "North wall" : "East wall");
  });

  test("AL-15 reload keeps the current plan (11 acceptance 8): an offline edit survives a reload via device recovery and the restored plan is identical", async ({ page }) => {
    await openTakeoff(page, "mixed");
    let screen = await openMixedAluminium(page);
    await expect(screen.getByTestId("alu-required")).toHaveText("7,300 mm");
    await page.evaluate(() => { window.__takeoffReviewOffline = true; });
    await addCut(screen, { len: 4000, label: "Door head" });
    await expect(screen.getByTestId("alu-required")).toHaveText("11,300 mm");
    await expect(screen.getByRole("status").filter({ hasText: /^Not synced$/ })).toBeVisible();
    const before = await screen.getByTestId("alu-bar").allInnerTexts();
    // the device-recovery write is asynchronous (IndexedDB): wait until it holds the unsynced edit before reloading
    await expect.poll(() => page.evaluate(() => new Promise((res) => {
      const req = indexedDB.open("blh-takeoff-recovery");
      req.onsuccess = () => { try { const t = req.result.transaction("drafts", "readonly").objectStore("drafts").count(); t.onsuccess = () => res(t.result); t.onerror = () => res(0); } catch { res(0); } };
      req.onerror = () => res(0);
    }))).toBeGreaterThan(0);
    await page.reload();
    await ready(page);
    await expect(page.getByText(/Unsaved changes from .* were found on this device\./)).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    screen = await openMixedAluminium(page);
    await expect(screen.getByTestId("alu-required")).toHaveText("11,300 mm");
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    expect(await screen.getByTestId("alu-bar").allInnerTexts()).toEqual(before);
    await expect(screen.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  });

  test("AL-16 an offcut recorded for one aluminium is never used by a different-finish aluminium (11 acceptance 4)", async ({ page }) => {
    await openTakeoff(page);
    let screen = await addAluminium(page, { kerf: 3 });
    await recordOffcut(screen, { label: "Rack A", len: 891 });
    await addCut(screen, { len: 600 });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy nothing new");
    await screen.getByRole("button", { name: "Back" }).click();

    await page.getByRole("button", { name: "Add aluminium" }).click();
    const setup = setupDialog(page);
    await setup.getByLabel("Name", { exact: true }).fill("Black angle");
    await setup.getByLabel("Finish / colour").fill("Black");
    await confirmKerf(page, 3);
    screen = await toCutting(page, /Black angle/);
    await addCut(screen, { len: 600 });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-offcuts-used")).toHaveCount(0);
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(0);
    await expect(screen.getByText("No offcuts recorded.")).toBeVisible();
  });
});

test.describe("TC-R04 aluminium offcut pieces (phone)", () => {
  test.use(PHONE);
  test("AL-17 identical offcuts are recorded as separate pieces (each used at most once) in one undoable step", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    await addCut(screen, { len: 600, qty: 2 });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await recordOffcut(screen, { label: "Rack C", len: 891, count: 2 });
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(2);
    await expect(screen.locator('[data-testid="alu-offcut"][data-offcut="Rack C (1 of 2)"]')).toContainText("891 mm");
    await expect(screen.locator('[data-testid="alu-offcut"][data-offcut="Rack C (2 of 2)"]')).toContainText("891 mm");
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy nothing new");
    await expect(screen.getByTestId("alu-offcuts-used")).toHaveText("+ uses 2 existing offcuts");
    await expect(screen.getByTestId("alu-offcut-status").filter({ hasText: /^In this plan: Cut 600$/ })).toHaveCount(2);
    await expect(screen.getByLabel("Measured offcut length", { exact: true })).toHaveValue(""); // the form is ready for the next piece
    await expect(screen.getByTestId("alu-just-added-offcut")).toContainText("Recorded Rack C (1 of 2), Rack C (2 of 2) · 891 mm");
    await screen.getByRole("button", { name: "Undo" }).click();
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(0);
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
  });
});

// ── second adversarial review (TC-R04 resume) — each test proves a defect found in review and fixed ─────────────
/** Place an order for `quantity` bars of a material through the review backend's own order API (what the Orders
 *  screen does), so the takeoff has a frozen, placed order to reconcile against. */
async function placeOrderInReviewBackend(page, materialId, quantity) {
  return page.evaluate(async ({ materialId, quantity }) => {
    const j = async (url, method = "GET", body) => (await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json();
    const st = await j("/api/takeoff/workspaces/ws-1/orders");
    const line = st.scheduleLines.find((l) => l.generic && l.unit === "bar" && l.jobMaterialIds.includes(materialId));
    const id = crypto.randomUUID();
    await j("/api/takeoff/workspaces/ws-1/orders", "POST", { id, supplierId: "sup-1", delivery: { method: "pickup" } });
    await j(`/api/takeoff/orders/${id}`, "PATCH", { expectedRevision: 1, lines: [{ bucketKey: line.bucketKey, quantity, jobMaterialId: materialId }] });
    const ex = await j(`/api/takeoff/orders/${id}/exports`, "POST", { isDraft: false });
    if (!ex.ok) return ex;
    const pl = await j(`/api/takeoff/orders/${id}/placements`, "POST", { exportId: ex.export.exportId, supplierReference: "REVIEW-1", placedOn: "2026-10-14" });
    return pl.ok === true ? true : pl;
  }, { materialId, quantity });
}

test.describe("TC-R04 aluminium second review (phone)", () => {
  test.use(PHONE);

  test("AL-18 add forms never lose or leave behind a number: an entry applies when the field is left (tap elsewhere) and the form is visibly empty again, fast repeated entry adds every opening, a cleared field is not secretly used", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    const field = (label) => screen.getByLabel(label, { exact: true });
    // leaving the field (no Enter) applies the entry AND empties the form — no number left showing that it no longer holds
    await num(screen, "Opening width", 600);
    await field("Opening height").fill("2400");
    await field("Opening height").blur();
    await expect(screen.getByTestId("alu-opening")).toHaveCount(1);
    await expect(field("Opening width")).toHaveValue("");
    await expect(field("Opening height")).toHaveValue("");
    await expect(field("How many of this size")).toHaveValue("1");
    await field("Finished cut length").fill("1200");
    await field("Finished cut length").blur();
    await expect(screen.getByTestId("alu-extra-cut")).toHaveCount(1);
    await expect(field("Finished cut length")).toHaveValue("");
    await expect(field("Cut quantity")).toHaveValue("1");
    await field("Measured offcut length").fill("891");
    await field("Measured offcut length").blur();
    await expect(screen.getByTestId("alu-offcut")).toHaveCount(1);
    await expect(field("Measured offcut length")).toHaveValue("");

    // fast entry straight after each one (before: the form's reset could land after the next number was typed and wipe it)
    for (let i = 0; i < 6; i++) await addOpening(screen, { label: "Fast", w: 900, h: 1200 });
    await expect(opening(screen, "Fast")).toHaveCount(6);
    await expect(screen.getByTestId("alu-opening").filter({ hasText: "Opening 900 × 1,200 mm" })).toHaveCount(6);

    // a cleared or invalid field is empty, not the last number: nothing is added from a value no longer shown
    await num(screen, "Opening width", 700);
    await num(screen, "Opening width", "");
    await num(screen, "Opening height", 800);
    await expect(screen.getByTestId("alu-opening")).toHaveCount(7);
    await num(screen, "Opening width", "abc");
    await expect(screen.getByText("Enter a number greater than 0.")).toBeVisible();
    await expect(screen.getByTestId("alu-opening")).toHaveCount(7);
    await num(screen, "Opening width", 700);
    await expect(screen.getByTestId("alu-opening")).toHaveCount(8);
    await expect(screen.getByTestId("alu-opening").filter({ hasText: "Opening 700 × 800 mm" })).toHaveCount(1);
    await expect(screen.getByRole("alert").filter({ hasText: /^Enter (the opening|a number)/ })).toHaveCount(0);
  });

  test("AL-19 placed orders are reconciled, never re-bought silently (11 workflow 5): covered → still to order → surplus, the placed order unchanged", async ({ page }) => {
    await openTakeoff(page, "mixed");
    const screen = await openMixedAluminium(page);
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    await expect(screen.getByTestId("alu-ordered")).toHaveCount(0);
    expect(await placeOrderInReviewBackend(page, "mat-al", 2)).toBe(true);
    // the next save brings the server's order status back with it
    await addCut(screen, { len: 600, label: "Shelf trim" });
    await expect(screen.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    await expect(screen.getByTestId("alu-ordered")).toHaveText("Already ordered: 2 × 6,500 mm on placed orders. That covers this plan.");
    await expect(screen.getByTestId("alu-ordered-summary")).toHaveText("Already ordered: 2 × 6,500 mm on placed orders. That covers this plan.");
    // the plan grows: only the difference is still to order
    await addCut(screen, { len: 6000, label: "Garage head" });
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 3 × 6,500 mm");
    await expect(screen.getByTestId("alu-ordered")).toHaveText("Already ordered: 2 × 6,500 mm on placed orders. Still to order: 1 more bar.");
    // the plan shrinks below what was ordered: surplus is shown, the placed order is not changed
    await screen.getByRole("button", { name: "Undo" }).click();
    await screen.getByTestId("alu-wall-openings").getByRole("checkbox", { name: /W2/ }).uncheck();
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-ordered")).toHaveText("Already ordered: 2 × 6,500 mm on placed orders. 1 bar more than this plan now needs — placed orders are not changed.");
  });

  test("AL-20 view-only: the cutting sheet opens from the material row and reads honestly — no add/edit/remove, no undo, ticks locked, exports still work", async ({ page }) => {
    // the review backend has no view-only staff role: present the takeoff with edit permission removed
    await page.addInitScript(() => {
      const json = Response.prototype.json;
      Response.prototype.json = async function () {
        const j = await json.call(this);
        if (j && typeof j === "object" && j.capabilities) j.capabilities = { ...j.capabilities, edit: false, editStandards: false };
        return j;
      };
    });
    await openTakeoff(page, "mixed");
    await page.getByRole("listitem").filter({ hasText: "Window angle 50 × 50 × 3" }).getByRole("button", { name: "Cutting" }).click();
    const screen = aluScreen(page, /Window angle/);
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    await expect(screen.getByTestId("alu-statuses")).toContainText("Ordering: ready to order");
    await expect(screen.getByTestId("alu-preset-readonly")).toContainText("left + right jamb = height + 100 mm total");
    await expect(screen.getByTestId("alu-footnote")).toContainText("You can view this cutting plan but not change it.");
    for (const name of [/^Add /, /^Edit /, /^Remove/, "Undo", "Redo", "Profile & cutting settings", /^Record /, "Measure runs on the plan", "Mark consumed"]) {
      await expect(screen.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(screen.getByRole("textbox")).toHaveCount(0);
    for (const box of await screen.getByTestId("alu-wall-openings").getByRole("checkbox").all()) await expect(box).toBeDisabled();
    await screen.getByRole("button", { name: /^Bar 1/ }).click();
    await expect(screen.getByTestId("alu-bar-remainder")).toContainText("Not stock until this bar is actually cut");
    await expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
    expect(await smallTargets(page)).toEqual([]);
  });

  test("AL-21 the site CSV never runs a typed label as a spreadsheet formula; each bar row reads as one phrase to a screen reader", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    await addCut(screen, { len: 600, label: "=1+2" });
    await expect(screen.getByRole("button", { name: "Bar 1: new 6,500 mm, 1 cut, planned remainder 5,897 mm" })).toBeVisible();
    const dl = page.waitForEvent("download");
    await screen.getByRole("button", { name: "Download CSV" }).click();
    const rows = readFileSync(await (await dl).path(), "utf8").split("\n").slice(1).map((r) => r.split(","));
    expect(rows).toHaveLength(1);
    expect(rows[0][4]).toBe("'=1+2");
    expect(rows[0][8]).toBe("600");
  });

  test("AL-22 greedy start beaten (11 acceptance 10): 3300+3200+2000+1600+1300+1200 — first-fit-decreasing needs 3 bars, the search proves 2 and says how", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    for (const len of [3300, 3200, 2000, 1600, 1300, 1200]) await addCut(screen, { len });
    await expect(screen.getByTestId("alu-extra-cut")).toHaveCount(6);
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 2 × 6,500 mm");
    await expect(screen.getByTestId("alu-proof")).toHaveText("Minimum proven");
    await expect(screen.getByTestId("alu-lower-bound")).toHaveText("Lower bound: 2 bars");
    await screen.getByText("How this was worked out").click();
    await expect(screen.getByText(/^First-fit-decreasing start: 3 new bars; branch-and-bound result: 2 new bars/)).toBeVisible();
    // conservation on every bar: stock = cuts + saw cuts + remainder
    await expect(screen.getByTestId("alu-balance")).toContainText("13,000 mm = 12,600 mm cuts + 18 mm cut loss + 382 mm remainder");
  });

  test("AL-23 measure runs on the plan and come back: the plan screen opens for this aluminium and Done returns to the same cutting sheet", async ({ page }) => {
    await openTakeoff(page, "mixed");
    const screen = await openMixedAluminium(page);
    await screen.getByRole("button", { name: "Measure runs on the plan" }).click();
    const plan = page.getByRole("dialog").filter({ hasText: "Material: Window angle 50 × 50 × 3" });
    await expect(plan).toBeVisible();
    await plan.getByRole("button", { name: "Done" }).click();
    await expect(aluScreen(page, /Window angle/).getByTestId("alu-required")).toHaveText("7,300 mm");
  });
});

// ── third adversarial review (TC-R04 phone + engine) — each test proves a defect found in review and fixed ────────
const hideApp = (page) => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
});
const recoveryCount = (page) => page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open("blh-takeoff-recovery");
  req.onsuccess = () => { try { const t = req.result.transaction("drafts", "readonly").objectStore("drafts").count(); t.onsuccess = () => res(t.result); t.onerror = () => res(0); } catch { res(0); } };
  req.onerror = () => res(0);
}));
const openCutting = async (page, name = /Aluminium angle/) => {
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Cutting" }).click();
  const screen = aluScreen(page, name);
  await expect(screen.getByTestId("aluminium-screen")).toBeVisible();
  return screen;
};

test.describe("TC-R04 aluminium third review (phone)", () => {
  test.use(PHONE);

  test("AL-24 PH-05 an opening by size applies as soon as width and height are valid (no Add step): kept on Back with the field still focused, kept when the app is hidden mid-typing (reload → Restore), undoable; 'How many of this size' joins the same undo step", async ({ page }) => {
    await openTakeoff(page);
    let screen = await addAluminium(page, { kerf: 3 });
    const field = (label) => screen.getByLabel(label, { exact: true });
    await num(screen, "Opening width", 900);
    await expect(screen.getByTestId("alu-opening")).toHaveCount(0); // a width alone is not an opening
    await num(screen, "Opening height", 1200);
    // before: nothing happened until "Add opening" was pressed
    await expect(screen.getByTestId("alu-opening")).toHaveCount(1);
    await expect(opening(screen, "W01").getByTestId("alu-nominal")).toContainText("Opening 900 × 1,200 mm");
    await expect(opening(screen, "W01").getByRole("button", { name: /^W01 Left jamb 1,300 mm/ })).toBeVisible();
    await expect(field("Opening width")).toHaveValue(""); // ready for the next opening
    await expect(field("Opening height")).toHaveValue("");
    await expect(screen.getByRole("button", { name: /^Add (\d+ )?openings?$/ })).toHaveCount(0); // no Apply/Add step
    const card = screen.getByTestId("alu-just-added-opening");
    await expect(card).toContainText("Added W01 · 900 × 1,200 mm");
    // more of the same size: the copies join the addition's undo step
    await num(card, "How many of this size", 3);
    await expect(screen.getByTestId("alu-opening")).toHaveCount(3);
    for (const l of ["W01", "W02", "W03"]) await expect(opening(screen, l).getByTestId("alu-nominal")).toContainText("Opening 900 × 1,200 mm");
    await screen.getByRole("button", { name: "Undo" }).click();
    await expect(screen.getByTestId("alu-opening")).toHaveCount(0);
    await expect(screen.getByTestId("alu-just-added-opening")).toHaveCount(0);
    await screen.getByRole("button", { name: "Redo" }).click();
    await expect(screen.getByTestId("alu-opening")).toHaveCount(3);

    // valid numbers typed, then straight to Back with the height field still focused (the ph-07 probe). iOS delivers
    // the tap without moving focus off the field: dispatch the click so the field is NOT blurred first. Kept.
    await field("Opening width").fill("600");
    await field("Opening height").fill("2400");
    await screen.getByRole("button", { name: "Back" }).dispatchEvent("click");
    screen = await openCutting(page);
    await expect(screen.getByRole("heading", { name: "Openings (4)" })).toBeVisible();
    await expect(opening(screen, "W04").getByTestId("alu-nominal")).toContainText("Opening 600 × 2,400 mm");

    // the app is hidden mid-typing while offline (the ph-14 probe): the opening reaches device recovery and is restored
    await page.evaluate(() => { window.__takeoffReviewOffline = true; });
    await field("Opening width").fill("1200");
    await field("Opening height").fill("1500");
    await hideApp(page);
    await expect(screen.getByTestId("alu-opening")).toHaveCount(5);
    await expect.poll(() => recoveryCount(page)).toBeGreaterThan(0);
    await page.reload();
    await ready(page);
    await expect(page.getByText(/Unsaved changes from .* were found on this device\./)).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    screen = await openCutting(page);
    await expect(screen.getByTestId("alu-opening")).toHaveCount(5);
    await expect(opening(screen, "W05").getByTestId("alu-nominal")).toContainText("Opening 1,200 × 1,500 mm");
  });

  test("AL-25 F04 a recorded offcut keeps the profile and finish it was cut from (11 acceptance 4): after the finish or the section changes it is not used and says why; changing back uses it again", async ({ page }) => {
    await openTakeoff(page);
    let screen = await addAluminium(page, { kerf: 3 });
    await addCut(screen, { len: 600 });
    await recordOffcut(screen, { label: "OC1", len: 891 });
    const oc = screen.locator('[data-testid="alu-offcut"][data-offcut="OC1"]');
    await expect(oc).toContainText("891 mm");
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy nothing new");
    await expect(oc.getByTestId("alu-offcut-status")).toHaveText("In this plan: Cut 600");

    // a different finish: the mill offcut is not used — a bar is bought — and the offcut says why
    await screen.getByRole("button", { name: "Profile & cutting settings" }).click();
    const finish = setupDialog(page).getByLabel("Finish / colour");
    const original = await finish.inputValue();
    await finish.fill("Black anodised");
    screen = await toCutting(page);
    // before: "Buy nothing new" — the plan still cut the 600 from the mill offcut
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-offcuts-used")).toHaveCount(0);
    await expect(oc.getByTestId("alu-offcut-status")).toHaveText("Not used — recorded for a different profile or finish");

    // back to the original finish: the same piece is used again
    await screen.getByRole("button", { name: "Profile & cutting settings" }).click();
    await setupDialog(page).getByLabel("Finish / colour").fill(original);
    screen = await toCutting(page);
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy nothing new");
    await expect(oc.getByTestId("alu-offcut-status")).toHaveText("In this plan: Cut 600");

    // a smaller section (50 × 50 × 2): not used either
    await screen.getByRole("button", { name: "Profile & cutting settings" }).click();
    await num(setupDialog(page), "Thickness", 2);
    screen = await toCutting(page);
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(oc.getByTestId("alu-offcut-status")).toHaveText("Not used — recorded for a different profile or finish");
  });

  test("AL-26 PH-05 recheck: Undo clears what is still being typed first — never an earlier opening (wall-editor rule); a number typed but not applied is dropped, not applied later", async ({ page }) => {
    await openTakeoff(page);
    const screen = await addAluminium(page, { kerf: 3 });
    const field = (label) => screen.getByLabel(label, { exact: true });
    const undoBtn = screen.getByRole("button", { name: "Undo" });
    await addOpening(screen, { w: 900, h: 1200 });
    await expect(opening(screen, "W01").getByTestId("alu-nominal")).toContainText("Opening 900 × 1,200 mm");

    // the next opening typed (height still focused — iOS keeps focus on the field when Undo is tapped), then Undo.
    // Before: Undo removed W01 (900 × 1,200) and the typed 600 × 2,400 was then added as W01 when the field let go.
    await num(screen, "Opening width", 600);
    await field("Opening height").fill("2400");
    await undoBtn.dispatchEvent("click");
    await expect(field("Opening width")).toHaveValue("");
    await expect(field("Opening height")).toHaveValue("");
    await screen.getByRole("heading", { name: /^Openings/ }).click(); // tap elsewhere: nothing left to apply
    await expect(screen.getByTestId("alu-opening")).toHaveCount(1);
    await expect(opening(screen, "W01").getByTestId("alu-nominal")).toContainText("Opening 900 × 1,200 mm");

    // half an opening (width only, applied to the form with return): Undo clears it, W01 stays; the next Undo removes W01
    await num(screen, "Opening width", 700);
    await undoBtn.click();
    await expect(field("Opening width")).toHaveValue("");
    await expect(screen.getByTestId("alu-opening")).toHaveCount(1);
    await undoBtn.click();
    await expect(screen.getByTestId("alu-opening")).toHaveCount(0);
    await screen.getByRole("button", { name: "Redo" }).click();
    await expect(opening(screen, "W01").getByTestId("alu-nominal")).toContainText("Opening 900 × 1,200 mm");

    // an existing opening's width typed but not applied (still focused), then Undo: the stored width shows again
    const w01 = opening(screen, "W01");
    await w01.getByRole("button", { name: "Edit W01" }).click();
    await w01.getByLabel("Width", { exact: true }).fill("1111");
    await undoBtn.dispatchEvent("click");
    await expect(w01.getByLabel("Width", { exact: true })).toHaveValue("900");
    await screen.getByRole("heading", { name: /^Openings/ }).click();
    await expect(w01.getByTestId("alu-nominal")).toContainText("Opening 900 × 1,200 mm");
    await expect(w01.getByRole("button", { name: /^W01 Left jamb 1,300 mm/ })).toBeVisible();

    // an invalid number: Undo clears the draft and its message, the opening is not undone
    await num(w01, "Height", "abc");
    await expect(w01.getByRole("alert")).toHaveText("Enter a number greater than 0.");
    await undoBtn.click();
    await expect(w01.getByRole("alert")).toHaveCount(0);
    await expect(w01.getByLabel("Height", { exact: true })).toHaveValue("1200");
    await expect(screen.getByTestId("alu-opening")).toHaveCount(1);
  });
});
