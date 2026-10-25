// Wall-by-wall plan step 4 (Sam, 21 Oct 2026): battens, foam tape and H-flashing worked out AUTOMATICALLY from each
// cladding's own layout — nothing to set up. Drives the REAL engine through computeWorkspace (dispatch → sheet / course
// layout → engine/followers.js → one allocator → purchase lines → order snapshot → supplier PDF). Every quantity below is
// worked out by hand in the comment beside it, on real multi-wall jobs with windows, a door, a gable, an H joint and a
// Rectangle outline traced on a scaled elevation.
//   Axon: uprights at both ends, every vertical sheet join and 600 centres from the first sheet; bottom, top (sloped on a
//         gable / outline) and behind every H joint; both sides and the head of every opening, the sill on windows;
//         foam tape (code 304560, 25 m rolls) behind every vertical join, full height, stopping at openings and the
//         H-flashing; H-flashing (code 305613, 3,000 lengths) on every horizontal joint, offcuts shared, no lap.
//   Linea / Stria: battens across the boards at 600. Timber cladding: 450. Direct fix: no battens. No nails.
//   node scripts/tests/takeoff-tc-autobattens.test.mjs
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildCalibration, computeWorkspace, methodFor, orderLineState, verifyCalibration } from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";
import { BATTEN, FOAM_TAPE, FOLLOWER_TEXT, H_FLASHING, followerRule } from "../../shared/takeoff/engine/followers.js";
import { normaliseFamilySpec } from "../../shared/takeoff/engine/families.js";
import { BLUE_LEAF_JH_DEFAULTS, applyCompanyDefault } from "../../shared/takeoff/companyDefaults.js";
import { rectCorners } from "../../src/components/takeoff/measure/geometry.js";
import { buildExportSnapshot } from "../../server/lib/takeoff/takeoffService.mjs";
import { renderSiteAppendixPdf, renderSupplierOrderPdf } from "../../server/lib/takeoff/takeoffPdf.mjs";

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}\n    ${(e.stack || "").split("\n").find((x) => /autobattens\.test/.test(x)) || ""}`); }
}
const near = (a, b, eps = 1e-3, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≈ ${b}`);

// a scaled, checked elevation page (the HUB 023 frame): x mm across, y mm up
const k = 0.05, X0 = 100, Y0 = 100;
const cal = { id: "cal", documentId: "d", pageIndex: 0, calibrationRevision: 1,
  ...verifyCalibration(buildCalibration({ basisRotation: 0, horizontal: { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 }, vertical: { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 } }).calibration,
    { p1: { x: X0, y: Y0 }, p2: { x: X0 + 3000 * k, y: Y0 }, expectedMm: 3000 }) };
const at = (x, y) => ({ x: X0 + x * k, y: Y0 + y * k });

const group = (name, widthMm) => productGroups({ family: "cladding" }).find((g) => g.name === name && (widthMm == null || g.widthMm === widthMm));
const fam = (spec) => { const m = methodFor(spec); return { spec, methodKey: m.key, methodVersion: m.version }; };
const JOINT = { atMm: [], gapMm: 10, detailRef: "H-flashing" };
const axon400 = (rules = {}, spareRate = 0, extra = {}) => ({ id: "clad", name: "Axon 400 smooth", ...fam({ ...specFromGroup(group("Axon 400 smooth")), assemblyId: "axon-vertical", spareRate, ...extra }), rules: { route: "cavity", jointRows: JOINT, ...rules } });
const rect = (id, widthMm, heightMm, name) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm, name } });
const gable = (id, widthMm, eavesHeightMm, apexXMm, apexHeightMm, name) => ({ id, kind: "wall", inputs: { kind: "gable", widthMm, eavesHeightMm, apexXMm, apexHeightMm, name } });
const outline = (id, points, name) => ({ id, kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points, inputs: { kind: "polygon", name } });
const op = (id, parentId, xMm, sillMm, widthMm, heightMm, label, type = "window") => ({ id, kind: "opening", parentId, inputs: { xMm, sillMm, widthMm, heightMm, label, type } });
const con = (id, measurementId, jobMaterialId, role = "wall") => ({ id, measurementId, jobMaterialId, role });
function ws(materials, measurements, extraContribs = [], matId = materials[0].id) {
  const walls = measurements.filter((m) => m.kind === "wall");
  return { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials, measurements, contributions: [...walls.map((w) => con(`c-${w.id}`, w.id, matId)), ...extraContribs] };
}
const linesOf = (c, id = "clad") => c.scheduleLines.filter((l) => l.jobMaterialIds.includes(id));
const follower = (c, kind, id = "clad") => linesOf(c, id).filter((l) => l.follower === kind);
const qtyOf = (c, kind, id) => follower(c, kind, id).reduce((n, l) => n + l.quantity, 0);
const sheetsOf = (c, id = "clad") => linesOf(c, id).filter((l) => l.unit === "sheet").reduce((n, l) => n + l.quantity, 0);
const lay = (c, label, id = "clad") => c.materialResults[id].layouts.find((L) => L.wallLabel === label);
const battens = (c, label, id) => lay(c, label, id).followers.battens;
const kinds = (b) => b.lines.map((l) => l.kind);
const lens = (b, kind) => b.lines.filter((l) => l.kind === kind).map((l) => l.lengthMm);

// ── the multi-wall Axon job (Axon 400 smooth, 2,450 / 2,750 / 3,000 sheets; Blue Leaf's 10 mm H-flashing joint) ──
// North 6,000 × 2,700, W1 (1,000 → 2,200, sill 900, head 2,100) and W2 (3,800 → 5,000)
// East 4,000 × 2,700, door D1 1,500 → 2,400, 2,100 high
// Tall 3,000 × 3,600: the joint goes in at 3,000 (courses 0–3,000 and 3,010–3,600)
// Gable 6,000 wide, eaves 2,400, apex 3,600 at 3,000 (rakes rise 0.4 mm per mm): joint at 3,000 too
// Outline: a Rectangle traced on the elevation, 4,000 × 3,000, window W3 1,000 → 2,200, sill 1,000, head 2,200
const JOB = [rect("n", 6000, 2700, "North"), rect("e", 4000, 2700, "East"), rect("t", 3000, 3600, "Tall"), gable("g", 6000, 2400, 3000, 3600, "Gable"),
  outline("o", rectCorners(at(0, 0), at(4000, 3000)), "Outline"),
  op("w1", "n", 1000, 900, 1200, 1200, "W1"), op("w2", "n", 3800, 900, 1200, 1200, "W2"), op("d1", "e", 1500, 0, 900, 2100, "D1", "door"), op("w3", "o", 1000, 1000, 1200, 1200, "W3")];
const job = (over = {}) => computeWorkspace(ws([axon400(over.rules, over.spareRate ?? 0, over.spec)], over.measurements || JOB, over.extra || []));

