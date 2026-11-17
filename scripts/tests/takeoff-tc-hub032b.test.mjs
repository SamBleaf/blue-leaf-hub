// HUB 032 round 2 (Sam, 18 Nov 2026): the MGP10 stock rule as he finally gave it (300 mm steps to 3 m, 600 mm steps above, 1,200
// shortest, short pieces cut from longer lengths), the precut stud list, one-tap recovery of a pre-032 saved order, and the
// supplier take-off shown on the order screen as well as on the PDF.
//   node scripts/tests/takeoff-tc-hub032b.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { computeWorkspace, wallFramingDefaults, methodFor, WALL_FRAMING_RULES, buildSupplierGroups, PRECUT_STUD_MM, productText, orderLineState, reconcileStaleLine,
  onTimberGrid, ITEM_STALE_TEXT } from "../../shared/takeoff/index.js";
import { selectStock, permittedStockLengths } from "../../shared/takeoff/engine/stock.js";
import { timberStockPolicy } from "../../shared/takeoff/engine/timber.js";

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const rect = (id, w, h, n) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm: w, heightMm: h, name: n } });
/** Walls with MGP10 studs (so cripples, jacks and studs are all MGP10), a 3.3 m wall and a window. */
function wallsWorkspace(studGrade = "MGP10") {
  const spec = wallFramingDefaults([]);
  spec.components.studs = { ...spec.components.studs, section: { depthMm: 90, widthMm: 45 }, grade: studGrade, treatment: "H2", stock: { maxMm: 6000, unavailableMm: [] } };
  const mk = methodFor(spec);
  const walls = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true } };
  const ms = [rect("w1", 9000, 2700, "Wall 1"), rect("w2", 4000, 3300, "Wall 2"),
    { id: "d1", kind: "opening", parentId: "w1", inputs: { xMm: 1000, sillMm: 0, widthMm: 820, heightMm: 2040, label: "D1", type: "door" } },
    { id: "o1", kind: "opening", parentId: "w2", inputs: { xMm: 1200, sillMm: 900, widthMm: 1800, heightMm: 1200, label: "W1", type: "window" } }];
  return { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials: [walls], measurements: ms,
    contributions: [{ id: "a", measurementId: "w1", jobMaterialId: "walls", role: "wall" }, { id: "b", measurementId: "w2", jobMaterialId: "walls", role: "wall" }] };
}

await t("MGP10 stock list: 1,200 to 3,000 in 300 mm steps, then 600 mm steps (3,600, 4,200 … 6,000)", () => {
  assert.deepEqual(permittedStockLengths(timberStockPolicy({ grade: "MGP10", maxMm: 6000 })), [1200, 1500, 1800, 2100, 2400, 2700, 3000, 3600, 4200, 4800, 5400, 6000]);
  assert.deepEqual(permittedStockLengths(timberStockPolicy({ grade: "LVL Smart 10", maxMm: 4200 })), [1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600, 3900, 4200]);
  assert.equal(selectStock(3300, timberStockPolicy({ grade: "MGP10", maxMm: 6000 })).stockMm, 3600);
  assert.equal(selectStock(2700, timberStockPolicy({ grade: "MGP10", maxMm: 6000 })).stockMm, 2700);
  assert.equal(onTimberGrid(3300, "MGP10"), false);
});

await t("a Walls run on MGP10: a 3.3 m stud buys 3.6, 2.7 stays 2.7, nothing is bought between 3.0 and 3.6, nothing under 1.2 m", () => {
  const c = computeWorkspace(wallsWorkspace());
  const mgp = c.scheduleLines.filter((l) => /MGP10/.test(l.item.description) && l.item.stockLengthMm);
  assert.ok(mgp.length >= 5);
  for (const l of mgp) assert.ok(onTimberGrid(l.item.stockLengthMm, "MGP10") && l.item.stockLengthMm >= 1200, l.item.description);
  const studs = c.scheduleLines.filter((l) => l.component === "studs");
  assert.ok(studs.some((l) => l.item.stockLengthMm === 3600 && l.roles.stud), "the 3.3 m studs buy 3.6");
  assert.ok(studs.some((l) => l.item.stockLengthMm === 2700 && l.roles.stud), "the 2.7 m studs stay 2.7");
  assert.ok(!studs.some((l) => l.item.stockLengthMm === 3300), "no 3.3 m MGP10");
});

await t("short pieces are cut from longer lengths, never bought as short pieces: the cripples under the window share a stock length", () => {
  const c = computeWorkspace(wallsWorkspace());
  const cripples = c.scheduleLines.filter((l) => l.roles && l.roles["below-sill"]);
  const demands = Object.values(c.materialResults).flatMap((r) => r.demands || []).filter((d) => d.role === "below-sill");
  assert.ok(demands.length >= 2, "two cripples under the window");
  assert.ok(demands.every((d) => d.lengthMm < 1200), "each is shorter than the 1,200 minimum");
  assert.equal(cripples.reduce((a, l) => a + l.quantity, 0), 1, "both cripples come out of ONE bought length");
  assert.ok(cripples[0].item.stockLengthMm >= 1200);
  // a non-MGP10 stud product keeps one stock length per cripple (unchanged behaviour)
  const lvl = computeWorkspace(wallsWorkspace("LVL Smart 10"));
  assert.equal(lvl.scheduleLines.filter((l) => l.roles && l.roles["below-sill"]).reduce((a, l) => a + l.quantity, 0), 2);
});

