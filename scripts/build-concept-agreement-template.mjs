// Builds the STARTER concept-agreement DOCX template (bundled fallback) at
// public/templates/concept-agreement-template.docx. This is a basic layout with the {FIELD}
// merge placeholders in single runs (so docxtemplater parses them cleanly). Sam replaces this with
// his high-quality version via the admin template upload — keep the same field names.
//
// Run once: node scripts/build-concept-agreement-template.mjs
// Fields: {CLIENT_NAME} {DATE} {PROJECT_TYPE} {SITE_ADDRESS} {DESIGNER_NAME} {DESIGNER_COMPANY}
//         {CONCEPT_FEE} {DESIGN_PACKAGE_FEE}

import PizZip from "pizzip";
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAND = "006C9B";
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function run(text, { bold, size, color } = {}) {
  const rpr = [];
  if (bold) rpr.push("<w:b/>");
  if (size) rpr.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`);
  if (color) rpr.push(`<w:color w:val="${color}"/>`);
  const rprXml = rpr.length ? `<w:rPr>${rpr.join("")}</w:rPr>` : "";
  return `<w:r>${rprXml}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
const p = (runs, after = 120) => `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr>${Array.isArray(runs) ? runs.join("") : runs}</w:p>`;
const heading = (t) => p(run(t, { bold: true, size: 26, color: BRAND }), 80);
const stage = (t) => p(run(t, { bold: true, size: 24 }), 40);
const body = (t) => p(run(t, { size: 21 }));

const paras = [
  p(run("Concept Agreement", { bold: true, size: 40, color: BRAND }), 60),
  p([run("Blue Leaf Building", { size: 20, color: "666666" })], 20),
  p([run("{DATE}", { size: 20, color: "666666" })], 200),
  p(run("Prepared for: {CLIENT_NAME}", { size: 21 })),
  p(run("Project: {SITE_ADDRESS}", { size: 21 })),
  p(run("Recommended designer: {DESIGNER_NAME} ({DESIGNER_COMPANY})", { size: 21 }), 200),

  heading("Overview"),
  body("Thank you for the opportunity to work with you on your project. This document outlines our design-and-build process from here — what each stage involves, what it costs, and what you can expect — so there are no surprises down the track."),

  heading("Our process"),
  stage("1. Concept Design Package — {CONCEPT_FEE}"),
  body("A follow-up meeting with {DESIGNER_NAME} and the Blue Leaf team to run through measurements, ideas and key design considerations, after which {DESIGNER_NAME} prepares two concept drawings for your project. This small upfront fee keeps everyone aligned before more detailed design work begins."),
  stage("2. Full Design Package — {DESIGN_PACKAGE_FEE}"),
  body("If you're happy with the concepts and wish to proceed, we move into full design: a complete set of planning documents (floor plans, elevations, interiors and site plans — yours to keep), the engineering documentation required for approval, management of the entire planning-approval process, and full coordination from Blue Leaf throughout."),
  stage("3. Fixed Price Building Proposal"),
  body("Once your plans are approved and documentation is finalised, we prepare a Fixed Price Building Proposal. If accepted, we move into a building contract — and from there, breaking ground and starting your build."),

  heading("What you receive at concept stage"),
  body("A collaborative design meeting with your recommended designer, two concept drawings prepared for your project, and a review meeting to talk through changes and next steps."),

  heading("What we need from you"),
  body("Any inspiration, mood boards or design ideas you'd like to share, and your confirmation to proceed with the Concept Design Package."),

  heading("Fee summary"),
  body("Concept Design Package: {CONCEPT_FEE}"),
  body("Full Design Package: {DESIGN_PACKAGE_FEE}"),
  body("Fixed Price Building Proposal: prepared once your plans are approved"),

  p([run("Blue Leaf Building  ·  Licensed Builder BLD 332830  ·  ABN 88 656 051 188", { size: 18, color: "666666" })], 0),
];

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", contentTypes);
zip.file("_rels/.rels", rels);
zip.file("word/document.xml", documentXml);
const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

const dir = join(__dirname, "../public/templates");
fs.mkdirSync(dir, { recursive: true });
const dest = join(dir, "concept-agreement-template.docx");
fs.writeFileSync(dest, out);
console.log(`Wrote ${dest} (${out.length} bytes)`);
