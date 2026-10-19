// @ts-check
// TC-R04 REAL-STACK JOURNEYS — the strongest evidence: the REAL app UI driven against an ISOLATED local takeoff
// sandbox (scripts/takeoff/sandbox.mjs: real server code, real Postgres with migrations 206 + 207, real pdfkit PDF
// renderer). Nothing on the takeoff path is mocked; nothing leaves this Mac; nothing is sent or ordered.
//
//   S0  start a takeoff, choose the plan page, scale it (horizontal + vertical + independent check)
//   J1  timber: Add timber → rafters 90 × 45 MGP10 H3, 600 centres, projected + 30° pitch, end allowance 100; member
//       line 4,500 + distribution line 10,000 drawn on the plan → 18 × 5,400; true length → no pitch (18 × 4,800)
//   J2  cladding: Add cladding → Axon 133 smooth; wall by numbers 4,800 × 2,700 + 900 × 900 window → 4 sheets,
//       net 12.15 m²; 4,801 → 5 sheets (and back to 4,800)
//   AL  aluminium (11): Add aluminium, kerf 3 confirmed; opening 600 × 2,400 → 2,500 / 2,500 / 600 on ONE 6,500 bar,
//       891 remainder
//   FL  flashing paths (13): new flashing (300 mm order step, HUB 005); four 750 legs as ONE path → one 3,300; a 10,000
//       path → red overflow → split at the limit → 9,000 + 1,500 → Split to handling length → 5,400 + 5,400
//   J5  order with timber pieces + Axon sheets + aluminium bars + flashing pieces; delivery / pickup details; a
//       NON-draft export; BOTH the supplier PDF and the site appendix downloaded, saved and read back as text
//
// Run via playwright.tc-evidence.config.js (desktop Chromium = director on the Hub route; WebKit "iPhone 13" with
// touch = leading hand on the Worker PWA route). Evidence → docs/takeoff/evidence/tc-journeys/<project>/.
// Each journey is recorded PASS / FAIL / BLOCKED (with the error) in results.json and SUMMARY.md; a failing journey
// does not hide the ones after it. The test itself fails if any journey did not pass.
//
// Taps: every plan point is panned into the middle of the view (as a user pans to it) and tapped on a WHOLE CSS
// pixel — WebKit truncates touch coordinates to whole pixels, so this is what makes the tapped geometry exact and
// the knife-edge fixtures (3,000 + 200 → 3,300; 1,200 + 200 → 1,500 at the 300 mm step) reproducible instead of ±1 px.
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { computeWorkspace } from "../../shared/takeoff/index.js";
import { anchorsFor } from "../../src/components/takeoff/measure/geometry.js";

const BASE = process.env.TAKEOFF_SANDBOX_URL;
const JOB = "5a4db0c5-0000-4000-8000-00000000a001";   // the sandbox's fixed (local-only) job id
const OUT = process.env.TC_EVIDENCE_DIR || "docs/takeoff/evidence/tc-journeys";
const meta = JSON.parse(readFileSync(new URL("../../src/ui-review/fixtures/takeoff/synthetic-plan-set.json", import.meta.url), "utf8"));
const k = meta.pages[0].pdfUnitsPerMm;   // page 1: 1:100 synthetic plan, 12,000 × 8,000 outline at (120, 150) pt
const BX = 120, BY = 150;
const at = (xMm, yMm) => ({ x: BX + xMm * k, y: BY + yMm * k });
const AXON_133 = "James Hardie|Axon 133 smooth|1200|9";

test.skip(!BASE, "set TAKEOFF_SANDBOX_URL to the ISOLATED sandbox (see playwright.tc-evidence.config.js)");
// never the owner's live preview (5180) or the owner's own sandbox (5181)
if (BASE && /:(5180|5181)(\/|$)/.test(BASE)) throw new Error(`Refusing to run against ${BASE} — use the isolated tc-evidence sandbox.`);

