// TC-R04 cladding engine — wall model (04 §C0) and cladding methods (C1–C6, 12 Rendex) asserted against the
// PRODUCTION functions in shared/takeoff/engine/{wall,cladding}.js: every fixtures.json case of the cladding
// kinds, J2/J3/J4, CL01–CL06 and each "never"/"do not" boundary in 04/12.
//   node scripts/tests/takeoff-tc-cladding.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWall, normaliseOpenings, wallAreas } from "../../shared/takeoff/engine/wall.js";
import {
  sheetLayout, courseLayout, panelGrid, aacPanelLayout, areaToLinear, selectInstallationRule, MAX_ELEMENTS_PER_WALL,
} from "../../shared/takeoff/engine/cladding.js";
import { identityKey, QUANTITY_STATUS, INSTALLATION_STATUS, PROCUREMENT_STATUS, UNITS } from "../../shared/takeoff/engine/contract.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const TC = new URL("../../docs/takeoff/TC-R04/", import.meta.url);
const FIXTURES = JSON.parse(readFileSync(new URL("fixtures.json", TC), "utf8")).cases;
const CATALOGUE = JSON.parse(readFileSync(new URL("catalogue-seed.json", TC), "utf8"));
const P = (id) => { const p = CATALOGUE.products.find((x) => x.id === id); assert.ok(p, `catalogue has ${id}`); return p; };
const ASSEMBLY = (id) => CATALOGUE.assemblyCandidates.find((a) => a.id === id);
const AXON133 = ["axon-403931", "axon-403932", "axon-403933", "axon-404979"].map(P); // 2450/2750/3000/3600
const AXON400 = ["axon-404417", "axon-404418", "axon-404419"].map(P);                 // 2450/2750/3000
const WALSC50 = ["walsc50-2200", "walsc50-2400", "walsc50-2550", "walsc50-2700", "walsc50-2850", "walsc50-3000"].map(P);
const MATRIX1190 = P("matrix-403811");

const rect = (w, h, id = "W1") => buildWall({ id, kind: "rect", widthMm: w, heightMm: h });
const of = (res, role) => res.demands.filter((d) => d.role === role);
const codes = (res) => res.problems.map((p) => p.code);
const close = (a, e, msg) => assert.ok(Math.abs(a - e) <= Math.max(1e-6, 1e-9 * Math.abs(e)), `${msg ?? ""} ${a} ≠ ${e}`);
const total = (ds) => ds.reduce((s, d) => s + d.lengthMm * d.quantity, 0);

/** MethodResult / Demand contract shape (engine/contract.js). */
function checkContract(res) {
  assert.ok(Array.isArray(res.demands) && Array.isArray(res.problems) && Array.isArray(res.explain));
  assert.ok(QUANTITY_STATUS.includes(res.status.quantity), res.status.quantity);
  assert.ok(INSTALLATION_STATUS.includes(res.status.installation), res.status.installation);
  assert.ok(PROCUREMENT_STATUS.includes(res.status.procurement), res.status.procurement);
  const ids = new Set();
  for (const d of res.demands) {
    assert.equal(typeof d.id, "string"); assert.ok(!ids.has(d.id), `duplicate demand id ${d.id}`); ids.add(d.id);
    assert.ok(d.materialId && d.role, "materialId + role");
    assert.ok(["linear", "sheet", "count", "area", "volume"].includes(d.kind), d.kind);
    assert.ok(UNITS.includes(d.unit), d.unit);
    assert.ok(Number.isFinite(d.quantity) && d.quantity > 0, "quantity > 0 (unknown is never 0)");
    assert.equal(typeof d.identity, "object");
    assert.ok(Array.isArray(d.sourceRefs) && d.sourceRefs.length, "sourceRefs");
    assert.ok(["calculated", "manual"].includes(d.provenance));
    if (d.kind === "linear" && d.unit === "piece") assert.ok(d.lengthMm > 0);
    if (d.kind === "sheet") assert.ok(d.widthMm > 0 && d.heightMm > 0);
  }
  for (const p of res.problems) {
    assert.equal(typeof p.code, "string"); assert.equal(typeof p.message, "string"); assert.equal(typeof p.blocking, "boolean");
    assert.ok(["quantity", "installation", "procurement"].includes(p.axis), `${p.code} has an axis`);
  }
  return res;
}

// ── fixtures.json — every cladding-kind case through the production functions ─────────────────
const MINE = FIXTURES.filter((f) => ["sheets", "panelGrid", "courses", "linear", "netArea"].includes(f.kind));
const byCover = (cover, minLength) => CATALOGUE.products.find((p) => p.family === "cladding" && p.effectiveCoverMm === cover && p.dimensionsMm.length >= minLength);
const RUN = {
  sheets: ({ walls, cover }) => {
    assert.equal(AXON133[0].effectiveCoverMm, cover);
    return walls.reduce((s, w, i) => s + of(checkContract(sheetLayout(rect(w, 2400, `W${i}`), [], AXON133, { materialId: "axon" })), "sheet").length, 0);
  },
  panelGrid: ({ width, height, panel, gap }) => {
    const prod = CATALOGUE.products.find((p) => p.dimensionsMm?.length === panel && p.dimensionsMm?.width === panel);
    return of(checkContract(panelGrid(rect(width, height), [], prod, { jointGapMm: gap })), "panel").length;
  },
  courses: ({ height, cover }) => {
    const r = checkContract(courseLayout(rect(2400, height), [], byCover(cover, 2400), { orientation: "horizontal" }));
    assert.equal(r.layout.summary.boards, r.layout.summary.courses, "one board per course on a 2,400 wall");
    return r.layout.summary.courses;
  },
  linear: ({ areaM2, coverMm, spareRate }) => checkContract(areaToLinear({ netAreaM2: areaM2, coverMm, spareRate, orderIncrementM: 0.001 })).layout.withSpareLm,
  netArea: ({ width, height, openingWidth, openingHeight }) => wallAreas(rect(width, height), [{ id: "O1", xMm: 600, sillMm: 900, widthMm: openingWidth, heightMm: openingHeight }]).netM2,
};
t("fixtures: all 11 cladding-kind cases are present (none silently skipped)", () => assert.equal(MINE.length, 11));
for (const f of MINE) t(`fixture ${f.id} (${f.kind}) = ${f.expected}`, () => close(RUN[f.kind](f.input), f.expected, f.id));