await t("precut studs (EA): 2.4, 2.7, 3.0, 3.3, 3.6 and 4.2 m only; 3.9 and 4.8 stay random-length LM; the name follows the LVL pattern", () => {
  assert.deepEqual([...PRECUT_STUD_MM], [2400, 2700, 3000, 3300, 3600, 4200]);
  const L = (n, mm) => ({ unit: "piece", quantity: n, stockLengthMm: mm, roles: { stud: n }, product: { section: "90x35", grade: "LVL SMART 10", treatment: "H2", species: null } });
  const g = buildSupplierGroups([{ lines: [L(10, 2400), L(5, 3300), L(4, 3600), L(3, 4200), L(2, 4800), L(2, 3900)] }]);
  const rows = g[0].rows;
  assert.deepEqual(rows.filter((r) => r.unit === "EA").map((r) => [r.product, r.quantity]), [["LVL STUD SMART10 H2 90X35 2.4M", 10], ["LVL STUD SMART10 H2 90X35 3.3M", 5], ["LVL STUD SMART10 H2 90X35 3.6M", 4], ["LVL STUD SMART10 H2 90X35 4.2M", 3]]);
  const lm = rows.find((r) => r.unit === "LM");
  assert.equal(lm.product, "LVL SMART10 H2 90X35 P/M");
  assert.equal(lm.cutText, "2/4.8, 2/3.9");
  // pine uses the same pattern, nothing extra
  assert.equal(productText({ section: "90x45", grade: "MGP10", treatment: "H2" }, { precutMm: 2700 }), "PINE STUD 90x45 MGP10 2.7M");
});

await t("LM rows read P/M, and a piece with no stock length is shown on its row, never dropped", () => {
  const pine = { section: "90x45", grade: "MGP10", treatment: "H2", species: null };
  const g = buildSupplierGroups([{ lines: [
    { unit: "lm", quantity: 12.5, stockLengthMm: null, roles: { noggin: 12.5 }, product: pine },
    { unit: "piece", quantity: 3, stockLengthMm: 2400, roles: { noggin: 3 }, product: pine },
    { unit: "piece", quantity: 2, stockLengthMm: null, roles: { noggin: 2 }, product: pine }] }]);
  const row = g[0].rows[0];
  assert.equal(row.product, "PINE 90x45 MGP10 P/M");
  assert.ok(!/random/.test(row.product));
  assert.equal(row.uncounted, 2);
  assert.equal(row.cutText, "3/2.4, 2 with no stock length");
  assert.equal(row.totalLm, 19.7);
  // only uncounted pieces: the row still exists and says so
  const only = buildSupplierGroups([{ lines: [{ unit: "piece", quantity: 4, stockLengthMm: null, roles: { stud: 4 }, product: pine }] }]);
  assert.equal(only[0].rows[0].cutText, "4 with no stock length");
});

// ── a saved order from before the change ─────────────────────────────────────────────────────────────────────────
const mats = (w) => new Map(w.materials.map((m) => [m.id, m]));
/** A saved order line, the way the server keeps it, at a stock length that is no longer bought. */
function oldLine(sl, fromMm, quantity) {
  return { bucketKey: sl.bucketKey.replace(`|${sl.unit}|${sl.finishedLengthMm}|`, `|${sl.unit}|${fromMm}|`), specKey: sl.specKey, jobMaterialId: sl.jobMaterialIds[0], finishedLengthMm: fromMm, quantity, unit: sl.unit,
    item: { ...sl.item, description: sl.item.description.replace(/[\d,]+ mm length/, `${fromMm.toLocaleString("en-AU")} mm length`), stockLengthMm: fromMm } };
}

await t("a saved pre-032 order: a 3,300 MGP10 plate line is stale, and is offered the 3,600 it now buys as — one tap, quantity kept", () => {
  const w = wallsWorkspace(), c = computeWorkspace(w), m = mats(w);
  const plates = c.scheduleLines.find((l) => l.component === "plates" && /MGP10/.test(l.item.description));
  assert.equal(plates.finishedLengthMm, 4200);
  const old = oldLine(plates, 3300, 2);
  const st = orderLineState(old, c, m);
  assert.equal(st.stale, true);
  assert.equal(st.problem, "line_stale_missing");
  assert.equal(st.suggestion.bucketKey, plates.bucketKey, "the smallest current length that covers the old one");
  assert.deepEqual(st.lengthChange, { fromMm: 3300, toMm: 4200 });
  // one tap: the quantity moves to the new line, the old line is gone
  const r = reconcileStaleLine({ [old.bucketKey]: 2 }, { [old.bucketKey]: old.jobMaterialId }, { line: old, ...st });
  assert.deepEqual(r.qty, { [plates.bucketKey]: 2 });
  // the explanation is plain English
  assert.match(ITEM_STALE_TEXT.line_stale_missing, /no longer in the takeoff/);
});

