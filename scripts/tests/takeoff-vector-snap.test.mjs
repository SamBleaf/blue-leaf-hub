// Snap-to-plan tests — run: node scripts/tests/takeoff-vector-snap.test.mjs
// Synthetic walls drawn into real PDFs (CTM scaling, /Rotate 90) and read back through pdf.js, plus pure-segment checks.
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments, mergeCollinear, buildSnapIndex, snapPoint, matchTraced } from "../../shared/takeoff/vectorSnap.js";

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
// a 1:100 sheet: 1 PDF unit = 35.28 mm. A 90 mm wall = 2.55 units between its faces, drawn 100 units long
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

const wallPdf = (rot) => pdfOf(`${line(50, 100, 250, 100)}${line(50, 107.65, 250, 107.65)}${line(50, 100, 50, 250)}${line(57.65, 100, 57.65, 250)}`, { rotate: rot });
for (const rot of [0, 90, 180, 270]) {
  await t(`detects a 270 mm wall pair and its centreline (page /Rotate ${rot})`, async () => {
    const ix = buildSnapIndex(await linesOf(wallPdf(rot)), MM);
    assert.ok(ix.walls.length >= 2, `walls ${ix.walls.length}`);
    const w = ix.walls.find((x) => Math.abs(x.ax - x.bx) > 100 || Math.abs(x.ay - x.by) > 100 ? Math.abs(x.ay - x.by) < 1 : false);
    assert.ok(w, "horizontal wall");
    assert.ok(Math.abs(w.thickness * MM - 270) < 5, `thickness ${w.thickness * MM}`);
    assert.ok(Math.abs(w.ay - 103.825) < 0.05, `centreline y ${w.ay}`); // user space, whatever the page rotation
  });
}

const ixL = buildSnapIndex(await linesOf(wallPdf(0)), MM);
await t("a tap near the outer corner snaps to the centreline corner", () => {
  const s = snapPoint(ixL, { x: 52, y: 101 }, 12);
  assert.equal(s.kind, "corner");
  assert.ok(Math.abs(s.x - 53.825) < 0.1 && Math.abs(s.y - 103.825) < 0.1, `${s.x},${s.y}`);
});
await t("a tap beside a wall snaps onto its centreline", () => {
  const s = snapPoint(ixL, { x: 150, y: 110 }, 12);
  assert.equal(s.kind, "centre");
  assert.ok(Math.abs(s.y - 103.825) < 0.1 && Math.abs(s.x - 150) < 0.1);
});
await t("a tap far from any wall does not snap", () => assert.equal(snapPoint(ixL, { x: 400, y: 300 }, 12), null));
await t("scale matters: the same lines at 1:50 are not 270 mm walls", () => {
  assert.equal(buildSnapIndex(mergeCollinear(extractSegments({ fnArray: [], argsArray: [] }, undefined), { minLen: 4 }), MM / 2).walls.length, 0);
});

const trace = (ay, by, ax = 53.825, bx = 250) => [{ x: ax, y: ay }, { x: bx, y: by }];
await t("a wall traced 5 mm off the plan is on plan, ends land on the corner", () => {
  const [a, b] = trace(103.825 + 5 / MM, 103.825 + 5 / MM, 53.825, 249.9);
  const r = matchTraced(ixL, a, b);
  assert.equal(r.status, "on", JSON.stringify(r.offsetsMm));
  assert.ok(r.offsetsMm[0] < 20 && r.offsetsMm[1] < 20);
});
await t("a wall traced 60 mm off is near, and the target sits on the centreline", () => {
  const [a, b] = trace(103.825 + 60 / MM, 103.825 + 60 / MM, 53.825, 249.9);
  const r = matchTraced(ixL, a, b);
  assert.equal(r.status, "near");
  assert.ok(Math.abs(r.offsetsMm[1] - 60) < 5, `${r.offsetsMm}`);
  assert.ok(Math.abs(r.target[1].y - 103.825) < 0.05);
});
await t("a wall 400 mm off, or crossing no plan wall, has no match", () => {
  assert.equal(matchTraced(ixL, { x: 60, y: 103.825 + 400 / MM }, { x: 240, y: 103.825 + 400 / MM }).status, "none");
  assert.equal(matchTraced(ixL, { x: 300, y: 300 }, { x: 380, y: 300 }).status, "none");
});
await t("a diagonal wall does not match a horizontal one", () => assert.equal(matchTraced(ixL, { x: 60, y: 103.8 }, { x: 160, y: 150 }).status, "none"));

console.log(`takeoff-vector-snap: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
