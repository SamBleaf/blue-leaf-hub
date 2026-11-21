// Cross-checks the Hub's copy of the SmartLVL 13 single span floor bearer table (L13-FLOOR-BEARER, floor mass 40 kg/m2, guide p13, pdf p16)
// against the licensed PDF text layer: PDF sha, every size row present, 10 cells per row, every span AND every extra-bearing subscript.
// Reads the page its own way (a whole-line regex, subscript = what trails a multiple of 100) so it is independent of the Python generator.
// Needs poppler's pdftotext and the PDF on this Mac. Run: node scripts/takeoff/standards/verify-floor-bearer-vs-pdf.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const { default: data } = await import("../../../shared/takeoff/standards/data/smartlvl13-e1-2021.js");
const t = data.tables["L13-FLOOR-BEARER"];
const PDF = `${homedir()}/Downloads/SmartLVL13-Design-Guide-E1-2021.pdf`;
let bad = 0;
const fail = (m) => { bad++; console.log(`MISMATCH ${m}`); };
if (createHash("sha256").update(readFileSync(PDF)).digest("hex") !== data.source.sha256) fail("the PDF's sha256 differs from the one the data was generated from");
const cell = (tok) => {
  if (tok === "NS") return { span: null, extra: 0 };
  const m = tok.match(/^(\d{1,2}00|\d{3,4}00)(\d{0,2})$/) || tok.match(/^(\d00|\d{2}00)(\d{0,2})$/);
  return m ? { span: +m[1], extra: +(m[2] || 0) } : null;
};
const txt = execFileSync("pdftotext", ["-layout", "-f", String(t.citation.pdfPage), "-l", String(t.citation.pdfPage), PDF, "-"], { encoding: "utf8" });
if (!/Single span floor bearers supporting floor loads only/.test(txt) || !/Floor mass - 40 kg\/m2/.test(txt)) fail("the page is not the 40 kg/m2 single span floor bearer table");
const head = txt.split("\n").find((l) => /^Floor load width \(mm\)/.test(l.trim()));
const cols = head ? head.trim().split(/\s+/).slice(4).map(Number) : [];
if (JSON.stringify(cols) !== JSON.stringify(t.floorLwMm)) fail(`floor load width columns ${JSON.stringify(cols)} vs ${JSON.stringify(t.floorLwMm)}`);
const pdf = new Map();
for (const line of txt.split("\n")) {
  const m = line.match(/^\s*((?:\d\/)?\d{2,3}x\d{2,3})\s+((?:(?:\d{3,6}|NS)\s+)*(?:\d{3,6}|NS))\s*$/);
  if (m) pdf.set(m[1], m[2].trim().split(/\s+/).map(cell));
}
for (const r of t.rows) {
  const p = pdf.get(r.size);
  if (!p || p.length !== t.floorLwMm.length || p.some((c) => !c)) { fail(`${r.size}: PDF row unreadable or not ${t.floorLwMm.length} cells`); continue; }
  if (r.spansMm.length !== p.length || p.some((c, i) => c.span !== r.spansMm[i] || c.extra !== r.extraBearingMm[i])) fail(`${r.size}: Hub ${JSON.stringify(r.spansMm)} +${JSON.stringify(r.extraBearingMm)} PDF ${JSON.stringify(p)}`);
}
if (pdf.size !== t.rows.length) fail(`the PDF page has ${pdf.size} size rows, the table has ${t.rows.length}`);
console.log(`L13-FLOOR-BEARER pdf page ${t.citation.pdfPage} (guide p${t.citation.guidePage}): ${t.rows.length} rows x ${t.floorLwMm.length} cells checked, ${pdf.size} rows read from the PDF page`);
console.log(bad ? `${bad} problem(s)` : "all rows match the PDF");
process.exit(bad ? 1 : 0);