await t("rules: Axon sheets get battens + foam tape + H-flashing; Linea / Stria battens at 600 across the boards; timber cladding at 450; direct fix no battens; Matrix, AAC and foam none", () => {
  const rule = (spec, rules = {}) => { const m = methodFor(spec); return followerRule({ methodKey: m.key, rules }, normaliseFamilySpec(spec)); };
  assert.deepEqual(rule(specFromGroup(group("Axon 400 smooth")), { route: "cavity" }), { kind: "axon", centresMm: 600, battens: true, extras: true, across: "both" });
  assert.deepEqual(rule(specFromGroup(group("Axon 400 smooth"))), { kind: "axon", centresMm: 600, battens: true, extras: true, across: "both" }, "no route chosen: still a cavity until it says direct");
  assert.deepEqual(rule(specFromGroup(group("Axon 400 smooth")), { route: "direct" }), { kind: "axon", centresMm: 600, battens: false, extras: true, across: "both" });
  assert.deepEqual(rule(specFromGroup(group("Linea", 150))), { kind: "boards", centresMm: 600, battens: true, extras: false, across: "vertical" }, "Linea lies flat → upright battens");
  assert.deepEqual(rule(specFromGroup(group("Stria smooth", 325))), { kind: "boards", centresMm: 600, battens: true, extras: false, across: "horizontal" }, "Stria standing → horizontal battens");
  assert.deepEqual(rule({ ...specFromGroup(group("Stria smooth", 325)), orientation: "horizontal" }), { kind: "boards", centresMm: 600, battens: true, extras: false, across: "vertical" });
  const timber = { family: "timber-cladding", layout: "course", orientation: "horizontal", supply: "random", orderIncrementM: 1, product: { name: "Shiplap", widthMm: 135, thicknessMm: 19, effectiveCoverMm: 120 } };
  assert.deepEqual(rule(timber), { kind: "timber", centresMm: 450, battens: true, extras: false, across: "vertical" });
  assert.deepEqual(rule({ ...timber, orientation: "vertical", supply: "fixed", product: { ...timber.product, lengthsMm: [5400] } }), { kind: "timber", centresMm: 450, battens: true, extras: false, across: "horizontal" });
  assert.equal(rule(specFromGroup(group("Linea", 150)), { route: "direct" }), null, "direct-fixed boards: nothing follows");
  assert.equal(rule(specFromGroup(group("Stria smooth", 325)), { route: "direct" }), null, "Stria fixed straight to the frame: no battens");
  assert.equal(rule(timber, { route: "direct" }), null, "timber cladding fixed straight to the frame: no battens");
  assert.equal(rule(specFromGroup(group("Matrix", 1190))), null);
  assert.equal(rule(specFromGroup(productGroups({ family: "aac" })[0])), null);
  assert.equal(rule({ family: "foam", layout: "sheet", product: { name: "Rendex" } }), null);
  // HUB 030 (Sam, 25 Oct 2026): the owner's 90 × 35 H3 pine, never the Hardie Cavity Batten; 1,200–6,000 in 300 mm steps
  assert.deepEqual([BATTEN.name, BATTEN.code, BATTEN.widthMm, BATTEN.thicknessMm, [...BATTEN.lengthsMm]],
    ["90 × 35 H3 pine batten", null, 90, 35, Array.from({ length: 17 }, (_, i) => 1200 + i * 300)], "the owner's pine batten and its 300 mm stock lengths");
  assert.deepEqual([FOAM_TAPE.code, FOAM_TAPE.rollMm, H_FLASHING.code, H_FLASHING.lengthMm], ["304560", 25000, "305613", 3000]);
});

await t("one Axon wall (4,800 × 2,700 + a 900 window): 16 batten pieces, 36.6 m → 7 pine battens; 8.1 m of tape → 1 roll; no H joint, no H-flashing", () => {
  const c = computeWorkspace(ws([{ ...axon400(), ...fam(specFromGroup(group("Axon 133 smooth"))), rules: {} }], [rect("n", 4800, 2700, "North"), op("w", "n", 1350, 900, 900, 900, "W01")]));
  const b = battens(c, "North");
  // uprights at 0, 600 … 4,800 (joins 1,200 / 2,400 / 3,600 among them): 9, the one at 1,800 cut round the window (900 + 900)
  assert.deepEqual(b.lines.filter((l) => l.kind === "upright").map((l) => l.a.x), [0, 600, 1200, 1800, 1800, 2400, 3000, 3600, 4200, 4800]);
  assert.deepEqual(lens(b, "upright"), [2700, 2700, 2700, 900, 900, 2700, 2700, 2700, 2700, 2700]);
  assert.deepEqual([lens(b, "bottom"), lens(b, "top")], [[4800], [4800]], "4,800 bottom and top are one pine batten each (they join only past 6,000)");
  assert.deepEqual([lens(b, "jamb"), lens(b, "head"), lens(b, "sill")], [[900, 900], [900], [900]], "both sides, the head and the sill of the window");
  assert.equal(b.lines.length, 16); near(b.totalMm, 36600);
  // 36.6 m cut from the 300 mm pine lengths with offcuts shared: 2 × 5,700 + 4 × 5,400 + 3,600 = 36.6 m, nothing wasted
  assert.deepEqual(linesOf(c).map((l) => `${l.quantity} ${l.unit}${l.finishedLengthMm ? ` @${l.finishedLengthMm}` : ""}`), ["4 sheet @2750", "2 piece @5700", "4 piece @5400", "1 piece @3600", "1 roll"]);
  assert.equal(lay(c, "North").followers.tape.totalMm, 8100, "3 joins × 2,700, the window clear of every join");
  assert.equal(follower(c, "hflashing").length, 0);
  assert.equal(c.orderReady, true, JSON.stringify(c.scheduleLines.map((l) => l.problems)));
});

await t("the multi-wall job — every wall's battens exactly: North 25 pieces 46.5 m, East (door) 13 / 29.6 m, Tall (H joint) 9 / 30.6 m, Gable 15 / 47.837 m, Outline 16 / 34.4 m", () => {
  const c = job();
  // North: 11 uprights; the four inside W1 / W2 (1,200 1,800 4,200 4,800) are cut to 900 below + 600 above; the 6,000
  // bottom and top are one pine batten each (HUB 030: joins only past 6,000); W1 and W2 each get two sides, a head and a
  // sill of 1,200 → 15 + 2 + 8 = 25
  const n = battens(c, "North");
  assert.deepEqual([n.lines.length, n.totalMm], [25, 46500]);
  assert.deepEqual([lens(n, "bottom"), lens(n, "top"), lens(n, "jamb").length, lens(n, "head").length, lens(n, "sill").length], [[6000], [6000], 4, 2, 2]);
  // East: the upright at 1,800 is inside the door (600 above it); the one at 2,400 IS the door's right side (counted once);
  // the bottom batten stops at the door (1,500 + 1,600); the door has a left side and a head, no sill
  const e = battens(c, "East");
  assert.deepEqual([e.lines.length, e.totalMm], [13, 29600], "the 4,000 top is one batten");
  assert.deepEqual([lens(e, "bottom"), lens(e, "jamb"), lens(e, "head"), lens(e, "sill")], [[1500, 1600], [2100], [900], []]);
  // Tall: 6 uprights of 3,600, one pine length each (no join under 6,000); bottom, top and the joint batten 3,000 each
  const tl = battens(c, "Tall");
  assert.deepEqual([tl.lines.length, tl.totalMm], [9, 30600]);
  assert.deepEqual(lens(tl, "upright"), [3600, 3600, 3600, 3600, 3600, 3600]);
  assert.deepEqual(tl.lines.filter((l) => l.kind === "joint").map((l) => [l.lengthMm, l.a.y]), [[3000, 3005]], "centred on the 10 mm joint");
  // Gable: uprights at 0 … 6,000 rise 2,400 → 3,600 → 2,400 (sum 32,400), one pine length each (none over 6,000);
  // two rakes of √(3,000² + 1,200²) = 3,231.099, one length each; the batten behind the H joint at 3,005 runs between
  // the rakes: 1,512.5 → 4,487.5 = 2,975
  const g = battens(c, "Gable");
  assert.equal(g.lines.length, 15);
  near(g.totalMm, 32400 + 6000 + 2 * Math.hypot(3000, 1200) + 2975, 0.01);
  assert.deepEqual(lens(g, "top").map((L) => Math.round(L * 1000) / 1000), [3231.099, 3231.099], "sloped top battens, one length each");
  assert.ok(g.lines.filter((l) => l.kind === "top").every((l) => l.orientation === "sloped"));
  assert.deepEqual(lens(g, "joint"), [2975]);
  assert.deepEqual(lens(g, "upright").map((L) => Math.round(L * 1000) / 1000), [2400, 2640, 2880, 3120, 3360, 3600, 3360, 3120, 2880, 2640, 2400], "one upright per station, rising with the rakes");
  // Outline (a Rectangle on the elevation): 8 uprights of 3,000, two cut by W3 (1,000 + 800); 4,000 bottom / top in one
  // length each; W3 × 4
  const o = battens(c, "Outline");
  assert.deepEqual([o.lines.length, o.totalMm], [16, 34400]);
  assert.deepEqual([lens(o, "jamb"), lens(o, "head"), lens(o, "sill")], [[1200, 1200], [1200], [1200]]);
  assert.equal(c.orderReady, true, JSON.stringify(c.scheduleLines.map((l) => l.problems)));
  // every piece fits the longest pine batten (6,000) and nothing is longer
  for (const L of c.materialResults.clad.layouts) for (const l of L.followers.battens.lines) assert.ok(l.lengthMm <= 6000 + 1e-6 && l.lengthMm > 0, `${l.label} ${l.lengthMm}`);
});

