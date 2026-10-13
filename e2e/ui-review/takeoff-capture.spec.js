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

  // ── A01: Add flashing → draw on the empty grid → correct sizes on the drawing → crush fold (2 taps) ──
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Add flashing" }).click();
  await shot("choose-flashing", "Choose flashing — company standards, New flashing, pieces-only");
  await page.getByRole("button", { name: "New flashing" }).click();
  const dlg = page.getByRole("dialog", { name: /^Flashing/ });
  await expect(dlg.getByText("Tap where the flashing starts.")).toBeVisible();
  await page.waitForTimeout(300);
  await shot("flashing-blank-grid", "New flashing opens on an EMPTY grid — header: Close · Undo · More only");
  const gb = await dlg.locator("[data-takeoff-viewport]").boundingBox();
  for (const [fx, fy] of [[0.25, 0.75], [0.25, 0.3], [0.65, 0.3], [0.65, 0.42]]) await tapAt(gb.x + gb.width * fx, gb.y + gb.height * fy);
  await expect(dlg.locator("svg text", { hasText: /^L3 / })).toBeVisible();
  await shot("flashing-tapped-out", "Shape tapped out (each tap = one leg; no Done-drawing step)");
  // tap the label's own box (its rect), as a finger would
  const tapSvgText = async (re) => { const bb = await dlg.locator("svg text", { hasText: re }).first().locator("xpath=../*[local-name()='rect']").boundingBox(); await tapAt(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  for (const [leg, mm] of [["L1", "100"], ["L2", "150"], ["L3", "75"]]) {
    await tapSvgText(new RegExp(`^${leg} `));
    await dlg.getByLabel(`${leg} length`).fill(mm);
    await expect(dlg.locator("svg text", { hasText: `${leg} ${mm}` })).toBeVisible();
  }
  await expect(dlg.getByRole("button", { name: /Apply|^Save/ })).toHaveCount(0);
  await shot("flashing-sizes", "Sizes typed straight onto the drawing — applied while typing, no Apply / Enter / Save");
  await dlg.getByRole("button", { name: "Done" }).click();
  const eb = await dlg.locator('[data-end-handle="end"]').boundingBox();
  await tapAt(eb.x + eb.width / 2, eb.y + eb.height / 2);                 // tap 1: the end
  await dlg.getByRole("button", { name: "Crush fold" }).click();          // tap 2: crush fold (10 mm, last-used side)
  await expect(dlg.locator("svg text", { hasText: /^Crush 10/ })).toBeVisible();
  await dlg.getByRole("button", { name: /Flip fold/ }).click();
  await shot("flashing-crush-fold", "Endpoint → Crush fold (2 taps), shown at once; Flip fold is one tap");
  await dlg.getByRole("button", { name: "Done" }).click();
  await expect(dlg.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await dlg.getByRole("button", { name: "Details" }).click();
  // ── Flashing details: dependent dropdowns, auto-applied ──
  await page.getByLabel("Colour", { exact: true }).selectOption("Monument");
  await expect(page.getByLabel("Thickness (BMT)")).toHaveValue("0.55");
  await shot("flashing-details", "Flashing details — Solid/Perforated, finish, BMT (0.55 company default), colour; saves automatically");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Lengths" }).click();

  // ── A09 lengths: two separate 4,321 runs + one 6,980 run (zoomed on each end for accuracy) ──
  await viewer();
  await page.getByRole("checkbox", { name: "Connected" }).uncheck();
  await zoomOn(at(1000, 2000), 8);
  for (const [a, b2] of [[at(1000, 2000), at(5321, 2000)], [at(1000, 3000), at(5321, 3000)], [at(0, 6000), at(6980, 6000)]]) {
    await tapZoomed(a); await tapZoomed(b2);
  }
  await expect(page.getByText(/Measured 6,9\d\d(\.\d)? \+ allowance 200 → order 7,200 mm/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await shot("measure-runs", "Measured runs 2 × 4,321 → 4,600 and 6,980 → 7,200 (long piece, kept whole + flagged)");
  await page.getByRole("button", { name: "Done" }).click();

  // two manual finished 3,000s (no allowance)
  await page.getByRole("button", { name: "Add lengths" }).first().click();
  await page.getByLabel("Finished length").fill("3000"); await page.getByLabel("Finished length").press("Tab");
  await page.getByLabel("Qty").fill("2"); await page.getByLabel("Qty").press("Tab");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/2 × 3,000 mm/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });

  // schedule + explicit split of the 7,200
  await page.getByRole("button", { name: "Open schedule" }).click();
  await page.getByRole("button", { name: /7,200 mm/ }).click();
  await shot("schedule", "Length schedule — the 7,200 is one piece with a handling flag and a Split action");
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

  // ── second colour (grouping isolation): same kind of flashing in Surfmist, 1 × 4,600 ──
  await page.getByRole("button", { name: "Add flashing" }).first().click();
  await page.getByRole("button", { name: "New flashing" }).click();
  const d2 = page.getByRole("dialog", { name: /^Flashing/ });
  const g2 = await d2.locator("[data-takeoff-viewport]").boundingBox();
  for (const [fx, fy] of [[0.3, 0.7], [0.3, 0.35], [0.6, 0.35]]) await tapAt(g2.x + g2.width * fx, g2.y + g2.height * fy);
  await expect(d2.locator("svg text", { hasText: /^L2 / })).toBeVisible();
  await expect(d2.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await d2.getByRole("button", { name: "Details" }).click();
  await page.getByLabel("Colour", { exact: true }).selectOption("Surfmist");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Add lengths" }).last().click();
  await page.getByLabel("Finished length").fill("4600"); await page.getByLabel("Finished length").press("Tab");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });

  // ── close / reload: profile, marks and lengths come back from the server ──
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Flashings" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^(Profile|View profile)$/ }).first().click();
  const back = page.getByRole("dialog", { name: /^Flashing/ });
  for (const t of ["L1 100", "L2 150", "L3 75", "Crush 10"]) await expect(back.locator("svg text", { hasText: t })).toBeVisible();
  await shot("reload-restored", "After a reload the drawing comes back from the server exactly");
  await back.getByRole("button", { name: "Close" }).click();
  // the schedule reconciles BEFORE ordering: Monument 2 × 4,600 + 2 × 3,700 + 2 × 3,000 = 6 pieces / 22,600 mm
  const sched = await page.evaluate(async ({ job, mobile }) => {
    const base = mobile ? "/api/worker/takeoff" : "/api/takeoff";
    const j = await (await fetch(`${base}/jobs/carpentry/${job}`)).json();
    const w = await (await fetch(`${base}/workspaces/${j.workspaces[0].id}`)).json();
    return w.computed.scheduleLines.map((l) => ({ spec: l.specKey, len: l.finishedLengthMm, qty: l.quantity, problems: l.problems }));
  }, { job: JOB, mobile: isMobile });
  const mono = sched.filter((l) => /monument/.test(l.spec)), surf = sched.filter((l) => /surfmist/.test(l.spec));
  expect(mono.map((l) => `${l.qty}×${l.len}`).sort()).toEqual(["2×3000", "2×3700", "2×4600"]);
  expect(mono.reduce((a, l) => a + l.qty * l.len, 0)).toBe(22600);
  expect(surf.map((l) => `${l.qty}×${l.len}`)).toEqual(["1×4600"]);
  writeFileSync(`${dir}/schedule.json`, JSON.stringify(sched, null, 2));

  // order → export (real PDF) → (director) record as placed
  await page.getByRole("button", { name: /Review & export order|Orders/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  // what the supplier needs: when (or ASAP) and who to call — never invented, asked for
  await page.getByLabel("As soon as possible").check();
  await page.getByRole("textbox", { name: "Contact phone" }).fill("0400 000 000");
  await page.getByRole("button", { name: "Save order details" }).click();
  await expect(page.getByText(/^Ready: \d+ pieces/)).toBeVisible({ timeout: 20_000 });
  await shot("order-review", "Order review — supplier (Fielders default), delivery, lengths still needed, readiness");
  await page.getByRole("button", { name: "Export draft PDF" }).click();
  await expect(page.getByText(/Export 1 \(draft\) is frozen/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Export supplier PDF" }).click();
  await expect(page.getByText(/Export 2 is frozen\. Nothing has been sent\./)).toBeVisible({ timeout: 30_000 });
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
  // read the REAL PDF back: every piece, length, spec and the crush fold must be on it
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, verbosity: 0 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) text += " " + (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ");
  for (const t of ["FLASHING ORDER", "COLORBOND · Monument · 0.55 BMT", "COLORBOND · Surfmist · 0.55 BMT", "L1 100 mm", "L2 150 mm", "L3 75 mm", "crush fold (closed hem) 10 mm",
    "4,600", "3,700", "3,000", "6 pieces · 22.600 LM", "Order total: 7 pieces · 27.200 LM", "Fielders"]) expect(text, `PDF missing "${t}"`).toContain(t);
  expect(text).not.toContain("DRAFT");
  writeFileSync(`${dir}/supplier-order.txt`, text);
  if (!isMobile) {
    await page.getByRole("button", { name: "Record order placed…" }).click();
    await page.getByLabel("Which PDF did you send?").selectOption({ label: "Export 2" });
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
