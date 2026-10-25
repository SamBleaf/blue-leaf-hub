// HUB 030 (Sam, 25 Oct 2026): "we NEVER use the hardies cavity batten - we always use 90 x 35 pine for battens".
// In chat: H3 treatment, 6.0 m longest, 300 mm steps (all timber), offcuts shared; pine battens bought ONCE for the
// whole job across every cladding ("Whole job"); a Support battens item with nothing entered uses 600 centres and
// counts no batten fixings (decision 2). Drives the REAL engine through computeWorkspace.
//   node scripts/tests/takeoff-tc-hub030.test.mjs
import assert from "node:assert/strict";
import { OWNER_BATTEN, SUPPORT_BATTEN_DEFAULTS, computeWorkspace, familyProblems, methodFor, normaliseFamilySpec } from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";
import { BATTEN, BATTEN_SETOUT_FACE_MM, FOLLOWERS_VERSION, FOLLOWER_TEXT } from "../../shared/takeoff/engine/followers.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); } }

const group = (name, widthMm) => productGroups({ family: "cladding" }).find((g) => g.name === name && (widthMm == null || g.widthMm === widthMm));
const fam = (spec) => { const m = methodFor(spec); return { spec, methodKey: m.key, methodVersion: m.version }; };
const JOINT = { atMm: [], gapMm: 10, detailRef: "H-flashing" };
const axon = (id, name = "Axon 400 smooth", rules = {}) => ({ id, name, ...fam({ ...specFromGroup(group("Axon 400 smooth")), assemblyId: "axon-vertical" }), rules: { route: "cavity", jointRows: JOINT, ...rules } });
const linea = (id) => ({ id, name: "Linea 150", ...fam(specFromGroup(group("Linea", 150))), rules: {} });
const stria = (id) => ({ id, name: "Stria", ...fam(specFromGroup(group("Stria smooth", 325))), rules: {} });
const shiplap = (id) => ({ id, name: "Shiplap", ...fam({ family: "timber-cladding", layout: "course", orientation: "horizontal", supply: "random", orderIncrementM: 1, product: { name: "Shiplap", widthMm: 135, thicknessMm: 19, effectiveCoverMm: 120 } }), rules: {} });
const rect = (id, widthMm, heightMm, name) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm, name } });
const op = (id, parentId, xMm, sillMm, widthMm, heightMm, label, type = "window") => ({ id, kind: "opening", parentId, inputs: { xMm, sillMm, widthMm, heightMm, label, type } });
const con = (id, measurementId, jobMaterialId, role = "wall") => ({ id, measurementId, jobMaterialId, role });
const ws = (materials, measurements, contributions) => ({ id: "w", calibrations: [], documents: [], orders: [], placements: [], materials, measurements, contributions });
const battenLines = (c) => c.scheduleLines.filter((l) => l.follower === "battens");
const layOf = (c, mid, label) => c.materialResults[mid].layouts.find((L) => L.wallLabel === label).followers.battens;

t("the owner's batten: 90 × 35 H3 pine, 1,200 to 6,000 in 300 mm steps, one definition for the automatic and the Support battens", () => {
  assert.deepEqual([OWNER_BATTEN.name, OWNER_BATTEN.widthMm, OWNER_BATTEN.thicknessMm, OWNER_BATTEN.treatment, OWNER_BATTEN.source], ["90 × 35 H3 pine batten", 90, 35, "H3", "OWNER-2026-10-25"]);
  assert.deepEqual([...OWNER_BATTEN.lengthsMm], Array.from({ length: 17 }, (_, i) => 1200 + i * 300));
  assert.deepEqual([BATTEN.name, BATTEN.code, BATTEN.widthMm, BATTEN.thicknessMm, [...BATTEN.lengthsMm]], [OWNER_BATTEN.name, null, 90, 35, [...OWNER_BATTEN.lengthsMm]]);
  assert.equal(FOLLOWER_TEXT.battens, "90 × 35 H3 pine batten");
  // the set-out face stays 70 so no batten moves; the follower rules' version is unchanged (tape and H-flashing keys)
  assert.equal(BATTEN_SETOUT_FACE_MM, 70);
  assert.equal(FOLLOWERS_VERSION, 1);
});

