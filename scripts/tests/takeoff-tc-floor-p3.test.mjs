// Floor frame, Phase 3 (floor_framing@1): Hebel PowerFloor main floor, Scyon Secura wet areas, accessories, control joints. Plan: docs/takeoff/FLOOR_FRAMING_PLAN.md
//   node scripts/tests/takeoff-tc-floor-p3.test.mjs
import assert from "node:assert/strict";
import { CALCULATION_VERSION, buildSupplierGroups, floorFramingDefaults, FLOOR_FRAMING_RULES, buildCalibration, computeWorkspace, methodFor } from "../../shared/takeoff/index.js";
import { computeFloorFraming } from "../../shared/takeoff/engine/floor/framing.js";
import { ADHESIVE_LM_PER_CARTRIDGE, SEALANT_LM_PER_SAUSAGE, HEBEL_SCREW_BOX } from "../../shared/takeoff/engine/floor/accessories.js";
import { scyonFixingsPerLine, reflexCount } from "../../shared/takeoff/engine/floor/sheets.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 9).join("\n    ")}`); } }
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const rect = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const L_SHAPE = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 3000, y: 2000 }, { x: 3000, y: 4200 }, { x: 0, y: 4200 }];
const wet = (pts, name = "Wet area 1", id = "w1") => ({ id, name, points: pts });
const go = (outline, rules = {}, wets = []) => computeFloorFraming({ materialId: "m", n: floorFramingDefaults(), rules: { ...FLOOR_FRAMING_RULES, ...rules }, outline, voids: [], wets });
const acc = (r, key) => (r.layout.accessories || []).find((a) => a.key === key);
const codes = (r) => r.problems.map((p) => p.code);

// ── Hebel main floor: Sam's worked example 6.0 x 4.2 at 450 ──────────────────────────────────────────────────
t("Hebel 6.0 x 4.2 at 450: 7 rows of 1800 x 600 panels, 14 whole + 12 cut packed = 26 on the 450 truss grid, +5% = 28", () => {
  const r = go(rect(6000, 4200), { floorMaterial: "hebel" });
  const s = r.layout.sheets;
  assert.equal(s.sheet.name, "HEBEL POWERFLOOR 1800x600x75"); assert.equal(s.sheet.thicknessMm, 75); assert.equal(s.rows, 7); assert.equal(s.rippedRowWidthMm, null);
  assert.deepEqual(s.packed, { whole: 14, cut: 12, strips: 0, total: 26 });
  assert.equal(s.orderedSheets, 28); near(s.laidM2, 25.2);
  assert.ok(r.demands.some((d) => d.role === "floor sheet" && d.quantity === 28));
  assert.ok(r.problems.some((p) => p.code === "floor_hebel_height" && p.blocking === false && /raises the floor 75 mm/.test(p.message)));
});
t("Hebel rules: joints on truss lines, stagger >= 450 (one truss space), no cut panel under 2 truss spaces (900), waste editable", () => {
  const r = go(rect(6000, 4200), { floorMaterial: "hebel" });
  const s = r.layout.sheets;
  assert.ok(s.minStaggerMm >= 450 - 1e-6, `stagger ${s.minStaggerMm}`);
  for (const row of s.rowJoints) for (const u of row) assert.ok(Math.abs(u / 450 - Math.round(u / 450)) < 1e-3, `joint ${u} not on a 450 truss line`);
  const cuts = s.pieces.filter((p) => p.lengthMm < 1790);
  assert.ok(cuts.length > 0 && cuts.every((p) => p.lengthMm >= 900 - 0.5), `a cut under 900: ${cuts.map((p) => p.lengthMm)}`);
  assert.ok(!codes(r).includes("floor_sheet_stagger"));
  assert.equal(go(rect(6000, 4200), { floorMaterial: "hebel", wastePct: 0 }).layout.sheets.orderedSheets, 26);
});
t("Hebel at 600 centres is allowed: min cut 1200, stagger 600 where the truss lines allow it", () => {
  const r = go(rect(6000, 4200), { floorMaterial: "hebel", centresMm: 600 });
  const cuts = r.layout.sheets.pieces.filter((p) => p.lengthMm < 1790);
  assert.ok(cuts.every((p) => p.lengthMm >= 1200 - 0.5), `cuts ${cuts.map((p) => p.lengthMm)}`);
  assert.ok(!r.problems.some((p) => p.blocking) && r.layout.sheets.sheet.name === "HEBEL POWERFLOOR 1800x600x75");
});
t("Hebel stagger rule on exact lengths: 5400 runs lay full panels and a 900 start, joints >= 450 apart", () => {
  const r = go(rect(5400, 3000), { floorMaterial: "hebel" });
  assert.ok(r.layout.sheets.minStaggerMm == null || r.layout.sheets.minStaggerMm >= 450 - 1e-6);
  assert.ok(r.layout.sheets.packed.whole >= 5);
});
t("Hebel last row under 270 mm wide: non-blocking note (Hebel can't be cut that narrow)", () => {
  const r = go(rect(6000, 4000), { floorMaterial: "hebel" });   // 6 rows of 600 + 400: fine
  assert.ok(!codes(r).includes("floor_hebel_min_width"));
  const r2 = go(rect(6000, 3800), { floorMaterial: "hebel" });  // 6 rows + 200
  assert.ok(r2.problems.some((p) => p.code === "floor_hebel_min_width" && p.blocking === false));
});

