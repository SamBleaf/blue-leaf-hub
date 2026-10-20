// @ts-check
// Hub review HUB 021 — reopen an unchanged plan without downloading it again (UI Review Mode, mocked backend).
// The fake server's plan bytes come from the fixture PDF, so every real download is a request Playwright can
// count and slow down. A plan kept on this device is used only while the snapshot lists the same stored hash.
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
const TAKEOFF = "/carpentry/cjb-1/takeoff?reviewRole=admin&section=flashings";

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
/** Count (and slow down) every real download of the plan's bytes. */
async function countPlan(page, delayMs = 2500, { abort = false } = {}) {
  const c = { hits: 0, abort };
  await page.route("**/synthetic-plan-set.pdf", async (route) => {
    c.hits += 1;
    if (c.abort) return route.abort("internetdisconnected");
    await new Promise((r) => setTimeout(r, delayMs));
    return route.continue();
  });
  return c;
}
const rendered = (page, timeout) => page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout });
/** the viewer's render count lives on window, so it is reset first — a remount must render THIS open */
const resetRenders = (page) => page.evaluate(() => { if (window.__takeoffViewerStats) window.__takeoffViewerStats.renders = 0; });
async function measure(page, timeout = 30_000) {
  await resetRenders(page);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await rendered(page, timeout);
}
/** Leave the takeoff to the section chooser and come back (the workspace view is unmounted and mounted again). */
async function reenter(page) {
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "‹ Back" }).click();
  await page.locator('[data-section="flashings"]').click();
  await expect(page.getByRole("heading", { level: 1, name: "Flashings" })).toBeVisible();
}
const plansOnDevice = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open("blh-takeoff-plans");
  r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains("meta")) return res([]); const q = db.transaction("meta", "readonly").objectStore("meta").getAll(); q.onsuccess = () => res(q.result.map((m) => ({ docId: m.docId, sha256: m.sha256 }))); };
  r.onerror = () => res([]);
}));

test("HUB 021: after one load, the plan reopens with no second download on a slow connection — after re-entering and after a reload", async ({ page }) => {
  const c = await countPlan(page);
  await page.goto(TAKEOFF); await ready(page);
  await measure(page);
  expect(c.hits).toBe(1);
  await expect.poll(() => plansOnDevice(page)).toEqual([{ docId: "doc-plan-c", sha256: "synthetic" }]);
  let sawDownload = false;
  await reenter(page);
  const watch = setInterval(async () => { if (await page.getByText(/Downloading plan/).isVisible().catch(() => false)) sawDownload = true; }, 100);
  await resetRenders(page);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await rendered(page, 1500);                       // far quicker than the 2.5 s download
  expect(c.hits).toBe(1);
  await page.reload(); await ready(page);
  await measure(page, 1500);
  clearInterval(watch);
  expect(c.hits).toBe(1);
  expect(sawDownload).toBe(false);
});

test("HUB 021: the plan opens with no signal — re-entering while offline, and a reload where the plan download fails", async ({ page, context }) => {
  const c = await countPlan(page, 0);
  await page.goto(TAKEOFF); await ready(page);
  await measure(page);
  await expect.poll(() => plansOnDevice(page)).toHaveLength(1);
  await context.setOffline(true);
  try {
    await reenter(page);
    await measure(page, 5000);
    await expect(page.getByText(/couldn.t be opened|No connection|Request failed|Network error/)).toHaveCount(0);
  } finally { await context.setOffline(false); }
  c.abort = true;                                   // the plan's own download now fails like a dead connection
  await page.reload(); await ready(page);
  await measure(page, 5000);
  expect(c.hits).toBe(1);
});

test("HUB 021: a replaced plan (new stored hash) downloads the new version once, with progress; then that copy is reused", async ({ page }) => {
  const c = await countPlan(page, 1500);
  await page.goto(TAKEOFF); await ready(page);
  await measure(page);
  expect(c.hits).toBe(1);
  await page.addInitScript(() => { window.__takeoffReviewPlanSha = "synthetic-v2"; });
  await page.reload(); await ready(page);
  await resetRenders(page);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await expect(page.getByText(/Downloading plan/)).toBeVisible();
  await rendered(page, 30_000);
  expect(c.hits).toBe(2);
  await expect.poll(() => plansOnDevice(page)).toEqual([{ docId: "doc-plan-c", sha256: "synthetic-v2" }]);
  await reenter(page);
  await measure(page, 1500);
  expect(c.hits).toBe(2);
});

test("HUB 021: the page this device was last on comes back after a reload (same plan, no download)", async ({ page }) => {
  const c = await countPlan(page, 0);
  await page.goto(TAKEOFF); await ready(page);
  await page.getByRole("button", { name: "Set up plans" }).click();
  await page.getByRole("button", { name: /^Page 2/ }).click();
  await page.getByRole("button", { name: "Use page 2 as the main plan page" }).click();
  await expect(page.getByText(/· page 2/)).toBeVisible();
  await page.reload(); await ready(page);           // the fake server forgets its main page on reload — the device remembers
  await expect(page.getByText(/· page 2/)).toBeVisible();
  expect(c.hits).toBe(1);
});

test("HUB 021: with no device storage the plan still opens every time (it just downloads again), and no error shows", async ({ page }) => {
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, v) => { if (name === "blh-takeoff-plans") throw new DOMException("full", "QuotaExceededError"); return open(name, v); };
  });
  const c = await countPlan(page, 0);
  await page.goto(TAKEOFF); await ready(page);
  await measure(page);
  await reenter(page);
  await measure(page);
  expect(c.hits).toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
