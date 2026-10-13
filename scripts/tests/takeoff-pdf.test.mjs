// Supplier-order PDF tests (A28) — run: node scripts/tests/takeoff-pdf.test.mjs [--write-samples]
// Renders from frozen snapshots built by the PRODUCTION snapshot builder, then reads the PDF back
// with pdf.js and checks every row/label/symbol made it onto the pages. --write-samples saves the
// example PDFs to docs/takeoff/evidence/ for the handover.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildExportSnapshot, snapshotHash } from "../../server/lib/takeoff/takeoffService.mjs";
import { renderSupplierOrderPdf, winAnsi, RENDERER_VERSION } from "../../server/lib/takeoff/takeoffPdf.mjs";
import { starterProfile, mirrorProfile, setIncludedAngle, computeWorkspace, normaliseProfile } from "../../shared/takeoff/index.js";

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const WRITE = process.argv.includes("--write-samples");

async function pdfText(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    pages.push(tc.items.map((x) => x.str).join(" "));
  }
  await doc.destroy();
  return pages;
}

const spec = (colour) => ({ product: "Flashing", finish: "COLORBOND", bmt: 0.55, colour });
function wsWith(materials, measurements, contributions) {
  return {
    workspace: { id: "ws1", name: "Flashings", revision: 7, state: "active", owner: { carpentryJobId: "j1" } },
    documents: [], calibrations: [], materials, measurements, contributions,
  };
}
function orderFor(ws) {
  const computed = computeWorkspace(ws);
  return computed.scheduleLines.map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: l.jobMaterialIds[0], finishedLengthMm: l.finishedLengthMm, quantity: l.quantity }));
}
const supplier = { id: "s1", name: "Fielders (sample branch)", contact_name: "Orders desk", email: "orders@example.test", phone: "08 0000 0000" };
const company = { name: "Blue Leaf Building", abn: "00 000 000 000", address: "Sample office address", phone: "08 1111 1111", email: "office@example.test" };
const order = { id: "o1", orderRef: "FO-001001", revision: 3, notes: "Sample — synthetic data", delivery: { method: "delivery", address: "1 Sample Street, Testville", requiredDate: "2026-10-20", contactName: "Lee", contactPhone: "0400 000 000" } };

await t("winAnsi keeps × ° ± and replaces unencodable characters visibly", () => {
  assert.equal(winAnsi("3 × 4,600 mm 90° ±1"), "3 × 4,600 mm 90° ±1");
  assert.equal(winAnsi("Colour 🎨 汉"), "Colour ? ?");
  assert.equal(winAnsi("a → b"), "a -> b");
});

await t("R04 A07: solid painted, unpainted and perforated flashings print their full spec; perforation spelled out; no fake colour", async () => {
  const p = starterProfile();
  const legId = String(p.segments[1].id);
  const ws = wsWith(
    [{ id: "m1", name: "Apron (solid)", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: spec("Monument"), profile: p },
     { id: "m2", name: "Apron (zinc)", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { product: "Flashing", finishId: "zincalume", bmt: 0.5, colour: "" }, profile: p },
     { id: "m3", name: "Vent flashing", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { ...spec("Surfmist"), construction: "perforated", perforation: { pattern: "round", holeSizeMm: 3, pitchMm: 6, openAreaPct: 11, extent: "selected_legs", legIds: [legId], solidMarginMm: 10 } }, profile: p }],
    [{ id: "a", kind: "manual", finishedLengthMm: 4600, quantity: 1 }, { id: "b", kind: "manual", finishedLengthMm: 4600, quantity: 1 }, { id: "c", kind: "manual", finishedLengthMm: 4600, quantity: 1 }],
    [{ id: "c1", measurementId: "a", jobMaterialId: "m1" }, { id: "c2", measurementId: "b", jobMaterialId: "m2" }, { id: "c3", measurementId: "c", jobMaterialId: "m3" }],
  );
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot: ws, order, lines: orderFor(ws), supplier, company, jobLabel: "1 Sample Street (Sample client)", rendererVersion: RENDERER_VERSION });
  assert.deepEqual(problems, []);
  assert.equal(snapshot.groups.length, 3, "solid / unpainted / perforated never merge");
  const pdf = await renderSupplierOrderPdf(snapshot, { exportNo: 1, isDraft: true, snapshotSha256: snapshotHash(snapshot) });
  const all = (await pdfText(pdf)).join(" ");
  for (const s of ["COLORBOND · Monument · 0.55 BMT", "ZINCALUME · natural (unpainted) · 0.5 BMT", "Reference side (unpainted", "PERFORATED", "round holes 3 mm @ 6 mm pitch", "11% open", "legs L2", "solid margin 10 mm", "Confirm availability with supplier"]) {
    assert.ok(all.includes(s), `missing "${s}"`);
  }
  if (WRITE) { mkdirSync("docs/takeoff/evidence", { recursive: true }); writeFileSync("docs/takeoff/evidence/sample-supplier-order-solid-unpainted-perforated.pdf", pdf); }
});