// ── C0 wall model ─────────────────────────────────────────────────────────────────────────────
t("C0 rect / rake / gable / polygon gross areas are exact", () => {
  assert.equal(rect(4800, 2700).grossAreaMm2, 12960000);
  assert.equal(buildWall({ kind: "rake", widthMm: 2400, startHeightMm: 2300, endHeightMm: 2900 }).grossAreaMm2, 2400 * 2600);
  const g = buildWall({ kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000, apexHeightMm: 4000 });
  assert.equal(g.grossAreaMm2, 19200000); assert.equal(g.polygon.length, 5); assert.deepEqual(g.bbox, { x0: 0, y0: 0, x1: 6000, y1: 4000 });
  const L = buildWall({ kind: "polygon", points: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }] });
  assert.equal(L.grossAreaMm2, 4000 * 2000 + 2000 * 1000); assert.deepEqual(L.problems, []);
});
t("C0 clockwise traced polygon is normalised (same area, counter-clockwise)", () => {
  const cw = buildWall({ kind: "polygon", points: [{ x: 0, y: 0 }, { x: 0, y: 2700 }, { x: 4800, y: 2700 }, { x: 4800, y: 0 }] });
  assert.equal(cw.grossAreaMm2, 12960000);
  const p = cw.polygon; let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  assert.ok(a > 0);
});
t("C0 self-intersecting, zero-area and invalid inputs need correction (blocking, no polygon)", () => {
  const bad = [
    [{ kind: "polygon", points: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }] }, "wall_self_intersecting"],
    [{ kind: "polygon", points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }] }, "wall_polygon_invalid"],
    [{ kind: "polygon", points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 800 }] }, "wall_self_intersecting"],
    [{ kind: "rect", widthMm: 0, heightMm: 2400 }, "wall_dimension_invalid"],
    [{ kind: "rect", widthMm: 4800 }, "wall_dimension_invalid"],
    [{ kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 6000, apexHeightMm: 4000 }, "wall_dimension_invalid"],
    [{ kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000, apexHeightMm: 2400 }, "wall_dimension_invalid"],
    [{ kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexHeightMm: 4000 }, "wall_dimension_invalid"],
    [{ kind: "rake", widthMm: 2400, startHeightMm: 0, endHeightMm: 0 }, "wall_dimension_invalid"],
    [{ kind: "hexagon", widthMm: 1 }, "wall_kind_unknown"],
  ];
  for (const [input, code] of bad) {
    const w = buildWall(input);
    assert.equal(w.polygon, null, code); assert.equal(w.problems[0].code, code); assert.equal(w.problems[0].blocking, true);
  }
  const r = sheetLayout(buildWall(bad[0][0]), [], AXON133, {});
  assert.equal(r.status.quantity, "incomplete"); assert.equal(r.demands.length, 0);
});
t("C0 rake with a zero end is a valid triangle", () => {
  const w = buildWall({ kind: "rake", widthMm: 3000, startHeightMm: 2400, endHeightMm: 0 });
  assert.equal(w.polygon.length, 3); assert.equal(w.grossAreaMm2, 3600000);
});
t("C0 overlapping openings are NOT deducted twice (union, also for an exact duplicate shape)", () => {
  const w = rect(4800, 2700);
  const o1 = { id: "O1", xMm: 1000, sillMm: 900, widthMm: 1000, heightMm: 1000 };
  const o2 = { id: "O2", xMm: 1500, sillMm: 900, widthMm: 1000, heightMm: 1000 };
  const a = wallAreas(w, [o1, o2]);
  close(a.openingM2, 1.5); close(a.netM2, 12.96 - 1.5);
  close(wallAreas(w, [o1, o2, { ...o1, id: "O3" }]).openingM2, 1.5);
});
t("C0 opening entirely outside the wall is flagged (blocking) and deducts nothing", () => {
  const w = rect(4800, 2700);
  const n = normaliseOpenings(w, [{ id: "OUT", xMm: 5000, sillMm: 0, widthMm: 900, heightMm: 900 }]);
  assert.equal(n.openings.length, 0); assert.equal(n.problems[0].code, "opening_outside_wall"); assert.equal(n.problems[0].blocking, true);
  close(wallAreas(w, [{ id: "OUT", xMm: 5000, sillMm: 0, widthMm: 900, heightMm: 900 }]).netM2, 12.96);
  const r = sheetLayout(w, [{ id: "OUT", xMm: 5000, sillMm: 0, widthMm: 900, heightMm: 900 }], AXON133, {});
  assert.equal(r.status.quantity, "incomplete"); assert.ok(codes(r).includes("opening_outside_wall"));
});
t("C0 gable: an opening inside the bounding box but above the roof line is outside the wall", () => {
  const g = buildWall({ kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000, apexHeightMm: 4000 });
  assert.equal(normaliseOpenings(g, [{ id: "HI", xMm: 100, sillMm: 3500, widthMm: 400, heightMm: 400 }]).problems[0].code, "opening_outside_wall");
  const part = normaliseOpenings(g, [{ id: "VENT", xMm: 2800, sillMm: 3000, widthMm: 400, heightMm: 900 }]);
  assert.equal(part.problems[0].code, "opening_clipped"); assert.equal(part.problems[0].blocking, false);
  assert.ok(part.openings[0].wallAreaMm2 < part.openings[0].areaMm2);
});
t("C0 opening touching the boundary is valid; one extending past it is clipped (warning only)", () => {
  const w = rect(4800, 2700);
  assert.deepEqual(normaliseOpenings(w, [{ id: "D1", xMm: 0, sillMm: 0, widthMm: 900, heightMm: 2100 }]).problems, []);
  const a = wallAreas(w, [{ id: "W9", xMm: 4500, sillMm: 1000, widthMm: 600, heightMm: 1000 }]);
  close(a.openingM2, 0.3); assert.equal(a.problems[0].code, "opening_clipped"); assert.equal(a.problems[0].blocking, false);
});
t("C0 zero-sized, id-less and duplicate openings require correction", () => {
  const n = normaliseOpenings(rect(4800, 2700), [
    { id: "Z", xMm: 100, sillMm: 100, widthMm: 0, heightMm: 900 }, { xMm: 100, sillMm: 100, widthMm: 900, heightMm: 900 },
    { id: "D", xMm: 100, sillMm: 100, widthMm: 900, heightMm: 900 }, { id: "D", xMm: 2000, sillMm: 100, widthMm: 900, heightMm: 900 },
  ]);
  assert.deepEqual(n.problems.map((p) => p.code), ["opening_invalid", "opening_invalid", "opening_duplicate"]);
  assert.ok(n.problems.every((p) => p.blocking)); assert.equal(n.openings.length, 1);
});

t("C0 property (seeded): union area = independent brute force; cell material sums to net area on rect/rake/gable/traced walls", () => {
  let seed = 20261014;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  for (let n = 0; n < 150; n++) {
    const W = int(600, 9000), H = int(600, 4000);
    const kind = ["rect", "rake", "gable", "polygon"][n % 4];
    const wall = kind === "rect" ? rect(W, H)
      : kind === "rake" ? buildWall({ kind, widthMm: W, startHeightMm: H, endHeightMm: int(300, 4000) })
        : kind === "gable" ? buildWall({ kind, widthMm: W, eavesHeightMm: H, apexXMm: int(1, W - 1), apexHeightMm: H + int(1, 2000) })
          : buildWall({ kind, points: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: W / 2, y: H }, { x: W / 2, y: H + 777.5 }, { x: 0, y: H + 777.5 }] });
    const ops = Array.from({ length: int(0, 6) }, (_, i) => ({ id: `O${i}`, xMm: int(0, W - 200), sillMm: int(0, H - 200), widthMm: int(100, 2000), heightMm: int(100, 1500) }));
    const norm = normaliseOpenings(wall, ops);
    const kept = ops.filter((o) => norm.openings.some((k) => k.id === o.id));
    const areas = wallAreas(wall, kept);
    if (kind === "rect") { // brute force: compress the opening edges, count covered cells inside the wall
      const xs = [...new Set([0, W, ...kept.flatMap((o) => [o.xMm, o.xMm + o.widthMm])])].map((v) => Math.min(Math.max(v, 0), W)).sort((a, b) => a - b);
      const ys = [...new Set([0, H, ...kept.flatMap((o) => [o.sillMm, o.sillMm + o.heightMm])])].map((v) => Math.min(Math.max(v, 0), H)).sort((a, b) => a - b);
      let u = 0;
      for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
        const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
        if (kept.some((o) => cx > o.xMm && cx < o.xMm + o.widthMm && cy > o.sillMm && cy < o.sillMm + o.heightMm)) u += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
      close(areas.openingAreaMm2, u, `rect ${n}`);
    }
    const tall = AXON133.map((p) => ({ ...p, dimensionsMm: { ...p.dimensionsMm, length: p.dimensionsMm.length + 10000 } }));
    const r = sheetLayout(wall, kept, tall, {});
    assert.equal(r.status.quantity, "calculated", `${kind} ${n}: ${codes(r)}`);
    assert.ok(Math.abs(r.layout.areas.layoutCutM2 - areas.netM2) <= 1e-9 * Math.max(1, areas.netM2), `${kind} ${n}: cells ${r.layout.areas.layoutCutM2} vs net ${areas.netM2}`);
    assert.ok(areas.openingM2 <= kept.reduce((s, o) => s + (o.widthMm * o.heightMm) / 1e6, 0) + 1e-9, "union never exceeds the sum");
  }
});