await t("uprights: both ends, every vertical sheet join and no gap over 600, set out from the first sheet (a 400 part strip moves the grid with it)", () => {
  const xs = (c, label) => [...new Set(battens(c, label).lines.filter((l) => l.kind === "upright").map((l) => l.a.x))];
  assert.deepEqual(xs(job({ measurements: [rect("a", 4000, 2700, "A")] }), "A"), [0, 600, 1200, 1800, 2400, 3000, 3600, 4000]);
  // first sheet from 400: joins at 400 / 1,600 / 2,800 (and 4,000 is the end) → uprights 0, 400, 1,000, 1,600, 2,200, 2,800, 3,400, 4,000
  const shifted = job({ measurements: [rect("a", 4000, 2700, "A")], rules: { datumByWall: { a: 400 } } });
  const got = xs(shifted, "A");
  assert.deepEqual(got, [0, 400, 1000, 1600, 2200, 2800, 3400, 4000]);
  const joins = lay(shifted, "A").columns.slice(0, -1).map((cl) => cl.zoneEnd);
  for (const j of joins) assert.ok(got.includes(j), `upright at the sheet join ${j}`);
  for (let i = 1; i < got.length; i++) assert.ok(got[i] - got[i - 1] <= 600 + 1e-9, `gap ${got[i - 1]} → ${got[i]}`);
});

await t("foam tape behind every vertical sheet join, full height, stopping at openings (a join down a window's edge has none beside it) and at the H-flashing; rounded into rolls ONCE for the job", () => {
  const c = job();
  const tape = (label) => lay(c, label).followers.tape.totalMm;
  assert.equal(tape("North"), 8400, "1,200 and 4,800 run through W1 / W2 (900 + 600 each); 2,400 and 3,600 full height");
  assert.equal(tape("East"), 6000, "the 2,400 join runs down the door's edge: only the 600 above it");
  assert.equal(tape("Tall"), 7180, "2 joins × (3,000 + 590): stops at the 10 mm H joint");
  assert.equal(tape("Gable"), 12460, "1,200 and 4,800: 2,880 each; 2,400 and 3,600: 3,000 + 350 each");
  assert.equal(tape("Outline"), 7800, "1,200 through W3: 1,000 + 800; 2,400 and 3,600: 3,000 each");
  // 41.84 m for the job → 2 rolls of 25 m (wall by wall it would be 5 rolls)
  const [line] = follower(c, "tape");
  assert.deepEqual([line.quantity, line.unit, line.spareQuantity ?? 0], [2, "roll", 0]);
  assert.equal(line.item.description, "Hardie™ 50mm Foam Back Sealing Tape, 25 m roll, code 304560");
  assert.match(line.item.note, /^41\.84 m behind the vertical sheet joins → 2 rolls of 25 m$/);
  const perWall = c.materialResults.clad.layouts.reduce((n, L) => n + Math.ceil(L.followers.tape.totalMm / 25000), 0);
  assert.equal(perWall, 5);
});

await t("H-flashing on every horizontal joint by the metre, cut from 3,000 lengths with offcuts shared across walls, no lap (the joint's own 'not selected' note is gone)", () => {
  const c = job();
  assert.deepEqual(lay(c, "Tall").followers.hFlashing.runs.map((r) => r.lengthMm), [3000]);
  assert.deepEqual(lay(c, "Gable").followers.hFlashing.runs.map((r) => r.lengthMm), [2950], "between the rakes at 3,000 / 3,010: 1,525 → 4,475");
  const [h] = follower(c, "hflashing");
  assert.deepEqual([h.quantity, h.unit, h.finishedLengthMm], [2, "piece", 3000]);
  assert.equal(h.item.description, "Hardie™ 9mm Alum Horizontal H Flashing, code 305613 — 3,000 mm length");
  assert.match(h.item.note, /^5\.95 m of horizontal joints on 2 walls, cut with offcuts shared across the walls, no lap$/);
  assert.ok(!c.materialResults.clad.problems.some((p) => p.code === "joint_product_missing" || p.code === "component_not_selected"), "the joint is on the order now");
  assert.ok(!c.materialResults.clad.demands.some((d) => d.role === "horizontal-joint"), "never the old unpriced joint as well");
  // offcuts shared: 4,500 + 1,500 wide tall walls → 3,000 | 1,500 + 1,500 = 2 lengths (3 wall by wall); 7,000 → 3,000 + 3,000 + 1,000
  const two = job({ measurements: [rect("a", 4500, 3600, "A"), rect("b", 1500, 3600, "B")] });
  assert.equal(qtyOf(two, "hflashing"), 2);
  assert.equal(qtyOf(job({ measurements: [rect("a", 4500, 3600, "A")] }), "hflashing") + qtyOf(job({ measurements: [rect("b", 1500, 3600, "B")] }), "hflashing"), 3);
  const long = job({ measurements: [rect("a", 7000, 3600, "A")] });
  assert.deepEqual(long.materialResults.clad.demands.filter((d) => d.follower === "hflashing").map((d) => d.lengthMm), [3000, 3000, 1000]);
  assert.equal(qtyOf(long, "hflashing"), 3);
});

await t("battens are cut with offcuts shared across ALL walls of the material: two 3,500 walls need 11, not 6 + 6", () => {
  // each wall: 7 uprights of 2,700 and a 3,500 bottom and top → on its own 3 × 5,400 (two uprights each), 1 × 2,700 and
  // 2 × 3,600 = 6; together the two odd uprights share one 5,400: 7 × 5,400 + 4 × 3,600 = 11 (HUB 030 pine lengths)
  const one = job({ measurements: [rect("a", 3500, 2700, "A")] });
  assert.equal(qtyOf(one, "battens"), 6);
  const both = job({ measurements: [rect("a", 3500, 2700, "A"), rect("b", 3500, 2700, "B")] });
  assert.equal(qtyOf(both, "battens"), 11);
  const g = both.materialResults.clad.allocation.groups.find((x) => x.identityKey.includes("\"follower\":\"battens\""));
  const shared = g.bars.find((b) => new Set(b.cuts.map((cut) => cut.label.split(" ")[0])).size === 2);
  assert.ok(shared && shared.stockLengthMm === 5400, "one batten's cuts serve both walls");
});

await t("the whole job's battens: every piece cut exactly once from a pine length, and the order count is the cutting plan's", () => {
  const c = job();
  const r = c.materialResults.clad;
  const pieces = r.demands.filter((d) => d.follower === "battens");
  assert.equal(pieces.length, 25 + 13 + 9 + 15 + 16);
  const g = r.allocation.groups.find((x) => x.identityKey.includes("\"follower\":\"battens\""));
  const cut = g.bars.flatMap((b) => b.cuts.map((x) => x.demandId));
  assert.equal(cut.length, pieces.length); assert.equal(new Set(cut).size, pieces.length);
  for (const b of g.bars) assert.ok(b.cuts.reduce((s, x) => s + x.lengthMm, 0) <= b.stockLengthMm + 1e-6 && BATTEN.lengthsMm.includes(b.stockLengthMm));
  const total = pieces.reduce((s, d) => s + d.lengthMm, 0);
  const lines = follower(c, "battens");
  const qty = lines.reduce((n, l) => n + l.quantity, 0);
  assert.equal(qty, g.barCount);
  assert.ok(qty >= Math.ceil(total / 6000) && qty <= pieces.length);
  assert.deepEqual(lines.map((l) => `${l.quantity} × ${l.item.description}`), ["28 × 90 × 35 H3 pine batten — 6,000 mm length", "2 × 90 × 35 H3 pine batten — 5,700 mm length",
    "1 × 90 × 35 H3 pine batten — 5,400 mm length", "1 × 90 × 35 H3 pine batten — 4,500 mm length"]);
  assert.ok(lines.every((l) => / m of battens on \d walls?, cut with offcuts shared across the walls · fixings to the studs not counted$/.test(l.item.note)), lines.map((l) => l.item.note).join(" | "));
  // the lines' fitted metres add up to the job's 188.94 m of battens
  const fitted = lines.reduce((m, l) => m + Number(/^([\d.]+) m/.exec(l.item.note)[1]), 0);
  assert.ok(Math.abs(fitted - 188.94) < 0.011, `${fitted}`);
  // the contributions share out the whole order (conservation), line by line
  for (const line of lines) {
    const owned = c.contributions.filter((x) => x.jobMaterialId === "clad").flatMap((x) => x.pieces).filter((p) => p.bucketKey === line.bucketKey).reduce((n, p) => n + p.quantity, 0);
    assert.equal(owned, line.quantity);
  }
  // nothing is counted as nails or fixings, and nothing here holds up the order
  assert.ok(!r.demands.some((d) => String(d.role).startsWith("fixing")));
  assert.ok(!r.problems.some((p) => p.blocking !== false && /batten|tape|flashing/i.test(p.message)), JSON.stringify(r.problems.filter((p) => p.blocking !== false).map((p) => p.message)));
});