await t("pre-032 stale lines: studs and plates of the same length are never mixed up, an MGP10 line never moves to LVL, and a line with nothing to move to stays removable", () => {
  const w = wallsWorkspace(), c = computeWorkspace(w), m = mats(w);
  const stud = c.scheduleLines.find((l) => l.component === "studs" && l.roles.stud && l.item.stockLengthMm === 3600);
  const s = orderLineState(oldLine(stud, 3300, 6), c, m);
  assert.equal(s.suggestion.bucketKey, stud.bucketKey);
  assert.equal(s.suggestion.component, "studs");
  // a stud line longer than anything now bought for studs: no suggestion (never guessed)
  const none = orderLineState(oldLine(stud, 9000, 1), c, m);
  assert.equal(none.stale, true);
  assert.equal(none.suggestion, null);
  assert.equal(none.lengthChange, undefined);
  // a line that is still current is not stale and has no length change
  const live = c.scheduleLines.find((l) => l.component === "plates");
  const ok = orderLineState({ bucketKey: live.bucketKey, specKey: live.specKey, jobMaterialId: live.jobMaterialIds[0], finishedLengthMm: live.finishedLengthMm, quantity: 1, unit: live.unit, item: live.item }, c, m);
  assert.equal(ok.stale, false);
  assert.equal(ok.lengthChange, undefined);
});

// ── the order screen shows the supplier layout ───────────────────────────────────────────────────────────────────
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(join(tmpdir(), "takeoff-032b-"));
mkdirSync(join(REPO, "node_modules", ".cache"), { recursive: true });
const out = join(REPO, "node_modules", ".cache", `takeoff-hub032b-render-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import { TimberTakeoff } from ${JSON.stringify(join(REPO, "src/components/takeoff/OrdersScreen.jsx"))};
import { WallsSetup } from ${JSON.stringify(join(REPO, "src/components/takeoff/FamilySetup.jsx"))};
import { wallFramingDefaults, WALL_FRAMING_RULES, buildSupplierGroups } from ${JSON.stringify(join(REPO, "shared/takeoff/index.js"))};
export const take = (items) => renderToStaticMarkup(<TimberTakeoff groups={buildSupplierGroups(items)} />);
export const card = (spec) => renderToStaticMarkup(<WallsSetup value={{ name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec, rules: { ...WALL_FRAMING_RULES } }} onChange={() => {}} />);
export const defaults = () => wallFramingDefaults([]);
`);
await build({ entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent", nodePaths: [join(REPO, "node_modules")],
  external: ["react", "react-dom", "react-dom/server", "react-router-dom"], define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" } });
const ui = await import(pathToFileURL(out).href);

await t("the order screen shows the Timber order grouped like the PDF: role headings, product rows, count/length cuts, LM and EA, and uncounted pieces", () => {
  const pine = { section: "90x45", grade: "MGP10", treatment: "H2", species: null };
  const lvl = { section: "90x35", grade: "LVL SMART 10", treatment: "H2", species: null };
  const html = ui.take([{ lines: [
    { unit: "piece", quantity: 12, stockLengthMm: 6000, roles: { "bottom-plate": 6, "top-plate": 6 }, product: pine },
    { unit: "piece", quantity: 4, stockLengthMm: 3600, roles: { "bottom-plate": 2, "top-plate": 2 }, product: pine },
    { unit: "piece", quantity: 270, stockLengthMm: 2700, roles: { stud: 270 }, product: lvl },
    { unit: "piece", quantity: 15, stockLengthMm: 5100, roles: { stud: 15 }, product: lvl },
    { unit: "piece", quantity: 2, stockLengthMm: null, roles: { noggin: 2 }, product: pine }] }]);
  for (const s of ["T&amp;B PLATES", "STUDS", "NOGGINS", "PINE 90x45 MGP10 P/M", "12/6, 4/3.6", "LVL STUD SMART10 H2 90X35 2.7M", "270 EA", "LVL SMART10 H2 90X35 P/M", "15/5.1", "76.50 LM", "2 with no stock length", "data-testid=\"timber-takeoff\""]) {
    assert.ok(html.includes(s), `${s} :: ${html.slice(0, 200)}`);
  }
  assert.ok(!/random lengths/.test(html), "LM rows read P/M only");
  assert.ok(html.indexOf("T&amp;B PLATES") < html.indexOf("STUDS") && html.indexOf("STUDS") < html.indexOf("NOGGINS"), "the supplier's group order");
  assert.equal(ui.take([]), "", "an empty order shows nothing");
});

await t("the editors say the new MGP10 rule, not the old 1,200 then 300 mm steps for MGP10", () => {
  const html = ui.card(ui.defaults());
  assert.ok(/data-wall-part-stock-rule/.test(html), "the MGP10 plate part says its rule");
  assert.ok(/only every 600 mm above 3 m/.test(html));
  assert.ok(!/600, 1,200, 1,800/.test(html));
});

console.log(`takeoff-tc-hub032b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
