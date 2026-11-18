// Framing you can see (Sam, 18 Nov 2026, live Wall 1 3,955 x 2,700, W1 3,430 wide, sill 2,000, head 2,600): the opening card
// said "Kings, Jacks, Cripples ..." but the "On this wall" list said "Studs, Below-sill pieces ..." and the elevation drew
// only studs. Now the list uses the card's words, kings are their own row (display only), the elevation draws every member,
// and a lintel size typed by hand completes the opening with no extra tap.
//   node scripts/tests/takeoff-tc-framing-visible.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { build } from "esbuild";
import * as WF from "../../shared/takeoff/index.js";
import { WALL_FRAMING_RULES, computeWorkspace, wallFramingDefaults } from "../../shared/takeoff/index.js";
import { memberGroup } from "../../shared/takeoff/supplierOrder.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(join(tmpdir(), "takeoff-framing-"));
mkdirSync(join(REPO, "node_modules", ".cache"), { recursive: true });
const out = join(REPO, "node_modules", ".cache", `takeoff-framing-visible-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `export { wallQuantities, openingFramingItems } from ${JSON.stringify(join(REPO, "src/components/takeoff/WallsScreen.jsx"))};\n`);
await build({ entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent", nodePaths: [join(REPO, "node_modules")],
  external: ["react", "react-dom", "react-dom/server", "react-router-dom"], define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" } });
const { wallQuantities, openingFramingItems } = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
const READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const ROOF = { carriesRoof: true, roofMass: "sheet", rlwMm: 3000, rafterSpacingMm: 600, windClass: "N2" };
const wm = (id, widthMm, heightMm, name) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm, name } });
const om = (id, parentId, label, type, xMm, widthMm, heightMm, sillMm, extra = {}) => ({ id, kind: "opening", parentId, inputs: { xMm, sillMm, widthMm, heightMm, label, type, ...extra } });
const run = (measurements, rules = {}) => computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
  materials: [{ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec: READY(), rules: { ...WALL_FRAMING_RULES, ...ROOF, ...rules } }],
  measurements, contributions: measurements.filter((m) => m.kind === "wall").map((m) => ({ id: `c-${m.id}`, measurementId: m.id, jobMaterialId: "walls", role: "wall" })) });
const SAM = (extra = {}) => [wm("w", 3955, 2700, "Wall 1"), om("o", "w", "W1", "window", 450, 3430, 600, 2000, extra)];
const WR = (c) => c.materialResults.walls;
// the list's label (before " — cut from ...") with its quantity; two rows of one label add up
const rows = (c) => wallQuantities(WR(c), "w", null).reduce((o, r) => { const k = r.text.split(" — ")[0]; o[k] = (o[k] || 0) + r.qty; return o; }, {});

t("list: Wall 1 reads in the opening card's words (cripples below sill 6, king studs 2, jack studs 2, sill trimmers 3, lintels 1)", () => {
  const r = rows(run(SAM()));
  assert.equal(r["Cripples below sill"], 6);
  assert.equal(r["King studs"], 2);
  assert.equal(r["Jack studs"], 2);
  assert.equal(r["Sill trimmers"], 3);
  assert.equal(r["Lintels"], 1);
  assert.equal(r["Studs"], 1, "the grid stud left once the two kings are named");
  assert.ok(!Object.keys(r).some((k) => /Below-sill|Above-head/.test(k)));
});

t("list: the split is display only, the demands and the order are untouched (kings still plain stud demands; same total studs)", () => {
  const c = run(SAM());
  const roles = WR(c).demands.map((d) => d.role);
  assert.equal(roles.filter((x) => x === "stud").length, 3);
  assert.ok(!roles.includes("king"));
  const r = rows(c);
  assert.equal(r["Studs"] + r["King studs"], 3);
  assert.equal(WR(c).layouts[0].totals.studs, 3);
});

t("cripples above head read 'Cripples above head' (roof frame lintel)", () => {
  const r = rows(run(SAM({ lintelPosition: "roofFrame" })));
  assert.ok(r["Cripples above head"] > 0, JSON.stringify(r));
  assert.equal(r["Head trimmers"], 1);
});

t("supplier order headings still group the same", () => {
  for (const [role, key] of [["below-sill", "studs"], ["above-head", "studs"], ["stud", "studs"], ["king", "jambs"], ["jack", "jambs"], ["sill trimmer", "trimmers"], ["head trimmer", "trimmers"], ["lintel", "lintels"], ["head block", "junction"]]) assert.equal(memberGroup(role).key, key, role);
});

t("elevation: kings, jacks, cripples, trimmers and the lintel are drawn from the engine layout", () => {
  const c = run(SAM({ lintel: { depthMm: 100, breadthMm: 45, plies: 1 } }));
  const l = WR(c).layouts[0];
  const items = openingFramingItems(l, l.openings[0], "p:", { x0: 0, x1: 3955, y0: 0, y1: 2700 });
  const by = (s) => items.filter((i) => i.state === s);
  assert.equal(by("jack").length, 2);
  assert.equal(by("cripple").length, 6, "six cripples below the sill; none above (the lintel fills the head)");
  assert.equal(by("trimmer").length, 1, "the stacked sill trimmers are one block (3 stacked)");
  const sill = by("trimmer")[0].rect;
  assert.equal(Math.round(sill.y1 - sill.y0), 135, "3 x 45 stacked");
  assert.equal(Math.round(sill.y1), 2000, "under the sill at 2,000 from the floor");
  assert.equal(by("lintel").length, 1);
  assert.equal(Math.round(by("lintel")[0].rect.y0), 2600, "sits on the head at 2,600");
  assert.deepEqual(by("jack").map((i) => i.a.y), [45, 45].map((x) => x), "jacks stand on the bottom plate");
  assert.equal(Math.round(by("jack")[0].b.y), 2600, "and run to the head");
  const o = l.openings[0], jx = by("jack").map((i) => i.a.x).sort((a, b) => a - b);
  assert.equal(jx[0], o.xLeftMm - 22.5, "left jack stands just outside the clear opening");
  assert.equal(jx[1], o.xRightMm + 22.5, "right jack stands just outside the clear opening");
});

t("elevation: roof-frame lintel gets a head trimmer and cripples above it, no solid lintel under the top plate", () => {
  const c = run(SAM({ lintelPosition: "roofFrame" }));
  const l = WR(c).layouts[0];
  const items = openingFramingItems(l, l.openings[0], "p:", { x0: 0, x1: 3955, y0: 0, y1: 2700 });
  assert.equal(items.filter((i) => i.state === "lintel").length, 0);
  assert.equal(items.filter((i) => i.state === "trimmer").length, 2, "sill and head");
  assert.ok(items.filter((i) => i.state === "cripple").length > 6, "cripples above the head as well");
});

t("typed floor-frame lintel (Depth / Thickness / Pieces -> Use this size) completes the opening with no extra tap", () => {
  const c = run(SAM({ lintelPosition: "floorFrame", lintel: { depthMm: 240, breadthMm: 45, plies: 1 } }));
  const r = WR(c).layouts[0].openings[0].rule;
  assert.equal(r.lintel.status, "typed");
  assert.equal(r.lintel.grade, "LVL13", "the item's own lintel product (SmartLVL 13), the grade the table path uses");
  assert.equal(WR(c).status.quantity, "calculated");
  assert.ok(!WR(c).problems.some((p) => p.code === "timber_identity_incomplete"), "no 'choose the grade' left");
  const d = WR(c).demands.find((x) => x.role === "lintel");
  assert.equal(d.identity.grade, "LVL13");
  assert.equal(c.orderReady?.ready ?? WR(c).status.procurement, WR(c).status.procurement);
  assert.equal(WR(c).status.procurement, "ready");
});

t("typed lintel takes the item's lintel product: Pine MGP10 item -> MGP10; a typed grade of its own is kept", () => {
  const mgp = WR(run(SAM({ lintel: { depthMm: 190, breadthMm: 45, plies: 2 } }), { lintelProduct: "MGP10" })).demands.find((x) => x.role === "lintel");
  assert.equal(mgp.identity.grade, "MGP10");
  const own = WR(run(SAM({ lintel: { depthMm: 190, breadthMm: 45, plies: 1, grade: "lvl15" } }))).demands.find((x) => x.role === "lintel");
  assert.equal(own.identity.grade, "LVL15");
});

t("typed lintel on the table path's own size: same identity as the table lintel", () => {
  const table = WR(run(SAM({ lintelPosition: "roofFrame" }))).demands.find((x) => x.role === "lintel");
  const typed = WR(run(SAM({ lintelPosition: "roofFrame", lintel: { depthMm: 240, breadthMm: 45, plies: 1 } }))).demands.find((x) => x.role === "lintel");
  assert.deepEqual(typed.identity, table.identity);
  assert.equal(typed.lengthMm, table.lengthMm);
});

// order totals byte-identical to 84170c1 (the engine before this change), for every case that doesn't type a gradeless lintel
let before = null;
try { const d = execSync("mktemp -d").toString().trim(); execSync(`git archive 84170c1 shared | tar -x -C ${d}`, { stdio: "ignore" }); before = await import(`${d}/shared/takeoff/index.js`); } catch { /* commit not present in this clone */ }
t("order lines and totals byte-identical to 84170c1 (default, roof frame, floor frame, typed with a grade, Pine MGP10 item)", () => {
  if (!before) return;
  const go = (E, extra, rules = {}) => {
    const spec = E.wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
    const ms = [...SAM(extra), wm("w2", 5000, 2400, "Wall 2"), om("o2", "w2", "W2", "window", 1000, 1200, 1200, 900)];
    const c = E.computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
      materials: [{ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec, rules: { ...E.WALL_FRAMING_RULES, ...ROOF, ...rules } }],
      measurements: ms, contributions: ms.filter((m) => m.kind === "wall").map((m) => ({ id: `c-${m.id}`, measurementId: m.id, jobMaterialId: "walls", role: "wall" })) });
    return JSON.stringify({ s: c.scheduleLines, t: c.totalLm, r: c.orderReady, d: c.materialResults.walls.demands });
  };
  for (const [e, r] of [[{}, {}], [{ lintelPosition: "roofFrame" }, {}], [{ lintelPosition: "floorFrame" }, {}], [{ lintel: { depthMm: 190, breadthMm: 45, plies: 1, grade: "LVL13" } }, {}],
    [{ lintelPosition: "floorFrame", lintel: { depthMm: 240, breadthMm: 45, plies: 1, grade: "LVL13" } }, {}], [{}, { lintelProduct: "MGP10" }]]) assert.equal(go(WF, e, r), go(before, e, r), JSON.stringify([e, r]));
});

console.log(`takeoff-tc-framing-visible: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
