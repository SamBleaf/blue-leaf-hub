// Floor frame, Phase 4: the layout drawing (shared model + SVG) and the floor page in the site appendix PDF. Plan: docs/takeoff/FLOOR_FRAMING_PLAN.md
//   node scripts/tests/takeoff-tc-floor-p4.test.mjs
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { CALCULATION_VERSION, floorFramingDefaults, FLOOR_FRAMING_RULES, buildCalibration, computeWorkspace, methodFor } from "../../shared/takeoff/index.js";
import { computeFloorFraming } from "../../shared/takeoff/engine/floor/framing.js";
import { floorDrawing, drawingToSvg } from "../../shared/takeoff/engine/floor/drawing.js";
import { buildExportSnapshot } from "../../server/lib/takeoff/takeoffService.mjs";
import { renderSiteAppendixPdf, RENDERER_VERSION } from "../../server/lib/takeoff/takeoffPdf.mjs";

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 9).join("\n    ")}`); } }
const rect = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const go = (outline, rules = {}, voids = [], wets = []) => computeFloorFraming({ materialId: "m", n: floorFramingDefaults(), rules: { ...FLOOR_FRAMING_RULES, ...rules }, outline, voids, wets });
const count = (svg, re) => (svg.match(re) || []).length;

// 6.0 x 4.2 at 450, a stair void, and a 2.4 x 1.8 Scyon wet area
const STAIR = { id: "v1", name: "Stair", stair: true, points: rect(1000, 2400, 2500, 600) };
const WET = { id: "w1", name: "Bath", points: rect(2400, 1800, 3000, 2400) };

await t("drawing, Structaflor 6.0 x 4.2 at 450 with a stair void and a wet area: every sheet piece, truss line, void, wet area and legend entry is drawn", () => {
  const r = go(rect(6000, 4200), { beams: { e0: "445x63" } }, [STAIR], [WET]);
  const lay = r.layout, m = floorDrawing(lay, { name: "Floor frame" }), svg = drawingToSvg(m);
  assert.ok(m && svg.startsWith("<svg"));
  assert.equal(count(svg, /data-fl="main-(sheet|cut)"/g), lay.sheets.pieces.length, "every main piece is a polygon");
  assert.equal(count(svg, /data-fl="wet-(sheet|cut)"/g), lay.wetSheets.flatMap((w) => w.pieces).length, "every Scyon piece");
  assert.equal(m.counts.cutPieces, lay.sheets.pieces.filter((p) => p.lengthMm < 3590 || p.widthMm < 795).length);
  assert.ok(m.counts.cutPieces > 0 && count(svg, /data-fl="cut-mark"/g) >= m.counts.cutPieces, "cut pieces are marked");
  const joints = lay.sheets.rowJoints.reduce((n, row) => n + row.length, 0);
  assert.ok(joints > 0); assert.equal(m.counts.joints, joints);
  assert.equal(count(svg, /data-fl="truss"/g), lay.trusses.length);
  assert.equal(m.counts.trussLines, lay.totals.trussLines);
  assert.equal(count(svg, /data-fl="void-stair"/g), 1); assert.ok(count(svg, /data-fl="void-hatch"/g) > 3, "stair void is hatched");
  assert.equal(count(svg, /data-fl="wet"/g), 1); assert.ok(count(svg, /data-fl="wet-hatch"/g) > 3, "wet area is hatched");
  assert.equal(count(svg, /data-fl="trimmer"/g), 4, "four stair trimmers");
  assert.equal(count(svg, /data-fl="beam"/g), 1);
  assert.ok(count(svg, /data-fl="end-strongback"/g) >= 1); assert.ok(count(svg, /data-fl="mid-strongback"/g) >= 1);
  assert.equal(count(svg, /data-fl="truss-arrow"/g), 5, "one double-headed direction arrow");
  assert.match(svg, /Trusses 450 crs/); assert.match(svg, /A 445x63/); assert.match(svg, /LVL 445x63/); assert.match(svg, /Scyon 2700x600x19/);
  assert.match(svg, /6,000 mm/); assert.match(svg, /4,200 mm/);
  assert.deepEqual(m.counts.legendKeys, ["structaflor", "scyon", "wet", "stair", "cut", "truss", "trussCut", "beam", "strongback", "trimmer"]);
  assert.equal(m.summary.length, 5);
  assert.match(m.summary[0], new RegExp(`${lay.totals.trussCount} trusses at 450 crs`));
  assert.ok(m.summary.some((s) => s.includes(`${lay.sheets.orderedSheets} × STRUCTAFLOR 3600x800x19`)) && m.summary.some((s) => /SCYON SECURA 2700x600x19/.test(s)));
  assert.match(m.legend.find((l) => l.key === "structaflor").label, /STRUCTAFLOR/);
});

await t("drawing, Hebel main floor 6.0 x 4.2 at 450: 26 packed pieces drawn in the Hebel fill, joints on truss lines, a control joint is dashed and labelled", () => {
  const r = go(rect(6000, 4200), { floorMaterial: "hebel" });
  const lay = r.layout, m = floorDrawing(lay), svg = drawingToSvg(m);
  assert.equal(count(svg, /data-fl="main-(sheet|cut)"/g), lay.sheets.pieces.length);
  assert.ok(svg.includes("#d8e3f0") && !svg.includes("#f1e2bf"), "Hebel fill, not the Structaflor fill");
  assert.ok(m.counts.legendKeys.includes("hebel") && !m.counts.legendKeys.includes("structaflor"));
  assert.equal(m.counts.joints, lay.sheets.rowJoints.reduce((n, row) => n + row.length, 0));
  const wide = go(rect(7200, 4200), { floorMaterial: "hebel" }), ws = drawingToSvg(floorDrawing(wide.layout));
  assert.ok(wide.layout.controlJoints.length > 0, "a 7.2 m Hebel run needs a control joint");
  assert.equal(count(ws, /data-fl="control-joint"/g), wide.layout.controlJoints.length); assert.match(ws, />CJ</);
  assert.ok(floorDrawing(wide.layout).counts.legendKeys.includes("controlJoint"));
});

await t("drawing: a floor with no outline gives no drawing", () => { assert.equal(floorDrawing(null), null); assert.equal(floorDrawing({ totals: null }), null); });

// ── through the real workspace to the frozen snapshot and the site appendix PDF ─────────────────────────────
const k = 0.05, X0 = 100, Y0 = 100;
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 }, vertical: { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 } }).calibration, status: "ready" };
const at = (p) => ({ x: X0 + p.x * k, y: Y0 + p.y * k });
const area = (id, pts, inputs) => ({ id, kind: "area", documentId: "d", pageIndex: 0, calibrationId: "cal", points: pts.map(at), inputs });
async function pdfText(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" "));
  await doc.destroy();
  return pages;
}
await t("PDF: the site appendix has one floor layout page with the legend, summary and dimensions; the renderer is takeoff-pdf@6; calc version unchanged", async () => {
  const spec = floorFramingDefaults(), mk = methodFor(spec);
  const mat = { id: "floor", name: "Ground floor frame", spec, methodKey: mk.key, methodVersion: mk.version, rules: { ...FLOOR_FRAMING_RULES } };
  const ms = [area("f1", rect(6000, 4200), { role: "floor", kind: "rect" }), area("v1", rect(1000, 2400, 2500, 600), { role: "void", stair: true, name: "Stair" }), area("w1", rect(2400, 1800, 3000, 2400), { role: "wet", kind: "rect", name: "Bath" })];
  const w = { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal], materials: [mat], measurements: ms,
    contributions: ms.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "floor", role: "primary" })) };
  const c = computeWorkspace(w);
  assert.equal(c.materialResults.floor.appendix.floorLayouts.length, 1);
  const lines = c.scheduleLines.filter((l) => l.jobMaterialIds.includes("floor")).map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: "floor", finishedLengthMm: l.finishedLengthMm, quantity: l.quantity, unit: l.unit, item: l.item, roles: l.roles }));
  const { snapshot } = buildExportSnapshot({ wsSnapshot: w, order: { id: "o", orderRef: "TO-9", revision: 1, category: "timber", delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400" } },
    lines, supplier: { id: "s", name: "Supplier" }, company: { name: "Blue Leaf", phone: "08" }, jobLabel: "1 Example St", rendererVersion: RENDERER_VERSION });
  assert.equal(snapshot.appendix.floorLayouts.length, 1, "the drawing model is frozen into the snapshot");
  const pdf = await renderSiteAppendixPdf(snapshot, { exportNo: 1, snapshotSha256: "abc" });
  const pages = await pdfText(pdf);
  const fp = pages.find((p) => /layout drawing/.test(p));
  assert.ok(fp, "a floor layout page exists");
  for (const s of ["Ground floor frame", "Trusses 450 crs", "6,000 mm", "4,200 mm", "Stair void (hatched)", "Wet area (hatched)", "STRUCTAFLOR 3600x800x19", "Floor truss line", "Strongback", "Control joint", "trusses at 450 crs", "The truss supplier designs the layout"]) {
    if (s === "Control joint") continue;   // only drawn when a run is long enough
    assert.ok(fp.includes(s), `missing "${s}" on the floor page`);
  }
  assert.equal(RENDERER_VERSION, "takeoff-pdf@6");
  assert.equal(CALCULATION_VERSION, "takeoff-calc@13", "the drawing adds no number, so the calculation version is unchanged");
});

console.log(`takeoff-tc-floor-p4: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