// ── C1 Axon sheets — J2, CL01, CL02, rakes ───────────────────────────────────────────────────
const J2_WINDOW = [{ id: "W01", xMm: 1350, sillMm: 900, widthMm: 900, heightMm: 900 }]; // wholly inside strip 2 (1,200–2,400)
t("J2 4,800 × 2,700, cover 1,200, 900 × 900 window inside one cell → 4 sheets (no reuse), net 12.15 m²", () => {
  const w = rect(4800, 2700);
  const r = checkContract(sheetLayout(w, J2_WINDOW, AXON133, { materialId: "axon" }));
  const s = of(r, "sheet");
  assert.equal(s.length, 4);
  assert.ok(s.every((d) => d.identity.sku === "403932" && d.identity.stockLengthMm === 2750), "shortest listed height ≥ 2,700 is 2,750");
  close(r.layout.areas.netM2, 12.15); close(wallAreas(w, J2_WINDOW).netM2, 12.15);
  const windowSheet = s.find((d) => d.id === "axon:W1:sheet:c1r0");
  assert.ok(windowSheet.sourceRefs.some((ref) => ref.openingId === "W01"), "window cell keeps its sheet and its source link");
  assert.deepEqual(r.status, { quantity: "calculated", installation: "unspecified", procurement: "draft" });
  assert.equal(r.layout.summary.sheets, 4); assert.deepEqual(r.layout.summary.bySku, { 403932: 4 });
  assert.ok(r.layout.potentialOffcuts.length && r.layout.potentialOffcuts.every((o) => o.allocated === false));
  close(r.layout.areas.stockM2, 4 * 1.2 * 2.75); close(r.layout.areas.layoutCutM2, 12.15);
});
t("J2 width 4,801 → 5 sheets before spares (0.1 mm-scale overrun is never absorbed)", () => {
  assert.equal(of(sheetLayout(rect(4801, 2700), J2_WINDOW, AXON133, {}), "sheet").length, 5);
  assert.equal(of(sheetLayout(rect(4800.1, 2700), [], AXON133, {}), "sheet").length, 5);
  assert.equal(of(sheetLayout(rect(4800 + 1e-9, 2700), [], AXON133, {}), "sheet").length, 4, "float noise only");
});
t("J2 recalculation is deterministic: identical demands and stable ids", () => {
  const a = sheetLayout(rect(4800, 2700), J2_WINDOW, AXON133, { materialId: "axon" });
  const b = sheetLayout(rect(4800, 2700), J2_WINDOW, AXON133, { materialId: "axon" });
  assert.deepEqual(a, b);
  assert.deepEqual(a.demands.map((d) => d.id), ["axon:W1:sheet:c0r0", "axon:W1:sheet:c1r0", "axon:W1:sheet:c2r0", "axon:W1:sheet:c3r0"]);
});
t("CL01 two adjacent 1,300 walls + small opening → 2 + 2 = 4 (per-wall rounding, partly occupied sheet kept, no phantom reuse)", () => {
  const a = checkContract(sheetLayout(rect(1300, 2400, "WA"), [{ id: "O1", xMm: 1220, sillMm: 1000, widthMm: 60, heightMm: 300 }], AXON133, { materialId: "m" }));
  const b = checkContract(sheetLayout(rect(1300, 2400, "WB"), [], AXON133, { materialId: "m" }));
  const all = [...of(a, "sheet"), ...of(b, "sheet")];
  assert.equal(all.length, 4, "never pooled to ceil(2,600 / 1,200) = 3");
  assert.equal(new Set(all.map((d) => d.id)).size, 4);
  assert.ok(of(a, "sheet").some((d) => d.sourceRefs.some((r) => r.openingId === "O1")));
  for (const r of [a, b]) {
    assert.ok(r.layout.potentialOffcuts.some((o) => o.widthMm === 1100), "the 1,100 mm offcut is shown, not allocated");
    assert.ok(r.layout.potentialOffcuts.every((o) => o.allocated === false));
  }
});
t("C1 an entirely empty cell consumes none; partial cells consume whole sheets; no fractional area subtraction", () => {
  const w = rect(4800, 2700);
  const voidStrip = [{ id: "V", xMm: 1200, sillMm: 0, widthMm: 1200, heightMm: 2700 }];
  assert.equal(of(sheetLayout(w, voidStrip, AXON133, {}), "sheet").length, 3);
  const r = sheetLayout(w, voidStrip, AXON133, { openingPolicy: "none" });
  assert.equal(of(r, "sheet").length, 4, "no-deduction policy is explicit and stored");
  assert.equal(r.layout.openingPolicy, "none");
  const three = [0, 1, 2].map((i) => ({ id: `O${i}`, xMm: 150 + i * 1200, sillMm: 900, widthMm: 900, heightMm: 900 }));
  assert.equal(of(sheetLayout(w, three, AXON133, {}), "sheet").length, 4);
  assert.equal(codes(sheetLayout(w, [], AXON133, { openingPolicy: "ratio" }))[0], "opening_policy_invalid");
});
t("C1 rake: each strip is sized by its MAXIMUM top, never its centre", () => {
  const w = buildWall({ id: "R", kind: "rake", widthMm: 2400, startHeightMm: 2300, endHeightMm: 2900 });
  const r = checkContract(sheetLayout(w, [], AXON133, {}));
  const cells = r.layout.cells.filter((c) => c.occupied);
  close(cells[0].cutLengthMm, 2600); close(cells[1].cutLengthMm, 2900);
  assert.deepEqual(of(r, "sheet").map((d) => d.identity.sku), ["403932", "403933"], "centre heights 2,450 / 2,750 would under-order");
});
t("C1 gable strips each take their own max top (apex strip tallest)", () => {
  const g = buildWall({ kind: "gable", widthMm: 3600, eavesHeightMm: 2400, apexXMm: 1800, apexHeightMm: 3200 });
  const r = sheetLayout(g, [], AXON133, {});
  const tops = r.layout.cells.map((c) => c.cutLengthMm);
  close(tops[0], 2400 + 800 * (1200 / 1800)); close(tops[1], 3200); close(tops[2], tops[0]);
  assert.deepEqual(of(r, "sheet").map((d) => d.identity.stockLengthMm), [3000, 3600, 3000]);
});
t("C1 shortest sufficient listed height includes the explicit allowance", () => {
  assert.equal(of(sheetLayout(rect(2400, 2400), [], AXON133, {}), "sheet")[0].identity.sku, "403931");
  assert.equal(of(sheetLayout(rect(2400, 2400), [], AXON133, { heightAllowanceMm: 100 }), "sheet")[0].identity.sku, "403932");
  assert.equal(codes(sheetLayout(rect(2400, 2400), [], AXON133, { heightAllowanceMm: -1 }))[0], "allowance_invalid");
});
t("C1 datum half-sheet start is kept when selected — quantity can increase", () => {
  const r = sheetLayout(rect(4800, 2400), [], AXON133, { datumMm: 600 });
  assert.equal(of(r, "sheet").length, 5);
  assert.equal(r.layout.datumMm, 600); close(r.layout.cells[0].cutWidthMm, 600);
});
t("CL02 wall taller than every listed sheet, no joint row → blocked with a proposal; never one sheet per width", () => {
  const r = checkContract(sheetLayout(rect(4800, 3300), [], AXON400, {}));
  assert.equal(r.status.quantity, "incomplete"); assert.equal(r.status.procurement, "unavailable-stock");
  assert.equal(r.demands.length, 0);
  const p = r.problems.find((x) => x.code === "sheet_too_tall");
  assert.ok(p.blocking); assert.equal(p.suggestedJointAtMm, 3000); assert.deepEqual(p.listedLengthsMm, [2450, 2750, 3000]); assert.equal(p.refs.length, 4);
});
t("CL02 a 'joint allowed' flag is not a layout: still blocked", () => {
  for (const opts of [{ jointAllowed: true }, { jointRows: { allowed: true } }, { jointRows: { atMm: [3000] } }, { jointRows: { atMm: [3400], gapMm: 10 } }]) {
    const r = sheetLayout(rect(4800, 3300), [], AXON400, opts);
    assert.equal(r.status.quantity, "incomplete", JSON.stringify(opts)); assert.equal(r.demands.length, 0);
  }
});
t("CL02 explicit joint row → real second course (4 × 2 sheets) + horizontal-joint demands", () => {
  const r = checkContract(sheetLayout(rect(4800, 3300), [], AXON400, { materialId: "axon", jointRows: { atMm: [3000], gapMm: 10, detailRef: "H02 joint" } }));
  const s = of(r, "sheet");
  assert.equal(s.length, 8);
  assert.deepEqual(s.map((d) => d.identity.sku), ["404419", "404419", "404419", "404419", "404417", "404417", "404417", "404417"]);
  const j = of(r, "horizontal-joint");
  assert.equal(j.length, 1); assert.equal(j[0].lengthMm, 4800); assert.equal(j[0].lengthKind, "tight");
  assert.deepEqual(r.layout.joints[0], { index: 0, orientation: "horizontal", atMm: 3000, gapMm: 10, detailRef: "H02 joint", source: "explicit", segments: [{ startMm: 0, endMm: 4800 }] });   // HUB 015: joints say where they came from
  assert.ok(codes(r).includes("joint_product_missing")); assert.equal(r.status.procurement, "missing-product");
  assert.equal(r.status.quantity, "calculated");
});
t("CL02 joint row interrupted by an opening crossing it", () => {
  const r = sheetLayout(rect(4800, 3300), [{ id: "HIGH", xMm: 1000, sillMm: 2500, widthMm: 1000, heightMm: 700 }], AXON400, { jointRows: { atMm: [3000], gapMm: 10 } });
  assert.deepEqual(r.layout.joints[0].segments, [{ startMm: 0, endMm: 1000 }, { startMm: 2000, endMm: 4800 }]);
  close(total(of(r, "horizontal-joint")), 3800);
});
t("CL02 a taller LISTED sheet is preferred over a joint (Axon 133 3,600)", () => {
  const r = sheetLayout(rect(4800, 3300), [], AXON133, {});
  assert.deepEqual(of(r, "sheet").map((d) => d.identity.sku), ["404979", "404979", "404979", "404979"]);
});
t("C1 products are never mixed or inferred: grained+smooth, AAC family, missing cover", () => {
  assert.equal(codes(sheetLayout(rect(2400, 2400), [], [...AXON133, P("axon-404512")], {}))[0], "mixed_product_variants");
  assert.equal(codes(sheetLayout(rect(2400, 2400), [], [P("axon-403931"), P("axon-404417")], {}))[0], "mixed_product_variants", "133 vs 400 profile");
  assert.equal(codes(sheetLayout(rect(2400, 2400), [], WALSC50, {}))[0], "wrong_family");
  const m = sheetLayout(rect(2400, 2400), [], MATRIX1190, {});
  assert.equal(codes(m)[0], "product_parameter_missing"); assert.match(m.problems[0].message, /effective cover/);
  assert.equal(codes(sheetLayout(rect(2400, 2400), [], null, {}))[0], "product_missing");
  assert.equal(codes(sheetLayout(rect(2400, 2400), [], AXON133, { orientation: "horizontal" }))[0], "orientation_not_permitted");
});
t("C1 too many generated sheets → rejected with split guidance, never truncated", () => {
  const tiny = { ...AXON133[0], effectiveCoverMm: 1 };
  const r = sheetLayout(rect(MAX_ELEMENTS_PER_WALL + 100, 2400), [], tiny, {});
  assert.equal(r.demands.length, 0); assert.ok(codes(r).includes("too_many_elements")); assert.equal(r.status.quantity, "incomplete");
});

