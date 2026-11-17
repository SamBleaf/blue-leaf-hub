// Cross-checks the Hub's copy of the MGP10 lintel tables (T17, T18, T47, T48) against Sam's licensed PDF text layer,
// row by row, so the page numbers and every cell are re-read from the source and not from Bestimator. Needs poppler's
// pdftotext and the PDF on this Mac. Run: node scripts/takeoff/standards/verify-lintels-vs-pdf.mjs
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const PDF = `${homedir()}/Documents/AS 1684 Span Tables/Non-cyclonic/N1N2/MGP10.PDF`;
const { default: data } = await import("../../../shared/takeoff/standards/data/as1684-mgp10-n1n2.js");
let bad = 0, rows = 0;
for (const id of ["T17", "T18", "T47", "T48"]) {
  const t = data.tables[id];
  const page = execFileSync("pdftotext", ["-layout", "-f", String(t.citation.page), "-l", String(t.citation.page), PDF, "-"], { encoding: "utf8" });
  const found = new Map();
  for (const line of page.split("\n")) {
    const m = line.match(/^\s*((?:\d\/)?\d{2,3}x\d{2,3})\s+((?:\d{3,4}\s+)+\d{3,4})\s*$/);
    if (m) found.set(m[1], m[2].trim().split(/\s+/).map(Number));
  }
  for (const r of t.rows) {
    rows++;
    const pdf = found.get(r.size);
    if (!pdf || pdf.length !== r.maxSpanMm.length || pdf.some((v, i) => v !== r.maxSpanMm[i])) { bad++; console.log(`MISMATCH ${id} ${r.size}: Hub ${JSON.stringify(r.maxSpanMm)} PDF ${JSON.stringify(pdf)}`); }
  }
  console.log(`${id} page ${t.citation.page}: ${t.rows.length} rows checked, ${found.size} rows read from the PDF page`);
}
console.log(bad ? `${bad} of ${rows} rows differ` : `all ${rows} rows match the PDF`);
process.exit(bad ? 1 : 0);
