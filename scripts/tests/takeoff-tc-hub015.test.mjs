// Hub review HUB 015 — a wall taller than the sheet gets its joint automatically from the product's joint rule
// (gap + H-flashing detail; Sam, 20 Oct 2026: 10 mm gap with an H-flashing). Drives the REAL cladding engine + dispatch.
import assert from "node:assert/strict";
import { sheetLayout, autoJointRows } from "../../shared/takeoff/engine/cladding.js";
import { buildWall } from "../../shared/takeoff/engine/wall.js";
import { CATALOGUE_SEED } from "../../shared/takeoff/products/seed.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const rect = (w, h) => buildWall({ id: "W1", kind: "rect", widthMm: w, heightMm: h });
const axon = ["axon-404417", "axon-404418", "axon-404419"].map((id) => CATALOGUE_SEED.products.find((p) => p.id === id));   // Axon 400 smooth 2,450 / 2,750 / 3,000
const axon3000 = axon.filter((p) => p.dimensionsMm.length === 3000);
const RULE = { gapMm: 10, detailRef: "H-flashing" };
const run = (h, products = axon3000, rules = RULE, extra = {}) => sheetLayout(rect(6573, h), [], products, { materialId: "m", wallId: "W1", orientation: "vertical", jointRows: rules, ...extra });
const codes = (r) => r.problems.map((p) => p.code);

t("the Axon 400 smooth sheets are in the catalogue (3,000 listed)", () => {
  assert.ok(axon3000.length >= 1, `axon 3000: ${axon.map((p) => p.dimensionsMm.length).join(",")}`);
});

t("a 3,600 wall with 3,000 Axon stock and the 10 mm H-flashing rule: one joint at 3,000, two courses, sheets counted (not 0)", () => {
  const r = run(3600);
  assert.ok(!codes(r).includes("sheet_too_tall"), codes(r).join(","));
  assert.equal(r.layout.joints.length, 1);
  assert.equal(r.layout.joints[0].atMm, 3000); assert.equal(r.layout.joints[0].source, "auto"); assert.equal(r.layout.joints[0].detailRef, "H-flashing");
  const sheets = r.demands.filter((d) => d.unit === "sheet");
  assert.ok(sheets.length > 0);
  assert.ok(sheets.some((d) => /course 2/.test(d.label)));
});

t("without a rule the wall stays blocked with the suggested joint (never assumed)", () => {
  const r = run(3600, axon3000, null);
  assert.ok(codes(r).includes("sheet_too_tall"));
  assert.equal(r.problems.find((p) => p.code === "sheet_too_tall").suggestedJointAtMm, 3000);
});

t("the minimum joints: 6,500 → two joints (3 courses); 2,950 → none; a height allowance moves the joint down", () => {
  assert.deepEqual(run(6500).layout.joints.map((j) => j.atMm), [3000, 6010]);
  const short = run(2950);
  assert.equal(short.layout.joints.length, 0); assert.ok(!codes(short).includes("joint_rows_invalid"));
  assert.deepEqual(run(3600, axon3000, RULE, { heightAllowanceMm: 10 }).layout.joints.map((j) => j.atMm), [2990]);
});

t("explicit joint heights always win (no automatic duplicate); a sliver top course lowers the auto joint with a note", () => {
  assert.deepEqual(run(3600, axon3000, { ...RULE, atMm: [2400] }).layout.joints.map((j) => `${j.atMm}:${j.source}`), ["2400:explicit"]);
  const sliver = run(3050);
  assert.equal(sliver.layout.joints[0].atMm, 3050 - 10 - 100);
  assert.ok(codes(sliver).includes("auto_joint_lowered"));
});

t("deterministic and pure: autoJointRows never changes its input", () => {
  const spec = { ...RULE };
  const a = autoJointRows(spec, 0, 3600, 3000, 0, null);
  assert.deepEqual(a.atMm, [3000]); assert.equal(spec.atMm, undefined);
  assert.deepEqual(JSON.stringify(run(3600)), JSON.stringify(run(3600)));
});

const { _test } = await import("../../server/lib/takeoff/takeoffService.mjs");
t("per-wall settings keyed by a wall's id survive the server's clean-up (a UUID often starts with a digit); unsafe keys still go", () => {
  const wallA = "3f2a1b4c-1234-4abc-8def-0123456789ab", wallB = "af2a1b4c-1234-4abc-8def-0123456789ab";
  const out = _test.cleanGenericRules({ datumByWall: { [wallA]: 600, [wallB]: 300 }, jointRows: { atMm: [], gapMm: 10, detailRef: "H-flashing" }, "1bad": 1, "has space": 2 });
  assert.deepEqual(out.datumByWall, { [wallA]: 600, [wallB]: 300 });   // the first was silently dropped before
  assert.deepEqual(out.jointRows, { atMm: [], gapMm: 10, detailRef: "H-flashing" });
  assert.equal(out["1bad"], undefined); assert.equal(out["has space"], undefined);
  const proto = _test.cleanGenericRules(JSON.parse('{"__proto__": {"x": 1}, "ok": 1}'));
  assert.equal(proto.ok, 1); assert.equal(Object.getPrototypeOf(proto), Object.prototype);
});

console.log(`takeoff-tc-hub015: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
