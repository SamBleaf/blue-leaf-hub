// Generates a STARTER APB-Balanced fee-proposal DOCX template (docs/fee-proposal-apb-template-starter.docx).
// It contains all 13 sections with the docxtemplater merge fields/loops wired up. Open it in Word, apply
// the Blue Leaf design (dusty-blue banners, serif headings, timber imagery, logo+footer per the company
// profile), KEEP the {FIELD} / {#LOOP} tags intact, then upload it in the wizard (Step 3 → APB template).
// Re-run: node scripts/gen-apb-template-starter.mjs
import PizZip from "pizzip";
import { writeFileSync } from "node:fs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// style → run/paragraph props (sizes are half-points: 48 = 24pt)
const STYLES = {
  title: { sz: 48, b: 1, jc: "center" },
  h1:    { sz: 32, b: 1 },
  h2:    { sz: 26, b: 1 },
  body:  { sz: 22 },
  note:  { sz: 18, i: 1 },
  loop:  { sz: 22 }
};
function para(style, text) {
  const s = STYLES[style] || STYLES.body;
  const rpr = `<w:rPr>${s.b ? "<w:b/>" : ""}${s.i ? "<w:i/>" : ""}<w:sz w:val="${s.sz}"/></w:rPr>`;
  const ppr = `<w:pPr>${s.jc ? `<w:jc w:val="${s.jc}"/>` : ""}<w:spacing w:after="120"/></w:pPr>`;
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}
const doc = [];
const P = (style, text) => doc.push(para(style, text));

// 1 — Cover
P("title", "{NICHE_STATEMENT}");
P("body", "Fixed Price Construction Proposal");
P("h2", "{QUOTE_NUMBER}");
P("body", "Prepared for {CLIENT_SALUTATION}");
P("body", "At {PROJECT_ADDRESS}");
P("body", "{DATE}");
P("note", "[Cover page — apply timber hero image + Blue Leaf logo]");

// 2 — Introduction
P("h1", "Introduction");
P("body", "Dear {CLIENT_SALUTATION}");
P("body", "{OPENING_PARAGRAPH}");
P("body", "This proposal and the pricing herein shall remain valid for a period of 30 days following the date shown above.");
P("body", "Yours sincerely,");
P("body", "{SIGNATORIES}");

// 3 — Fixed Price & Scope of Work
P("h1", "Fixed Price & Scope of Work");
P("h2", "Your total fixed price: {TOTAL_INC_GST} (inc GST)");
P("body", "{VARIATIONS_CLAUSE}");

// 4 — Why Build With Us
P("h1", "Why Build With Blue Leaf");
P("body", "{WHY_BUILD_WITH_US}");

// 5 — Our Guarantees
P("h1", "Our Guarantees");
P("loop", "{#GUARANTEES}");
P("h2", "{GUARANTEE_HEADING}");
P("body", "{GUARANTEE_TEXT}");
P("loop", "{/GUARANTEES}");

// 6 — Online Project Management
P("h1", "Online Project Management");
P("body", "{ONLINE_PM_BODY}");

// 7 — Inclusions
P("h1", "Inclusions");
P("loop", "{#INCLUSION_SECTIONS}");
P("h2", "{SECTION_HEADING}");
P("loop", "{#SECTION_ITEMS}");
P("body", "•  {ITEM_TEXT}");
P("loop", "{/SECTION_ITEMS}");
P("loop", "{/INCLUSION_SECTIONS}");

// 8 — Prime Cost & Provisional Sums
P("h1", "Prime Cost & Provisional Sums");
P("body", "The following allowances are included for items not yet fully selected or confirmed. Adjustments are treated as a variation.");
P("loop", "{#PC_SUMS}");
P("body", "{PC_DESCRIPTION} — {PC_AMOUNT}");
P("loop", "{/PC_SUMS}");

// 9 — Optional Upgrades
P("h1", "Optional Upgrades");
P("loop", "{#OPTIONAL_ITEMS}");
P("body", "{OPTION_DESCRIPTION} — {OPTION_PRICE}");
P("loop", "{/OPTIONAL_ITEMS}");

// 10 — Construction Schedule
P("h1", "Construction Schedule");
P("body", "{CONSTRUCTION_SCHEDULE_INTRO}");
P("loop", "{#CONSTRUCTION_SCHEDULE}");
P("h2", "{PHASE_LABEL}  ({PHASE_WEEKS})");
P("loop", "{#TASKS}");
P("body", "•  {TASK_NAME} — {TASK_WEEKS} (starts week {START_WEEK})");
P("loop", "{/TASKS}");
P("loop", "{/CONSTRUCTION_SCHEDULE}");

// 11 — Testimonials
P("h1", "What Our Clients Say");
P("loop", "{#TESTIMONIALS}");
P("body", "“{TESTIMONIAL_TEXT}”");
P("note", "— {TESTIMONIAL_AUTHOR}");
P("loop", "{/TESTIMONIALS}");

// 12 — Licences & Associations
P("h1", "Licences & Associations");
P("loop", "{#LICENCES}");
P("body", "{LICENCE_TEXT}");
P("loop", "{/LICENCES}");

// 13 — Responsibilities / Exclusions / Summary / Fee Schedule / Next Step / Close
P("h1", "Responsibilities");
P("h2", "Our responsibilities");
P("loop", "{#RESPONSIBILITIES_OURS}");
P("body", "•  {RESP_TEXT}");
P("loop", "{/RESPONSIBILITIES_OURS}");
P("h2", "Your responsibilities");
P("loop", "{#RESPONSIBILITIES_YOURS}");
P("body", "•  {RESP_TEXT}");
P("loop", "{/RESPONSIBILITIES_YOURS}");

P("h1", "Exclusions");
P("loop", "{#EXCLUSIONS}");
P("body", "•  {EXCLUSION_TEXT}");
P("loop", "{/EXCLUSIONS}");

P("h1", "Quote Summary");
P("loop", "{#SUMMARY_ROWS}");
P("body", "{CATEGORY_NAME}    {CATEGORY_COST_GST}");
P("loop", "{/SUMMARY_ROWS}");
P("h2", "Total: {TOTAL_COST_GST} (inc GST)");

P("h1", "Fee Schedule");
P("loop", "{#FEE_SCHEDULE}");
P("body", "{STAGE_CLAIM}    {MILESTONE}    {PERCENTAGE}");
P("loop", "{/FEE_SCHEDULE}");

P("h1", "The Next Step");
P("body", "{NEXT_STEPS}");

P("h1", "Summary");
P("body", "{APB_SUMMARY_BODY}");

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
  doc.join("") +
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>` +
  `</w:body></w:document>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const rels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", contentTypes);
zip.file("_rels/.rels", rels);
zip.file("word/document.xml", documentXml);
const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
const out = new URL("../docs/fee-proposal-apb-template-starter.docx", import.meta.url).pathname;
writeFileSync(out, buf);
console.log("Wrote", out, `(${buf.length} bytes, ${doc.length} paragraphs)`);