test("TC-R04 real-stack journeys", async ({ page, isMobile }, info) => {
  const project = info.project.name;
  const dir = `${OUT}/${project}`;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/^\d\d-.*\.png$/.test(f)) rmSync(`${dir}/${f}`, { force: true });   // stale shots of an earlier run
  const role = isMobile ? "leading hand (Worker PWA route, worker token)" : "director (Hub route, admin)";
  const url = isMobile ? `${BASE}/worker/takeoff/carpentry/${JOB}` : `${BASE}/carpentry/${JOB}/takeoff?reviewRole=admin`;
  const apiBase = isMobile ? "/api/worker/takeoff" : "/api/takeoff";

  // ── evidence ──────────────────────────────────────────────────────────────────────────────────────────────
  let n = 0;
  const steps = [];        // { journey, file, note }
  const results = [];      // { id, title, status, error?, observed }
  const findings = [];     // product defects / honest notes found while driving the UI
  const observed = {};     // numbers read back from the real server per journey
  let current = "S0";
  const shot = async (name, note) => {
    n++;
    const f = `${String(n).padStart(2, "0")}-${current}-${name}.png`;
    await page.screenshot({ path: `${dir}/${f}` }).catch(() => {});
    steps.push({ journey: current, file: f, note });
  };
  const note = (text) => steps.push({ journey: current, file: null, note: text });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${current}] ${m.text().slice(0, 400)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${current}] pageerror: ${e.message.slice(0, 400)}`));
  const popups = [];
  page.context().on("page", (p) => popups.push(p));

  // ── input helpers (mouse on desktop, touch on the phone) ─────────────────────────────────────────────────
  const press = async (loc) => { await loc.scrollIntoViewIfNeeded().catch(() => {}); return isMobile ? loc.tap() : loc.click(); };
  // HUB 002: one takeoff, two sections; material rows show their actions once tapped
  let curSection = "timber_cladding";
  const SECTION_H1 = { flashings: "Flashings", timber_cladding: "Timber and cladding" };
  const sectionHeading = () => page.getByRole("heading", { level: 1, name: /^(Flashings|Timber and cladding)$/ });
  const toSection = async (sec) => {
    curSection = sec;
    await press(page.getByRole("group", { name: "Takeoff section" }).getByRole("button", { name: SECTION_H1[sec], exact: true }));
    await expect(page.getByRole("heading", { level: 1, name: SECTION_H1[sec] })).toBeVisible();
  };
  const openRow = async (row) => {
    const t = row.locator("button[aria-expanded]").first();
    if ((await t.getAttribute("aria-expanded")) !== "true") await press(t);
    return row;
  };
  const tapAt = async (x, y) => (isMobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const num = async (loc, v) => { await loc.fill(String(v)); await loc.press("Enter"); };
  const vp = () => page.locator("[data-takeoff-viewport]").first();
  const screenOf = (p) => page.evaluate((pt) => {
    const el = document.querySelector("[data-takeoff-viewport]");
    const s = el.takeoffViewport.toScreen(pt); const r = el.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }, p);
  const pdfAtClient = (c) => page.evaluate((q) => {
    const el = document.querySelector("[data-takeoff-viewport]"); const r = el.getBoundingClientRect();
    return el.takeoffViewport.toPdf({ x: q.x - r.left, y: q.y - r.top });
  }, c);
  /** zoom by `f` on a PDF point (as a pinch there would), then centre it */
  const zoomOn = async (p, f) => { await page.evaluate(({ pt, fac }) => document.querySelector("[data-takeoff-viewport]").takeoffViewport.zoomOn(pt, fac), { pt: p, fac: f }); await page.waitForTimeout(250); };
  /**
   * Tap EXACTLY on a PDF point: pan it to the middle of the view, nudge the pan so it sits on a whole CSS pixel
   * (WebKit truncates touch coordinates to whole pixels; Chromium keeps float32), then tap that pixel.
   */
  const exactTap = async (p) => {
    await zoomOn(p, 1);
    const s = await screenOf(p);
    const I = { x: Math.floor(s.x), y: Math.floor(s.y) };
    const d = { x: s.x - I.x, y: s.y - I.y };
    if (d.x > 1e-6 || d.y > 1e-6) { await zoomOn(await pdfAtClient({ x: s.x + d.x, y: s.y + d.y }), 1); }
    const t = await screenOf(p);
    expect(Math.abs(t.x - Math.round(t.x)) < 1e-6 && Math.abs(t.y - Math.round(t.y)) < 1e-6, `point not on a whole pixel: ${JSON.stringify(t)}`).toBe(true);
    await tapAt(Math.round(t.x), Math.round(t.y));
  };
  const viewer = async () => {
    await vp().waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
    await page.waitForTimeout(600);
  };
  const saved = (scope = page) => expect(scope.getByRole("status").filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 20_000 });
  const focusWin = () => page.locator("[data-takeoff-focus]");
  /** leave every focused window by its header close button (Back / Done / Close / ‹ Walls) */
  const toOverview = async () => {
    for (let i = 0; i < 5 && await focusWin().count(); i++) { await press(focusWin().last().locator("header button").first()); await page.waitForTimeout(300); }
    await expect(sectionHeading()).toBeVisible({ timeout: 20_000 });
  };
  const recover = async () => {
    await page.goto(`${url}${url.includes("?") ? "&" : "?"}section=${curSection}`);
    await expect(sectionHeading()).toBeVisible({ timeout: 30_000 });
  };
  /** the REAL server's view of this takeoff (same API + credentials as the app on this route) */
  const server = () => page.evaluate(async ({ job, base }) => {
    const j = await (await fetch(`${base}/jobs/carpentry/${job}`)).json();
    const w = await (await fetch(`${base}/workspaces/${j.workspaces[0].id}`)).json();
    return w;
  }, { job: JOB, base: apiBase });
  const materialNamed = async (re) => (await server()).snapshot.materials.find((m) => re.test(m.name) || re.test(m.spec?.family || ""));
  const linesOf = (w, id) => w.computed.scheduleLines.filter((l) => l.jobMaterialIds.includes(id));
  const lineText = (l) => `${l.quantity} ${l.unit || "piece"} · ${l.item?.description || `${l.finishedLengthMm} mm`}`;

  async function journey(id, title, fn, needs = []) {
    current = id;
    const blocked = needs.filter((x) => results.find((r) => r.id === x)?.status !== "PASS");
    if (blocked.length) { results.push({ id, title, status: "BLOCKED", error: `needs ${blocked.join(", ")}` }); return; }
    const t0 = Date.now();
    try {
      await test.step(`${id} — ${title}`, fn);
      results.push({ id, title, status: "PASS", seconds: Math.round((Date.now() - t0) / 1000), observed: observed[id] });
    } catch (e) {
      const msg = String(e?.message || e).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "").split("\n").slice(0, 14).join("\n");
      await shot("FAILED", `FAILED: ${msg.split("\n")[0]}`);
      results.push({ id, title, status: "FAIL", seconds: Math.round((Date.now() - t0) / 1000), error: msg, observed: observed[id] });
      await recover().catch(() => {});
    }
  }

  // ═══ S0 — start a takeoff, choose the plan page, scale it ═══════════════════════════════════════════════════
  await journey("S0", "Start takeoff + plan setup + scale (12,000 / 8,000 / check 3,000)", async () => {
    await page.goto(url);
    const start = page.locator('[data-section="timber_cladding"]');
    await start.waitFor({ timeout: 30_000 });
    await expect(page.locator("[data-takeoff-sections] [data-section]")).toHaveCount(2);   // HUB 002: Flashings or Timber and cladding first
    await shot("job-takeoffs-empty", `Job takeoff on the ${isMobile ? "Worker PWA" : "Hub"} route — choose Flashings or Timber and cladding (fresh sandbox)`);
    await press(start);
    await expect(page.getByRole("heading", { level: 1, name: "Timber and cladding" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add timber" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add flashing" })).toHaveCount(0);
    await shot("takeoff-overview", "New takeoff, Timber and cladding section: plan not scaled; Add timber / cladding / aluminium (no flashing actions)");
    await press(page.getByRole("button", { name: "Set up plans" }));
    const usePage = page.getByRole("button", { name: /Use page 1 as the main plan page/ });
    await usePage.waitFor();
    await page.waitForTimeout(1200);
    await press(usePage);
    await press(page.getByRole("button", { name: "Scale this page" }));
    await viewer();
    await press(page.getByRole("button", { name: "Scale the whole page" }));
    await zoomOn(at(0, -40 / k), 4);
    await exactTap(at(0, -40 / k)); await exactTap(at(12000, -40 / k));
    await num(page.getByRole("textbox", { name: "Horizontal dimension" }), 12000);
    await shot("calibrate-horizontal", "Scale: both ends of the printed 12,000 dimension tapped, 12000 typed");
    await press(page.getByRole("button", { name: "Next", exact: true }));
    await exactTap(at(-40 / k, 0)); await exactTap(at(-40 / k, 8000));
    await num(page.getByRole("textbox", { name: "Vertical dimension" }), 8000);
    await press(page.getByRole("button", { name: "Next", exact: true }));
    await expect(page.getByText(/Both directions agree/)).toBeVisible();
    await press(page.getByRole("button", { name: /Next: check/ }));
    await exactTap(at(0, 8000 + 30 / k)); await exactTap(at(3000, 8000 + 30 / k));
    await num(page.getByRole("textbox", { name: "Printed check dimension" }), 3000);
    await expect(page.getByText(/Scale is ready/)).toBeVisible();
    await shot("calibrate-ready", "Horizontal + vertical agree; independent 3,000 check → Scale is ready");
    await press(page.getByRole("button", { name: "Save scale" }));
    await saved();
    const w = await server();
    const cal = w.snapshot.calibrations.at(-1);
    observed.S0 = { calibration: cal };
    note(`Server calibration record: status ${cal?.status}`);
    expect(cal?.status).toBe("ready");
    await toOverview();
    await expect(page.getByText(/page 1\s*Ready/)).toBeVisible();
  });

  // ═══ J1 — timber rafters ═══════════════════════════════════════════════════════════════════════════════════
  let timberId = null;
  await journey("J1", "Timber rafters: 4,500 projected @ 30° + 10,000 run → 18 × 5,400; true length → 18 × 4,800", async () => {
    await press(page.getByRole("button", { name: "Add timber" }));
    const t = page.locator('[data-setup="timber"]');
    await expect(t).toBeVisible();
    await t.getByLabel("Name", { exact: true }).fill("Rafters 90 × 45");
    await press(t.locator('[data-chips="purpose"]').getByRole("button", { name: "Rafters" }));
    await num(t.getByLabel("Section depth"), 90);
    await num(t.getByLabel("Section width"), 45);
    await t.getByLabel("Grade (e.g. MGP10)").fill("MGP10");
    await t.getByLabel("Treatment (e.g. H3)").fill("H3");
    await num(t.getByLabel("Centres", { exact: true }), 600);
    await press(t.locator('[data-chips="length-source"]').getByRole("button", { name: "Measure projection" }));
    await num(t.getByLabel("Pitch"), 30);
    await press(t.getByText("More (offsets, allowance, ends, plies, supplier)"));
    await num(t.getByLabel("End allowance (true length)"), 100);
    await saved();
    await expect.poll(async () => {
      const m = await materialNamed(/^Rafters 90 × 45$/);
      return m && [m.methodKey, m.spec.purpose, m.spec.section, m.spec.grade, m.spec.treatment, m.rules.centresMm, m.rules.lengthSource, m.rules.pitchDeg, m.spec.endAllowanceMm];
    }, { timeout: 20_000 }).toEqual(["repeated_members", "rafters", { depthMm: 90, widthMm: 45 }, "MGP10", "H3", 600, "projected", 30, 100]);
    timberId = (await materialNamed(/^Rafters 90 × 45$/)).id;
    await shot("timber-setup", "Timber setup: rafters 90 × 45 MGP10 H3, 600 centres, measure projection, pitch 30°, end allowance 100 (auto-saved)");
    await press(page.getByRole("button", { name: "Measure members" }));
    await viewer();
    await expect(page.getByRole("radio", { name: "Member" })).toHaveAttribute("aria-checked", "true");
    await zoomOn(at(1000, 3250), 2);
    await exactTap(at(1000, 1000)); await page.waitForTimeout(450); await exactTap(at(1000, 5500));
    await expect(page.locator('[data-kind="member"]')).toHaveCount(1);
    const mp = page.locator("[data-member-panel]");
    await expect(mp).toContainText(/Member line 4,500(\.0+)? mm measured in plan \(projected\)/);
    await expect(mp).toContainText(/5,196(\.\d+)? mm true at 30°/);
    await expect(page.getByLabel("Roof pitch")).toHaveValue("30");
    await saved();
    await press(page.getByRole("button", { name: "Fit page" })); await page.waitForTimeout(400);
    await shot("member-line", "Member line tapped on the plan: 4,500 mm projected → 5,196 mm true at 30°");
    await press(page.getByRole("radio", { name: "Distribution" }));
    await zoomOn(at(6000, 7000), 1);
    await exactTap(at(1000, 7000)); await page.waitForTimeout(450); await exactTap(at(11000, 7000));
    const dist = page.locator('[data-kind="distribution"]');
    await expect(dist).toHaveCount(1);
    await expect(dist).toHaveAttribute("data-ticks", "18");
    await expect(dist.locator("text").filter({ hasText: "18 rafters" })).toBeVisible();
    await saved();
    await press(page.getByRole("button", { name: "Fit page" })); await page.waitForTimeout(400);
    await shot("distribution-ticks", "Distribution run 10,000 mm at 600 centres → 18 rafter ticks on the plan");
    await toOverview();
    // schedule: the real server's computed lines + the schedule screen
    let w = await server();
    observed.J1 = { projected: linesOf(w, timberId).map(lineText) };
    expect(linesOf(w, timberId).map((l) => [l.quantity, l.unit, l.item?.stockLengthMm ?? l.finishedLengthMm ?? null])).toEqual([[18, "piece", 5400]]);
    await press(page.getByRole("button", { name: "Open schedule" }));
    const g = page.locator(`[data-generic-group="${timberId}"]`);
    await expect(g.getByRole("button", { name: /^18 pieces\s*90 × 45 MGP10 H3 — 5,400 mm length/ })).toBeVisible();
    await g.scrollIntoViewIfNeeded();
    await shot("schedule-18x5400", "Schedule (computed by the real server): 18 pieces 90 × 45 MGP10 H3 — 5,400 mm length");
    await toOverview();
    // switch to TRUE length: the pitch is no longer applied (4,500 + 100 → 4,800 grid)
    await press((await openRow(page.getByRole("listitem").filter({ hasText: "Rafters 90 × 45" }))).getByRole("button", { name: "Setup" }));
    await press(page.locator('[data-setup="timber"] [data-chips="length-source"]').getByRole("button", { name: "Measure true length" }));
    await expect(page.locator('[data-setup="timber"]').getByLabel("Pitch")).toHaveCount(0);
    await saved();
    await expect.poll(async () => linesOf(await server(), timberId).map((l) => [l.quantity, l.item?.stockLengthMm ?? null]), { timeout: 20_000 }).toEqual([[18, 4800]]);
    await press(page.getByRole("button", { name: "Measure members" }));
    await viewer();
    await expect(page.locator("[data-member-panel]")).toContainText(/measured as a true length — pitch not applied/);
    await expect(page.locator("[data-member-panel]")).not.toContainText(/true at 30°/);
    await shot("true-length", "Member length from = true length: 4,500 measured as a true length — pitch not applied");
    await toOverview();
    await press(page.getByRole("button", { name: "Open schedule" }));
    await expect(page.locator(`[data-generic-group="${timberId}"]`).getByRole("button", { name: /^18 pieces\s*90 × 45 MGP10 H3 — 4,800 mm length/ })).toBeVisible();
    await page.locator(`[data-generic-group="${timberId}"]`).scrollIntoViewIfNeeded();
    await shot("schedule-18x4800", "True length: 18 × 4,800 (4,500 + 100 allowance → 4,800 grid) — no pitch applied");
    w = await server();
    observed.J1.trueLength = linesOf(w, timberId).map(lineText);
    await toOverview();
    // back to projected for the order (J5 expects 18 × 5,400); the 30° pitch must still be there
    await press((await openRow(page.getByRole("listitem").filter({ hasText: "Rafters 90 × 45" }))).getByRole("button", { name: "Setup" }));
    await press(page.locator('[data-setup="timber"] [data-chips="length-source"]').getByRole("button", { name: "Measure projection" }));
    const pitch = page.locator('[data-setup="timber"]').getByLabel("Pitch");
    const kept = await pitch.inputValue();
    observed.J1.pitchAfterSwitchBack = kept;
    if (kept !== "30") { findings.push({ journey: "J1", text: `Switching length source true → projected showed pitch "${kept}" (was 30). Re-entered 30.` }); await num(pitch, 30); }
    await saved();
    await expect.poll(async () => linesOf(await server(), timberId).map((l) => [l.quantity, l.item?.stockLengthMm ?? null]), { timeout: 20_000 }).toEqual([[18, 5400]]);
    await toOverview();
  }, ["S0"]);

  // ═══ J2 — cladding: Axon 133 smooth on a wall by numbers ═══════════════════════════════════════════════════════
  let axonId = null;
  await journey("J2", "Cladding: Axon 133 smooth, wall 4,800 × 2,700 + 900 × 900 window → 4 sheets, net 12.15 m²; 4,801 → 5", async () => {
    await press(page.getByRole("button", { name: "Add cladding" }));
    const c = page.locator('[data-setup="cladding"]');
    await expect(c).toBeVisible();
    await expect(c.locator('[data-chips="family"]').getByRole("button", { name: "Fibre cement" })).toHaveAttribute("aria-pressed", "true");
    await press(page.locator(`[data-product-option="${AXON_133}"]`));
    await expect(page.locator(`[data-chosen-product="${AXON_133}"]`)).toBeVisible();
    await saved();
    const m = await materialNamed(/Axon 133 smooth/);
    axonId = m.id;
    observed.J2 = { materialName: m.name, methodKey: m.methodKey, assemblyId: m.spec.assemblyId };
    await shot("cladding-setup", `Cladding setup: James Hardie Axon 133 smooth chosen (material "${m.name}", ${m.methodKey})`);
    await press(page.getByRole("button", { name: "Walls", exact: true }));
    await expect(page.getByRole("region", { name: "Walls" })).toBeVisible();
    await press(page.getByRole("button", { name: "Wall by numbers" }));
    const add = page.getByRole("region", { name: "Wall by numbers" });
    await add.getByLabel("Wall name").fill("North wall");
    await num(add.getByLabel("Wall length"), 4800);
    const h = page.getByLabel("Wall height");
    await expect(h).toBeFocused();
    await num(h, 2700);
    await expect(page.getByRole("dialog", { name: "North wall" })).toBeVisible();
    await expect(page.locator('[data-area="gross"]')).toHaveText("12.96 m²");
    // window: tap its approximate position on the elevation, then the numbers (they are authoritative)
    await press(page.getByRole("button", { name: "Add opening" }));
    await expect(page.getByText("Tap the elevation where the opening is")).toBeVisible();
    await page.waitForTimeout(200);
    const el = page.locator("[data-wall-elevation]");
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    await tapAt(box.x + box.width * 0.12, box.y + box.height * 0.45);
    const ns = page.getByRole("region", { name: "New opening" });
    // the app focuses Width so the size can be typed at once; if the engine doesn't honour that focus, say so and
    // tap the field as a user would
    const width = ns.getByLabel("Width");
    if (!(await expect(width).toBeFocused({ timeout: 4000 }).then(() => true, () => false))) {
      await shot("opening-width-not-focused", "After tapping the elevation the New opening sheet is open but Width is NOT focused (no keyboard) — tapping the field");
      findings.push({ journey: "J2", id: "F5", severity: "UX (phone)", text: `src/components/takeoff/WallsScreen.jsx:672 — ${isMobile ? "WebKit iPhone (touch)" : "Chromium"}: after tapping the elevation to place a new opening, the "New opening" sheet opens but the Width field is not left focused — the app focuses it on the tap (focusin at pointerup), then the tap's compatibility mousedown lands on the elevation drawing (SVG) and blurs it (focusout, relatedTarget null → body). No keyboard; the user has to tap Width first. Steps: J2 on the phone → North wall → Add opening → tap the elevation.` });
      await press(width);
    }
    await num(width, 900);
    await num(ns.getByLabel("Height", { exact: true }), 900);
    const os = page.getByRole("region", { name: /^Opening W/ });
    await expect(os).toBeVisible();
    await num(os.getByLabel("Sill height"), 900);
    await num(os.getByLabel("Offset from wall start"), 150);
    await expect(page.locator('[data-area="net"]')).toHaveText("12.15 m²");
    await expect(page.locator(`[data-wall-qty="${axonId}"]`)).toContainText("4 sheets");
    await expect(page.locator("[data-sheet-summary]")).toContainText("4 strips × 1 course → 4 sheets");
    await saved();
    await page.locator("[data-wall-result]").scrollIntoViewIfNeeded();
    await shot("wall-4800-4-sheets", "North wall 4,800 × 2,700 + W1 900 × 900 (sill 900, 150 from start) → 4 sheets, net 12.15 m² of 12.96 m²");
    await page.locator("[data-wall-elevation]").scrollIntoViewIfNeeded();
    await shot("wall-elevation", "Generated elevation (sheet cells + window), Cladding view");
    let w = await server();
    observed.J2.at4800 = { lines: linesOf(w, axonId).map(lineText), wall: w.computed.materialResults?.[axonId]?.walls?.map((x) => x.areas) };
    // 4,801 → one more (1 mm) strip → 5 sheets
    const len = page.getByRole("region", { name: "Wall dimensions" }).getByLabel("Wall length");
    await num(len, 4801);
    await expect(page.locator(`[data-wall-qty="${axonId}"]`)).toContainText("5 sheets");
    await expect(page.locator("[data-sheet-summary]")).toContainText("5 strips (1 cut: 1 mm wide) × 1 course → 5 sheets");
    await saved();
    await expect.poll(async () => linesOf(await server(), axonId).reduce((a, l) => a + (l.unit === "sheet" ? l.quantity : 0), 0), { timeout: 20_000 }).toBe(5);
    await page.locator("[data-sheet-summary]").scrollIntoViewIfNeeded();
    await shot("wall-4801-5-sheets", "Wall length 4,801 → 5 strips (1 cut: 1 mm wide) → 5 sheets");
    w = await server();
    observed.J2.at4801 = linesOf(w, axonId).map(lineText);
    // back to 4,800 for the order
    await num(len, 4800);
    await expect(page.locator(`[data-wall-qty="${axonId}"]`)).toContainText("4 sheets");
    await saved();
    await expect.poll(async () => linesOf(await server(), axonId).map((l) => [l.quantity, l.unit]), { timeout: 20_000 }).toEqual([[4, "sheet"]]);
    observed.J2.final = linesOf(await server(), axonId).map(lineText);
    await toOverview();
  });

  // ═══ AL — aluminium window angle (11) ═══════════════════════════════════════════════════════════════════════
  let aluId = null;
  await journey("AL", "Aluminium: kerf 3 confirmed; opening 600 × 2,400 → 2,500 / 2,500 / 600 on one 6,500 bar, 891 remainder", async () => {
    await press(page.getByRole("button", { name: "Add aluminium" }));
    const setup = page.getByRole("dialog", { name: "Aluminium" });
    await expect(setup).toBeVisible();
    await expect(setup.locator("[data-needs]")).toContainText("Confirm the saw kerf");
    await num(setup.getByLabel("Saw kerf", { exact: true }), 3);
    await setup.getByLabel(/saw kerf above is confirmed/).check();
    await expect(setup.locator("[data-needs]")).toHaveCount(0);
    await saved(setup);
    const m = await materialNamed(/^aluminium$/);
    aluId = m.id;
    expect([m.spec.kerfMm, m.spec.kerfConfirmed, m.spec.stockLengthMm]).toEqual([3, true, 6500]);
    await shot("aluminium-setup", "Aluminium setup: saw kerf 3 mm entered and confirmed (6,500 bars, head not cut by the window preset)");
    await press(setup.getByRole("button", { name: "Openings & cutting" }));
    const screen = page.getByRole("dialog", { name: /Aluminium angle/ });
    await expect(screen.getByTestId("aluminium-screen")).toBeVisible();
    await screen.getByLabel("Opening label (optional)").fill("W01");
    await num(screen.getByLabel("Opening width", { exact: true }), 600);
    await num(screen.getByLabel("Opening height", { exact: true }), 2400); // applies once width + height are valid (no Add step)
    const w01 = screen.locator('[data-testid="alu-opening"][data-label="W01"]');
    await expect(w01.getByRole("button", { name: "W01 Left jamb 2,500 mm — Bar 1" })).toBeVisible();
    await expect(w01.getByRole("button", { name: "W01 Right jamb 2,500 mm — Bar 1" })).toBeVisible();
    await expect(w01.getByRole("button", { name: "W01 Bottom 600 mm — Bar 1" })).toBeVisible();
    await expect(screen.getByTestId("alu-buy")).toHaveText("Buy 1 × 6,500 mm");
    await expect(screen.getByTestId("alu-required")).toHaveText("5,600 mm");
    await expect(screen.getByTestId("alu-cut-loss")).toHaveText("9 mm");
    await expect(screen.getByTestId("alu-reusable")).toHaveText("891 mm");
    await saved(screen);
    await press(screen.getByRole("button", { name: /^Bar 1/ }));
    const cuts = screen.getByRole("list", { name: "Bar 1 cuts in order" });
    await expect(cuts.getByRole("button")).toHaveCount(3);
    await expect(screen.getByTestId("alu-bar-remainder")).toContainText("Planned remainder 891 mm — reusable");
    await screen.locator("#alu-cutting-sheet").scrollIntoViewIfNeeded();
    await shot("aluminium-cutting-sheet", "Cutting sheet: Bar 1 = W01 left jamb 2,500 + right jamb 2,500 + bottom 600, 9 mm kerf loss, 891 mm reusable remainder");
    const w = await server();
    observed.AL = { lines: linesOf(w, aluId).map(lineText) };
    expect(linesOf(w, aluId).map((l) => [l.quantity, l.unit])).toEqual([[1, "bar"]]);
    await toOverview();
  });

  // ═══ FL — continuous flashing paths (13) ═════════════════════════════════════════════════════════════════════
  let flashId = null;
  // HUB 005: a NEW flashing orders in 300 mm steps (3,000 + 200 → 3,300; 1,200 + 200 → 1,500), and one "Split to handling
  // length" re-splits the whole run into even pieces within the 6,000 handling length (10,000 → 2 × 5,000 → 5,400 each)
  await journey("FL", "Flashing paths (300 mm step): four 750 legs → ONE 3,300; 10,000 path → red overflow → split at limit → 9,000 + 1,500 → Split to handling length → 5,400 + 5,400", async () => {
    await toSection("flashings");
    await expect(page.getByRole("button", { name: "Add timber" })).toHaveCount(0);
    await press(page.getByRole("button", { name: "Add flashing" }).first());
    await press(page.getByRole("button", { name: "New flashing" }));
    const dlg = page.getByRole("dialog", { name: /^Flashing/ });
    await expect(dlg.getByText("Tap where the flashing starts.")).toBeVisible();
    await page.waitForTimeout(300);
    const gb = await dlg.locator("[data-takeoff-viewport]").boundingBox();
    for (const [fx, fy] of [[0.3, 0.7], [0.3, 0.35], [0.6, 0.35]]) { await tapAt(gb.x + gb.width * fx, gb.y + gb.height * fy); await page.waitForTimeout(150); }
    await expect(dlg.locator("svg text", { hasText: /^L2 / })).toBeVisible();
    await saved(dlg);
    await shot("flashing-profile", "New flashing drawn on the empty grid (2 legs), auto-saved");
    await press(dlg.getByRole("button", { name: "Details" }));
    await page.getByLabel("Colour", { exact: true }).selectOption("Monument");
    await saved();
    const fm = (await server()).snapshot.materials.find((x) => x.methodKey === "flashing_runs");
    flashId = fm.id;
    await press(page.getByRole("button", { name: "Lengths" }));
    await viewer();
    await expect(page.getByRole("radio", { name: "Run" })).toHaveAttribute("aria-checked", "true");
    // path A: four 750 legs (a staircase) — ONE run, ONE allowance, ONE piece
    const A = [at(2000, 2000), at(2750, 2000), at(2750, 2750), at(3500, 2750), at(3500, 3500)];
    await zoomOn(at(2750, 2750), isMobile ? 8 : 4);
    for (const p of A) { await exactTap(p); await page.waitForTimeout(450); }
    const draft = page.locator("[data-path-draft]");
    await expect(draft).toHaveAttribute("data-points", "5");
    const tightA = Number(await draft.getAttribute("data-tight"));
    observed.FL = { pathA: { tight: tightA } };
    await expect(draft).toHaveAttribute("data-order", "3300");
    await expect(page.getByText(/4 legs — corners are cut\/folded on site/)).toBeVisible();
    await shot("path-750x4-draft", `Four 750 legs drawn as one path: tight ${tightA} → ONE allowance → order 3,300 (300 mm step)`);
    await press(page.getByRole("button", { name: "Finish", exact: true }));
    await expect(page.locator("[data-path-draft]")).toHaveCount(0);
    const runs = page.locator('[data-kind="polyline"][data-measurement-id]:not([data-unfinished])');
    await expect(runs).toHaveCount(1);
    await expect(runs.first()).toHaveAttribute("data-pieces", "1");
    await expect(runs.first()).toHaveAttribute("data-order", "3300");
    await expect(page.locator("[data-finished-run]")).toContainText("Finished — one run");
    await saved();
    await shot("path-750x4-finished", "Finished — one run, one piece 3,300 (corners are site cuts/folds)");
    // path B: 6,000 + 4,000 = 10,000 → red overflow past the 9,000 maximum → one tap on red splits at the legal marker
    await page.waitForTimeout(600);
    await zoomOn(at(8000, 3000), isMobile ? 1.6 : 1.2);
    for (const p of [at(5000, 1000), at(11000, 1000), at(11000, 5000)]) { await exactTap(p); await page.waitForTimeout(450); }
    const d2 = page.locator("[data-path-draft]");
    await expect(d2).toHaveAttribute("data-points", "3");
    const tightB = Number(await d2.getAttribute("data-tight"));
    observed.FL.pathB = { tight: tightB };
    await expect(d2).toHaveAttribute("data-pieces", "1");
    await expect(d2.locator("[data-overflow-run]")).toHaveCount(1);
    await expect(d2.locator("[data-legal-marker]")).toHaveAttribute("data-station", "8800");
    await expect(page.locator("[data-overflow-text]")).toContainText("over the 9,000 mm maximum");
    await shot("path-10000-red", `10,000 path (tight ${tightB}): red past the 9,000 maximum, legal split marker at 8,800`);
    // tap the red part (zoomed on it so the run's last point — a 44 px target — isn't what is hit)
    const pts = (await d2.locator("[data-overflow-run]").first().getAttribute("points")).trim().split(/\s+/).map((s) => s.split(",").map(Number));
    let best = null;
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (!best || L > best.L) best = { L, x: pts[i - 1][0] + 0.4 * (pts[i][0] - pts[i - 1][0]), y: pts[i - 1][1] + 0.4 * (pts[i][1] - pts[i - 1][1]) }; }
    const redPdf = await page.evaluate((q) => document.querySelector("[data-takeoff-viewport]").takeoffViewport.toPdf(q), { x: best.x, y: best.y });
    await zoomOn(redPdf, 3);
    await exactTap(redPdf);
    await expect(d2).toHaveAttribute("data-points", "3");
    await expect(d2).toHaveAttribute("data-splits", "8800");
    await expect(d2).toHaveAttribute("data-order", "9000+1500");
    await expect(d2.locator("[data-overflow-run]")).toHaveCount(0);
    await expect(page.getByText(/Split at the limit \(8,800 mm along the run\)\. Pieces now 9,000 \+ 1,500 mm/)).toBeVisible();
    await shot("path-10000-split", "One tap on the red part → split at the limit (8,800 along the run) → 9,000 + 1,500");
    // HUB 005: the 9,000 piece is over the 6,000 handling length → ONE action splits the whole run evenly
    const auto = page.locator("[data-split-to-handling]");
    await expect(auto).toHaveText("Split to handling length — 2 × 5,400 mm");
    await press(auto);
    await expect(d2).toHaveAttribute("data-splits", "5000");
    await expect(d2).toHaveAttribute("data-order", "5400+5400");
    await expect(page.getByText(/Split into 2 pieces: 5,400 \+ 5,400 mm — each with its own allowance, all within the 6,000 mm handling length/)).toBeVisible();
    await shot("path-10000-handling", "Split to handling length → 2 even pieces, 5,400 + 5,400 (each 5,000 tight + 200 allowance, rounded to 300)");
    await page.waitForTimeout(450);
    await press(page.getByRole("button", { name: "Finish", exact: true }));
    await expect(runs).toHaveCount(2);
    await saved();
    await page.waitForTimeout(1500);   // the saved server snapshot replaces the local drawing
    await press(page.getByRole("button", { name: "Fit page" }));
    await page.waitForTimeout(500);
    const wB = await server();
    const runB = wB.snapshot.measurements.find((m) => m.kind === "polyline" && m.inputs?.splitsMm?.length);
    observed.FL.storedSplit = { splitsMm: runB?.inputs?.splitsMm, splitAnchors: runB?.inputs?.splitAnchors };
    observed.FL.lines = linesOf(wB, flashId).map((l) => `${l.quantity} × ${l.finishedLengthMm}${l.problems?.length ? ` (${l.problems.join(",")})` : ""}`);
    const sheetText = (await page.locator("[data-finished-run]").innerText().catch(() => "")).replace(/\s+/g, " ");
    observed.FL.sheetAfterSave = sheetText;
    await shot("paths-finished-saved", `Both runs finished + saved; after the server round-trip the sheet reads: "${sheetText.slice(0, 220)}"`);
    const got = linesOf(wB, flashId).map((l) => `${l.quantity}x${l.finishedLengthMm}`).sort();
    if (JSON.stringify(got) !== JSON.stringify(["1x3300", "2x5400"]) && runB) {
      // cross-check with the REAL engine (shared/takeoff) on the server's own snapshot: the stored (rounded) anchor vs
      // the full-precision anchor the app computed for the same split
      const cal = wB.snapshot.calibrations.find((c) => c.id === runB.calibrationId);
      const exact = anchorsFor(runB.points, cal, runB.inputs.splitsMm);
      const recompute = (anchors) => {
        const snap = structuredClone(wB.snapshot);
        const m = snap.measurements.find((x) => x.id === runB.id);
        if (anchors) m.inputs.splitAnchors = anchors; else delete m.inputs.splitAnchors;
        return computeWorkspace(snap).scheduleLines.filter((l) => l.jobMaterialIds.includes(flashId)).map((l) => `${l.quantity}x${l.finishedLengthMm}${l.problems.length ? `(${l.problems.join(",")})` : ""}`).sort().join(" ");
      };
      observed.FL.engineCrossCheck = { storedAnchor: recompute(runB.inputs.splitAnchors), fullPrecisionAnchor: recompute(exact), noAnchor: recompute(null) };
      findings.push({ journey: "FL", id: "F1", severity: "blocking", text: `Split at the limit is changed by the save. Steps: scale page 1 (S0); Add flashing → New flashing → Details → Lengths; Run tool: tap (5,000, 1,000) → (11,000, 1,000) → (11,000, 5,000) (= 10,000 mm); tap the red part → "Split at the limit (8,800 mm along the run). Pieces now 9,000 + 1,400 mm"; Finish → after "Saved" the sheet reads: "${sheetText.slice(0, 170)}…" and still says "tap it to split at the limit (8,800 mm along the run)" (src/components/takeoff/measure/PathPanel.jsx:60) although the run is already split there. The server now computes ${observed.FL.lines.join(" / ")}, and the order is blocked ("A piece is longer than the order ceiling…", "The split pieces do not cover the run."). Cause: server/lib/takeoff/takeoffService.mjs:242 cleans inputs.splitAnchors x/y — PDF-point coordinates — with MM() (:204-208, Math.round(n * 1000) / 1000): stored ${JSON.stringify(runB.inputs.splitAnchors)} vs the app's ${JSON.stringify(exact)}; shared/takeoff/engine/flashingPath.js:298 (checkSplits → locateOnPath) then rebuilds the station from the rounded anchor (8,800 → 8,800.02 → 9,000.02 → 9,100). Real-engine cross-check on the server's own snapshot: stored anchor → ${observed.FL.engineCrossCheck.storedAnchor}; full-precision anchor → ${observed.FL.engineCrossCheck.fullPrecisionAnchor}; no anchor → ${observed.FL.engineCrossCheck.noAnchor}. Rounding the other way would instead silently make piece 2 1,500 (any split at a whole-mm station is exposed).` });
    }
    // after the save the run must still be 5,400 + 5,400 — on the plan and on the server
    await expect(page.locator('[data-kind="polyline"][data-measurement-id][data-order="5400+5400"]')).toHaveCount(1);
    expect(got).toEqual(["1x3300", "2x5400"]);
    await toOverview();
  }, ["S0"]);

  // ═══ J5 — one order: timber + sheets + bars + flashing; export (not draft); supplier PDF + site appendix ═══════
  /** PDF → text: pdftotext (-layout for reading, -raw = drawing order for row checks); pdf.js when pdftotext is absent */
  const pdfText = async (file, mode) => {
    try { return execFileSync("pdftotext", [mode === "raw" ? "-raw" : "-layout", file, "-"], { encoding: "utf8" }); }
    catch {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), isEvalSupported: false, verbosity: 0 }).promise;
      let s = ""; for (let i = 1; i <= doc.numPages; i++) s += `${(await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ")}\n`;
      return s;
    }
  };
  const openOrders = async () => {
    await press(page.getByRole("button", { name: /Review & export order|Orders/ }));
    await expect(page.getByRole("dialog", { name: "Orders" })).toBeVisible();
    await page.waitForTimeout(800);
  };
  const deliveryDetails = async () => {
    // delivery (director, desktop) / pickup (leading hand, phone) — what the supplier needs is asked for, never invented
    const due = new Date(Date.now() + 7 * 864e5); const ymd = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    if (isMobile) {
      await press(page.getByText("Pick up", { exact: true }));
      await page.getByRole("textbox", { name: "Pickup branch" }).fill("Sandbox branch (test only)");
      await page.getByLabel("As soon as possible").check();
    } else {
      await expect(page.getByRole("textbox", { name: /Delivery address/ })).toHaveValue(/.+/);
      await page.getByRole("textbox", { name: /Delivery address/ }).fill("1 Sandbox Street, Testville SA (test only)");
      await page.getByLabel("Required by").fill(ymd);
    }
    await page.getByRole("textbox", { name: "Site contact" }).fill("Sandbox site lead");
    await page.getByRole("textbox", { name: "Contact phone" }).fill("0400 000 000");
    await page.getByRole("textbox", { name: "Notes for supplier" }).fill("TC-R04 evidence run — sandbox only, not a real order");
  };
  /** Save → Ready (or throw with the app's own reasons) */
  const saveUntilReady = async (tag) => {
    const saveBtn = page.getByRole("button", { name: "Save order details" });
    if (await saveBtn.isVisible().catch(() => false)) await press(saveBtn);
    const readyBanner = page.getByText(/^Ready: /);
    const notReady = page.getByText("Not ready to order yet:");
    await expect(readyBanner.or(notReady)).toBeVisible({ timeout: 30_000 });
    if (await notReady.isVisible()) {
      const why = (await notReady.locator("xpath=..").innerText()).replace(/\s+/g, " ");
      await notReady.scrollIntoViewIfNeeded();
      await shot("order-not-ready", `Order NOT ready (Export supplier PDF disabled): ${why.slice(0, 300)}`);
      await expect(page.getByRole("button", { name: "Export supplier PDF" })).toBeDisabled();
      throw new Error(`Order not ready to export — ${why}`);
    }
    const t = await readyBanner.innerText();
    await page.getByTestId("order-totals").scrollIntoViewIfNeeded();
    await shot("order-ready", `${tag}: saved → ${t}`);
    return t;
  };
  /** NON-draft export, then BOTH documents through the app's own buttons; saved + read back as text */
  const exportAndRead = async (tag) => {
    await press(page.getByRole("button", { name: "Export supplier PDF" }));
    const frozen = page.getByRole("status").filter({ hasText: /Export \d+ is frozen\. Nothing has been sent\./ });
    await expect(frozen).toBeVisible({ timeout: 30_000 });
    await expect(frozen).not.toContainText("(draft)");
    await shot("order-exported", `${tag}: ${(await frozen.innerText()).replace(/\s+/g, " ").slice(0, 120)} (not a draft) — nothing sent, nothing ordered`);
    const grab = async (button, re) => {
      const [resp] = await Promise.all([
        page.waitForResponse((r) => re.test(new URL(r.url()).pathname) && r.request().method() === "GET", { timeout: 60_000 }),
        press(frozen.getByRole("button", { name: button })),
      ]);
      expect(resp.status()).toBe(200);
      const body = await resp.body();
      expect(body.subarray(0, 5).toString()).toBe("%PDF-");
      return { body, path: new URL(resp.url()).pathname };
    };
    const pdf = await grab("Open PDF", /\/exports\/[^/]+\/pdf$/);
    await page.waitForTimeout(800);
    const app = await grab("Site appendix (cutting & setout)", /\/exports\/[^/]+\/appendix$/);
    await page.waitForTimeout(800);
    await expect(page.getByText(/Couldn't open/)).toHaveCount(0);
    for (const p of popups.splice(0)) await p.close().catch(() => {});
    writeFileSync(`${dir}/${tag}-supplier-order.pdf`, pdf.body);
    writeFileSync(`${dir}/${tag}-site-appendix.pdf`, app.body);
    writeFileSync(`${dir}/${tag}-supplier-order.txt`, await pdfText(`${dir}/${tag}-supplier-order.pdf`, "layout"));
    writeFileSync(`${dir}/${tag}-site-appendix.txt`, await pdfText(`${dir}/${tag}-site-appendix.pdf`, "layout"));
    // checks read the drawing-order text with all whitespace (incl. wrapped cells) collapsed to single spaces
    const flat = (x) => x.replace(/\s+/g, " ");
    const S = flat(await pdfText(`${dir}/${tag}-supplier-order.pdf`, "raw")), A = flat(await pdfText(`${dir}/${tag}-site-appendix.pdf`, "raw"));
    note(`Downloaded via the app's buttons: GET ${pdf.path.replace(/[0-9a-f-]{36}/, "<export>")} (${pdf.body.length} bytes) → ${tag}-supplier-order.pdf; GET ${app.path.replace(/[0-9a-f-]{36}/, "<export>")} (${app.body.length} bytes) → ${tag}-site-appendix.pdf; text via ${existsSync("/opt/homebrew/bin/pdftotext") ? "pdftotext (-layout saved as .txt; -raw used for the checks)" : "pdf.js"}`);
    return { S, A };
  };
  const runChecks = (tag, list) => {
    const checks = list.map(([doc, hay, re]) => ({ doc, expect: String(re), ok: re.test(hay) }));
    writeFileSync(`${dir}/${tag}-pdf-checks.json`, JSON.stringify(checks, null, 2));
    return checks;
  };
  const saveOrders = async (tag) => {
    const order = await page.evaluate(async ({ job, base }) => {
      const j = await (await fetch(`${base}/jobs/carpentry/${job}`)).json();
      return (await (await fetch(`${base}/workspaces/${j.workspaces[0].id}/orders`)).json());
    }, { job: JOB, base: apiBase });
    writeFileSync(`${dir}/${tag}-orders.json`, JSON.stringify(order, null, 2));
  };
  // HUB 007: the timber and cladding order (Timber part, then Cladding) and the flashings order are separate supplier orders
  const tcChecks = (S, A) => [
    ["supplier", S, /TIMBER AND CLADDING ORDER/],
    ["supplier", S, /18 × piece 90 × 45 MGP10 H3 — 5,400 mm length/],
    ["supplier", S, /4 × sheet James Hardie Axon 133 smooth SKU \d+ — 2,750 × 1,200 mm/],
    ["supplier", S, /1 × bar equal-angle 50 × 50 × 3 — 6,500 mm length \(no joins\)/],
    ["supplier", S, isMobile ? /Sandbox branch \(test only\)/ : /Deliver to: 1 Sandbox Street, Testville SA \(test only\) Required: \d{4}-\d\d-\d\d/],
    ["supplier", S, /Site contact: Sandbox site lead 0400 000 000/],
    ["supplier (no DRAFT watermark)", S, /^(?![\s\S]*DRAFT)/],
    ["appendix", A, /SITE APPENDIX — CUTTING & SETOUT/],
    ["appendix", A, /Aluminium angle 50 × 50 × 3 — cutting sheet \(6,500 mm bars\)/],
    ["appendix", A, /Kerf 3 mm · end trim 0 mm · 1 new bar\(s\) · lower bound 1 · proven minimum/],
    ["appendix", A, /Bar 1: ?W01 left jamb 2,500 \| ?W01 right jamb 2,500 \| ?W01 bottom 600/],
    ["appendix", A, /Remainder 891 mm — keep \(reusable offcut\) · kerf loss 9 mm/],
    ["appendix", A, /Rafters 90 × 45 — timber cut list/],
    ["appendix", A, /18 × cut 5,296(\.\d+)? mm from 5,400 mm stock/],
    ["appendix", A, /North wall setout/],
    ["appendix", A, /Gross 12\.96 m² · openings 0\.81 m² · net 12\.15 m²/],
    ["appendix", A, /4 occupied cell\(s\) = 4 sheet\(s\)/],
    ["supplier", S, /TIMBER AND CLADDING ORDER[\s\S]*\bTIMBER\b[\s\S]*\bCLADDING\b/],   // the Timber part, then the Cladding part
    ["supplier (no flashing on it)", S, /^(?![\s\S]*(flashing piece|3,300 3\.300))/],
  ];
  const flChecks = (S, A) => [
    ["supplier", S, /FLASHING ORDER/],
    ["supplier", S, /1 × 3,300 3\.300/],
    ["appendix", A, /Tight 3,000 mm along the path · corners at 750, 1,500, 2,250 mm · splits at none mm/],
    ["appendix", A, /Piece 1: 0–3,000 mm along the run (→|->) tight 3,000 (→|->) order 3,300 mm/],
    ["supplier", S, isMobile ? /Sandbox branch \(test only\)/ : /Deliver to: 1 Sandbox Street, Testville SA \(test only\) Required: \d{4}-\d\d-\d\d/],
    ["supplier", S, /Site contact: Sandbox site lead 0400 000 000/],
    ["supplier (no DRAFT watermark)", S, /^(?![\s\S]*DRAFT)/],
    ["appendix", A, /SITE APPENDIX — CUTTING & SETOUT/],
    ["supplier (no timber / cladding on it)", S, /^(?![\s\S]*(MGP10|Axon 133|equal-angle))/],
  ];

  /** honest-output issues seen in the downloaded site appendix (recorded as findings; the journey checks are above) */
  const appendixFindings = (tag, A) => {
    const add = (id, text) => { if (!findings.some((f) => f.id === id)) findings.push({ journey: tag, id, severity: "minor (site appendix)", text }); };
    if (/North wall setout Gross [\d.]+ m² · openings [\d.]+ m² · net [\d.]+ m² · Derived from plan \+ entered heights/.test(A)) {
      add("F2", "Site appendix provenance is wrong for walls entered by numbers: server/lib/takeoff/takeoffPdf.mjs:214 hard-codes \"· Derived from plan + entered heights\" on every wall setout. The North wall was typed in (Walls → Wall by numbers); the wall editor labels it \"Entered\" and the schedule \"Entered length and heights\". Steps: J2 (wall by numbers) → Orders → export → Site appendix (cutting & setout).");
    }
    const q = /shortest listed length \? its cut/.exec(A);
    if (q) add("F3", `Site appendix prints a literal "?" for "≥": "${q[0]} …". The cladding explanation (shared/takeoff/engine/cladding.js:566) goes through winAnsi() (server/lib/takeoff/takeoffPdf.mjs:28-35), which maps only "→"; every other non-WinAnsi character becomes "?". Steps: J2 → Orders → export → Site appendix.`);
    const labels = /18 × cut [\d,.]+ mm from [\d,]+ mm stock — (.*?) \+\d+ more/.exec(A)?.[1];
    if (labels) {
      const at = labels.split(/, (?=Rafter)/).map((x) => Number(x.replace(/[^\d]/g, "")));
      if (at.some((v, i) => i > 0 && v < at[i - 1])) add("F4", `Site appendix timber cut list names the rafters out of station order and only the first 12: "${labels.slice(0, 150)}… +6 more" — so a site reader can't tell which stations the 6 unnamed ones are. Labels are collected in the allocator's cut order (shared/takeoff/engine/dispatch.js:369-380; equal lengths tie-break on cut-id text: byLengthDesc, shared/takeoff/engine/allocator.js:512) and truncated at 12 (server/lib/takeoff/takeoffPdf.mjs:208). Steps: J1 → Orders → export → Site appendix.`);
    }
  };

  await journey("J5", "Orders (HUB 007): ONE timber-and-cladding order (timber + Axon sheets + aluminium bars, Timber / Cladding parts) and a SEPARATE flashings order; delivery/pickup; NON-draft exports; supplier PDFs + site appendices read back", async () => {
    const w0 = await server();
    writeFileSync(`${dir}/schedule.json`, JSON.stringify({
      note: "computed.scheduleLines from the REAL sandbox server (GET workspace) just before ordering",
      materials: w0.snapshot.materials.map((m) => ({ id: m.id, name: m.name, methodKey: m.methodKey, family: m.spec?.family || "flashing" })),
      scheduleLines: w0.computed.scheduleLines.map((l) => ({ material: w0.snapshot.materials.find((m) => l.jobMaterialIds.includes(m.id))?.name, unit: l.unit || "piece", quantity: l.quantity,
        description: l.item?.description || null, finishedLengthMm: l.finishedLengthMm ?? null, stockLengthMm: l.item?.stockLengthMm ?? null, problems: l.problems, bucketKey: l.bucketKey })),
    }, null, 2));
    // 1) Timber and cladding
    await toSection("timber_cladding");
    await openOrders();
    await expect(page.getByRole("heading", { name: "Timber and cladding orders" })).toBeVisible();
    await press(page.getByRole("button", { name: "New order" }));
    await expect(page.getByText(/Draft FO-/)).toBeVisible({ timeout: 20_000 });
    const og = (id) => page.locator(`[data-order-group="${id}"]`);
    if (timberId) await expect(page.locator('[data-order-part="timber"]').locator(`[data-order-group="${timberId}"]`).getByLabel(/Order quantity.*\(pieces\)/)).toHaveValue("18");
    if (axonId) await expect(page.locator('[data-order-part="cladding"]').locator(`[data-order-group="${axonId}"]`).getByLabel(/Order quantity.*\(sheets\)/)).toHaveValue("4");
    if (aluId) await expect(og(aluId).getByLabel(/Order quantity.*\(bars\)/)).toHaveValue("1");
    await expect(page.getByText("Lengths on this order")).toHaveCount(0);   // no flashing line crosses onto this order
    await deliveryDetails();
    await shot("order-review", `Timber and cladding order: Timber and Cladding parts, every line defaults to what is still needed; ${isMobile ? "pick up (branch, ASAP)" : "deliver (address, required-by date)"}, site contact + phone`);
    const ready = await saveUntilReady("J5");
    observed.J5 = { ready };
    await expect(page.getByTestId("order-totals")).toContainText("18 pieces");
    await expect(page.getByTestId("order-totals")).toContainText("4 sheets");
    await expect(page.getByTestId("order-totals")).toContainText("1 bar");
    await expect(page.getByTestId("order-totals")).not.toContainText("flashing");
    const { S, A } = await exportAndRead("J5");
    const checks = runChecks("J5", [...tcChecks(S, A), ["supplier", S, /Order total: 1 bar · 18 pieces · 4 sheets/]]);
    appendixFindings("J5", A);
    // 2) Flashings — its own order
    await toOverview();
    await toSection("flashings");
    await openOrders();
    await expect(page.getByRole("heading", { name: "Flashings orders" })).toBeVisible();
    await expect(page.getByText(/Draft FO-/)).toHaveCount(0);   // the timber and cladding order isn't listed here
    await press(page.getByRole("button", { name: "New order" }));
    await expect(page.getByText(/Draft FO-/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-order-group]")).toHaveCount(0);
    await deliveryDetails();
    await shot("order-review-flashings", "Flashings order: flashing lengths only");
    observed.J5.flashingsReady = await saveUntilReady("J5F");
    const F = await exportAndRead("J5F");
    const fchecks = runChecks("J5F", [...flChecks(F.S, F.A),
      ["supplier", F.S, /2 × 5,400 10\.800/],
      ["supplier", F.S, /3 pieces · 14\.100 LM/], ["supplier", F.S, /Order total: 3 pieces · 14\.100 LM/],
      ["appendix", F.A, /Tight 10,000 mm along the path · corners at 6,000 mm · splits at 5,000 mm/],
      ["appendix", F.A, /Piece 1: 0–5,000 mm along the run (→|->) tight 5,000 (→|->) order 5,400 mm/],
      ["appendix", F.A, /Piece 2: 5,000–10,000 mm along the run (→|->) tight 5,000 (→|->) order 5,400 mm/]]);
    observed.J5.pdfChecks = [...checks, ...fchecks].filter((c) => !c.ok);
    await saveOrders("J5");
    const failed = [...checks, ...fchecks].filter((c) => !c.ok);
    expect(failed, `PDF text checks failed:\n${failed.map((c) => `${c.doc}: ${c.expect}`).join("\n")}`).toEqual([]);
  });

  // ── write the evidence (always) ───────────────────────────────────────────────────────────────────────────
  const engine = page.context().browser();
  const browser = engine ? `${engine.browserType().name()} ${engine.version()}` : info.project.use.browserName;
  const viewport = JSON.stringify(page.viewportSize());
  const ua = await page.evaluate(() => navigator.userAgent).catch(() => "?");
  await page.close();
  const video = page.video();
  if (video) await video.saveAs(`${dir}/journeys.webm`).catch(() => {});
  writeFileSync(`${dir}/results.json`, JSON.stringify({ project, role, url: url.replace(BASE, "<sandbox>"), browser, viewport, userAgent: ua, results, findings, consoleErrors, at: new Date().toISOString() }, null, 2));
  const byJ = (id) => steps.filter((s) => s.journey === id);
  writeFileSync(`${dir}/STEPS.md`, [
    `# ${project} — TC-R04 real-stack journeys (isolated local sandbox)`,
    "",
    `Role: ${role}  `,
    `Route: \`${url.replace(BASE, "<sandbox>")}\`  `,
    `Browser engine: Playwright ${browser}${isMobile ? " · iPhone 13 emulation with touch (not a physical device)" : ""} · viewport ${viewport}  `,
    `User agent: \`${ua}\`  `,
    "Backend: scripts/takeoff/sandbox.mjs — real takeoff routes + Postgres (migrations 206 + 207) + pdfkit renderer; isolated DB `blh_takeoff_tc_evidence`.",
    "",
    ...results.flatMap((r) => [
      `## ${r.id} — ${r.title} — **${r.status}**`,
      ...(r.error ? ["", "```", r.error, "```"] : []),
      "",
      ...byJ(r.id).map((s, i) => `${i + 1}. ${s.file ? `\`${s.file}\` — ` : ""}${s.note}`),
      ...(r.observed ? ["", "Observed (real server): `" + JSON.stringify(r.observed).slice(0, 1500) + "`"] : []),
      "",
    ]),
    findings.length ? "## Findings\n\n" + findings.map((f) => `- **${f.id}** (${f.severity}, ${f.journey}) ${f.text}`).join("\n") + "\n" : "",
    consoleErrors.length ? "## Console errors\n\n" + consoleErrors.map((e) => `- ${e}`).join("\n") + "\n" : "## Console errors\n\nNone.\n",
    "Video of the whole run: `journeys.webm` · schedule: `schedule.json` · per order journey (J5, and J5d when J5 was blocked): `<J>-orders.json`, `<J>-supplier-order.pdf`, `<J>-site-appendix.pdf` (+ `.txt`, `<J>-pdf-checks.json`)",
    "",
  ].join("\n"));
  writeSummary();

  expect(results.filter((r) => r.status !== "PASS").map((r) => `${r.id}: ${r.status} ${r.error?.split("\n")[0] || ""}`), "journeys not passing").toEqual([]);
});

/** SUMMARY.md across both projects (whichever have run). */
function writeSummary() {
  const projects = ["desktop-chromium", "iphone13-webkit"];
  const R = Object.fromEntries(projects.map((p) => [p, existsSync(`${OUT}/${p}/results.json`) ? JSON.parse(readFileSync(`${OUT}/${p}/results.json`, "utf8")) : null]));
  const ids = [];
  for (const p of projects) for (const r of R[p]?.results || []) if (!ids.some((x) => x.id === r.id)) ids.push({ id: r.id, title: r.title });
  const cell = (p, id) => { const r = R[p]?.results.find((x) => x.id === id); return r ? r.status : "not run"; };
  // product defects across both browsers (one entry per finding id, with where it was seen)
  const defects = new Map();
  for (const p of projects) for (const f of R[p]?.findings || []) {
    const d = defects.get(f.id) || { ...f, seen: [] };
    d.seen.push(p); defects.set(f.id, d);
  }
  const lines = [
    "# TC-R04 real-stack journeys — SUMMARY",
    "",
    "Real app UI → isolated local sandbox (scripts/takeoff/sandbox.mjs: real takeoff server code, real Postgres with migrations 206 + 207 + 208, real pdfkit PDF renderer;",
    "database `blh_takeoff_tc_evidence`, API 127.0.0.1:8798, web :5188, reset before each browser). Nothing mocked on the takeoff path.",
    "Nothing sent to suppliers, nothing ordered, no production system touched. Spec: `e2e/ui-review/tc-journeys-sandbox.spec.js`, config: `playwright.tc-evidence.config.js`.",
    "",
    `| Journey | ${projects.join(" | ")} |`,
    `|---|${projects.map(() => "---").join("|")}|`,
    ...ids.map((j) => `| ${j.id} — ${j.title} | ${projects.map((p) => cell(p, j.id)).join(" | ")} |`),
    "",
    "J5 (Hub review HUB 007) exports TWO supplier orders: one Timber and cladding order (Timber part, then Cladding) and a separate Flashings order.",
    "",
    "## Product defects found",
    "",
    ...(defects.size ? [...defects.values()].sort((a, b) => a.id.localeCompare(b.id)).flatMap((d) => [`### ${d.id} — ${d.severity || "defect"} — seen on ${d.seen.join(", ")}`, "", d.text, ""]) : ["None.", ""]),
    ...projects.filter((p) => R[p]).flatMap((p) => [
      `## ${p}`,
      "",
      `${R[p].role} · ${R[p].browser} · viewport ${R[p].viewport} · run ${R[p].at}`,
      `User agent: \`${R[p].userAgent}\``,
      "",
      ...R[p].results.filter((r) => r.status !== "PASS").flatMap((r) => [`**${r.id} ${r.status}**`, "", "```", (r.error || "").trim(), "```", ""]),
      `Console errors: ${R[p].consoleErrors.length ? "\n\n" + R[p].consoleErrors.map((e) => `- ${e}`).join("\n") : "none"}`,
      "",
      `Evidence: \`${p}/STEPS.md\`, screenshots \`${p}/NN-<journey>-*.png\`, \`${p}/journeys.webm\`, \`${p}/schedule.json\`, \`${p}/results.json\`; per order journey \`${p}/<J5|J5d>-supplier-order.pdf\`, \`-site-appendix.pdf\` (+ .txt), \`-pdf-checks.json\`, \`-orders.json\``,
      "",
    ]),
  ];
  writeFileSync(`${OUT}/SUMMARY.md`, lines.join("\n"));
}