await t("Linea (boards flat) → upright battens at 600 round nothing else; Stria standing → horizontal battens at 600 with the bottom and top; no tape or H-flashing", () => {
  const linea = { id: "lin", name: "Linea 150", ...fam(specFromGroup(group("Linea", 150))), rules: {} };
  // 3,000 × 2,400 with a window 600 → 1,500: uprights 0 … 3,000; 600 is the window's edge (full); 1,200 cut 900 + 600
  const c = computeWorkspace(ws([linea], [rect("a", 3000, 2400, "A"), op("w", "a", 600, 900, 900, 900, "W1")]));
  const b = battens(c, "A", "lin");
  assert.deepEqual(b.lines.map((l) => [l.kind, l.a.x, l.lengthMm]), [["upright", 0, 2400], ["upright", 600, 2400], ["upright", 1200, 900], ["upright", 1200, 600], ["upright", 1800, 2400], ["upright", 2400, 2400], ["upright", 3000, 2400]]);
  assert.equal(qtyOf(c, "battens", "lin"), 3, "13,500 of battens from pine lengths, nothing over: 5,700 + 5,400 + 2,400");
  assert.equal(follower(c, "tape", "lin").length + follower(c, "hflashing", "lin").length, 0);
  // Stria smooth 325 standing on a 2,400 × 2,700 wall: horizontals at 600 / 1,200 / 1,800 / 2,400 + the bottom and top
  const stria = { id: "str", name: "Stria", ...fam(specFromGroup(group("Stria smooth", 325))), rules: {} };
  const s = computeWorkspace(ws([stria], [rect("a", 2400, 2700, "A")]));
  const sb = battens(s, "A", "str");
  assert.deepEqual(sb.lines.map((l) => [l.kind, l.a.y, l.lengthMm]), [["across", 600, 2400], ["across", 1200, 2400], ["across", 1800, 2400], ["across", 2400, 2400], ["bottom", 0, 2400], ["top", 2700, 2400]]);
  assert.equal(qtyOf(s, "battens", "str"), 3, "6 × 2,400 = 3 × 4,800");
});

await t("timber cladding → battens across the boards at 450 (random-length LM too); a raked top gets a sloped batten; uprights up to 6,000 are one length", () => {
  const shiplap = (orientation, extra = {}) => ({ id: "tc", name: "Shiplap", ...fam({ family: "timber-cladding", layout: "course", orientation, supply: "random", orderIncrementM: 1, product: { name: "Shiplap", widthMm: 135, thicknessMm: 19, effectiveCoverMm: 120 }, ...extra }), rules: {} });
  // flat boards on 3,000 × 2,400: uprights 0, 450 … 2,700, 3,000 → 8 × 2,400 → 4 × 4,800 pine; the LM estimate is untouched
  const c = computeWorkspace(ws([shiplap("horizontal")], [rect("a", 3000, 2400, "A")]));
  assert.deepEqual(battens(c, "A", "tc").lines.map((l) => l.a.x), [0, 450, 900, 1350, 1800, 2250, 2700, 3000]);
  assert.equal(qtyOf(c, "battens", "tc"), 4);
  assert.deepEqual(linesOf(c, "tc").filter((l) => l.unit === "lm").map((l) => l.quantity), [60], "3,000 × 2,400 ÷ 120 cover = 60 LM, as before");
  // standing boards on 1,800 × 2,700: horizontals at 450 … 2,250 + bottom + top = 7 × 1,800 → 2 × 5,400 + 1,800
  const v = computeWorkspace(ws([shiplap("vertical")], [rect("a", 1800, 2700, "A")]));
  assert.deepEqual(battens(v, "A", "tc").lines.map((l) => l.a.y), [450, 900, 1350, 1800, 2250, 0, 2700]);
  assert.equal(qtyOf(v, "battens", "tc"), 3);
  // Linea on a 4,000 gable (eaves 2,400, apex 3,200 at 2,000): uprights rise to the rakes, each one length (none over
  // 6,000); each rake (√(2,000² + 800²) = 2,154.066) gets a sloped batten → 8 + 2 = 10 pieces
  const lin = computeWorkspace(ws([{ id: "lin", name: "Linea", ...fam(specFromGroup(group("Linea", 150))), rules: {} }], [gable("g", 4000, 2400, 2000, 3200, "G")]));
  const b = battens(lin, "G", "lin");
  assert.equal(b.lines.length, 10);
  near(b.totalMm, 2400 + 2640 + 2880 + 3120 + 3040 + 2800 + 2560 + 2400 + 2 * Math.hypot(2000, 800), 0.01);
  assert.deepEqual(lens(b, "top"), [2154.066, 2154.066]);
  assert.deepEqual(lens(b, "upright").map((L) => Math.round(L * 1000) / 1000), [2400, 2640, 2880, 3120, 3040, 2800, 2560, 2400]);
});

await t("direct-fixed cladding gets no battens — Axon keeps its foam tape and H-flashing; direct-fixed boards get nothing", () => {
  const c = job({ rules: { route: "direct" }, measurements: [rect("t", 3000, 3600, "Tall")] });
  assert.equal(follower(c, "battens").length, 0);
  assert.equal(lay(c, "Tall").followers.battens.state, "direct");
  assert.equal(qtyOf(c, "tape"), 1); assert.equal(qtyOf(c, "hflashing"), 1);
  const lin = computeWorkspace(ws([{ id: "lin", name: "Linea", ...fam(specFromGroup(group("Linea", 150))), rules: { route: "direct" } }], [rect("a", 3000, 2400, "A")]));
  assert.equal(linesOf(lin, "lin").filter((l) => l.follower).length, 0);
  assert.equal(lay(lin, "A", "lin").followers, undefined);
});