t("no line on an Axon, Linea, Stria or timber cladding takeoff is ever the Hardie Cavity Batten", () => {
  const mats = [axon("a"), linea("l"), stria("s"), shiplap("t")];
  const meas = [rect("wa", 3600, 2700, "A"), rect("wl", 3000, 2400, "L"), rect("ws", 2400, 2700, "S"), rect("wt", 3000, 2400, "T")];
  const c = computeWorkspace(ws(mats, meas, [con("1", "wa", "a"), con("2", "wl", "l"), con("3", "ws", "s"), con("4", "wt", "t")]));
  const bl = battenLines(c);
  assert.ok(bl.length >= 1);
  for (const l of bl) {
    assert.match(l.item.description, /^90 × 35 H3 pine batten — [\d,]+ mm length$/);
    assert.ok(OWNER_BATTEN.lengthsMm.includes(l.finishedLengthMm), `${l.finishedLengthMm}`);
  }
  assert.ok(!JSON.stringify(c.scheduleLines.map((l) => l.item)).match(/405307|Cavity Batten/));
});

t("bought once for the WHOLE JOB: two claddings' battens are one cutting plan, offcuts shared, under the first cladding", () => {
  // A (Axon) 3,500 × 2,700 alone: 7 × 2,700 uprights + a 3,500 bottom and top → 3 × 5,400 + 1 × 2,700 + 2 × 3,600 = 6;
  // B (Axon, a second product line) the same → 6. Together the two odd uprights share one 5,400 → 11, not 12
  const one = (mat, w) => computeWorkspace(ws([mat], [w], [con("c", w.id, mat.id)]));
  const qty = (c) => battenLines(c).reduce((n, l) => n + l.quantity, 0);
  assert.equal(qty(one(axon("a"), rect("wa", 3500, 2700, "A"))), 6);
  const both = computeWorkspace(ws([axon("a", "Axon front"), axon("b", "Axon side")], [rect("wa", 3500, 2700, "A"), rect("wb", 3500, 2700, "B")], [con("1", "wa", "a"), con("2", "wb", "b")]));
  assert.equal(qty(both), 11);
  const bl = battenLines(both);
  assert.ok(bl.every((l) => l.bucketKey.includes("|a|")), "they sit under the first cladding");
  assert.ok(bl.some((l) => l.jobMaterialIds.includes("b")), "and name the second");
  assert.ok(both.materialResults.b.problems.some((p) => p.code === "followers_pooled" && p.blocking === false && /its battens and foam tape are ordered once for the job with Axon front\.$/.test(p.message)));
  // each wall's pieces are attributed to its own cladding's contribution (conservation)
  for (const l of bl) assert.equal(both.contributions.flatMap((x) => x.pieces).filter((p) => p.bucketKey === l.bucketKey).reduce((n, p) => n + p.quantity, 0), l.quantity);
});

t("the batten stations and metres are the same as before HUB 030: only joins under 6,000 go", () => {
  // a 7,000 wall: its bottom and top join over an upright (7,000 > 6,000); a 5,900 wall's don't
  const run = (w) => { const c = computeWorkspace(ws([axon("a")], [rect("w", w, 2700, "W")], [con("c", "w", "a")])); return layOf(c, "a", "W"); };
  const long = run(7000), short = run(5900);
  assert.equal(long.lines.filter((l) => l.kind === "bottom").length, 2);
  assert.ok(long.lines.filter((l) => l.kind === "bottom").every((l) => l.lengthMm <= 6000 + 1e-6));
  assert.equal(short.lines.filter((l) => l.kind === "bottom").length, 1);
  // uprights at the sheet joins and every 600 (the 70 mm set-out face): unchanged
  assert.deepEqual([...new Set(short.lines.filter((l) => l.kind === "upright").map((l) => l.a.x))], [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 5900]);
  // 9 × 2,700 + 1 cut? no: 11 uprights × 2,700 + 5,900 bottom + 5,900 top = 41.5 m, the same metres as before
  assert.equal(short.totalMm, 11 * 2700 + 2 * 5900);
});

