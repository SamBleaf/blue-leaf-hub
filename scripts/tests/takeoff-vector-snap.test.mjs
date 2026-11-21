// Snap-to-plan tests — run: node scripts/tests/takeoff-vector-snap.test.mjs
// Synthetic walls drawn into real PDFs (CTM scaling, /Rotate 90) and read back through pdf.js, plus pure-segment checks.
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments, mergeCollinear, buildSnapIndex, detectWalls, snapPoint, snapGeneric, matchTraced, WALL_PAIR_TOL_MM, WALL_CAPTURE_MARGIN_MM, CORNER_REACH_MM } from "../../shared/takeoff/vectorSnap.js";

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

/** A minimal one-page PDF whose content stream is `content` (page /Rotate optional). */
function pdfOf(content, { rotate = 0, w = 600, h = 400 } = {}) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Rotate ${rotate} /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n"; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return new TextEncoder().encode(out);
}
const line = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S\n`;
async function linesOf(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0, isEvalSupported: false }).promise;
  const ol = await (await doc.getPage(1)).getOperatorList();
  return mergeCollinear(extractSegments(ol, pdfjs.OPS), { minLen: 4 });
}
// a 1:100 sheet: 1 PDF unit = 35.28 mm. A 90 mm wall = 2.551 units between its faces
const MM = 25.4 / 72 * 100;

await t("extracts stroked segments in user space, applying the CTM", async () => {
  const lines = await linesOf(pdfOf(`0.5 0 0 0.5 10 20 cm\n${line(0, 0, 200, 0)}`));
  assert.equal(lines.length, 1);
  const l = lines[0];
  assert.ok(Math.abs(l.len - 100) < 1e-3, `len ${l.len}`);
  assert.ok(Math.abs(Math.min(l.ay, l.by) - 20) < 1e-3 && Math.abs(Math.min(l.ax, l.bx) - 10) < 1e-3);
});

await t("paper-coloured strokes (texture) are ignored", async () => {
  const lines = await linesOf(pdfOf(`0.98 0.97 0.96 RG\n${line(0, 0, 100, 0)}0 0 0 RG\n${line(0, 10, 100, 10)}`));
  assert.equal(lines.length, 1);
  assert.ok(Math.abs(lines[0].ay - 10) < 1e-3);
});

await t("collinear pieces merge into one line", async () => {
  const lines = await linesOf(pdfOf(`${line(0, 0, 40, 0)}${line(40.2, 0, 90, 0)}${line(90.1, 0, 120, 0)}`));
  assert.equal(lines.length, 1);
  assert.ok(Math.abs(lines[0].len - 120) < 0.5);
});

// an L of 90 mm walls (Sam's rule: walls are 90, snap to the 45 mm centreline), faces 2.551 units apart
const F = 90 / MM, C = 100 + F / 2;   // the horizontal wall's faces at y 100 / 100 + F, its centreline at C (and x = 50 + F / 2 for the vertical)
const CX = 50 + F / 2;
const wallPdf = (rot) => pdfOf(`${line(50, 100, 250, 100)}${line(50 + F, 100 + F, 250, 100 + F)}${line(50, 100, 50, 250)}${line(50 + F, 100 + F, 50 + F, 250)}`, { rotate: rot });
for (const rot of [0, 90, 180, 270]) {
  await t(`detects a 90 mm wall pair and its centreline (page /Rotate ${rot})`, async () => {
    const ix = buildSnapIndex(await linesOf(wallPdf(rot)), MM);
    assert.ok(ix.walls.length >= 2, `walls ${ix.walls.length}`);
    const w = ix.walls.find((x) => Math.abs(x.ay - x.by) < 1 && Math.abs(x.ax - x.bx) > 100);
    assert.ok(w, "horizontal wall");
    assert.ok(Math.abs(w.thickness * MM - 90) < 2, `thickness ${w.thickness * MM}`);
    assert.ok(Math.abs(w.ay - C) < 0.05, `centreline y ${w.ay}`); // user space, whatever the page rotation
  });
}

const ixL = buildSnapIndex(await linesOf(wallPdf(0)), MM);
await t("a tap near the outer corner snaps to the centreline corner", () => {
  const s = snapPoint(ixL, { x: 50.4, y: 100.4 }, 12);
  assert.equal(s.kind, "corner");
  assert.ok(Math.abs(s.x - CX) < 0.1 && Math.abs(s.y - C) < 0.1, `${s.x},${s.y}`);
});
await t("a tap beside a wall snaps onto its centreline", () => {
  const s = snapPoint(ixL, { x: 150, y: 104 }, 0);
  assert.equal(s.kind, "centre");
  assert.ok(Math.abs(s.y - C) < 0.01 && Math.abs(s.x - 150) < 0.01);
});
await t("a tap far from any wall does not snap", () => assert.equal(snapPoint(ixL, { x: 400, y: 300 }, 12), null));
await t("scale matters: the same 2.55-unit pair at 1:300 is a 270 wall, not a 90 one", () => {
  assert.equal(buildSnapIndex(ixL.lines, MM * 3).walls.length, 0);
  assert.ok(buildSnapIndex(ixL.lines, MM * 3, { thicknessMm: 270 }).walls.length >= 2);
});

const trace = (ay, by, ax = CX, bx = 250) => [{ x: ax, y: ay }, { x: bx, y: by }];
await t("a wall traced 5 mm off the plan is on plan, ends land on the corner", () => {
  const [a, b] = trace(C + 5 / MM, C + 5 / MM, CX, 249.9);
  const r = matchTraced(ixL, a, b);
  assert.equal(r.status, "on", JSON.stringify(r.offsetsMm));
  assert.ok(r.offsetsMm[0] < 20 && r.offsetsMm[1] < 20);
});
await t("a wall traced 60 mm off is near, and the target sits on the centreline", () => {
  const [a, b] = trace(C + 60 / MM, C + 60 / MM, CX, 249.9);
  const r = matchTraced(ixL, a, b);
  assert.equal(r.status, "near");
  assert.ok(Math.abs(r.offsetsMm[1] - 60) < 5, `${r.offsetsMm}`);
  assert.ok(Math.abs(r.target[1].y - C) < 0.05);
});
await t("a wall 400 mm off, or crossing no plan wall, has no match", () => {
  assert.equal(matchTraced(ixL, { x: 60, y: C + 400 / MM }, { x: 240, y: C + 400 / MM }).status, "none");
  assert.equal(matchTraced(ixL, { x: 300, y: 300 }, { x: 380, y: 300 }).status, "none");
});
await t("a diagonal wall does not match a horizontal one", () => assert.equal(matchTraced(ixL, { x: 60, y: 103.8 }, { x: 160, y: 150 }).status, "none"));

// ── Sam's rule, 21 Nov 2026: a powder room on a plan drawn in mm (1 unit = 1 mm) ────────────────────────────────────────
// An L of 90 walls at the origin, a 90 wall butting the top of the horizontal one at x 2,000, a door through the
// horizontal wall at x 2,500 to 3,300, plus what made the old snap jump: tile hatch, a bench 150 off the wall face, a
// line 30 off it (skirting), a set-down 200 off it.
const segs = (list) => mergeCollinear(Float32Array.from(list.flatMap((q) => [...q, 0.25])));
const room = [
  [0, 0, 2500, 0], [3300, 0, 4000, 0],                       // H, outer face (the door gap at 2,500 to 3,300)
  [90, 90, 1955, 90], [2045, 90, 2500, 90], [3300, 90, 4000, 90], // H, inner face (broken at the T and the door)
  [0, 0, 0, 3000], [90, 90, 90, 3000],                        // V
  [1955, 90, 1955, 3000], [2045, 90, 2045, 3000],             // the T wall
  [300, 120, 1200, 120],                                      // skirting 30 off the inner face
  [200, 240, 1500, 240],                                      // bench front 150 off the face
  [200, 290, 1500, 290],                                      // set-down 200 off the face
  ...Array.from({ length: 14 }, (_, i) => [2600, 400 + i * 30, 3600, 400 + i * 30]),   // tile hatch, 30 apart
];
const ixR = buildSnapIndex(segs(room), 1);
const at = (s, x, y, what) => { assert.ok(s, `${what}: no snap`); assert.ok(Math.abs(s.x - x) < 0.01 && Math.abs(s.y - y) < 0.01, `${what}: ${s.x},${s.y} not ${x},${y}`); };
await t("constants are named: pair T-12 … T+25, capture 60 mm outside a face, corners within 150 mm", () => {
  assert.deepEqual({ ...WALL_PAIR_TOL_MM }, { under: 12, over: 25 }); assert.equal(WALL_CAPTURE_MARGIN_MM, 60); assert.equal(CORNER_REACH_MM, 150);
});
await t("only the 90 pairs are walls: hatch, the bench, the skirting and the set-down make none", () => {
  assert.ok(ixR.walls.every((w) => w.thickness >= 78 && w.thickness <= 115), JSON.stringify(ixR.walls.map((w) => w.thickness)));
  assert.ok(!ixR.walls.some((w) => Math.abs(w.ang) < 0.01 && w.n > 100), "no horizontal wall above the 90 pair");
  const ns = (ang) => ixR.walls.filter((w) => Math.abs(w.ang - ang) < 0.01).map((w) => Math.round(Math.abs(w.n) * 10) / 10).sort((a, b) => a - b);
  assert.deepEqual([...new Set(ns(0))], [45]);
  assert.deepEqual([...new Set(ns(Math.PI / 2))], [45, 2000]);
  // a pair 115 apart is at the edge of the band (T + 25), 120 is not
  assert.equal(detectWalls(segs([[0, 0, 1000, 0], [0, 115, 1000, 115]]), 1).length, 1);
  assert.equal(detectWalls(segs([[0, 0, 1000, 0], [0, 120, 1000, 120]]), 1).length, 0);
  assert.equal(detectWalls(segs([[0, 0, 1000, 0], [0, 77, 1000, 77]]), 1).length, 0);
});
await t("a tap anywhere inside the pair, or up to 60 mm outside a face, snaps to the 45 mm centreline", () => {
  for (const y of [10, 45, 80, -50, 140]) at(snapPoint(ixR, { x: 1000, y }, 0), 1000, 45, `y ${y}`);
  assert.equal(snapPoint(ixR, { x: 1000, y: 0 }).kind, "centre");
  assert.equal(snapPoint(ixR, { x: 1000, y: 160 }, 0), null, "70 mm outside the face: no snap");
  assert.equal(snapPoint(ixR, { x: 1000, y: 260 }, 0), null, "on the bench line: no snap");
});
await t("corners: a centreline crossing wins only within 150 mm of the tap", () => {
  at(snapPoint(ixR, { x: 120, y: 110 }, 0), 45, 45, "L corner");
  at(snapPoint(ixR, { x: 300, y: 60 }, 0), 300, 45, "255 mm from the L: the centreline");
  at(snapPoint(ixR, { x: 2100, y: 60 }, 0), 2000, 45, "T");
  at(snapPoint(ixR, { x: 2200, y: 60 }, 0), 2200, 45, "200 mm from the T: the centreline");
  at(snapPoint(ixR, { x: 2010, y: 600 }, 0), 2000, 600, "up the T wall");
});
await t("screen floor: zoomed right out the reach grows to the screen tolerance", () => {
  assert.equal(snapPoint(ixR, { x: 1000, y: 300 }, 0), null);
  at(snapPoint(ixR, { x: 1000, y: 300 }, 400), 1000, 45, "floor 400");
});
await t("sticky: the next point of a run stays on the wall the last point is on (through a doorway), and ends on a crossing", () => {
  const first = snapPoint(ixR, { x: 60, y: 30 }, 0);
  at(first, 45, 45, "start on the L");
  assert.equal(snapPoint(ixR, { x: 2900, y: 50 }, 0), null, "in the doorway alone: no wall to snap to");
  at(snapPoint(ixR, { x: 2900, y: 50 }, 0, { prev: first }), 2900, 45, "along the wall the run is on");
  at(snapPoint(ixR, { x: 1940, y: 130 }, 0, { prev: first }), 2000, 45, "ends on the T crossing");
  const onV = snapPoint(ixR, { x: 40, y: 1500 }, 0, { prev: first });
  at(onV, 45, 1500, "up the other wall of the corner");
});
await t("a 140 wall item: only lines 140 apart are walls", () => {
  const wide = segs([[0, 5000, 3000, 5000], [0, 5140, 3000, 5140], [0, 6000, 3000, 6000], [0, 6090, 3000, 6090]]);
  const i90 = buildSnapIndex(wide, 1), i140 = buildSnapIndex(wide, 1, { thicknessMm: 140 });
  at(snapPoint(i140, { x: 1000, y: 5020 }, 0), 1000, 5070, "140 centreline");
  assert.equal(snapPoint(i140, { x: 1000, y: 6050 }, 0), null, "the 90 pair is not a 140 wall");
  at(snapPoint(i90, { x: 1000, y: 6050 }, 0), 1000, 6045, "a 90 item still finds it");
});
await t("Check against plan measures to the true centreline of the T pair", () => {
  const r = matchTraced(ixR, { x: 45, y: 50 }, { x: 1700, y: 50 });
  assert.equal(r.status, "on"); assert.ok(Math.abs(r.target[0].y - 45) < 0.01 && Math.abs(r.offsetsMm[0] - 5) < 0.01, JSON.stringify(r));
});
await t("generic snap (Rectangle, Outline, runs): a line end or crossing within 150, else the nearest line within 60", () => {
  const g = (x, y) => snapGeneric(ixR, { x, y }, 0);
  at(g(60, -40), 0, 0, "outer corner");
  assert.equal(g(60, -40).kind, "point");
  at(g(1000, 20), 1000, 0, "on the outer face");
  assert.equal(g(1000, 20).kind, "line");
  at(g(1960, 100), 1955, 90, "where the T wall meets the face");
  assert.equal(g(1000, 1800), null);
  assert.equal(g(3100, 640), null, "the tile hatch is dropped");
});
await t("walls: false skips the wall pairing for a tool that only snaps to lines", () => {
  const ix = buildSnapIndex(segs(room), 1, { walls: false });
  assert.equal(ix.walls.length, 0); assert.ok(ix.lines.length > 5);
});

console.log(`takeoff-vector-snap: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