await t("a wall with battens set up BY HAND (older job) keeps them: no automatic battens there (said so), the other wall still gets them; never doubled", () => {
  const hand = { id: "bat", name: "Cavity battens", methodKey: "support_grid", methodVersion: 1, spec: { family: "batten", orientation: "vertical", product: { name: "Batten 70 × 19", widthMm: 70, thicknessMm: 19, lengthsMm: [3000] } }, rules: { maxSpacingMm: 600, fixingScope: { status: "by-others", reason: "framer" } } };
  const meas = [rect("a", 4000, 2700, "A"), rect("b", 4000, 2700, "B")];
  const c = computeWorkspace(ws([axon400(), hand], meas, [con("hb", "a", "bat")]));
  assert.equal(lay(c, "A").followers.battens.state, "hand-made"); assert.deepEqual(lay(c, "A").followers.battens.by, ["Cavity battens"]);
  assert.equal(lay(c, "A").followers.battens.lines.length, 0);
  assert.equal(battens(c, "B").lines.length, 10, "4,000 × 2,700: 8 uprights + bottom + top (one length each)");
  assert.equal(qtyOf(c, "battens"), 6, "B only: 8 × 2,700 on 4 × 5,400, and the 4,000 bottom and top on 2 × 4,200");
  assert.ok(c.materialResults.clad.problems.some((p) => p.code === "followers_hand_made" && p.blocking === false && /^A: battens come from Cavity battens \(set up by hand\), so the automatic battens from Axon 400 smooth aren't added on this wall — nothing is counted twice\.$/.test(p.message)));
  // the hand-made battens are exactly what they were before this step: uprights at the sheet joins and every 600
  const bt = c.materialResults.bat.layouts[0];
  assert.deepEqual(bt.stations.map((s) => s.atMm), [0, 600, 1200, 1800, 2400, 3000, 3600, 4000]);
  assert.equal(qtyOf(c, "tape"), 1, "A and B both keep their foam tape (no accessory set up by hand)");
  // a record of EXISTING supports (not bought) doesn't stand in for battens
  const existing = computeWorkspace(ws([axon400(), { ...hand, rules: { ...hand.rules, existing: true } }], meas, [con("hb", "a", "bat")]));
  assert.equal(lay(existing, "A").followers.battens.state, "auto");
});

await t("an accessory set made by hand that already has the joint foam tape or H joints keeps them on its wall: the old joint stays 'not on the order' there", () => {
  const acc = (rules) => ({ id: "acc", name: "Axon accessories", methodKey: "accessory_routes", methodVersion: 1, spec: { family: "accessory", product: { name: "Axon set" } }, rules });
  const meas = [rect("t", 3000, 3600, "Tall"), rect("u", 3000, 3600, "Other")];
  // the set holds the joint foam tape itself (code 304560) → no automatic tape on Tall; H-flashing still automatic there
  const foam = { groups: [{ id: "ft", kind: "manual", label: "Foam back sealing tape", identity: { product: "304560" }, manualQuantity: { quantity: 1, unit: "roll", authority: "Quote Q-1" } }] };
  const c = computeWorkspace(ws([axon400(), acc({ recipe: foam })], meas, [con("ha", "t", "acc")]));
  assert.equal(lay(c, "Tall").followers.tape.state, "hand-made"); assert.equal(lay(c, "Tall").followers.tape.totalMm, 0);
  assert.equal(lay(c, "Other").followers.tape.totalMm, 7180);
  assert.equal(lay(c, "Tall").followers.hFlashing.totalMm, 3000);
  assert.ok(c.materialResults.clad.problems.some((p) => p.code === "followers_hand_made" && /^Tall: Axon accessories \(set up by hand\) already covers the foam tape, so the automatic foam tape from Axon 400 smooth isn't added on this wall/.test(p.message)));
  // a set's OTHER tape never stands in for it: window tape round the openings, a wrap's seam tape, or the card's Tape
  // choice (by others / exclude / not decided) — none of them goes behind the sheet joins, so the foam tape stays
  const windowTape = { groups: [{ id: "wt", kind: "tape", label: "Window flashing tape", routes: ["opening-perimeter"], rollLengthMm: 25000 }] };
  for (const rules of [{ recipe: windowTape }, { scope: { tape: "by-others" } }, { scope: { tape: "exclude" } }, { scope: { tape: "unresolved" } }]) {
    const k = computeWorkspace(ws([axon400(), acc(rules)], meas, [con("ha", "t", "acc")]));
    assert.equal(lay(k, "Tall").followers.tape.state, "auto", JSON.stringify(rules));
    assert.equal(lay(k, "Tall").followers.tape.totalMm, 7180, JSON.stringify(rules));
    assert.equal(qtyOf(k, "tape"), 1, "14.36 m of foam tape → 1 roll");
    assert.ok(!k.materialResults.clad.problems.some((p) => p.code === "followers_hand_made"), JSON.stringify(rules));
  }
  // with an Axon wall that has a window: the window tape is its own line, the foam tape is still bought
  const w = computeWorkspace(ws([axon400(), acc({ recipe: windowTape })], [rect("n", 4800, 2700, "North"), op("w", "n", 1350, 900, 900, 900, "W01")], [con("ha", "n", "acc")]));
  assert.equal(lay(w, "North").followers.tape.totalMm, 8100);
  assert.equal(qtyOf(w, "tape"), 1);
  assert.ok(w.scheduleLines.some((l) => l.jobMaterialIds.includes("acc") && l.unit === "roll"), "the window tape is the set's own roll");
  // a joint strip in the set's recipe → the H-flashing on Tall stays the set's, and the cladding's unpriced joint is named as before
  const recipe = { groups: [{ id: "h", kind: "joint-strip", routes: ["joints"], stockPolicy: { kind: "list", lengthsMm: [3000], sharePieces: true, kerfMm: 0 } }] };
  const j = computeWorkspace(ws([axon400(), acc({ recipe })], meas, [con("ha", "t", "acc")]));
  assert.equal(lay(j, "Tall").followers.hFlashing.state, "hand-made");
  assert.deepEqual(j.materialResults.clad.demands.filter((d) => d.follower === "hflashing").map((d) => d.sourceRefs[0].wallId), ["Other"]);
  assert.ok(j.materialResults.clad.demands.some((d) => d.role === "horizontal-joint" && d.sourceRefs[0].wallId === "Tall"));
  assert.ok(j.materialResults.clad.problems.some((p) => p.code === "component_not_selected"));
  // a joint product chosen on the cladding's own joint rows is bought as itself — never an H-flashing as well
  const own = job({ rules: { jointRows: { ...JOINT, product: { id: "jp", family: "accessory", name: "PVC joiner", sku: "J1", dimensionsMm: { length: 3000, width: 20, thickness: 9 } } } }, measurements: [rect("t", 3000, 3600, "Tall")] });
  assert.equal(lay(own, "Tall").followers.hFlashing.state, "joint-product");
  assert.equal(follower(own, "hflashing").length, 0);
  assert.ok(own.materialResults.clad.demands.some((d) => d.role === "horizontal-joint" && d.identity.sku === "J1"));
});

await t("spares: battens and H-flashing each get their OWN spare at the cladding's rate; foam tape takes it on the metres before the rolls; a sheet pack size never rounds battens", () => {
  const c = job({ spareRate: 10 });
  assert.equal(sheetsOf(c), 23 + 3, "23 sheets + ceil(2.3) = 3 spare, as before");
  const bl = follower(c, "battens"), [h] = follower(c, "hflashing"), [tp] = follower(c, "tape");
  const base = qtyOf(job(), "battens");
  // one spare count for the battens (ceil of 10 %), spread over their pine lengths
  assert.deepEqual([bl.reduce((n, l) => n + l.quantity, 0), bl.reduce((n, l) => n + (l.spareQuantity || 0), 0)], [base + Math.ceil(base * 0.1), Math.ceil(base * 0.1)]);
  assert.ok(bl.some((l) => /incl\. \d+ spare \(10% of the battens\)$/.test(l.item.note)), bl.map((l) => l.item.note).join(" | "));
  assert.deepEqual([h.quantity, h.spareQuantity], [3, 1]); assert.match(h.item.note, /incl\. 1 spare \(10% of the H-flashing\)$/);
  assert.deepEqual([tp.quantity, tp.spareQuantity ?? 0], [2, 0], "41.84 m + 10% = 46.02 m → still 2 rolls");
  assert.match(tp.item.note, /^41\.84 m behind the vertical sheet joins \+ 10% spare = 46\.02 m → 2 rolls of 25 m$/);
  // 24.3 m of tape is one roll; with 10% (26.73 m) it is two — the extra roll is the spare
  const t2 = job({ spareRate: 10, measurements: [rect("a", 6000, 2700, "A"), rect("b", 6000, 2700, "B"), rect("c", 1500, 2700, "C")] });
  const [tl] = follower(t2, "tape");
  assert.deepEqual([tl.quantity, tl.spareQuantity], [2, 1]);
  assert.equal(qtyOf(job({ measurements: [rect("a", 6000, 2700, "A"), rect("b", 6000, 2700, "B"), rect("c", 1500, 2700, "C")] }), "tape"), 1);
  // full packs of 3 for the sheets only
  const packed = job({ spec: { product: { ...specFromGroup(group("Axon 400 smooth")).product, packQuantity: 3, fullPackRequired: true } } });
  assert.equal(sheetsOf(packed) % 3, 0);
  assert.equal(qtyOf(packed, "battens"), qtyOf(job(), "battens"));
});

await t("acceptance 4: one wall made 3,600 changes only that wall's sheets, battens and H-flashing — the other walls' layouts don't move", () => {
  const a = job();
  const b = job({ measurements: JOB.map((m) => (m.id === "n" ? rect("n", 6000, 3600, "North") : m)) });
  for (const label of ["East", "Tall", "Gable", "Outline"]) {
    assert.deepEqual(lay(b, label).followers, lay(a, label).followers, `${label} unchanged`);
    assert.deepEqual(lay(b, label).cells.map((x) => [x.id, x.cutLengthMm]), lay(a, label).cells.map((x) => [x.id, x.cutLengthMm]));
  }
  const n = lay(b, "North").followers;
  assert.deepEqual(n.hFlashing.runs.map((r) => r.lengthMm), [6000], "the new joint at 3,000 clears both windows");
  assert.equal(n.battens.lines.filter((l) => l.kind === "joint").length, 1, "its joint batten is one 6,000 pine length");
  assert.ok(n.battens.totalMm > lay(a, "North").followers.battens.totalMm);
  assert.equal(qtyOf(b, "hflashing"), qtyOf(a, "hflashing") + 2, "6,000 more of joint = two more lengths");
});

await t("the same walls in any order give the same battens, tape and H-flashing; a wall too tall for any sheet gets none until it is fixed", () => {
  const a = job();
  const rev = computeWorkspace({ ...ws([axon400()], JOB), measurements: [...JOB].reverse(), contributions: [...ws([axon400()], JOB).contributions].reverse() });
  const sig = (c) => JSON.stringify(linesOf(c).map((l) => [l.unit, l.quantity, l.item.description]));
  assert.equal(sig(a), sig(rev));
  const blocked = job({ rules: { jointRows: undefined }, measurements: [rect("t", 3000, 3600, "Tall"), rect("a", 4000, 2700, "A")] });
  assert.ok(blocked.materialResults.clad.problems.some((p) => p.code === "sheet_too_tall"));
  assert.equal(lay(blocked, "Tall").followers, undefined);
  assert.equal(battens(blocked, "A").lines.length, 10, "8 uprights + the 4,000 bottom and top in one length each");
});

await t("their own order-line key: battens appearing or going (a batten material set up by hand) never makes the sheet lines stale, and the other way round", () => {
  const hand = { id: "bat", name: "Cavity battens", methodKey: "support_grid", methodVersion: 1, spec: { family: "batten", orientation: "vertical", product: { name: "Batten", widthMm: 70, thicknessMm: 19, lengthsMm: [3000] } }, rules: { maxSpacingMm: 600 } };
  const meas = [rect("a", 4000, 2700, "A"), rect("b", 4000, 2700, "B")];
  const w0 = ws([axon400(), hand], meas), w1 = ws([axon400(), hand], meas, [con("hb", "a", "bat")]);
  const c0 = computeWorkspace(w0), c1 = computeWorkspace(w1);
  const sheet0 = linesOf(c0).find((l) => l.unit === "sheet"), sheet1 = linesOf(c1).find((l) => l.unit === "sheet");
  assert.equal(sheet0.dependencyKey, sheet1.dependencyKey, "the sheets are worked out from exactly the same walls");
  const bat0 = follower(c0, "battens")[0], bat1 = follower(c1, "battens")[0];
  assert.notEqual(bat0.dependencyKey, bat1.dependencyKey);
  assert.notEqual(bat0.dependencyKey, sheet0.dependencyKey);
  const draft = { bucketKey: bat0.bucketKey, specKey: bat0.specKey, jobMaterialId: "clad", finishedLengthMm: bat0.finishedLengthMm, quantity: bat0.quantity, unit: bat0.unit, item: bat0.item };
  assert.equal(orderLineState(draft, c0, w0.materials).stale, false);
  assert.equal(orderLineState(draft, c1, w1.materials).stale, true, "a drafted batten line is reviewed when its battens change");
});

await t("the Timber and cladding order lists the battens, the tape in rolls and the H-flashing in lengths with their product codes — snapshot and supplier PDF", async () => {
  const w = ws([axon400()], JOB);
  const c = computeWorkspace(w);
  const lines = linesOf(c).map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: "clad", finishedLengthMm: l.finishedLengthMm, quantity: l.quantity, unit: l.unit, item: l.item }));
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot: w, order: { id: "o", orderRef: "TO-7", revision: 1, category: "timber_cladding", delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400" } },
    lines, supplier: { id: "s", name: "Supplier" }, company: { name: "Blue Leaf", phone: "08" }, jobLabel: "1 Example St", rendererVersion: "test" });
  assert.deepEqual(problems, []);
  assert.equal(snapshot.items.length, 1, "one material: the battens, tape and H-flashing sit under the cladding");
  const rows = snapshot.items[0].lines.map((l) => `${l.quantity} ${l.unit} ${l.description}`);
  const nB = qtyOf(c, "battens");
  // HUB 030: the pine battens in their 300 mm lengths (no product code: the owner's own timber)
  assert.deepEqual(rows.slice(3), [`28 piece ${FOLLOWER_TEXT.battens} — 6,000 mm length`, `2 piece ${FOLLOWER_TEXT.battens} — 5,700 mm length`, `1 piece ${FOLLOWER_TEXT.battens} — 5,400 mm length`,
    `1 piece ${FOLLOWER_TEXT.battens} — 4,500 mm length`, `2 piece ${FOLLOWER_TEXT.hflashing} — 3,000 mm length`, `2 roll ${FOLLOWER_TEXT.tape}`]);
  assert.deepEqual(snapshot.totals.byUnit, { sheet: 23, piece: nB + 2, roll: 2 });
  const pdf = await renderSupplierOrderPdf(snapshot, { exportNo: 1, isDraft: false, snapshotSha256: "abc" });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, verbosity: 0 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + " ";
  await doc.destroy();
  // (a long description wraps onto a second line in the table)
  for (const code of ["304560", "305613"]) assert.match(text, new RegExp(`code\\s+${code}`), `PDF lists code ${code}`);
  assert.doesNotMatch(text, /405307|Cavity Batten/, "never the Hardie Cavity Batten (HUB 030)");
  assert.match(text, /\b\d+ ×\s+piece\s+90 × 35 H3 pine batten/); assert.match(text, /2 ×\s+roll\s+Hardie™ 50mm Foam Back Sealing Tape, 25 m roll/); assert.match(text, /2 ×\s+piece\s+Hardie™ 9mm Alum Horizontal H Flashing/);
  // the site appendix: a cut list for the battens and one for the H-flashing (never one row for both), naming each piece
  assert.deepEqual(snapshot.appendix.timber.map((x) => x.title), [`battens cut list (${FOLLOWER_TEXT.battens})`, `H-flashing cut list (${FOLLOWER_TEXT.hflashing})`]);
  const hRows = snapshot.appendix.timber[1].rows;
  assert.deepEqual(hRows.map((r) => [r.qty, r.cutMm, r.stockMm]), [[1, 3000, 3000], [1, 2950, 3000]]);
  assert.deepEqual(hRows.flatMap((r) => r.labels), ["Tall H-flashing — joint 1", "Gable H-flashing — joint 1"]);
  assert.equal(snapshot.appendix.timber[0].rows.reduce((n, r) => n + r.qty, 0), 25 + 13 + 9 + 15 + 16);
  const app = await renderSiteAppendixPdf(snapshot, { exportNo: 1, snapshotSha256: "abc" });
  const adoc = await pdfjs.getDocument({ data: new Uint8Array(app), isEvalSupported: false, verbosity: 0 }).promise;
  let atext = "";
  for (let i = 1; i <= adoc.numPages; i++) atext += (await (await adoc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + " ";
  await adoc.destroy();
  assert.match(atext, /Axon 400 smooth — battens cut list/); assert.match(atext, /Axon 400 smooth — H-flashing cut list/);
  assert.match(atext, /1 × cut 2,950 mm from 3,000 mm stock — Gable H-flashing — joint 1/);
});

await t("acceptance 10: Axon 400 set up from the Blue Leaf company default — the schedule lists battens, tape and H-flashing with nothing typed", () => {
  const D = BLUE_LEAF_JH_DEFAULTS;
  const g = group("Axon 400 smooth");
  const preset = { id: "pre", revision: 1, isActive: true, spec: { family: "cladding", layout: "sheet", product: { id: g.id }, spareRate: D.spareRate }, rules: { companyDefault: true, route: D.route, installConditions: { ...D.installConditions }, jointRows: { atMm: [], ...D.jointRule } } };
  const picked = { id: "clad", name: "Axon 400 smooth", ...fam({ ...specFromGroup(g), assemblyId: "axon-vertical" }), rules: {} };
  const mat = applyCompanyDefault(picked, preset);
  assert.deepEqual([mat.rules.route, mat.spec.spareRate, mat.rules.jointRows], ["cavity", 10, { atMm: [], gapMm: 10, detailRef: "H-flashing" }]);
  const c = computeWorkspace(ws([mat], [rect("a", 4000, 3600, "Wall 1")]));
  const units = linesOf(c).map((l) => [l.follower || "sheets", l.unit]);
  assert.deepEqual(units.map((u) => u[0]), ["sheets", "sheets", "battens", "battens", "hflashing", "tape"], "the battens in two pine lengths (3,600 uprights, 4,200 for the 4,000 bottom, top and joint)");
  const b = battens(c, "Wall 1");
  // uprights at the joins (1,200 / 2,400 / 3,600) and every 600, plus the bottom and top battens and the one behind the H joint
  assert.deepEqual([...new Set(b.lines.filter((l) => l.kind === "upright").map((l) => l.a.x))], [0, 600, 1200, 1800, 2400, 3000, 3600, 4000]);
  assert.deepEqual([b.lines.some((l) => l.kind === "bottom"), b.lines.some((l) => l.kind === "top"), b.lines.some((l) => l.kind === "joint")], [true, true, true]);
});

await t("a wall whose sheets are all cut from another wall's sheets or offcuts still gets its battens and foam tape (HUB 016b)", () => {
  // Under bay 4,800 × 1,400 and Return 2,400 × 1,000: the shared plan cuts both of Return's pieces from Under bay's sheets
  const c = job({ measurements: [rect("a", 4800, 1400, "Under bay"), rect("b", 2400, 1000, "Return")] });
  assert.equal(lay(c, "Return").cutPlan.sheets.length, 0); assert.equal(lay(c, "Return").cutPlan.fromOtherWalls, 2);
  // Return: uprights 0, 600, 1,200, 1,800, 2,400 × 1,000; bottom and top 2,400 → 7 pieces, 9.8 m; the join at 1,200 → 1 m of tape
  const r = battens(c, "Return");
  assert.deepEqual([r.lines.length, r.totalMm], [7, 9800]);
  assert.equal(lay(c, "Return").followers.tape.totalMm, 1000);
  // Under bay: 9 uprights × 1,400 and a 4,800 bottom and top → 11. Together 32.0 m of battens, cut from pine lengths with
  // offcuts shared across both walls: 5,700 + 4 × 4,800 + 4,200 + 3,000 = 32.1 m → 7 (HUB 030)
  assert.equal(qtyOf(c, "battens"), 7);
  const fitted = follower(c, "battens").reduce((m, l) => m + Number(/^([\d.]+) m of battens/.exec(l.item.note)[1]), 0);
  assert.ok(Math.abs(fitted - 32) < 0.011, `${fitted} m`);
  assert.equal(c.orderReady, true);
  // a second pair: Small's one piece comes off Big's offcut, and Small still gets its own: uprights at 0, 600, 1,200, the bottom and the top
  const d = job({ measurements: [rect("a", 2400, 1300, "Big"), rect("b", 1200, 1100, "Small")] });
  assert.equal(lay(d, "Small").cutPlan.fromOtherWalls, 1);
  assert.deepEqual(battens(d, "Small").lines.map((l) => [l.kind, l.lengthMm]), [["upright", 1100], ["upright", 1100], ["upright", 1100], ["bottom", 1200], ["top", 1200]]);
});

await t("two Axon claddings on one job: the battens and the foam tape are bought ONCE and the H-flashing is one cutting plan for the job, listed under the first cladding", () => {
  const two = (a, b, wa, wb) => computeWorkspace({ ...ws([a, b], [wa, wb]), contributions: [con("ca", wa.id, a.id), con("cb", wb.id, b.id)] });
  // Axon 133 smooth (3,600 sheets, no H joint) on A 2,400 × 3,600: tape 3,600 at the 1,200 join; Axon 400 on B: 3,000 + 590
  const a133 = { ...axon400(), id: "a1", name: "Axon 133 smooth", ...fam({ ...specFromGroup(group("Axon 133 smooth")), assemblyId: "axon-vertical", spareRate: 0 }) };
  const c = two(a133, { ...axon400(), id: "a2" }, rect("A", 2400, 3600, "A"), rect("B", 2400, 3600, "B"));
  const tapeLines = c.scheduleLines.filter((l) => l.follower === "tape");
  assert.equal(tapeLines.length, 1, "one foam tape line for the job");
  assert.deepEqual([tapeLines[0].quantity, tapeLines[0].jobMaterialIds], [1, ["a1", "a2"]], "7.19 m → 1 roll (2 if each cladding rounded its own)");
  assert.match(tapeLines[0].item.note, /^7\.19 m behind the vertical sheet joins → 1 roll of 25 m · for Axon 133 smooth and Axon 400 smooth, worked out once for the job$/);
  // only B has an H joint: its H-flashing sits under B's own section
  const h = c.scheduleLines.filter((l) => l.follower === "hflashing");
  assert.deepEqual(h.map((l) => [l.quantity, l.jobMaterialIds]), [[1, ["a2"]]]);
  assert.ok(h[0].bucketKey.includes("|a2|"));
  assert.ok(c.materialResults.a2.problems.some((p) => p.code === "followers_pooled" && p.blocking === false && p.message === "Axon 400 smooth: its battens and foam tape are ordered once for the job with Axon 133 smooth."));
  // HUB 030 (Sam: "Whole job"): the pine battens are bought once for the job too, offcuts shared across both claddings,
  // and sit under the first cladding
  const bl = c.scheduleLines.filter((l) => l.follower === "battens");
  assert.deepEqual(bl.map((l) => [l.quantity, l.finishedLengthMm, l.jobMaterialIds]), [[5, 6000, ["a1", "a2"]], [5, 3600, ["a1", "a2"]]]);
  assert.ok(bl.every((l) => l.bucketKey.includes("|a1|")));
  // the contributions share out exactly what is ordered
  for (const l of c.scheduleLines) assert.equal(c.contributions.flatMap((x) => x.pieces).filter((p) => p.bucketKey === l.bucketKey).reduce((n, p) => n + p.quantity, 0), l.quantity, l.item?.description);
  // two Axon 400 materials (front and side), 1,500 × 3,600 each: H-flashing 1,500 + 1,500 → ONE 3,000 length; tape 3.59 m each → 1 roll
  const f = two({ ...axon400(), id: "f", name: "Axon 400 front" }, { ...axon400({}, 10), id: "s", name: "Axon 400 side" }, rect("F", 1500, 3600, "Front"), rect("S", 1500, 3600, "Side"));
  const [hf] = f.scheduleLines.filter((l) => l.follower === "hflashing");
  assert.deepEqual([hf.quantity - (hf.spareQuantity || 0), hf.jobMaterialIds], [1, ["f", "s"]], "2 lengths if each rounded its own");
  assert.equal(hf.spareQuantity, 1, "spares at the higher rate of the two (10% of 1 → 1)");
  assert.match(hf.item.note, /^3\.00 m of horizontal joints on 2 walls, cut with offcuts shared across the walls, no lap · for Axon 400 front and Axon 400 side, worked out once for the job/);
  const [tf] = f.scheduleLines.filter((l) => l.follower === "tape");
  assert.deepEqual([tf.quantity, tf.jobMaterialIds], [1, ["f", "s"]]);
  assert.ok(f.materialResults.s.problems.some((p) => p.message === "Axon 400 side: its battens, H-flashing and foam tape are ordered once for the job with Axon 400 front."));
  assert.equal(f.materialResults.f.appendix.timber.filter((x) => /H-flashing/.test(x.title)).length, 1);
  assert.equal(f.orderReady, true);
  // the Timber and cladding order: the job's one tape and one H-flashing line sit in the FIRST cladding's block, once
  const w = { ...ws([{ ...axon400(), id: "f", name: "Axon 400 front" }, { ...axon400({}, 10), id: "s", name: "Axon 400 side" }], [rect("F", 1500, 3600, "Front"), rect("S", 1500, 3600, "Side")]),
    contributions: [con("ca", "F", "f"), con("cb", "S", "s")] };
  const lines = f.scheduleLines.map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: l.jobMaterialIds[0], finishedLengthMm: l.finishedLengthMm, quantity: l.quantity, unit: l.unit, item: l.item }));
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot: w, order: { id: "o", orderRef: "TO-8", revision: 1, category: "timber_cladding", delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400" } },
    lines, supplier: { id: "s", name: "Supplier" }, company: { name: "Blue Leaf", phone: "08" }, jobLabel: "1 Example St", rendererVersion: "test" });
  assert.deepEqual(problems, []);
  const block = (id) => snapshot.items.find((x) => x.materialId === id).lines.map((l) => l.description);
  assert.equal(block("f").filter((t) => /code 304560|code 305613/.test(t)).length, 2);
  assert.equal(block("s").filter((t) => /code 304560|code 305613/.test(t)).length, 0);
  assert.equal(snapshot.totals.byUnit.roll, 1);
  // one cladding alone is exactly as before (its own key, under its own section)
  const one = job({ measurements: [rect("t", 3000, 3600, "Tall")] });
  assert.deepEqual(one.scheduleLines.filter((l) => l.follower).map((l) => [l.follower, l.jobMaterialIds]), [["battens", ["clad"]], ["battens", ["clad"]], ["battens", ["clad"]], ["hflashing", ["clad"]], ["tape", ["clad"]]]);
});

