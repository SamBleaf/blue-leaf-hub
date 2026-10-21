// @ts-check
// Hub review HUB 025 — explain the aluminium Conflict status (Recording review 06, 1487.mp4 01:51–02:09: "Conflict" in
// the header, then "That was already saved."). Cause: unticking and re-ticking an opening landed in ONE save, which the
// server refuses (it adds the new assignment before it archives the old one). The mock now has the server's rules
// (one live assignment per measurement + material, idempotent replay), so these run against the real behaviour.
//   UI_REVIEW_PORT=5196 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-hub025.spec.js
// Phone 390 × 844, mixed seed (Window angle 50 × 50 × 3 with wall openings W1 and W2, kerf 3 confirmed).
import { test, expect } from "@playwright/test";

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true };
const MIXED = "/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=mixed";

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
async function openRow(row) {
  const t = row.locator("button[aria-expanded]").first();
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  return row;
}
const setupDialog = (page) => page.getByRole("dialog", { name: "Aluminium" });
const cutting = (page) => page.getByRole("dialog", { name: /Window angle/ });
const chipOf = (scope) => scope.getByRole("status").first(); // the header save chip
const mockState = (page) => page.evaluate(() => window.__takeoffReviewState());

async function openSetup(page) {
  await openRow(page.getByRole("listitem").filter({ hasText: "Window angle 50 × 50 × 3" }));
  await page.getByRole("listitem").filter({ hasText: "Window angle 50 × 50 × 3" }).getByRole("button", { name: "Setup" }).click();
  await expect(setupDialog(page)).toBeVisible();
  return setupDialog(page);
}
async function toCutting(page) {
  await setupDialog(page).getByRole("button", { name: "Openings & cutting" }).click();
  await expect(cutting(page).getByTestId("aluminium-screen")).toBeVisible();
  return cutting(page);
}
async function start(page) {
  await page.goto(MIXED);
  await ready(page);
  await expect(page.getByRole("heading", { level: 1, name: "Timber and cladding" })).toBeVisible();
}
/** Record every save-chip text and whether "That was already saved." ever appears (a badge can flash between polls). */
async function watchSaves(page) {
  await page.evaluate(() => {
    const seen = { chips: new Set(), alreadySaved: false };
    window.__hub025Seen = seen;
    const look = () => {
      for (const el of document.querySelectorAll("[role=status]")) seen.chips.add((el.textContent || "").trim());
      if ((document.body.textContent || "").includes("That was already saved.")) seen.alreadySaved = true;
    };
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true });
    look();
  });
}
const seenSaves = (page) => page.evaluate(() => ({ chips: [...window.__hub025Seen.chips], alreadySaved: window.__hub025Seen.alreadySaved }));
/** Commit straight to the mocked server, as another device would (this page's workspace state doesn't know). */
async function otherDevice(page, changes) {
  const r = await page.evaluate(async (ch) => {
    const body = { expectedRevision: window.__takeoffReviewState().revision, idempotencyKey: `other-${Math.random()}`, changes: ch };
    return (await fetch("/api/takeoff/workspaces/ws-1/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  }, changes);
  expect(r.ok, r.error).toBe(true);
}
/** Leave the takeoff and come back inside the SPA: it reloads from the mocked server (a page reload would re-seed it). */
async function reopen(page) {
  await page.evaluate(() => { history.pushState({}, "", "/carpentry/cjb-1"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(300);
  await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, MIXED);
  await expect(page.getByRole("heading", { level: 1, name: "Timber and cladding" })).toBeVisible();
}
async function num(scope, label, v) {
  const f = scope.getByLabel(label, { exact: true });
  await f.fill(String(v));
  await f.press("Enter");
}
const aluPairs = (st) => st.contributions.filter((c) => c.jobMaterialId === "mat-al").map((c) => c.measurementId).sort();

test.describe("HUB 025 aluminium save status (phone)", () => {
  test.use(PHONE);

  test("A recorded path: untick W2 and tick it straight back in the same save → Saved, never Conflict or 'That was already saved.'; the kerf after it saves too", async ({ page }) => {
    await start(page);
    await openSetup(page);
    const screen = await toCutting(page);
    await watchSaves(page);
    const walls = screen.getByTestId("alu-wall-openings");
    const chip = chipOf(screen);
    // hold an earlier save in flight (a slow phone signal), so the untick AND the tick of W2 both wait for the same save
    await page.evaluate(() => { window.__takeoffReviewCommitDelayMs = 1500; });
    await walls.getByRole("checkbox", { name: /W1/ }).uncheck();
    await expect(chip).toHaveText("Saving…");
    await walls.getByRole("checkbox", { name: /W2/ }).uncheck();
    await walls.getByRole("checkbox", { name: /W2/ }).check();
    await page.evaluate(() => { window.__takeoffReviewCommitDelayMs = 0; });
    await expect(chip).toHaveText("Saved", { timeout: 10_000 });
    await expect(walls.getByRole("checkbox", { name: /W2/ })).toBeChecked();
    expect(aluPairs(await mockState(page))).toEqual(["m-w2"]); // W2 counted once on the server, W1 off
    // tick W1 back after its save landed, then change the kerf in the setup: both save
    await walls.getByRole("checkbox", { name: /W1/ }).check();
    await expect(chip).toHaveText("Saved", { timeout: 10_000 });
    await screen.getByRole("button", { name: "Profile & cutting settings" }).click();
    const setup = setupDialog(page);
    await num(setup, "Saw kerf", 4);
    await setup.getByLabel(/saw kerf above is confirmed/).check();
    await expect(chipOf(setup)).toHaveText("Saved", { timeout: 10_000 });
    await expect(setup.getByTestId("save-problem")).toHaveCount(0);
    const seen = await seenSaves(page);
    expect(seen.chips).not.toContain("Conflict");
    expect(seen.chips).not.toContain("Not saved");
    expect(seen.alreadySaved).toBe(false);
    let st = await mockState(page);
    expect(aluPairs(st)).toEqual(["m-w1", "m-w2"]);
    expect(st.specs["mat-al"]).toMatchObject({ kerfMm: 4, kerfConfirmed: true });
    // leave and come back (reloads from the server): W1 and W2 counted, kerf 4 confirmed
    await setup.getByRole("button", { name: "Close" }).click();
    await reopen(page);
    const again = await openSetup(page);
    await expect(again.getByLabel("Saw kerf", { exact: true })).toHaveValue("4");
    await expect(again.getByLabel(/saw kerf above is confirmed/)).toBeChecked();
    const back = await toCutting(page);
    await expect(back.getByTestId("alu-wall-openings").getByRole("checkbox", { name: /W1/ })).toBeChecked();
    await expect(back.getByTestId("alu-wall-openings").getByRole("checkbox", { name: /W2/ })).toBeChecked();
    await expect(back.getByTestId("alu-required")).toHaveText("7,300 mm");
    st = await mockState(page);
    expect(aluPairs(st)).toEqual(["m-w1", "m-w2"]);
  });

  test("B no-change save: re-entering the same kerf, or unconfirming and confirming it in one save, shows Saved with no banner", async ({ page }) => {
    await start(page);
    const setup = await openSetup(page);
    await watchSaves(page);
    const commits0 = (await mockState(page)).commits;
    await num(setup, "Saw kerf", 3); // the same value: nothing to save
    await expect(chipOf(setup)).toHaveText("Saved");
    await page.waitForTimeout(800);
    expect((await mockState(page)).commits).toBe(commits0);
    // a save that sends the material unchanged (off and on again within half a second)
    const box = setup.getByLabel(/saw kerf above is confirmed/);
    await box.uncheck();
    await box.check();
    await expect.poll(async () => (await mockState(page)).commits).toBe(commits0 + 1);
    await expect(chipOf(setup)).toHaveText("Saved");
    await expect(setup.getByTestId("save-problem")).toHaveCount(0);
    expect((await mockState(page)).specs["mat-al"]).toMatchObject({ kerfMm: 3, kerfConfirmed: true });
    const seen = await seenSaves(page);
    expect(seen.chips).not.toContain("Conflict");
    expect(seen.chips).not.toContain("Not saved");
  });

  test("C a lost reply is replayed (same key) and shows Saved, not Conflict; the cut is saved once", async ({ page }) => {
    await start(page);
    await openSetup(page);
    const screen = await toCutting(page);
    await watchSaves(page);
    const st0 = await mockState(page);
    await page.evaluate(() => { window.__takeoffReviewDropResponse = true; });
    await screen.getByLabel("Cut label (optional)").fill("HUB025");
    await num(screen, "Finished cut length", 1234);
    await expect.poll(async () => (await seenSaves(page)).chips).toContain("Not synced");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(chipOf(screen)).toHaveText("Saved", { timeout: 10_000 });
    const st = await mockState(page);
    expect(st.revision).toBe(st0.revision + 1);          // applied once
    expect(st.commits).toBeGreaterThanOrEqual(st0.commits + 2); // the lost one + its replay
    expect(st.measurements).toBe(st0.measurements + 1);  // the cut exists once
    await expect(screen.getByText("Extra straight cuts (1)")).toBeVisible();
    const seen = await seenSaves(page);
    expect(seen.chips).not.toContain("Conflict");
    expect(seen.chips).not.toContain("Not saved");
  });

  test("D a real conflict in the setup window: the window itself names the edit and offers both choices; both versions kept until Apply my changes to latest", async ({ page }) => {
    await start(page);
    const setup = await openSetup(page);
    const st0 = await mockState(page);
    // another device changes the finish
    await otherDevice(page, { materials: { upsert: [{ id: "mat-al", name: "Window angle 50 × 50 × 3", methodKey: "linear_stock", spec: { ...st0.specs["mat-al"], finish: "Anodised clear" }, rules: {} }] } });
    await num(setup, "Saw kerf", 4);
    await expect(chipOf(setup)).toHaveText("Conflict", { timeout: 10_000 });
    const banner = setup.getByTestId("save-problem");
    await expect(banner).toContainText("Someone else saved this takeoff while you were working.");
    await expect(banner).toContainText("Not saved yet: Window angle 50 × 50 × 3 setup");
    await expect(banner).toContainText("Your version is kept on this device.");
    await expect(banner.getByRole("button", { name: "Apply my changes to latest" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Discard mine and load latest" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("hub025-setup-conflict-390x844.png") });
    // both versions kept: theirs on the server, mine on the screen; nothing is sent while waiting
    const st1 = await mockState(page);
    expect(st1.specs["mat-al"]).toMatchObject({ finish: "Anodised clear", kerfMm: 3 });
    await expect(setup.getByLabel("Saw kerf", { exact: true })).toHaveValue("4");
    await page.waitForTimeout(1200);
    expect((await mockState(page)).commits).toBe(st1.commits);
    await banner.getByRole("button", { name: "Apply my changes to latest" }).click();
    await expect(chipOf(setup)).toHaveText("Saved", { timeout: 10_000 });
    await expect(setup.getByTestId("save-problem")).toHaveCount(0);
    expect((await mockState(page)).specs["mat-al"]).toMatchObject({ finish: "Anodised clear", kerfMm: 4 }); // theirs AND mine
    await expect(setup.getByLabel("Finish / colour")).toHaveValue("Anodised clear");
    await expect(setup.getByLabel("Saw kerf", { exact: true })).toHaveValue("4");
  });

  test("E a real conflict on Openings & cutting: the same banner and choices there; Discard mine and load latest shows their version and keeps mine on this device", async ({ page }) => {
    await start(page);
    await openSetup(page);
    const screen = await toCutting(page);
    await otherDevice(page, {
      measurements: { upsert: [{ id: "m-theirs", kind: "manual", finishedLengthMm: 900, quantity: 1, label: "THEIRS" }] },
      contributions: { upsert: [{ id: "c-theirs", measurementId: "m-theirs", jobMaterialId: "mat-al", role: "primary" }] },
    });
    await screen.getByLabel("Cut label (optional)").fill("MINE");
    await num(screen, "Finished cut length", 1234);
    await expect(chipOf(screen)).toHaveText("Conflict", { timeout: 10_000 });
    const banner = screen.getByTestId("save-problem");
    await expect(banner).toContainText("Not saved yet: MINE added to Window angle 50 × 50 × 3");
    await expect(banner.getByRole("button", { name: "Apply my changes to latest" })).toBeVisible();
    await expect(banner).not.toContainText("That was already saved.");
    await page.screenshot({ path: test.info().outputPath("hub025-cutting-conflict-390x844.png") });
    await banner.getByRole("button", { name: "Discard mine and load latest" }).click();
    await expect(chipOf(screen)).toHaveText("Saved");
    await expect(screen.getByText("Extra straight cuts (1)")).toBeVisible();
    await expect(screen.getByText(/THEIRS/).first()).toBeVisible();
    await expect(screen.getByText(/MINE/)).toHaveCount(0);
    // my edit is still kept in this device's recovery store (offered the next time the takeoff opens)
    const rec = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open("blh-takeoff-recovery", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      return new Promise((res) => { const g = db.transaction("drafts").objectStore("drafts").get("staff:review-admin|ws-1"); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); });
    });
    expect(rec).not.toBeNull();
    expect(JSON.stringify(rec.changes)).toContain("MINE");
  });
  test("F a refusal that isn't someone else's save (409 DUPLICATE_ASSIGNMENT from an older app) is Not saved with its plain reason, Try again and Discard; never Conflict; later edits keep saving", async ({ page }) => {
    await start(page);
    await openSetup(page);
    const screen = await toCutting(page);
    await watchSaves(page);
    const text = "This item is already counted for the same material, so this change wasn't saved. Discard it, then add it again if you still need it.";
    await page.evaluate((error) => { window.__takeoffReviewRefuse = { status: 409, error, code: "DUPLICATE_ASSIGNMENT" }; }, text);
    await screen.getByLabel("Cut label (optional)").fill("REFUSED");
    await num(screen, "Finished cut length", 1111);
    await expect(chipOf(screen)).toHaveText("Not saved", { timeout: 10_000 });
    const banner = screen.getByTestId("save-problem");
    await expect(banner).toContainText(`Not saved: ${text}`);
    await expect(banner.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Discard" })).toBeVisible();
    // a later edit still saves, and the refused one keeps its reason and choices
    await page.evaluate(() => { window.__takeoffReviewRefuse = 0; });
    const st0 = await mockState(page);
    await screen.getByLabel("Cut label (optional)").fill("LATER");
    await num(screen, "Finished cut length", 2222);
    await expect.poll(async () => (await mockState(page)).measurements).toBe(st0.measurements + 1);
    await expect(chipOf(screen)).toHaveText("Not saved");
    await expect(banner).toContainText(`Not saved: ${text}`);
    await banner.getByRole("button", { name: "Discard" }).click();
    await expect(chipOf(screen)).toHaveText("Saved");
    await expect(screen.getByTestId("save-problem")).toHaveCount(0);
    expect((await seenSaves(page)).chips).not.toContain("Conflict");
  });

  test("G the server's other conflict answer (409 CONFLICT_RETRY: the takeoff kept changing while it was read) is a Conflict: the edit stays on screen with both choices, never Not saved", async ({ page }) => {
    await start(page);
    await openSetup(page);
    const screen = await toCutting(page);
    await watchSaves(page);
    await page.evaluate(() => { window.__takeoffReviewRefuse = { status: 409, error: "The takeoff changed while loading — reload.", code: "CONFLICT_RETRY" }; });
    const st0 = await mockState(page);
    await screen.getByLabel("Cut label (optional)").fill("RETRY");
    await num(screen, "Finished cut length", 1333);
    await expect(chipOf(screen)).toHaveText("Conflict", { timeout: 10_000 });
    const banner = screen.getByTestId("save-problem");
    await expect(banner).toContainText("Someone else saved this takeoff while you were working.");
    await expect(banner).toContainText("Not saved yet: RETRY added to Window angle 50 × 50 × 3");
    await expect(banner.getByRole("button", { name: "Apply my changes to latest" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Discard mine and load latest" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await expect(screen.getByText(/RETRY/).first()).toBeVisible();   // my edit is still on the screen
    expect((await mockState(page)).measurements).toBe(st0.measurements);
    // once the other device stops saving, Apply my changes to latest saves mine
    await page.evaluate(() => { window.__takeoffReviewRefuse = 0; });
    await banner.getByRole("button", { name: "Apply my changes to latest" }).click();
    await expect(chipOf(screen)).toHaveText("Saved", { timeout: 10_000 });
    await expect(screen.getByTestId("save-problem")).toHaveCount(0);
    await expect.poll(async () => (await mockState(page)).measurements).toBe(st0.measurements + 1);
    expect((await seenSaves(page)).chips).not.toContain("Not saved");
  });
});
