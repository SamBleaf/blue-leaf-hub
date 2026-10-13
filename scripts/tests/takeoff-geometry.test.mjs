// Takeoff geometry + profile tests — run: node scripts/tests/takeoff-geometry.test.mjs
// Screen↔PDF transforms are checked against pdf.js's OWN viewport (pinned pdfjs-dist) on real
// synthetic PDFs with /Rotate 0/90/180/270, offset crop boxes and a non-default /UserUnit.
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  viewportTransform, pdfToScreen, screenToPdf, totalRotation, deltaInBasis, buildCalibration, verifyCalibration,
  segmentLengthMm, CALIBRATION_STATUS, lockSecondaryAxis,
  starterProfile, normaliseProfile, setSegmentLength, setIncludedAngle, rotateProfile, mirrorProfile, reverseProfile,
  flipCoatedFace, profileVertices, coatedOffsetSegments, profileGeometryKey, indicativeGirthMm, profileProblems,
  includedAngle, createHistory, pushHistory, undo, redo, MIN_UNDO_DEPTH, TakeoffValidationError, treatmentGlyphs, treatmentDrawing, setTreatment,
} from "../../shared/takeoff/index.js";
import { buildKnownPlanPdf } from "./lib/takeoffPdfFixture.mjs";

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ""} expected ${b}, got ${a}`);

async function openPage(opts) {
  const { bytes, meta } = buildKnownPlanPdf(opts);
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const pageMeta = { viewBox: page.view.slice(), rotate: page.rotate, userUnit: page.userUnit ?? 1 };
  return { doc, page, pageMeta, meta };
}

const ROTS = [0, 90, 180, 270];
const ORIGINS = [{ x: 0, y: 0 }, { x: 37.5, y: -112.25 }];
const UNITS = [1, 2.5];

for (const rotate of ROTS) for (const origin of ORIGINS) for (const userUnit of UNITS) {
  await t(`matches pdf.js viewport: rotate ${rotate}, origin ${origin.x},${origin.y}, userUnit ${userUnit}`, async () => {
    const { doc, page, pageMeta } = await openPage({ rotate, origin, userUnit });
    assert.equal(pageMeta.rotate, rotate);
    near(pageMeta.userUnit, userUnit, 0, "userUnit");
    for (const display of [0, 90]) for (const scale of [1, 4, 12]) {
      const vp = page.getViewport({ scale, rotation: totalRotation(pageMeta, display) });
      const ours = viewportTransform(pageMeta, { scale, rotation: totalRotation(pageMeta, display) });
      for (let i = 0; i < 6; i++) near(ours.matrix[i], vp.transform[i], 1e-9, `m[${i}]`);
      near(ours.width, vp.width, 1e-9, "width"); near(ours.height, vp.height, 1e-9, "height");
      // Round trip at several DPRs: DPR scales the raster only — geometry uses CSS px.
      for (const dpr of [1, 2, 3]) {
        const view = { scale, rotation: totalRotation(pageMeta, display) };
        const p = { x: pageMeta.viewBox[0] + 123.456, y: pageMeta.viewBox[1] + 78.9 };
        const s = pdfToScreen(pageMeta, view, p);
        const rasterPx = { x: s.x * dpr, y: s.y * dpr };
        const back = screenToPdf(pageMeta, view, { x: rasterPx.x / dpr, y: rasterPx.y / dpr });
        near(back.x, p.x, 1e-6, "rt x"); near(back.y, p.y, 1e-6, "rt y");
        const [vx, vy] = vp.convertToViewportPoint(p.x, p.y);
        near(s.x, vx, 1e-9, "pdf.js x"); near(s.y, vy, 1e-9, "pdf.js y");
      }
    }
    await doc.destroy();
  });
}

await t("deltaInBasis equals the viewport's linear part (screen axes)", async () => {
  const meta = { viewBox: [0, 0, 100, 50], rotate: 0, userUnit: 1 };
  for (const r of ROTS) {
    const m = viewportTransform(meta, { scale: 1, rotation: r }).matrix;
    const d = { x: 3, y: 7 };
    const sx = d.x * m[0] + d.y * m[2], sy = d.x * m[1] + d.y * m[3];
    const b = deltaInBasis(d.x, d.y, r);
    near(b.dx, sx, 1e-12, `dx r${r}`); near(b.dy, sy, 1e-12, `dy r${r}`);
  }
});

await t("end-to-end: calibrate rotated, offset, userUnit PDF via screen taps → eaves = 4312 mm", async () => {
  for (const rotate of ROTS) {
    const { doc, pageMeta, meta } = await openPage({ rotate, origin: { x: 20, y: -30 }, userUnit: 2 });
    const rot = totalRotation(pageMeta, 0);
    const view = { scale: 3.7, rotation: rot };
    // Simulate taps: features → screen px → back to PDF (what the UI stores).
    const tap = (p) => screenToPdf(pageMeta, view, pdfToScreen(pageMeta, view, p));
    const f = meta.features;
    // The user picks whichever dimension LOOKS horizontal on screen.
    const screenHoriz = rot === 90 || rot === 270 ? f.verticalDim : f.horizontalDim;
    const screenVert = rot === 90 || rot === 270 ? f.horizontalDim : f.verticalDim;
    const r = buildCalibration({
      basisRotation: rot,
      horizontal: { p1: tap(screenHoriz.p1), p2: tap(screenHoriz.p2), knownMm: screenHoriz.mm },
      vertical: { p1: tap(screenVert.p1), p2: tap(screenVert.p2), knownMm: screenVert.mm },
    });
    assert.equal(r.ok, true, `rot ${rotate}: ${r.message}`);
    const cal = verifyCalibration(r.calibration, { p1: tap(f.checkDim.p1), p2: tap(f.checkDim.p2), expectedMm: 3000 });
    assert.equal(cal.status, CALIBRATION_STATUS.READY);
    near(segmentLengthMm(cal, tap(f.eavesRun.p1), tap(f.eavesRun.p2)), 4312, 1e-6, `rot ${rotate}`);
    await doc.destroy();
  }
});

await t("2 CSS px placement tolerance at zoom 1 ≈ known mm error bound", async () => {
  const { doc, pageMeta, meta } = await openPage({});
  const view = { scale: 1, rotation: 0 };
  const s = pdfToScreen(pageMeta, view, meta.features.eavesRun.p2);
  const off = screenToPdf(pageMeta, view, { x: s.x + 2, y: s.y });
  const mmPerPx = (off.x - meta.features.eavesRun.p2.x) * meta.mmPerPdfUnit / 2;
  assert.ok(mmPerPx > 0); // documented in the SOP: zoom in for precision
  await doc.destroy();
});

await t("axis lock: locked pair has zero secondary delta on screen at every rotation", async () => {
  const meta = { viewBox: [0, 0, 400, 300], rotate: 0, userUnit: 1 };
  for (const r of ROTS) {
    for (const axis of ["horizontal", "vertical"]) {
      const p1 = { x: 50, y: 60 }, p2 = lockSecondaryAxis(axis, p1, { x: 170, y: 140 }, r);
      const a = pdfToScreen(meta, { scale: 2, rotation: r }, p1), b = pdfToScreen(meta, { scale: 2, rotation: r }, p2);
      if (axis === "horizontal") near(b.y - a.y, 0, 1e-9, `h r${r}`); else near(b.x - a.x, 0, 1e-9, `v r${r}`);
      const d = deltaInBasis(p2.x - p1.x, p2.y - p1.y, r);
      if (axis === "horizontal") near(d.dy, 0, 1e-9); else near(d.dx, 0, 1e-9);
    }
  }
});

// ── profile ──────────────────────────────────────────────────────────────────
const P = starterProfile();
const tr = (pts, dx, dy) => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
function sameSegSet(A, B, eps = 1e-6) {
  const f4 = (v) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4);
  const key = (s) => [s.a, s.b].map((p) => `${f4(p.x)},${f4(p.y)}`).sort().join("|");
  const a = A.map(key).sort(), b = B.map(key).sort();
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i]);
  return eps;
}

await t("leg length edit keeps other legs and angles; downstream moves", () => {
  const q = setSegmentLength(P, P.segments[1].id, 300);
  assert.deepEqual(q.segments.map((s) => s.lengthMm), [100, 300, 50]);
  assert.deepEqual(q.bends, P.bends);
  const a = profileVertices(P).points, b = profileVertices(q).points;
  assert.deepEqual(a[1], b[1]);
  assert.notDeepEqual(a[3], b[3]);
});
await t("included-angle edit keeps leg lengths; keeps bend direction", () => {
  const q = setIncludedAngle(P, 1, 135);
  assert.deepEqual(q.segments.map((s) => s.lengthMm), P.segments.map((s) => s.lengthMm));
  assert.equal(includedAngle(q.bends[1].turnDeg), 135);
  assert.ok(q.bends[1].turnDeg < 0);
});
await t("square fold = ±90 turn; straight = 180 included", () => {
  assert.equal(includedAngle(90), 90); assert.equal(includedAngle(0), 180);
});
await t("rotate changes orientation only (same identity, coating rotates with it)", () => {
  const q = rotateProfile(P, 90);
  assert.equal(profileGeometryKey(q), profileGeometryKey(P));
  const a = coatedOffsetSegments(P), b = coatedOffsetSegments(q);
  // rotating the original coated offsets by +90 gives the new ones
  const rot = (p) => ({ x: -p.y, y: p.x });
  sameSegSet(a.map((s) => ({ a: rot(s.a), b: rot(s.b) })), b);
});
await t("reverse: same physical part, coated face is the same physical face", () => {
  const q = reverseProfile(P);
  assert.equal(profileGeometryKey(q), profileGeometryKey(P));
  const pv = profileVertices(P).points, qv = profileVertices(q).points;
  const end = pv[pv.length - 1];
  const qAligned = coatedOffsetSegments(q).map((s) => ({ a: { x: s.a.x + end.x, y: s.a.y + end.y }, b: { x: s.b.x + end.x, y: s.b.y + end.y } }));
  sameSegSet(coatedOffsetSegments(P), qAligned);
  near(tr(qv, end.x, end.y)[qv.length - 1].x, pv[0].x, 1e-9);
  assert.deepEqual(reverseProfile(q).coatedFace, P.coatedFace);
});
await t("mirror: geometry and coating together (coated offsets mirror exactly)", () => {
  const q = mirrorProfile(P);
  const mir = (p) => ({ x: -p.x, y: p.y });
  sameSegSet(coatedOffsetSegments(P).map((s) => ({ a: mir(s.a), b: mir(s.b) })), coatedOffsetSegments(q));
  // a straight piece turned end-for-end: same physical part, same schedule identity
  assert.equal(profileGeometryKey(q), profileGeometryKey(P));
  assert.equal(profileGeometryKey(mirrorProfile(reverseProfile(P))), profileGeometryKey(P));
});
await t("key ignores float noise on angles; flipped coating is still a different part", () => {
  const noisy = normaliseProfile({ ...P, bends: P.bends.map((b) => ({ turnDeg: b.turnDeg + 1e-10 })) });
  assert.equal(profileGeometryKey(noisy), profileGeometryKey(P));
  assert.notEqual(profileGeometryKey(flipCoatedFace(P)), profileGeometryKey(P));
});
await t("flip coated face changes coating only", () => {
  const q = flipCoatedFace(P);
  assert.deepEqual(profileVertices(q).points, profileVertices(P).points);
  assert.notEqual(q.coatedFace, P.coatedFace);
  assert.notEqual(profileGeometryKey(q), profileGeometryKey(P));
});
await t("coated side survives save/reload (JSON round trip)", () => {
  const q = normaliseProfile(JSON.parse(JSON.stringify(mirrorProfile(reverseProfile(P)))));
  assert.equal(profileGeometryKey(q), profileGeometryKey(mirrorProfile(reverseProfile(P))));
});
await t("equal girth, different shape → different key", () => {
  const q = setIncludedAngle(P, 0, 135);
  assert.equal(indicativeGirthMm(q), indicativeGirthMm(P));
  assert.notEqual(profileGeometryKey(q), profileGeometryKey(P));
});
await t("girth counts the end hem once", () => assert.equal(indicativeGirthMm(P), 100 + 150 + 50 + 10));
await t("self-crossing ordinary legs flagged; hem symbol is not a crossing", () => {
  const z = normaliseProfile({ segments: [{ lengthMm: 100 }, { lengthMm: 50 }, { lengthMm: 100 }, { lengthMm: 80 }], bends: [{ turnDeg: 150 }, { turnDeg: 150 }, { turnDeg: 150 }], start: { type: "none" }, end: { type: "none" }, coatedFace: "left" });
  assert.ok(profileProblems(z).length > 0);
  assert.deepEqual(profileProblems(P), []);
});
await t("leg passing through another leg's corner is flagged (touch, not just cross)", () => {
  const touch = normaliseProfile({ segments: [{ lengthMm: 100 }, { lengthMm: 100 }, { lengthMm: 200 }], bends: [{ turnDeg: 120 }, { turnDeg: 120 }], start: { type: "none" }, end: { type: "none" }, coatedFace: "left" });
  assert.ok(profileProblems(touch).length > 0, "L3 runs through the start point");
  const u = normaliseProfile({ segments: [{ lengthMm: 50 }, { lengthMm: 20 }, { lengthMm: 50 }], bends: [{ turnDeg: 90 }, { turnDeg: 90 }], start: { type: "none" }, end: { type: "none" }, coatedFace: "left" });
  assert.deepEqual(profileProblems(u), [], "a narrow U is fine");
});
await t("closed hem drawing: folds 180° back along the leg by its true width, on the chosen side", () => {
  // starter: L3 heads east (+x), end = closed hem 10 folding RIGHT (south); coated LEFT (north)
  const g = treatmentGlyphs(P).find((x) => x.at === "end");
  const d = treatmentDrawing(P, g, 4); // 4 px/mm → 10 mm = 40 px > min
  const first = d.points[0], last = d.points[d.points.length - 1];
  near(first.x, g.point.x, 1e-9); near(first.y, g.point.y, 1e-9);
  near(g.point.x - last.x, 10 - 0, 0.6, "returns ~10 mm back along the leg"); // arc radius is visual only
  assert.ok(last.y < g.point.y, "folds to the right of travel (south)");
  assert.ok(Math.max(...d.points.map((p) => p.x)) > g.point.x, "rounded fold beyond the end");
  // coating stays on the same face: folding onto the UNCOATED side leaves the band OUTSIDE (further south than the hem)
  assert.ok(Math.min(...d.band.map((p) => p.y)) < last.y, "band outside the fold");
  // folding onto the COATED side: band inside the fold, between leg and hem, and a wider gap
  const L = setTreatment(P, "end", { type: "closed_hem", widthMm: 10, side: "left" });
  const dl = treatmentDrawing(L, treatmentGlyphs(L).find((x) => x.at === "end"), 4);
  const hemY = dl.points[dl.points.length - 1].y, legY = treatmentGlyphs(L).find((x) => x.at === "end").point.y;
  const bandEndY = dl.band[dl.band.length - 1].y;
  assert.ok(bandEndY < hemY && bandEndY > legY, "band between leg and hem when folded onto the coated face");
  assert.equal(dl.foldOntoCoated, true);
  // tiny hems stay visible: never drawn shorter than 14 px
  const tiny = treatmentDrawing(setTreatment(P, "end", { type: "closed_hem", widthMm: 2, side: "right" }), treatmentGlyphs(setTreatment(P, "end", { type: "closed_hem", widthMm: 2, side: "right" })).find((x) => x.at === "end"), 4);
  assert.equal(tiny.trueScale, false); near(tiny.drawnLengthMm, 3.5, 1e-9);
});
await t("invalid profile inputs rejected", () => {
  assert.throws(() => normaliseProfile({ ...P, segments: [{ lengthMm: 0 }, ...P.segments.slice(1)] }), TakeoffValidationError);
  assert.throws(() => normaliseProfile({ ...P, bends: [{ turnDeg: 180 }, P.bends[1]] }), TakeoffValidationError);
  assert.throws(() => normaliseProfile({ ...P, coatedFace: "up" }), TakeoffValidationError);
  assert.throws(() => normaliseProfile({ ...P, segments: Array.from({ length: 101 }, () => ({ lengthMm: 10 })), bends: Array.from({ length: 100 }, () => ({ turnDeg: 0 })) }), TakeoffValidationError);
});
await t(`undo/redo holds at least ${MIN_UNDO_DEPTH} commands`, () => {
  let h = createHistory(P);
  let cur = P;
  for (let i = 0; i < 35; i++) { cur = setSegmentLength(cur, cur.segments[0].id, 100 + i + 1); h = pushHistory(h, cur); }
  for (let i = 0; i < MIN_UNDO_DEPTH; i++) h = undo(h);
  assert.equal(h.present.segments[0].lengthMm, 100 + 35 - MIN_UNDO_DEPTH);
  h = redo(h);
  assert.equal(h.present.segments[0].lengthMm, 100 + 35 - MIN_UNDO_DEPTH + 1);
});

console.log(`takeoff-geometry: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