await t("battens closer than a batten's face (70 mm): a join 30 mm from the wall end is one batten, a window edge 30 mm from an upright has no jamb, a 600 batten next to an end moves halfway", () => {
  // 4,830 wall: the join at 4,800 and the end at 4,830 → one upright at the join (11 pieces, 7 pine lengths — the same as 4,800)
  const c = job({ measurements: [rect("a", 4830, 2700, "A")] });
  const xs = [...new Set(battens(c, "A").lines.filter((l) => l.kind === "upright").map((l) => l.a.x))];
  assert.deepEqual(xs, [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800]);
  assert.deepEqual([lens(battens(c, "A"), "bottom"), lens(battens(c, "A"), "top")], [[4830], [4830]], "the bottom and top still run to the wall end");
  assert.equal(battens(c, "A").lines.length, 11);
  assert.equal(qtyOf(c, "battens"), qtyOf(job({ measurements: [rect("a", 4800, 2700, "A")] }), "battens"));
  // first sheet from 650: the 600 batten would land 50 from the wall start, so it moves halfway (325) — the same count,
  // no gap over 600, none closer than a batten's face; the rest stay on the 600 grid from the first sheet
  const d = job({ measurements: [rect("a", 3000, 2700, "A")], rules: { datumByWall: { a: 650 } } });
  assert.deepEqual([...new Set(battens(d, "A").lines.filter((l) => l.kind === "upright").map((l) => l.a.x))], [0, 325, 650, 1250, 1850, 2450, 3000]);
  // 3,600 × 2,700 with a window 1,230 → 2,370: its sides sit on the full-height uprights at 1,200 and 2,400 → no jambs;
  // 6 uprights + 1,800 cut (900 + 600), the 3,600 bottom and top in one length each, the head and the sill → 12 pieces
  const w = job({ measurements: [rect("a", 3600, 2700, "A"), op("w", "a", 1230, 900, 1140, 1200, "W1")] });
  const b = battens(w, "A");
  assert.deepEqual([lens(b, "jamb"), lens(b, "head"), lens(b, "sill")], [[], [1140], [1140]]);
  assert.equal(b.lines.length, 12);
  // Linea on a 3,020 wall: the 600 batten at 3,000 would sit 20 from the end batten, so it moves halfway (2,710)
  const lin = computeWorkspace(ws([{ id: "lin", name: "Linea", ...fam(specFromGroup(group("Linea", 150))), rules: {} }], [rect("a", 3020, 2400, "A")]));
  assert.deepEqual(battens(lin, "A", "lin").lines.map((l) => l.a.x), [0, 600, 1200, 1800, 2400, 2710, 3020]);
});

