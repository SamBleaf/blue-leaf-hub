// MGP10 N1/N2 lintel tables T17/T18/T47/T48: row completeness and shape, checked independently against the rendered PDF
// pages (2026-11-18). Catches a DROPPED row, which verify-lintels-vs-pdf.mjs cannot (it only iterates rows the data has).
//   node scripts/tests/takeoff-tc-mgp10-lintel-rows.test.mjs
import assert from "node:assert/strict";
import data from "../../shared/takeoff/standards/data/as1684-mgp10-n1n2.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error(`  x ${name}\n    ${e.message}`); } }

const SINGLE = ["90x35", "2/90x35", "90x45", "2/90x45", "120x35", "2/120x35", "120x45", "2/120x45", "140x35", "2/140x35", "140x45", "2/140x45", "170x35", "2/170x35", "170x45", "2/170x45", "190x35", "2/190x35", "190x45", "2/190x45", "240x35", "2/240x35", "240x45", "2/240x45", "2/290x35", "290x45", "2/290x45"];
const LOWER = ["90x35", "90x45", "2/90x35", "2/90x45", "120x35", "120x45", "2/120x35", "2/120x45", "140x35", "140x45", "2/140x35", "2/140x45", "170x35", "170x45", "2/170x35", "2/170x45", "190x35", "190x45", "2/190x35", "2/190x45", "240x35", "240x45", "2/240x35", "2/240x45", "290x45", "2/290x35", "2/290x45"];
const EXPECT = { T17: [SINGLE, 10], T18: [SINGLE, 10], T47: [LOWER, 9], T48: [LOWER, 9] };

for (const [id, [sizes, ncol]] of Object.entries(EXPECT)) {
  t(`${id}: exactly the 27 PDF rows, ${ncol} columns each`, () => {
    const tb = data.tables[id];
    assert.deepEqual(tb.rows.map((r) => r.size).sort(), [...sizes].sort()); // a set, not an order: pickRow ranks
    assert.equal(tb.columns.length, ncol);
    for (const r of tb.rows) { assert.equal(r.maxSpanMm.length, ncol, r.size); assert.equal(r.extraBearingMm.length, ncol, r.size); }
  });
}
t("T18 90x35 (printed with NS cells) is present", () => {
  const r = data.tables.T18.rows.find((x) => x.size === "90x35");
  assert.deepEqual(r.maxSpanMm, [1400, 1000, 1000, 700, 800, 600, 700, null, 600, null]);
});
t("T48 170x35 last cell is 900 with 5 mm extra bearing (subscript, not a fused 9005)", () => {
  const r = data.tables.T48.rows.find((x) => x.size === "170x35");
  assert.equal(r.maxSpanMm[8], 900); assert.equal(r.extraBearingMm[8], 5);
});
console.log(`takeoff-tc-mgp10-lintel-rows: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