// ── 12 Rendex EPS (distinct family, sheet layout) ───────────────────────────────────────────
// Synthetic job-entered record: Rendex dimensions are NOT seeded (12) — a real job enters them from the system document.
const rendex = (over = {}) => ({ id: "rendex-job", family: "eps-cladding", manufacturer: "Rendex", name: "EPS sheet (job-entered)", sku: "RX-JOB",
  dimensionsMm: { length: 2400, width: 1200, thickness: 75 }, effectiveCoverMm: 1200, coating: "applicator", permittedOrientations: ["vertical"], ...over });
t("Rendex: missing sheet size / cover / coating system blocks calculation (never invented)", () => {
  const r = sheetLayout(rect(4800, 2400), [], rendex({ dimensionsMm: { length: null, width: 1200, thickness: null }, effectiveCoverMm: null }), {});
  assert.equal(r.status.quantity, "incomplete"); assert.match(r.problems[0].message, /length.*thickness.*effective cover/);
  assert.equal(codes(sheetLayout(rect(4800, 2400), [], rendex({ coating: undefined }), {}))[0], "product_parameter_missing");
});
t("Rendex: occupied-sheet layout — cutting out a window does not save a sheet", () => {
  const r = checkContract(sheetLayout(rect(4800, 2400), J2_WINDOW, rendex(), { materialId: "rx" }));
  assert.equal(of(r, "sheet").length, 4); assert.equal(r.layout.family, "eps-cladding");
});
t("Rendex applicator-coated: basecoat + finish-coat = NET area, yields unresolved; fixings explicit, not zero", () => {
  const r = checkContract(sheetLayout(rect(4800, 2400), J2_WINDOW, rendex(), { materialId: "rx" }));
  for (const role of ["basecoat", "finish-coat"]) { const d = of(r, role); assert.equal(d.length, 1); assert.equal(d[0].unit, "m2"); close(d[0].quantity, 4.8 * 2.4 - 0.81); }
  assert.ok(codes(r).includes("coating_yield_unresolved")); assert.ok(codes(r).includes("fixing_row_missing"));
  const state = Object.fromEntries(r.layout.components.map((c) => [c.group, c.state]));
  assert.deepEqual(state, { fixings: "unresolved", "joint-treatment": "unresolved", mesh: "unresolved", basecoat: "calculated", "finish-coat": "calculated" });
  assert.equal(r.status.quantity, "calculated");
});
t("Rendex factory-coated: no site coating ordered twice; joint mesh stays unresolved (its detail decides, never zero)", () => {
  const r = sheetLayout(rect(4800, 2400), [], rendex({ coating: "factory" }), {});
  assert.equal(of(r, "basecoat").length + of(r, "finish-coat").length, 0);
  assert.deepEqual(r.layout.components.filter((c) => c.state === "not-required").map((c) => c.group), ["basecoat", "finish-coat"]);
  assert.equal(r.layout.components.find((c) => c.group === "mesh").state, "unresolved");
});
t("Rendex never inherits Walsc/AAC rails, adhesive or recipes", () => {
  const r = sheetLayout(rect(4800, 2400), [], rendex(), {
    adhesiveJointMm: 2, rails: { atMm: [600], authority: { ref: "Walsc guide", reviewer: "QA" } },
    reviewedComponents: [{ group: "rails", quantity: 10, unit: "piece", authority: { ref: "Walsc", reviewer: "QA" } }, { group: "adhesive", quantity: 3, unit: "bag", authority: { ref: "Walsc", reviewer: "QA" } }],
  });
  assert.equal(of(r, "rail").length + of(r, "rails").length + of(r, "adhesive").length, 0);
  assert.equal(r.problems.filter((p) => p.code === "component_not_applicable").length, 2);
  assert.equal(codes(aacPanelLayout(rect(4800, 2400), [], rendex(), { adhesiveJointMm: 2 }))[0], "wrong_family");
  const walscAsm = sheetLayout(rect(4800, 2400), [], rendex(), { installation: { assembly: ASSEMBLY("walsc50") } });
  assert.ok(codes(walscAsm).includes("assembly_method_mismatch")); assert.equal(walscAsm.status.installation, "unspecified");
});
t("Rendex reviewed manual accessory quantity is accepted with its authority", () => {
  const r = sheetLayout(rect(4800, 2400), [], rendex(), { reviewedComponents: [{ group: "fixings", quantity: 96, unit: "piece", authority: { ref: "Rendex system doc rev C p.12", reviewer: "SM" } }] });
  const f = of(r, "fixings");
  assert.equal(f.length, 1); assert.equal(f[0].provenance, "manual"); assert.equal(f[0].quantity, 96); assert.match(f[0].label, /Rendex system doc rev C p\.12/);
  assert.ok(!codes(r).includes("fixing_row_missing"));
  const bad = sheetLayout(rect(4800, 2400), [], rendex(), { reviewedComponents: [{ group: "fixings", quantity: 96, unit: "piece" }] });
  assert.ok(codes(bad).includes("manual_component_invalid")); assert.ok(codes(bad).includes("fixing_row_missing"));
});
t("Rendex horizontal sheets (where permitted) lay out along the wall with explicit vertical joints", () => {
  const h = rendex({ permittedOrientations: ["vertical", "horizontal"] });
  assert.equal(sheetLayout(rect(4800, 2400), [], h, { orientation: "horizontal" }).status.quantity, "incomplete", "4,800 run > 2,400 sheet: needs joints");
  const r = checkContract(sheetLayout(rect(4800, 2400), [], h, { orientation: "horizontal", jointRows: { atMm: [2400], gapMm: 0 } }));
  assert.equal(of(r, "sheet").length, 4);
  const j = of(r, "vertical-joint"); assert.equal(j.length, 1); close(j[0].lengthMm, 2400);
  assert.equal(r.layout.joints[0].orientation, "vertical");
});