await t("single-profile order: all fields, every leg/bend/end, rows and totals present", async () => {
  const p = starterProfile();
  const ws = wsWith(
    [{ id: "m1", name: "Apron flashing", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: spec("Monument"), profile: p }],
    [{ id: "a", kind: "manual", finishedLengthMm: 4600, quantity: 3 }, { id: "b", kind: "manual", finishedLengthMm: 6100, quantity: 1 }],
    [{ id: "c1", measurementId: "a", jobMaterialId: "m1" }, { id: "c2", measurementId: "b", jobMaterialId: "m1" }],
  );
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot: ws, order, lines: orderFor(ws), supplier, company, jobLabel: "1 Sample Street (Sample client)", rendererVersion: RENDERER_VERSION });
  assert.deepEqual(problems, []);
  const pdf = await renderSupplierOrderPdf(snapshot, { exportNo: 1, isDraft: false, snapshotSha256: snapshotHash(snapshot) });
  const text = (await pdfText(pdf)).join(" ");
  for (const s of ["FLASHING ORDER", "FO-001001", "Fielders (sample branch)", "1 Sample Street, Testville", "Required: 2026-10-20", "COLORBOND", "Monument", "0.55 BMT",
    "L1 100", "L2 150", "L3 50", "B1", "B2", "fold left", "fold right", "crush fold (closed hem) 10", "Indicative girth 310", "4,600", "6,100", "3 ×", "Long piece", "Painted (colour) face", "solid", "Confirm availability with supplier", "Order total: 4 pieces"]) {
    assert.ok(text.includes(s), `missing "${s}"`);
  }
  assert.ok(!/DRAFT/.test(text));
  if (WRITE) { mkdirSync("docs/takeoff/evidence", { recursive: true }); writeFileSync("docs/takeoff/evidence/sample-supplier-order-1-profile.pdf", pdf); }
});

await t("A28 40-line multi-profile order paginates without losing rows; draft watermark", async () => {
  const profiles = [starterProfile(), mirrorProfile(starterProfile()), setIncludedAngle(starterProfile(), 0, 135),
    normaliseProfile({ segments: [{ lengthMm: 75 }, { lengthMm: 200 }], bends: [{ turnDeg: 45 }], start: { type: "open_return", widthMm: 15, side: "left" }, end: { type: "none" }, coatedFace: "right" })];
  const materials = profiles.map((p, i) => ({ id: `m${i}`, name: `Profile ${i + 1}`, methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: spec(["Surfmist", "Basalt", "Monument", "Woodland Grey"][i]), profile: p }));
  const measurements = [], contributions = [];
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const len = 1000 + i * 150;
    measurements.push({ id: `x${i}`, kind: "manual", finishedLengthMm: len, quantity: (i % 3) + 1 });
    contributions.push({ id: `c${i}`, measurementId: `x${i}`, jobMaterialId: `m${i % 4}` });
    n += (i % 3) + 1;
  }
  const ws = wsWith(materials, measurements, contributions);
  const lines = orderFor(ws);
  assert.equal(lines.length, 40);
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot: ws, order, lines, supplier, company, jobLabel: "Sample job", rendererVersion: RENDERER_VERSION });
  assert.deepEqual(problems, []);
  const pdf = await renderSupplierOrderPdf(snapshot, { exportNo: 2, isDraft: true, snapshotSha256: snapshotHash(snapshot) });
  const pages = await pdfText(pdf);
  assert.ok(pages.length >= 2, `pages ${pages.length}`);
  const all = pages.join(" ");
  for (let i = 0; i < 40; i++) assert.ok(all.includes((1000 + i * 150).toLocaleString("en-AU")), `row ${1000 + i * 150} missing`);
  for (let i = 1; i <= 4; i++) assert.ok(all.includes(`P${i}`), `profile P${i} missing`);
  assert.ok(all.includes(`Order total: ${n} pieces`));
  assert.ok(all.includes("DRAFT"));
  pages.forEach((p, i) => assert.ok(p.includes(`page ${i + 1} of ${pages.length}`), `footer on page ${i + 1}`));
  assert.ok(all.includes("open return 15"));
  if (WRITE) writeFileSync("docs/takeoff/evidence/sample-supplier-order-40-lines-draft.pdf", pdf);
});