// ── accessories: Hebel ───────────────────────────────────────────────────────────────────────────────────────
t("Hebel accessories: screws 8/m2 at 450 in boxes of 500, Hebel Adhesive 1 bag per 20 m2, Max Bond from truss-line bead lm, 1 anti-corrosive paint", () => {
  const r = go(rect(6000, 4200), { floorMaterial: "hebel" });
  const s = r.layout.sheets;
  assert.equal(HEBEL_SCREW_BOX, 500);
  assert.equal(acc(r, "screws").quantity, 1); assert.match(acc(r, "screws").note, /202 screws: 8 per m² at 450 centres/);
  assert.equal(acc(r, "hebelAdhesive").quantity, 2);
  assert.equal(acc(r, "paint").quantity, 1);
  // 15 truss lines x 4.2 m = 63 m, plus a second bead at each of the 3 butt joints x 7 rows x 0.6 m = 12.6 m
  near(s.basis.beadLm, 75.6);
  assert.equal(acc(r, "maxBond").quantity, Math.ceil(75.6 / ADHESIVE_LM_PER_CARTRIDGE - 1e-9));
  assert.match(acc(r, "maxBond").note, /assumed .* confirm/);
  assert.ok(!acc(r, "nails") && !acc(r, "sealant") && !acc(r, "rod"));
  assert.equal(go(rect(6000, 4200), { floorMaterial: "hebel", centresMm: 600 }).layout.accessories.find((a) => a.key === "screws").note.match(/(\d+) screws/)[1], String(Math.ceil(25.2 * 6)));
  assert.equal(acc(go(rect(6000, 4200), {}), "paint"), undefined);
});
t("accessory constants: 900 g at an assumed 1.4 g/mL and 6 mm bead is about 22.7 lm; a 480 mL sausage at 20 mm2 is 24 lm", () => {
  near(ADHESIVE_LM_PER_CARTRIDGE, 22.74, 0.05); near(SEALANT_LM_PER_SAUSAGE, 24, 1e-9);
});