// ── C2 / C3 courses and boards — J3, CL03 ────────────────────────────────────────────────────
t("J3 3,000 clad height: Stria smooth (cover 300) → 10 courses, Fine Texture (295) → 11; separate identity", () => {
  const smooth = checkContract(courseLayout(rect(2400, 3000), [], P("stria-405504"), { orientation: "horizontal", materialId: "stria" }));
  const fine = checkContract(courseLayout(rect(2400, 3000), [], P("stria-405571"), { orientation: "horizontal", materialId: "stria" }));
  assert.equal(smooth.layout.summary.courses, 10); assert.equal(fine.layout.summary.courses, 11);
  assert.equal(fine.layout.sequence[0].coverMm, 295, "never the family-wide 300");
  assert.notEqual(identityKey(smooth.demands[0].identity), identityKey(fine.demands[0].identity));
  assert.ok(smooth.demands.every((d) => d.identity.sku === "405504")); assert.ok(fine.demands.every((d) => d.identity.sku === "405571"));
  assert.equal(fine.layout.courses[10].topCutMm, 11 * 295 - 3000, "top course cut extent is visible");
});
t("C2 effective cover, never nominal width (Linea 180 nominal → 150 cover)", () => {
  const r = courseLayout(rect(2400, 3000), [], P("linea-403912"), { orientation: "horizontal" });
  assert.equal(r.layout.summary.courses, 20);
  const noCover = { ...P("linea-403912"), effectiveCoverMm: null };
  assert.equal(codes(courseLayout(rect(2400, 3000), [], noCover, { orientation: "horizontal" }))[0], "product_parameter_missing");
});
t("C2 only an opening spanning the FULL course band removes length; a partial one notches the board", () => {
  const w = rect(4000, 300);
  const full = courseLayout(w, [{ id: "F", xMm: 1000, sillMm: 0, widthMm: 1000, heightMm: 150 }], P("linea-403912"), { orientation: "horizontal" });
  assert.deepEqual(full.layout.courses[0].segments.map((s) => [s.startMm, s.endMm]), [[0, 1000], [2000, 4000]]);
  assert.deepEqual(full.layout.courses[1].segments.map((s) => [s.startMm, s.endMm]), [[0, 4000]]);
  close(total(full.demands), 3000 + 4000);
  const part = courseLayout(w, [{ id: "N", xMm: 1000, sillMm: 50, widthMm: 1000, heightMm: 50 }], P("linea-403912"), { orientation: "horizontal" });
  assert.deepEqual(part.layout.courses[0].segments.map((s) => [s.startMm, s.endMm]), [[0, 4000]]);
  assert.deepEqual(part.layout.courses[0].notchOpeningIds, ["N"]);
  close(total(part.demands), 8000);
});
t("C2 run longer than the board with no joint rule → needs-layout (never an arbitrary break)", () => {
  const r = checkContract(courseLayout(rect(4000, 600), [], P("stria-405504"), { orientation: "horizontal" }));
  assert.equal(r.status.quantity, "incomplete"); assert.equal(r.demands.length, 0);
  const p = r.problems.find((x) => x.code === "needs_layout"); assert.ok(p.blocking); assert.equal(p.refs.length, 2); assert.equal(p.refs[0].reason, "no-joint-rule");
});
t("C2 on-support joints: break only at support stations (studs @600) → 3,000 + 1,000 per course", () => {
  const r = checkContract(courseLayout(rect(4000, 600), [], P("stria-405504"), { orientation: "horizontal", joints: { orientation: "horizontal", mode: "on-support", centresMm: 600 } }));
  assert.deepEqual(r.layout.courses[0].segments[0].pieces.map((p) => [p.startMm, p.endMm, p.startEnd, p.endEnd]), [[0, 3000, "cut", "joint"], [3000, 4000, "joint", "cut"]]);
  assert.equal(r.demands.length, 4); assert.ok(r.demands.every((d) => d.noSplice && d.stockPolicy.sharePieces === false && d.stockPolicy.lengthMm === 3000));
});
t("C2 minimum piece and explicit station list are honoured; infeasible stations → needs-layout", () => {
  const r = courseLayout(rect(4000, 300), [], P("stria-405504"), { orientation: "horizontal", joints: { orientation: "horizontal", mode: "on-support", centresMm: 600, minPieceMm: 1200 } });
  assert.deepEqual(r.layout.courses[0].segments[0].pieces.map((p) => p.lengthMm), [2400, 1600]);
  const s = courseLayout(rect(4000, 300), [], P("stria-405504"), { orientation: "horizontal", joints: { orientation: "horizontal", mode: "on-support", stationsMm: [500, 3700] } });
  assert.equal(s.status.quantity, "incomplete"); assert.equal(s.problems.find((p) => p.code === "needs_layout").refs[0].reason, "no-legal-joint");
});
t("C2 factory ends at joints: joint-to-joint pieces are whole boards", () => {
  const r = courseLayout(rect(7000, 300), [], P("stria-405504"), { orientation: "horizontal", joints: { orientation: "horizontal", mode: "on-support", centresMm: 600, factoryEndsAtJoints: true } });
  const pcs = r.layout.courses[0].segments[0].pieces;
  assert.equal(pcs.length, 3); assert.equal(pcs[1].lengthMm, 3000); assert.equal(pcs[1].startEnd, "joint-factory"); assert.equal(pcs[1].endEnd, "joint-factory");
  close(pcs.reduce((s, p) => s + p.lengthMm, 0), 7000);
});
t("CL06 off-support joints only for END-MATCHED products; ordinary boards never inherit them", () => {
  const off = { orientation: "horizontal", mode: "off-support" };
  const plain = courseLayout(rect(4000, 300), [], P("stria-405504"), { orientation: "horizontal", joints: off });
  assert.equal(codes(plain)[0], "off_support_joint_not_permitted"); assert.equal(plain.demands.length, 0);
  const em = { id: "tim-em", family: "timber-cladding", manufacturer: "Synthetic", name: "End-matched shiplap", sku: "EM140", endMatched: true, dimensionsMm: { length: 5400, width: 140, thickness: 19 }, effectiveCoverMm: 130 };
  const r = checkContract(courseLayout(rect(12000, 130), [], em, { orientation: "horizontal", joints: { ...off, minPieceMm: 900 } }));
  const pcs = r.layout.courses[0].segments[0].pieces.map((p) => p.lengthMm);
  assert.equal(pcs.length, 3); assert.ok(pcs.every((l) => l <= 5400 && l >= 900)); close(pcs.reduce((a, b) => a + b, 0), 12000);
});
t("C3 joints are never interchangeable between orientations", () => {
  const r = courseLayout(rect(4000, 300), [], P("stria-405504"), { orientation: "horizontal", joints: { orientation: "vertical", mode: "on-support", centresMm: 600 } });
  assert.equal(codes(r)[0], "joint_rule_orientation_mismatch"); assert.equal(r.status.quantity, "incomplete");
  assert.equal(codes(courseLayout(rect(4000, 300), [], P("stria-405504"), {}))[0], "orientation_required");
});
t("C3 vertical boards: columns = ceil(W / cover), each column's length follows the rake; full-width openings split columns", () => {
  const tim = (len) => ({ id: `tim-${len}`, family: "timber-cladding", manufacturer: "Synthetic", name: "Vertical board 140", sku: `VB-${len}`, dimensionsMm: { length: len, width: 140, thickness: 19 }, effectiveCoverMm: 140 });
  const rake = buildWall({ kind: "rake", widthMm: 700, startHeightMm: 2400, endHeightMm: 3000 });
  const r = checkContract(courseLayout(rake, [], [tim(2700), tim(3000)], { orientation: "vertical" }));
  assert.equal(r.layout.summary.courses, 5);
  r.demands.forEach((d, i) => close(d.lengthMm, 2400 + (600 * (i + 1) * 140) / 700, `column ${i}`));
  assert.deepEqual(r.demands.map((d) => d.identity.sku), ["VB-2700", "VB-2700", "VB-3000", "VB-3000", "VB-3000"]);
  assert.ok(r.demands.every((d) => d.role === "vertical-board" && d.identity.orientation === "vertical"));
  const win = courseLayout(rect(700, 2400), [{ id: "WIN", xMm: 140, sillMm: 900, widthMm: 140, heightMm: 600 }], [tim(2700)], { orientation: "vertical" });
  assert.deepEqual(win.layout.courses[1].segments.map((s) => [s.startMm, s.endMm]), [[0, 900], [1500, 2400]]);
  assert.equal(win.demands.length, 6);
});
t("C3 mixed board widths: repeating profile sequence, last course cut", () => {
  const r = checkContract(courseLayout(rect(2400, 3000), [], { sequence: [P("stria-405504"), P("stria-405505")] }, { orientation: "horizontal" }));
  assert.equal(r.layout.summary.courses, 9);
  assert.deepEqual(r.layout.courses.map((c) => c.coverMm), [300, 380, 300, 380, 300, 380, 300, 380, 300]);
  assert.equal(r.layout.courses[8].topCutMm, 20);
  assert.deepEqual([...new Set(r.demands.map((d) => d.identity.sku))], ["405504", "405505"]);
});
t("C2 datum must be at or below the clad base", () => {
  assert.equal(codes(courseLayout(rect(2400, 3000), [], P("stria-405504"), { orientation: "horizontal", datumMm: 100 }))[0], "datum_above_base");
  assert.equal(courseLayout(rect(2400, 3000), [], P("stria-405504"), { orientation: "horizontal", datumMm: -150 }).layout.summary.courses, 11);
});