await t("review #8: 30-leg profile paginates sanely; continued cutting lists keep their label; decimals exact", async () => {
  const legs = Array.from({ length: 30 }, (_, i) => ({ lengthMm: i === 0 ? 12.5 : 40 }));
  const zig = normaliseProfile({ segments: legs, bends: legs.slice(1).map((_, i) => ({ turnDeg: i % 2 ? -90 : 90 })), start: { type: "closed_hem", widthMm: 12.5, side: "left" }, end: { type: "none" }, coatedFace: "left" });
  const materials = [0, 1, 2, 3].map((i) => ({ id: `m${i}`, name: `Long profile ${i + 1}`, methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: spec(["Surfmist", "Basalt", "Monument", "Dune"][i]), profile: zig }));
  const measurements = [], contributions = [];
  for (let i = 0; i < 40; i++) { measurements.push({ id: `x${i}`, kind: "manual", finishedLengthMm: 1000 + i * 100 + 0.5, quantity: 1 }); contributions.push({ id: `c${i}`, measurementId: `x${i}`, jobMaterialId: `m${i % 4}` }); }
  const ws = wsWith(materials, measurements, contributions);
  const { snapshot } = buildExportSnapshot({ wsSnapshot: ws, order, lines: orderFor(ws), supplier, company, jobLabel: "x", rendererVersion: RENDERER_VERSION });
  const pdf = await renderSupplierOrderPdf(snapshot, { exportNo: 3, isDraft: true, snapshotSha256: "x" });
  const pages = await pdfText(pdf);
  assert.ok(pages.length <= 8, `too many pages: ${pages.length}`);
  for (const p of pages.slice(1)) assert.ok(/P\d — Long profile/.test(p) || /Order total/.test(p), "every continued page names its profile");
  const all = pages.join(" ");
  assert.ok(/L1\s+12\.5 mm/.test(all), "fractional leg printed exactly");
  assert.ok(all.includes("closed hem) 12.5 mm"), "fractional hem printed exactly");
  assert.ok(all.includes("1,000.5"), "fractional finished length printed exactly");
  for (let i = 1; i <= 29; i++) assert.ok(all.includes(`B${i} `), `B${i} present`);
});

await t("readiness problems listed for an incomplete order", async () => {
  const ws = wsWith([{ id: "m1", name: "No colour", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { product: "Flashing", finish: "COLORBOND", bmt: 0.55 }, profile: starterProfile() }],
    [{ id: "a", kind: "manual", finishedLengthMm: 9100, quantity: 1 }], [{ id: "c1", measurementId: "a", jobMaterialId: "m1" }]);
  const { problems } = buildExportSnapshot({ wsSnapshot: ws, order: { ...order, delivery: {} }, lines: orderFor(ws), supplier: null, company, jobLabel: "x", rendererVersion: RENDERER_VERSION });
  assert.ok(problems.some((p) => /supplier/.test(p)));
  assert.ok(problems.some((p) => /delivery or pickup/.test(p)));
  assert.ok(problems.some((p) => /ceiling/.test(p)));
  assert.ok(problems.some((p) => /colour/i.test(p)));
});

console.log(`takeoff-pdf: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
