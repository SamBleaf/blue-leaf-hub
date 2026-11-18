// Cross-checks the Hub's copy of the MGP10 lintel tables (T17, T18, T47, T48) against Sam's licensed PDF text layer,
// row by row: every span AND every extra-bearing subscript (extraBearingMm), subscript-aware (see pdf-lintel-rows.mjs).
// Needs poppler's pdftotext and the PDF on this Mac. Run: node scripts/takeoff/standards/verify-lintels-vs-pdf.mjs
import { readPage } from "./pdf-lintel-rows.mjs";

const { default: data } = await import("../../../shared/takeoff/standards/data/as1684-mgp10-n1n2.js");
let bad = 0, rows = 0;
for (const id of ["T17", "T18", "T47", "T48"]) {
  const t = data.tables[id];
  const found = readPage(t.citation.page);
  for (const r of t.rows) {
    rows++;
    const pdf = found.get(r.size);
    const ex = r.extraBearingMm || r.maxSpanMm.map(() => 0);
    if (!pdf || pdf.spans.length !== r.maxSpanMm.length || pdf.spans.some((v, i) => v !== r.maxSpanMm[i] || pdf.extra[i] !== ex[i])) {
      bad++; console.log(`MISMATCH ${id} ${r.size}: Hub ${JSON.stringify(r.maxSpanMm)} +${JSON.stringify(ex)} PDF ${JSON.stringify(pdf)}`);
    }
  }
  console.log(`${id} page ${t.citation.page}: ${t.rows.length} rows checked, ${found.size} rows read from the PDF page`);
}
console.log(bad ? `${bad} of ${rows} rows differ` : `all ${rows} rows match the PDF`);
process.exit(bad ? 1 : 0);