// ── C4 Matrix grid — J4, CL04 ────────────────────────────────────────────────────────────────
t("J4 2,390 × 2,390, 1,190 panels, 10 joints, no outer gaps → 4 full panels, joint lines as demands", () => {
  const r = checkContract(panelGrid(rect(2390, 2390), [], MATRIX1190, { jointGapMm: 10, materialId: "mx" }));
  assert.equal(of(r, "panel").length, 4);
  assert.ok(!codes(r).some((c) => c === "narrow_strip" || c === "cut_panel_needs_review"));
  assert.equal(of(r, "vertical-joint").length, 1); assert.equal(of(r, "horizontal-joint").length, 1);
  assert.equal(of(r, "vertical-joint")[0].lengthMm, 2390); assert.equal(of(r, "horizontal-joint")[0].lengthMm, 2390);
  assert.deepEqual([r.layout.grid.panelWidthMm, r.layout.grid.jointGapMm, r.layout.grid.boundaryGaps], [1190, 10, "none"]);
});
t("J4 2,400 × 2,400 → 3 × 3 occupied cells and the narrow strips flagged — never silently four", () => {
  const r = checkContract(panelGrid(rect(2400, 2400), [], MATRIX1190, { jointGapMm: 10 }));
  assert.equal(of(r, "panel").length, 9);
  const flags = r.problems.filter((p) => p.code === "narrow_strip");
  assert.equal(flags.length, 2); assert.deepEqual(flags.map((f) => f.refs[0].axis), ["width", "height"]);
  assert.ok(flags.every((f) => f.axis === "installation" && f.refs[0].widthMm === 0));
  assert.equal(r.status.quantity, "calculated");
});
t("C4 joint gap is a sourced assembly parameter — never defaulted", () => {
  const r = panelGrid(rect(2390, 2390), [], MATRIX1190, {});
  assert.equal(codes(r)[0], "joint_gap_required"); assert.equal(r.demands.length, 0);
});
t("C4 boundary gap convention is independent: outer joints both ends → 2,410 still 2 × 2", () => {
  assert.equal(of(panelGrid(rect(2410, 2410), [], MATRIX1190, { jointGapMm: 10, boundaryGaps: "both" }), "panel").length, 4);
  assert.equal(of(panelGrid(rect(2410, 2410), [], MATRIX1190, { jointGapMm: 10 }), "panel").length, 9);
});
t("C4 cut strip installability is never inferred: unknown minimum → review; known minimum → narrow only below it", () => {
  const w = rect(1800, 1190);
  assert.ok(codes(panelGrid(w, [], MATRIX1190, { jointGapMm: 10 })).includes("cut_panel_needs_review"));
  assert.ok(!codes(panelGrid(w, [], MATRIX1190, { jointGapMm: 10, minStripMm: 300 })).some((c) => c === "narrow_strip" || c === "cut_panel_needs_review"));
  assert.ok(codes(panelGrid(w, [], MATRIX1190, { jointGapMm: 10, minStripMm: 700 })).includes("narrow_strip"));
});
t("C4 same occupied-cell logic for openings; orientation only where the system permits", () => {
  assert.equal(of(panelGrid(rect(2390, 2390), [{ id: "O", xMm: 0, sillMm: 0, widthMm: 1190, heightMm: 1190 }], MATRIX1190, { jointGapMm: 10 }), "panel").length, 3);
  assert.equal(of(panelGrid(rect(2390, 2390), [{ id: "O", xMm: 300, sillMm: 300, widthMm: 400, heightMm: 400 }], MATRIX1190, { jointGapMm: 10 }), "panel").length, 4);
  const tall = P("matrix-403810");
  assert.equal(codes(panelGrid(rect(2390, 2390), [], tall, { jointGapMm: 10 }))[0], "orientation_required");
  const port = panelGrid(rect(2390, 2390), [], tall, { jointGapMm: 10, orientation: "portrait" });
  assert.equal(of(port, "panel").length, 4); assert.equal(port.layout.summary.columns, 4); assert.equal(port.layout.summary.rows, 1);
  assert.equal(codes(panelGrid(rect(2390, 2390), [], tall, { jointGapMm: 10, orientation: "landscape" }))[0], "orientation_not_permitted");
  assert.equal(codes(panelGrid(rect(2390, 2390), [], [MATRIX1190, tall], { jointGapMm: 10 }))[0], "mixed_product_variants");
});
t("C4 review flags keep a selected rule from claiming verified installation", () => {
  const asm = { ...ASSEMBLY("matrix-grid"), productVariantIds: [MATRIX1190.id], activeInstallationRows: [{ id: "row-1", verificationState: "active", conditions: { wind: "N2" } }] };
  const conditions = { wind: "N2", "on-or-off-stud": "on", "fixing-family": "nail", grid: "1190", "joint-backing": "strip" };
  assert.equal(panelGrid(rect(2390, 2390), [], MATRIX1190, { jointGapMm: 10, installation: { assembly: asm, conditions } }).status.installation, "supported-by-selected-rule");
  assert.equal(panelGrid(rect(2400, 2400), [], MATRIX1190, { jointGapMm: 10, installation: { assembly: asm, conditions } }).status.installation, "source-pending");
});