// ── Scyon wet area 2.4 x 1.8, 19 mm, 450 ─────────────────────────────────────────────────────────────────────
t("Scyon wet area 2.4 x 1.8 m: 3 sheets of 2700x600x19 (packed), +5% waste = 4 ordered; the main floor is Structaflor less the wet area", () => {
  const r = go(rect(6000, 4200), {}, [wet(rect(2400, 1800))]);
  const w = r.layout.wetSheets[0];
  assert.equal(w.sheet.name, "SCYON SECURA 2700x600x19"); assert.equal(w.packedSheets, 3);
  assert.equal(r.layout.scyon.packedSheets, 3); assert.equal(r.layout.scyon.orderedSheets, 4);
  assert.ok(r.demands.some((d) => d.identity?.name === "SCYON SECURA 2700x600x19" && d.quantity === 4));
  assert.ok(r.demands.some((d) => /^STRUCTAFLOR/.test(d.identity?.name || "")));
  near(r.layout.sheets.laidM2, 20.88);
  assert.equal(go(rect(6000, 4200), { wastePct: 0 }, [wet(rect(2400, 1800))]).layout.scyon.orderedSheets, 3);
});
t("Scyon accessories: nails (4 per truss line per sheet, 50 mm default), adhesive bead lm under every sheet, SMX50 on the tongue and butt joints, Scyon only", () => {
  const r = go(rect(6000, 4200), {}, [wet(rect(2400, 1800))]);
  assert.equal(scyonFixingsPerLine(600), 4);
  // each row: truss lines 0..2250 (6) plus blocking at the 2400 end (1) = 7 lines x 4 = 28; 3 rows = 84
  assert.equal(acc(r, "nails").quantity, 1); assert.match(acc(r, "nails").product, /STAINLESS STEEL FIRST-FIX NAILS 50 mm \(box of 3000\)/); assert.match(acc(r, "nails").note, /^84 nails: .*boxes of 3000/);
  assert.equal(go(rect(6000, 4200), { nailMm: 75 }, [wet(rect(2400, 1800))]).layout.accessories.find((a) => a.key === "nails").product, "STAINLESS STEEL FIRST-FIX NAILS 75 mm (box of 3000)");
  const w = r.layout.wetSheets[0];
  near(w.basis.beadLm, 12.6); near(w.basis.tongueLm, 4.8); near(w.basis.buttLm, 0);
  assert.equal(acc(r, "sealant").quantity, 1); assert.match(acc(r, "sealant").product, /SMX50/); assert.match(acc(r, "sealant").note, /assumed .* confirm/);
  assert.equal(acc(r, "rod"), undefined);
  assert.ok(!acc(go(rect(6000, 4200), {}), "sealant"), "no SMX50 without a wet area (Structaflor takes Max Bond)");
});
t("Scyon 22 mm option: 2400x600x22 sheets", () => {
  const r = go(rect(6000, 4200), { scyonThicknessMm: 22 }, [wet(rect(2400, 1800))]);
  assert.equal(r.layout.wetSheets[0].sheet.name, "SCYON SECURA 2400x600x22"); assert.equal(r.layout.scyon.packedSheets, 3);
});
t("Scyon stagger >= 600 with end joints on truss lines (a 5.4 m wet run, 450 centres)", () => {
  const r = go(rect(6000, 4200), {}, [wet(rect(5400, 1800))]);
  const w = r.layout.wetSheets[0];
  assert.ok(w.minStaggerMm >= 600, `stagger ${w.minStaggerMm}`);
  for (const row of w.rowJoints) for (const u of row) assert.ok(Math.abs(u / 450 - Math.round(u / 450)) < 1e-3, `joint ${u}`);
  assert.ok(w.basis.buttLm > 0);
  assert.equal(r.layout.controlJoints.length, 0);
});
t("wet area with truss centres other than 450: the non-blocking note, and no default chord warning", () => {
  const a = go(rect(6000, 4200), { centresMm: 600 }, [wet(rect(2400, 1800))]);
  assert.ok(a.problems.some((p) => p.code === "floor_wet_centres" && p.blocking === false && p.message === "Wet areas need trusses at 450 — check the truss layout"));
  const b = go(rect(6000, 4200), {}, [wet(rect(2400, 1800))]);
  assert.ok(!codes(b).includes("floor_wet_centres") && !codes(b).includes("floor_support_width"));
  assert.ok(go(rect(6000, 4200), { chordWidthMm: 35 }).problems.some((p) => p.code === "floor_support_width" && p.blocking === false));
});