await t("no head batten along the wall top over a door or window that reaches it (the top batten is cut there), and no sill on the floor", () => {
  // full-height door 1,200 → 2,400 on 3,600 × 2,700: uprights 0, 600, 1,200, 2,400, 3,000, 3,600 (1,800 is all door);
  // the bottom and the top both stop at the door; its sides are the uprights → 10 pieces, 21 m, no head
  const c = job({ measurements: [rect("a", 3600, 2700, "A"), op("d", "a", 1200, 0, 1200, 2700, "D1", "door")] });
  const b = battens(c, "A");
  assert.deepEqual([lens(b, "head"), lens(b, "jamb"), lens(b, "bottom"), lens(b, "top")], [[], [], [1200, 1200], [1200, 1200]]);
  assert.deepEqual([b.lines.length, b.totalMm], [10, 21000]);
  // a window 2,400 → 3,600 from 1,500 up to the top: a sill, no head; the top batten stops at 2,400
  const w = battens(job({ measurements: [rect("a", 3600, 2700, "A"), op("w", "a", 2400, 1500, 1200, 1200, "W1")] }), "A");
  assert.deepEqual([lens(w, "head"), lens(w, "sill"), lens(w, "top")], [[], [1200], [2400]]);
  assert.equal(w.lines.length, 10, "the 3,600 bottom is one length");
  // a window down to the floor (sill 0): no sill batten under it, the head stays
  const f = battens(job({ measurements: [rect("a", 3600, 2700, "A"), op("w", "a", 1350, 0, 900, 2100, "W2")] }), "A");
  assert.deepEqual([lens(f, "head"), lens(f, "sill")], [[900], []]);
});