// ── C5 AAC — CL05 ────────────────────────────────────────────────────────────────────────────
t("CL05 brands / wall systems never mix (Walsc + Hebel; PowerPanel50 + XL)", () => {
  const a = checkContract(aacPanelLayout(rect(4800, 2700), [], [P("walsc50-2700"), P("hebel50-162758")], { adhesiveJointMm: 2 }));
  assert.equal(codes(a)[0], "mixed_aac_systems"); assert.equal(a.demands.length, 0); assert.equal(a.status.quantity, "incomplete");
  assert.equal(codes(aacPanelLayout(rect(4800, 2700), [], [P("hebel50-162758"), P("hebelxl-118016")], { adhesiveJointMm: 2 }))[0], "mixed_aac_systems");
  const asm = { ...ASSEMBLY("walsc50"), productVariantIds: WALSC50.map((p) => p.id) };
  const swapped = aacPanelLayout(rect(4800, 2700), [], P("hebel50-162758"), { adhesiveJointMm: 2, installation: { assembly: asm } });
  assert.ok(codes(swapped).includes("assembly_product_mismatch")); assert.equal(swapped.status.installation, "unspecified");
});
t("CL05 adhesive joint is a required system parameter (no 10 mm default)", () => {
  const r = aacPanelLayout(rect(4800, 2700), [], WALSC50, {});
  assert.equal(codes(r)[0], "adhesive_joint_required"); assert.equal(r.demands.length, 0);
});
t("CL05 Walsc 50 layout: whole panels, shortest listed length; missing fixing row explicit; everything unknown unresolved (not zero)", () => {
  const r = checkContract(aacPanelLayout(rect(4800, 2700), J2_WINDOW, WALSC50, { adhesiveJointMm: 2, materialId: "walsc", installation: { assembly: ASSEMBLY("walsc50") } }));
  const panels = of(r, "aac-panel");
  assert.equal(panels.length, 8, "ceil((4,800 + 2) / (600 + 2)) = 8; the window cell keeps its panel");
  assert.ok(panels.every((d) => d.identity.stockLengthMm === 2700 && d.identity.manufacturer === "Walsc" && d.identity.sku === null));
  const fx = r.problems.find((p) => p.code === "fixing_row_missing");
  assert.ok(fx && fx.blocking === false && fx.axis === "installation");
  assert.equal(r.status.installation, "source-pending"); assert.equal(r.status.quantity, "calculated");
  assert.equal(r.status.procurement, "missing-product", "Walsc seed has no SKU");
  const state = Object.fromEntries(r.layout.components.map((c) => [c.group, c.state]));
  assert.deepEqual(state, { rails: "unresolved", fixings: "unresolved", adhesive: "unresolved", mesh: "unresolved", "control-joint": "unresolved", "reinforcement-treatment": "unresolved", coating: "calculated" });
  assert.equal(r.demands.filter((d) => ["rails", "rail", "fixings", "adhesive", "mesh"].includes(d.role)).length, 0, "no invented 600/1200 spacing or yields");
});
t("CL05 coating = net finish area, not ordered panel area", () => {
  const r = aacPanelLayout(rect(4800, 2700), J2_WINDOW, WALSC50, { adhesiveJointMm: 2 });
  const c = of(r, "coating");
  assert.equal(c.length, 1); assert.equal(c[0].unit, "m2"); close(c[0].quantity, 12.15);
  close(r.layout.areas.panelM2, 8 * 0.6 * 2.7); assert.ok(codes(r).includes("coating_yield_unresolved"));
});
t("CL05 control joints break panels and produce their own joint demands", () => {
  const r = checkContract(aacPanelLayout(rect(4800, 2700), [], WALSC50, { adhesiveJointMm: 2, controlJoints: { atMm: [2400], widthMm: 10 } }));
  assert.equal(of(r, "aac-panel").length, 8);
  assert.deepEqual(r.layout.columns.filter((c) => c.segment === 1)[0].zoneStartMm, 2405);
  const cj = of(r, "control-joint"); assert.equal(cj.length, 1); close(cj[0].lengthMm, 2700);
  assert.equal(r.layout.components.find((c) => c.group === "control-joint").state, "calculated");
  assert.equal(codes(aacPanelLayout(rect(4800, 2700), [], WALSC50, { adhesiveJointMm: 2, controlJoints: { atMm: [2400] } }))[0], "control_joints_invalid");
});
t("CL05 rails only from a reviewed layout with authority; openings interrupt them", () => {
  const ok = aacPanelLayout(rect(4800, 2700), J2_WINDOW, WALSC50, { adhesiveJointMm: 2, rails: { atMm: [300, 1200, 2400], authority: { ref: "Walsc tech note (reviewed)", reviewer: "SM" } } });
  const rails = of(ok, "rail");
  assert.equal(rails.length, 4); close(total(rails), 3 * 4800 - 900);
  assert.equal(ok.layout.components.find((c) => c.group === "rails").state, "calculated");
  const unreviewed = aacPanelLayout(rect(4800, 2700), [], WALSC50, { adhesiveJointMm: 2, rails: { atMm: [600, 1200] } });
  assert.equal(of(unreviewed, "rail").length, 0); assert.ok(codes(unreviewed).includes("rails_layout_invalid")); assert.ok(codes(unreviewed).includes("rails_unresolved"));
});
t("CL05 reviewed manual adhesive quantity replaces the unresolved row", () => {
  const r = aacPanelLayout(rect(4800, 2700), [], WALSC50, { adhesiveJointMm: 2, reviewedComponents: [{ group: "adhesive", quantity: 2, unit: "bag", authority: { ref: "Supplier takeoff 14/10", reviewer: "SM" } }] });
  const a = of(r, "adhesive"); assert.equal(a.length, 1); assert.equal(a[0].provenance, "manual"); assert.equal(a[0].unit, "bag");
  assert.ok(!r.problems.some((p) => p.code === "component_unresolved" && p.refs[0].group === "adhesive"));
});
t("CL05 full-width opening → separate head/sill panels flagged for detail (no inferred lintel); too tall blocked; horizontal blocked", () => {
  const r = aacPanelLayout(rect(1200, 2700), [{ id: "WIN", xMm: 0, sillMm: 900, widthMm: 1200, heightMm: 1200 }], WALSC50, { adhesiveJointMm: 2 });
  assert.equal(of(r, "aac-panel").length, 4, "sill + head panel per column, each a whole panel (no offcut reuse)");
  assert.deepEqual(of(r, "aac-panel").map((d) => d.heightMm), [900, 600, 900, 600]);
  assert.deepEqual(of(r, "aac-panel").map((d) => d.identity.stockLengthMm), [2200, 2200, 2200, 2200]);
  const flag = r.problems.find((p) => p.code === "opening_panel_detail_required");
  assert.equal(flag.refs.length, 2); assert.deepEqual(flag.refs[0].openingIds, ["WIN"]); assert.equal(flag.blocking, false);
  const door = aacPanelLayout(rect(1800, 2700), [{ id: "D1", xMm: 602, sillMm: 0, widthMm: 600, heightMm: 2100 }], WALSC50, { adhesiveJointMm: 2 });
  assert.deepEqual(door.problems.find((p) => p.code === "opening_panel_detail_required").refs.map((x) => x.column), [1], "head panel over a door is flagged too");
  assert.equal(of(door, "aac-panel").length, 3);
  const tall = aacPanelLayout(rect(1200, 3100), [], WALSC50, { adhesiveJointMm: 2 });
  assert.equal(tall.status.quantity, "incomplete"); assert.equal(tall.status.procurement, "unavailable-stock"); assert.ok(codes(tall).includes("panel_too_tall"));
  assert.equal(codes(aacPanelLayout(rect(1200, 2700), [], WALSC50, { adhesiveJointMm: 2, orientation: "horizontal" }))[0], "aac_orientation_requires_detail");
});