// ── Structaflor joints are glued (Sam, 19 Nov 2026) ──────────────────────────────────────────────────────────
t("Structaflor: Max Bond = bead under every sheet on each truss + tongues + butt joints; no SMX50", () => {
  const r = go(rect(6000, 4200), {});
  const b = r.layout.sheets.basis;
  assert.ok(b.beadLm > 0 && b.tongueLm > 0 && b.buttLm > 0);
  assert.equal(acc(r, "maxBond").quantity, Math.ceil((b.beadLm + b.tongueLm + b.buttLm) / ADHESIVE_LM_PER_CARTRIDGE - 1e-9));
  assert.match(acc(r, "maxBond").note, /tongues/);
  assert.ok(!acc(r, "sealant") && !acc(r, "screws"));
});

// ── control joints (length rule only) ────────────────────────────────────────────────────────────────────────
t("Hebel: a 7.5 m run across the trusses gets one control joint on the whole-panel grid (Sam 22 Nov: 3 panels = 5,400), 10 mm backing rod, and sheets stop at it", () => {
  const r = go(rect(7500, 4200), { floorMaterial: "hebel" });
  const s = r.layout.sheets;
  assert.equal(s.controlJoints.length, 1);
  const c = s.controlJoints[0];
  assert.equal(Math.round(c.a.x), 5400); assert.equal(Math.round(c.b.x), 5400);   // 3 whole panels, then the rest
  near(s.basis.controlJointLm, 4.2);
  assert.equal(acc(r, "rod").quantity, 5); assert.equal(acc(r, "rod").unit, "lm"); assert.match(acc(r, "rod").note, /Check/);
  assert.ok(s.pieces.every((p) => { const xs = p.corners.map((q) => q.x); return !(Math.min(...xs) < 5399 && Math.max(...xs) > 5401); }), "no panel crosses the joint");
  assert.ok(r.problems.some((p) => p.code === "floor_control_joint" && p.blocking === false));
  assert.equal(r.layout.controlJoints.length, 1);
  assert.equal(go(rect(6000, 4200), { floorMaterial: "hebel" }).layout.sheets.controlJoints.length, 0);   // 6000 is not over the limit
});
t("Hebel: a run ALONG the trusses over 6 m snaps to a sheet-row edge", () => {
  const r = go(rect(7500, 4200), { floorMaterial: "hebel", span: "long" });
  const c = r.layout.sheets.controlJoints;
  assert.equal(c.length, 1); assert.equal(Math.round(c[0].a.x) % 600, 0);   // 3750 -> the 3600 row edge
});
t("Scyon tiled: a 6.0 m wet run (over 5.4 m) gets a joint at a truss line; backing rod 2 lm for the 1.8 m joint", () => {
  const r = go(rect(6000, 4200), {}, [wet(rect(6000, 1800))]);
  const w = r.layout.wetSheets[0];
  assert.equal(w.controlJoints.length, 1); near(w.basis.controlJointLm, 1.8);
  assert.equal(acc(r, "rod").quantity, 2);
  assert.ok(w.pieces.every((p) => { const xs = p.corners.map((q) => q.x); return !(Math.min(...xs) < w.controlJoints[0].a.x - 1 && Math.max(...xs) > w.controlJoints[0].a.x + 1); }));
});
t("Scyon 22 mm: control joint limit is 4.8 m", () => {
  const r = go(rect(6000, 4200), { scyonThicknessMm: 22 }, [wet(rect(5000, 1800))]);
  assert.equal(r.layout.wetSheets[0].controlJoints.length, 1);
  assert.equal(go(rect(6000, 4200), {}, [wet(rect(5000, 1800))]).layout.wetSheets[0].controlJoints.length, 0);
});
t("re-entrant corner on an L-shaped Hebel floor: a note only, no automatic joint", () => {
  assert.equal(reflexCount(L_SHAPE), 1); assert.equal(reflexCount(rect(100, 100)), 0);
  const r = go(L_SHAPE, { floorMaterial: "hebel" });
  assert.ok(r.problems.some((p) => p.code === "floor_reentrant_corner" && p.blocking === false && p.message === "Check for a control joint at the re-entrant corner."));
  assert.equal(r.layout.sheets.controlJoints.length, 0);
  assert.ok(!go(L_SHAPE, {}).problems.some((p) => p.code === "floor_reentrant_corner"), "Structaflor: no control joint note");
});

