// Footer page numbers — split each PAGE / NUMPAGES field into the standard four Word runs.
//
// The docx library writes a page-number field as ONE run holding begin + instrText + separate + end.
// LibreOffice (our PDF converter) drops that run's formatting when it builds the field, so the numbers
// fall back to the document default (10.5pt ink) beside the 7.5pt grey "PAGE" label (Tab 26 R05 retest).
// Four runs that each carry the same formatting render in the footer style. No cached result is kept:
// LibreOffice fills the numbers in. Formatting only — no wording, size or colour change.
//
//   node scripts/documents/fix-footer-page-fields.mjs          → patch the five register templates in place
//   node scripts/documents/fix-footer-page-fields.mjs --check  → exit 1 if any template still has a single-run field
//
// author-templates.mjs runs the same transform, so re-authoring can't bring the bug back.
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import PizZip from "pizzip";

const SINGLE_RUN_FIELD = /<w:r>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?<w:fldChar w:fldCharType="begin"\/><w:instrText xml:space="preserve">\s*(PAGE|NUMPAGES)\s*<\/w:instrText><w:fldChar w:fldCharType="separate"\/><w:fldChar w:fldCharType="end"\/><\/w:r>/g;

/** Pure: returns { xml, count } with every single-run PAGE/NUMPAGES field split into four runs. Idempotent. */
export function splitFooterFields(xml) {
  let count = 0;
  const out = String(xml).replace(SINGLE_RUN_FIELD, (_m, rPr = "", field) => {
    count += 1;
    const r = (inner) => `<w:r>${rPr}${inner}</w:r>`;
    return r('<w:fldChar w:fldCharType="begin"/>') + r(`<w:instrText xml:space="preserve"> ${field} </w:instrText>`)
      + r('<w:fldChar w:fldCharType="separate"/>') + r('<w:fldChar w:fldCharType="end"/>');
  });
  return { xml: out, count };
}

/** Patch every footer part of a .docx buffer. Returns { buffer, count }. */
export function fixDocxFooterFields(buf) {
  const zip = new PizZip(buf);
  let count = 0;
  for (const name of Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n))) {
    const { xml, count: c } = splitFooterFields(zip.file(name).asText());
    if (c) { zip.file(name, xml); count += c; }
  }
  return { buffer: count ? zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) : buf, count };
}

export const REGISTER_TEMPLATES = [
  "blb-client-brief-template.docx", "blb-architect-brief-template.docx", "blb-client-presentation-template.docx",
  "blb-selections-schedule-template.docx", "blb-tender-notes-template.docx",
];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../public/templates");
  const check = process.argv.includes("--check");
  let bad = 0;
  for (const f of REGISTER_TEMPLATES) {
    const path = join(dir, f);
    const { buffer, count } = fixDocxFooterFields(fs.readFileSync(path));
    if (check) { if (count) { bad += 1; console.log(`✗ ${f}: ${count} single-run page field(s)`); } else console.log(`✓ ${f}`); continue; }
    if (count) { fs.writeFileSync(path, buffer); console.log(`patched ${f}: ${count} field(s)`); } else console.log(`unchanged ${f}`);
  }
  if (check && bad) process.exit(1);
}