// ── C6 timber area → LM — CL06 ───────────────────────────────────────────────────────────────
const shiplap = { id: "tim-sl", family: "timber-cladding", manufacturer: "Synthetic", name: "Shiplap 140", sku: "SL140", dimensionsMm: { length: null, width: 140, thickness: 19 }, effectiveCoverMm: 120 };
t("C6 24 m² / 0.12 m = 200 LM; +10% = 220; supplier increment applied last without float creep", () => {
  const r = checkContract(areaToLinear({ netAreaM2: 24, coverMm: 120, spareRate: 0.1, orderIncrementM: 0.1, product: shiplap }));
  assert.equal(r.layout.baseLm, 200); close(r.layout.withSpareLm, 220); assert.equal(r.layout.orderLm, 220);
  assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 120, spareRate: 0.1, orderIncrementM: 1 }).layout.orderLm, 220);
  assert.equal(areaToLinear({ netAreaM2: 24.01, coverMm: 120, spareRate: 0, orderIncrementM: 1 }).layout.orderLm, 201);
  const d = r.demands[0];
  assert.equal(d.unit, "lm"); assert.equal(d.kind, "linear"); assert.equal(d.quantity, 220); assert.equal(d.stockPolicy.kind, "random");
  assert.equal(r.status.quantity, "estimate", "area-derived LM is never an exact board count");
});
t("C6 cover 120 → 90 changes 200 → 266.666… LM; no duplicate lap deduction", () => {
  close(areaToLinear({ netAreaM2: 24, coverMm: 90, spareRate: 0, orderIncrementM: 1 }).layout.baseLm, 266.6666666666667);
  assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 90, spareRate: 0, orderIncrementM: 1 }).layout.orderLm, 267);
  const lap = areaToLinear({ netAreaM2: 24, coverMm: 120, spareRate: 0, orderIncrementM: 1, lapMm: 20, nominalWidthMm: 140 });
  assert.equal(lap.layout.baseLm, 200); assert.ok(codes(lap).includes("overlap_ignored"));
});
t("C6 cover is required and product-specific: never from nominal width, never another product's value", () => {
  assert.equal(codes(areaToLinear({ netAreaM2: 24, orderIncrementM: 1, product: { ...shiplap, effectiveCoverMm: null } }))[0], "cover_required");
  assert.equal(areaToLinear({ netAreaM2: 24, orderIncrementM: 1, product: shiplap }).layout.coverMm, 120);
  const mism = areaToLinear({ netAreaM2: 24, coverMm: 90, orderIncrementM: 1, product: shiplap });
  assert.equal(codes(mism)[0], "cover_mismatch"); assert.equal(mism.status.quantity, "incomplete");
  assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 90, orderIncrementM: 1, product: shiplap, coverOverride: true }).layout.baseLm, 24000 / 90);
});
t("C6 a missing supplier ordering increment keeps the estimate but blocks procurement", () => {
  const r = areaToLinear({ netAreaM2: 24, coverMm: 120, spareRate: 0.1, product: shiplap });
  assert.equal(r.layout.orderLm, null); close(r.demands[0].quantity, 220);
  assert.equal(r.status.quantity, "estimate"); assert.equal(r.status.procurement, "draft");
  assert.ok(r.problems.some((p) => p.code === "order_increment_required" && p.blocking && p.axis === "procurement"));
  assert.equal(codes(areaToLinear({ netAreaM2: 0, coverMm: 120, orderIncrementM: 1 }))[0], "area_invalid");
});
t("CL06 random-length LM estimate is distinct from a fixed-length stock list for the same wall", () => {
  const fixed = { ...shiplap, sku: "SL140-5400", dimensionsMm: { length: 5400, width: 140, thickness: 19 } };
  const w = rect(4800, 2400);
  const est = areaToLinear({ netAreaM2: wallAreas(w, []).netM2, product: shiplap, orderIncrementM: 0.3 });
  const list = courseLayout(w, [], fixed, { orientation: "horizontal" });
  assert.equal(est.demands[0].unit, "lm"); assert.equal(est.status.quantity, "estimate");
  assert.equal(list.demands.length, 20); assert.ok(list.demands.every((d) => d.unit === "piece" && d.identity.stockLengthMm === 5400));
  assert.equal(list.status.quantity, "calculated");
});

// ── installation rule selector (06 three statuses) ───────────────────────────────────────────
t("rule selector: seed candidates stay source-pending; missing selectors listed; inactive/superseded rows ignored", () => {
  const seed = ASSEMBLY("axon-vertical");
  const full = Object.fromEntries(seed.requiredSelectors.map((s) => [s, "x"]));
  const a = selectInstallationRule({ assembly: seed, conditions: full }, { method: "sheet_layout@2" });
  assert.equal(a.status, "source-pending"); assert.equal(a.problems[0].code, "installation_rule_missing");
  const b = selectInstallationRule({ assembly: seed, conditions: {} }, { method: "sheet_layout@2" });
  assert.deepEqual(b.problems[0].refs[0].missing, seed.requiredSelectors);
  const rows = [{ id: "cand", verificationState: "candidate", conditions: {} }, { id: "old", verificationState: "active", supersededBy: "new", conditions: {} }];
  assert.equal(selectInstallationRule({ assembly: { ...seed, activeInstallationRows: rows }, conditions: full }).status, "source-pending");
  const live = selectInstallationRule({ assembly: { ...seed, activeInstallationRows: [{ id: "new", verificationState: "active", conditions: { wind: "x" } }] }, conditions: full });
  assert.equal(live.status, "supported-by-selected-rule"); assert.equal(live.rule.id, "new");
});
t("rule selector: project detail needs ref + reviewer; out-of-scope and unspecified are explicit", () => {
  assert.equal(selectInstallationRule({ projectDetail: { ref: "Eng detail D-07", reviewer: "SM" } }).status, "project-detail-supplied");
  const inc = selectInstallationRule({ projectDetail: { ref: "D-07" } });
  assert.equal(inc.status, "unspecified"); assert.equal(inc.problems[0].code, "project_detail_incomplete");
  assert.equal(selectInstallationRule({ outOfScope: true }).status, "out-of-scope");
  assert.equal(selectInstallationRule(undefined).status, "unspecified");
  assert.equal(sheetLayout(rect(4800, 2700), [], AXON133, { installation: { assembly: ASSEMBLY("axon-vertical") } }).status.installation, "source-pending");
});

console.log(`takeoff-tc-cladding: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
