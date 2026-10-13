// @ts-check
// Evidence capture: the COMPLETE takeoff workflow against the local sandbox (real server code,
// real SQL, real PDF render) — step screenshots + video. Run via playwright.takeoff-evidence.config.js
// (projects: desktop Chromium as a director; WebKit "iPhone 13" with touch as a leading hand).
//   npm run takeoff:sandbox -- --reset src/ui-review/fixtures/takeoff/synthetic-plan-set.pdf
//   TAKEOFF_SANDBOX_URL=http://localhost:5181 npx playwright test --config=playwright.takeoff-evidence.config.js
import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.TAKEOFF_SANDBOX_URL;
const JOB = "5a4db0c5-0000-4000-8000-00000000a001";
const OUT = process.env.TAKEOFF_EVIDENCE_DIR || "docs/takeoff/evidence/workflow";
const meta = JSON.parse(readFileSync(new URL("../../src/ui-review/fixtures/takeoff/synthetic-plan-set.json", import.meta.url), "utf8"));
const k = meta.pages[0].pdfUnitsPerMm, BX = 120, BY = 150;
test.skip(!BASE, "set TAKEOFF_SANDBOX_URL (local sandbox) to capture");

test("complete takeoff workflow", async ({ page, isMobile }, info) => {
  test.setTimeout(240_000);
  const dir = `${OUT}/${info.project.name}`;
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const steps = [];
  const shot = async (name, note) => { n++; const f = `${String(n).padStart(2, "0")}-${name}.png`; await page.screenshot({ path: `${dir}/${f}` }); steps.push({ file: f, note }); };
  const tapAt = async (x, y) => (isMobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const tapPdf = async (p) => {
    const s = await page.evaluate((pt) => { const el = document.querySelector("[data-takeoff-viewport]"); const v = el.takeoffViewport.toScreen(pt); const r = el.getBoundingClientRect(); return { x: r.left + v.x, y: r.top + v.y }; }, p);
    await tapAt(s.x, s.y);
  };
  const viewer = async () => { await page.locator("[data-takeoff-viewport]").first().waitFor({ timeout: 30_000 }); await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 }); await page.waitForTimeout(600); };
  const at = (x, y) => ({ x: BX + x * k, y: BY + y * k });
  // zoom in on a point (as a pinch would) — on a phone, a printed dimension at fit-to-page is only a few
  // dozen pixels long, and a 1 px tap error would fail the 0.5% check (which is the point of the check)
  const zoomOn = async (p, f) => { await page.evaluate(({ pt, fac }) => document.querySelector("[data-takeoff-viewport]").takeoffViewport.zoomOn(pt, fac), { pt: p, fac: f }); await page.waitForTimeout(500); };

  const url = isMobile ? `${BASE}/worker/takeoff/carpentry/${JOB}` : `${BASE}/carpentry/${JOB}/takeoff?reviewRole=admin`;
  await page.goto(url);
  const start = page.getByRole("button", { name: "Start a flashing takeoff" });
  await start.waitFor({ timeout: 15_000 });
  await shot("job-takeoffs-empty", "Job takeoffs — no takeoff yet");
  await start.click();
  await expect(page.getByRole("heading", { name: "Flashings" })).toBeVisible();
  await shot("takeoff-overview", "New takeoff: plan not scaled, no materials");

  // plan setup — primary page
  await page.getByRole("button", { name: "Set up plans" }).click();
  await page.getByRole("button", { name: /Use page 1 as the main plan page/ }).waitFor();
  await page.waitForTimeout(1500);
  await shot("plan-setup", "Plan setup — page thumbnails, choose the primary floor-plan page");
  await page.getByRole("button", { name: /Use page 1 as the main plan page/ }).click();

  // calibration — horizontal, vertical, independent check
  await page.getByRole("button", { name: "Scale this page" }).click();
  await viewer();
  await page.getByRole("button", { name: "Scale the whole page" }).click();
  // careful calibration, as the screen instructs: zoom in on EACH end before tapping it
  const tapZoomed = async (p) => { await zoomOn(p, 1); await tapPdf(p); };
  await zoomOn(at(0, -40 / k), 6);
  await tapZoomed(at(0, -40 / k)); await tapZoomed(at(12000, -40 / k));
  await page.getByRole("textbox", { name: "Horizontal dimension" }).fill("12000"); await page.keyboard.press("Enter");
  await shot("calibrate-horizontal", "Horizontal: zoomed in on each end of the printed 12,000 dimension (second point locked horizontal)");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await tapZoomed(at(-40 / k, 0)); await tapZoomed(at(-40 / k, 8000));
  await page.getByRole("textbox", { name: "Vertical dimension" }).fill("8000"); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/Both directions agree/)).toBeVisible();
  await shot("calibrate-agreement", "Horizontal and vertical scales agree within 0.5% → one uniform scale");
  await page.getByRole("button", { name: /Next: check/ }).click();
  await tapZoomed(at(0, 8000 + 30 / k)); await tapZoomed(at(3000, 8000 + 30 / k));
  await page.getByRole("textbox", { name: "Printed check dimension" }).fill("3000"); await page.keyboard.press("Enter");
  await expect(page.getByText(/Scale is ready/)).toBeVisible();
  await shot("calibrate-check-ready", "Independent check on a third printed dimension → Ready");
  await page.getByRole("button", { name: "Save scale" }).click();

  // no material yet → draw a new flashing on the blank grid
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Add material" }).click();
  await shot("choose-material", "Choose material — company standards, Draw new flashing, pieces-only");
  await page.getByRole("button", { name: "Draw new flashing" }).click();
  const dlg = page.getByRole("dialog", { name: "Flashing" });
  await expect(dlg.getByText("Tap where the profile starts.")).toBeVisible();
  await page.waitForTimeout(300);
  await shot("flashing-blank-grid", "New flashing opens on an EMPTY grid");
  const gb = await dlg.locator("[data-takeoff-viewport]").boundingBox();
  for (const [fx, fy] of [[0.25, 0.75], [0.25, 0.3], [0.65, 0.3], [0.65, 0.42]]) await tapAt(gb.x + gb.width * fx, gb.y + gb.height * fy);
  await expect(dlg.getByText("3 legs drawn")).toBeVisible();
  await shot("flashing-tapped-out", "Shape tapped out leg by leg (lengths to 5 mm, angles to 15°)");
  await dlg.getByRole("button", { name: "Done drawing" }).click();
  await dlg.getByRole("button", { name: /^Edit End treatment/ }).click();
  await dlg.getByRole("button", { name: "Closed hem" }).click();
  await dlg.getByRole("button", { name: "Apply" }).click();
  await shot("flashing-closed-hem", "Closed hem added — drawn as a 180° fold; blue band = coated face");
  await dlg.getByRole("button", { name: "Save profile" }).click();
  await page.getByRole("combobox", { name: "Colour", exact: true }).fill("Monument");
  await shot("material-rules", "Material + ordering rules (allowance 200, round 100, flag >6000, ceiling 9000)");
  await page.getByRole("button", { name: "Save material" }).click();

  // measure: connected runs (each corner ends a run), a long run, then a count
  await viewer();
  // (taps land on whole screen pixels, so runs are kept off exact 100 mm boundaries)
  await tapPdf(at(1000, 2000)); await tapPdf(at(5312, 2000)); await tapPdf(at(5312, 4950));
  await expect(page.getByText(/Measured 2,9\d\d(\.\d)? \+ allowance 200 → order 3,200 mm/)).toBeVisible();
  await page.getByRole("button", { name: "End this line" }).click();
  await tapPdf(at(0, 6000)); await tapPdf(at(6950, 6000));
  await expect(page.getByText(/Measured 6,9\d\d(\.\d)? \+ allowance 200 → order 7,200 mm/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await shot("measure-runs", "Measured runs: connected 4,312 → 4,600 and 2,950 → 3,200 (each corner ends a run); 6,950 → 7,200 (long piece)");
  await page.getByRole("radio", { name: "Count" }).click();
  await page.getByRole("textbox", { name: /Finished length/ }).fill("2400"); await page.keyboard.press("Enter");
  for (const x of [9000, 9500, 10000]) await tapPdf(at(x, 1000));
  await expect(page.getByText(/Counted 3 × 2,400 mm/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await shot("measure-count", "Count: finished length first (no allowance), then tap each occurrence — Saved");
  await page.getByRole("button", { name: "Done" }).click();

  // schedule + explicit split of the 7,200
  await page.getByRole("button", { name: "Open schedule" }).click();
  await page.getByRole("button", { name: /7,200 mm/ }).click();
  await shot("schedule", "Length schedule — qty × finished length, explanation on expansion, long-piece flag");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByLabel("Piece 1 length").fill("3700"); await page.getByLabel("Piece 1 length").press("Tab");
  await page.getByLabel("Lap at joint 1").fill("200"); await page.getByLabel("Lap at joint 1").press("Tab");
  await page.getByLabel("Piece 2 length").fill("3700"); await page.getByLabel("Piece 2 length").press("Tab");
  await expect(page.getByText(/coverage 7,200 mm/)).toBeVisible();
  await shot("split", "Explicit split: 3,700 + 3,700 − 200 lap = 7,200 coverage (no second allowance)");
  await page.getByRole("button", { name: "Apply split" }).click();
  await expect(page.getByRole("button", { name: /3,700 mm/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("dialog", { name: "Length schedule" }).getByRole("button", { name: "Back" }).click();

  // order → export (real PDF) → (director) record as placed
  await page.getByRole("button", { name: /Review & export order|Orders/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  await expect(page.getByText(/^Ready: \d+ pieces/)).toBeVisible({ timeout: 20_000 });
  await shot("order-review", "Order review — supplier (Fielders default), delivery, lengths still needed, readiness");
  await page.getByRole("button", { name: "Export supplier PDF" }).click();
  await expect(page.getByText(/is frozen\. Nothing has been sent\./)).toBeVisible({ timeout: 30_000 });
  await shot("order-exported", "Export frozen — nothing sent, nothing ordered");
  // save the exported PDF as evidence
  const pdf = await page.evaluate(async ({ job, mobile }) => {
    const base = mobile ? "/api/worker/takeoff" : "/api/takeoff";
    const j = await (await fetch(`${base}/jobs/carpentry/${job}`)).json();
    const o = await (await fetch(`${base}/workspaces/${j.workspaces[0].id}/orders`)).json();
    const ex = o.orders.at(-1).exports.at(-1);
    const r = await fetch(`${base}/exports/${ex.id}/pdf`);
    return Array.from(new Uint8Array(await r.arrayBuffer()));
  }, { job: JOB, mobile: isMobile });
  writeFileSync(`${dir}/supplier-order.pdf`, Buffer.from(pdf));
  if (!isMobile) {
    await page.getByRole("button", { name: "Record order placed…" }).click();
    await page.getByLabel("Which PDF did you send?").selectOption({ index: 1 });
    await page.getByRole("textbox", { name: "Supplier reference" }).fill("SO-WALKTHROUGH");
    await page.getByRole("button", { name: "Record order placed", exact: true }).click();
    await expect(page.getByText("Placed externally")).toBeVisible();
    await shot("order-placed", "Director records the order as placed externally (SO ref + date); order locked");
  } else {
    await expect(page.getByRole("button", { name: "Record order placed…" })).toHaveCount(0);
    await shot("order-history-worker", "Leading hand can export but cannot record a placed order (director only)");
  }
  const engine = page.context().browser();
  const browser = `${engine.browserType().name()} ${engine.version()}`;
  const viewport = JSON.stringify(page.viewportSize());
  const ua = await page.evaluate(() => navigator.userAgent);
  // the video is only complete once the page closes
  await page.close();
  const video = page.video();
  if (video) await video.saveAs(`${dir}/workflow.webm`);
  writeFileSync(`${dir}/STEPS.md`, `# ${info.project.name} — complete takeoff workflow (real local sandbox backend)\n\nBrowser engine: Playwright ${browser}${isMobile ? " · mobile emulation with touch (not a physical device)" : ""} · viewport ${viewport}\nUser agent: \`${ua}\`\n\n${steps.map((s, i) => `${i + 1}. \`${s.file}\` — ${s.note}`).join("\n")}\n\nVideo of the whole run: \`workflow.webm\`\nSupplier PDF exported in this run: \`supplier-order.pdf\`\n`);
});