t("a window and a door: the battens round them are unchanged pieces, bought from pine lengths with nothing wasted", () => {
  const c = computeWorkspace(ws([axon("a")], [rect("w", 4800, 2700, "North"), op("o", "w", 1350, 900, 900, 900, "W01")], [con("c", "w", "a")]));
  const b = layOf(c, "a", "North");
  assert.equal(b.totalMm, 36600);
  const bought = battenLines(c).reduce((m, l) => m + l.quantity * l.finishedLengthMm, 0);
  assert.equal(bought, 36600, "2 × 5,700 + 4 × 5,400 + 3,600");
});

t("Support battens with nothing entered: the owner's pine batten, 600 centres, fixings not counted — ready to order, nothing to fix", () => {
  const n = normaliseFamilySpec({ family: "batten", product: {} });
  assert.deepEqual([n.product.id, n.product.name, n.product.widthMm, n.product.thicknessMm, n.product.lengthsMm.length], [OWNER_BATTEN.id, OWNER_BATTEN.name, 90, 35, 17]);
  assert.deepEqual(familyProblems({ family: "batten", product: {} }), []);
  // a half-typed custom batten is never replaced
  assert.equal(normaliseFamilySpec({ family: "batten", product: { id: "custom-batten", name: null } }).product.id, "custom-batten");
  // the normaliser is a fixed point (the server keeps exactly this)
  assert.deepEqual(normaliseFamilySpec(n), n);
  const bat = { id: "bat", name: "Support battens", ...fam({ family: "batten", orientation: "vertical", product: {} }), rules: {} };
  const c = computeWorkspace(ws([bat], [rect("w", 3600, 2700, "Wall 1")], [con("c", "w", "bat")]));
  const res = c.materialResults.bat;
  assert.deepEqual(res.problems.filter((p) => p.blocking !== false).map((p) => p.code), []);
  assert.ok(c.scheduleLines.some((l) => l.jobMaterialIds.includes("bat") && l.problems.length === 0 && /90 × 35 H3 pine batten/.test(l.item.description)));
  assert.deepEqual(res.layouts[0].stations.map((s) => s.atMm), [0, 600, 1200, 1800, 2400, 3000, 3600], "600 centres");
  assert.equal(res.layouts[0].fixings["support-to-frame"].scope, "exclude");
  assert.equal(res.layouts[0].fixings["support-to-frame"].reason, SUPPORT_BATTEN_DEFAULTS.fixingScope.reason);
  assert.equal(c.orderReady, true, JSON.stringify(c.scheduleLines.map((l) => l.problems)));
  // a spacing entered by hand wins
  const at450 = computeWorkspace(ws([{ ...bat, rules: { maxSpacingMm: 450 } }], [rect("w", 1800, 2700, "Wall 1")], [con("c", "w", "bat")]));
  assert.deepEqual(at450.materialResults.bat.layouts[0].stations.map((s) => s.atMm), [0, 450, 900, 1350, 1800]);
});

t("a single stock length is a one-length list (never 'stock policy missing'); the Hardie Cavity Batten picked on purpose still orders as Hardie", () => {
  const one = { id: "bat", name: "Battens", ...fam({ family: "batten", orientation: "vertical", product: { name: "Pine 90 × 35", widthMm: 90, thicknessMm: 35, lengthMm: 4800 } }), rules: {} };
  const c = computeWorkspace(ws([one], [rect("w", 3000, 2400, "Wall 1")], [con("c", "w", "bat")]));
  assert.ok(!c.materialResults.bat.problems.some((p) => p.code === "stock-policy-missing"), JSON.stringify(c.materialResults.bat.problems.map((p) => p.code)));
  assert.ok(c.scheduleLines.some((l) => l.jobMaterialIds.includes("bat") && l.finishedLengthMm === 4800));
  const hardie = productGroups({}).find((g) => /Cavity Batten/.test(g.name));
  assert.ok(hardie, "the Hardie Cavity Batten stays in the catalogue for a deliberate pick");
  const h = { id: "hb", name: "Cavity battens", ...fam(specFromGroup(hardie)), rules: { maxSpacingMm: 600 } };
  const hc = computeWorkspace(ws([h], [rect("w", 3000, 2400, "Wall 1")], [con("c", "w", "hb")]));
  assert.ok(hc.scheduleLines.some((l) => l.jobMaterialIds.includes("hb") && /Cavity Batten/.test(l.item.description)));
});

console.log(`takeoff-tc-hub030: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