await t("each batten piece is named so it can be found on the wall: 'upright at 1,200, below W1', 'bottom, left of D1', the gable's left and right rakes", () => {
  const c = job();
  const labels = (label) => battens(c, label).lines.map((l) => l.label.replace(/^.*? batten — /, ""));
  assert.ok(labels("North").includes("upright at 1,200, below W1") && labels("North").includes("upright at 1,200, above W1"), labels("North").join(" | "));
  assert.ok(labels("East").includes("bottom, left of D1") && labels("East").includes("bottom, right of D1"));
  // a run longer than the longest pine batten (6,000) is joined, and each piece says which it is
  const long = job({ measurements: [rect("l", 7200, 2700, "Long")] });
  assert.deepEqual(battens(long, "Long").lines.map((l) => l.label.replace(/^.*? batten — /, "")).filter((x) => /bottom|top/.test(x)), ["bottom (1 of 2)", "bottom (2 of 2)", "top (1 of 2)", "top (2 of 2)"]);
  assert.ok(labels("Tall").includes("upright at 0") && !labels("Tall").some((x) => /of 2/.test(x)), "a 3,600 upright is one length");
  assert.deepEqual(labels("Gable").filter((x) => /rake/.test(x)).sort(), ["left rake", "right rake"]);
  assert.ok(labels("North").includes("W1 head") && labels("North").includes("W1 sill") && labels("North").includes("W1 left side"));
  for (const L of c.materialResults.clad.layouts) assert.equal(new Set(L.followers.battens.lines.map((l) => l.label)).size, L.followers.battens.lines.length, `${L.wallLabel}: every piece has its own name`);
});

await t("the check job computes quickly (client live preview + server): 5 walls with openings in well under a second", () => {
  const t0 = Date.now();
  for (let i = 0; i < 3; i++) job();
  assert.ok((Date.now() - t0) / 3 < 500, `${(Date.now() - t0) / 3} ms`);
});

console.log(`takeoff-tc-autobattens: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