// ── through the real workspace: order headings and notes ─────────────────────────────────────────────────────
const k = 0.05, X0 = 100, Y0 = 100;
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 }, vertical: { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 } }).calibration, status: "ready" };
const at = (p) => ({ x: X0 + p.x * k, y: Y0 + p.y * k });
const area = (id, pts, inputs) => ({ id, kind: "area", documentId: "d", pageIndex: 0, calibrationId: "cal", points: pts.map(at), inputs });
function run(measurements, rules = {}) {
  const spec = floorFramingDefaults(), mk = methodFor(spec);
  const mat = { id: "floor", name: "Floor", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...FLOOR_FRAMING_RULES, ...rules } };
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: [mat], measurements, contributions: measurements.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "floor", role: "primary" })) });
  const groups = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null, bracing: l.bracing || null, description: l.item.description, acc: l.item.acc || null, note: l.item.note || null, problem: l.problems.length > 0 })) }]);
  return { c, res: c.materialResults.floor, groups };
}
t("engine: Hebel floor with a wet area orders FLOORING (Hebel + Scyon) then FLOORING ACCESSORIES with EA and LM rows and basis notes, nothing incomplete", () => {
  const r = run([area("f1", rect(7500, 4200), { role: "floor", kind: "rect" }), area("w1", rect(2400, 1800), { role: "wet", kind: "rect", name: "Bath" })], { floorMaterial: "hebel" });
  assert.equal(r.res.status.quantity, "calculated", JSON.stringify(r.res.problems.filter((p) => p.blocking)));
  const f = r.groups.find((g) => g.heading === "FLOORING");
  assert.deepEqual(f.rows.map((x) => x.product).sort(), ["HEBEL POWERFLOOR 1800x600x75", "SCYON SECURA 2700x600x19"]);
  const a = r.groups.find((g) => g.heading === "FLOORING ACCESSORIES");
  assert.ok(a, r.groups.map((g) => g.heading).join());
  assert.ok(a.rows.every((x) => x.note && x.accessory));
  const rod = a.rows.find((x) => /BACKING ROD/.test(x.product));
  assert.equal(rod.unit, "LM"); assert.equal(rod.totalLm, 5);
  assert.ok(a.rows.find((x) => /NAILS/.test(x.product)).unit === "EA");
  assert.ok(r.groups.map((g) => g.heading).indexOf("FLOORING ACCESSORIES") > r.groups.map((g) => g.heading).indexOf("FLOORING"));
});
t("engine: Structaflor is still the default main floor (floorMaterial unset)", () => {
  const r = run([area("f1", rect(6000, 4200), { role: "floor", kind: "rect" })]);
  assert.equal(r.groups.find((g) => g.heading === "FLOORING").rows[0].product, "STRUCTAFLOR 3600x800x19");
  assert.ok(r.groups.find((g) => g.heading === "FLOORING ACCESSORIES").rows.some((x) => /MAX BOND/.test(x.product)));
});
t("version: takeoff-calc@14", () => { assert.match(CALCULATION_VERSION, /^takeoff-calc@14$/); });

t("Hebel (Sam 22 Nov: came in ~25 panels high): a 11.7 x 15.14 m floor at 450 packs 175, not 186: control joints on the panel grid, no unusable offcuts at each joint", () => {
  const s = go(rect(11700, 15140), { floorMaterial: "hebel" }).layout.sheets;
  assert.equal(s.controlJoints.length > 0, true);
  assert.ok(s.packedSheets <= 175, `${s.packedSheets} panels packed`);
  assert.ok(s.packedSheets >= Math.ceil(s.laidM2 / 1.08), "never under the laid area");
  // the joints across the trusses are whole panels apart from the edge of the run
  const xs = [...new Set(s.controlJoints.filter((c) => Math.abs(c.a.y - c.b.y) < 1 && Math.abs(c.a.x - c.b.x) > 5000).map((c) => Math.round(c.a.y)))];
  assert.deepEqual(xs, [5400, 10800]);
  for (const x of xs) assert.equal(x % 1800, 0, `joint at ${x}`);
});
console.log(`takeoff-tc-floor-p3: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
