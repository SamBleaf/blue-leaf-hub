// Build the APB-Balanced template by CLONING the original BLB template's design (styles.xml, fonts,
// theme, header/footer, logo, settings — all untouched) and authoring a fresh body in the SAME named
// styles (Title / Heading1-3 / Normal), fully data-bound, in APB's 13-section order. The result keeps
// the exact Blue Leaf look (Playfair Display headings, Open Sans body, brand blue, header+footer+logo)
// while adding the new APB sales sections + the auto-filled scope/PC-PS/schedule.
// Output: docs/fee-proposal-apb-template.docx   Re-run: node scripts/gen-apb-template-styled.mjs
import PizZip from "pizzip";
import { readFileSync, writeFileSync } from "node:fs";

const src = new PizZip(readFileSync("public/BLB_TENDER_TEMPLATE.docx"));
const origDoc = src.file("word/document.xml").asText();

// Reuse the original's <w:document …> opening (xmlns incl. r:) and its body-level sectPr (header/footer
// references + page size), so the header/footer/logo + page setup carry over unchanged.
const openTag = origDoc.slice(0, origDoc.indexOf("<w:body>") + "<w:body>".length);
const sectMatches = origDoc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) || [];
const sectPr = sectMatches.length ? sectMatches[sectMatches.length - 1] : "<w:sectPr/>";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const P = (style, text) => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
const B = (text) => `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`; // Normal body / loop tags
const PB = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
const out = [];
const add = (...x) => out.push(...x);

// 1 — Cover
add(P("Title", "{NICHE_STATEMENT}"));
add(B("Fixed Price Construction Proposal"));
add(P("Heading2", "{QUOTE_NUMBER}"));
add(B("Prepared for {CLIENT_SALUTATION}"));
add(B("At {PROJECT_ADDRESS}"));
add(B("{DATE}"));
add(PB());

// 2 — Introduction
add(P("Heading1", "Introduction"));
add(B("Dear {CLIENT_SALUTATION}"));
add(B("{OPENING_PARAGRAPH}"));
add(B("This proposal and the pricing herein shall remain valid for a period of 30 days following the date shown above."));
add(B("Yours sincerely,"));
add(B("{SIGNATORIES}"));
add(PB());

// 3 — Fixed Price & Scope of Work
add(P("Heading1", "Fixed Price & Scope of Work"));
add(P("Heading2", "Your total fixed price: {TOTAL_INC_GST} (inc GST)"));
add(B("{VARIATIONS_CLAUSE}"));

// 4 — Why Build With Us
add(P("Heading1", "Why Build With Blue Leaf"));
add(B("{WHY_BUILD_WITH_US}"));

// 5 — Our Guarantees
add(P("Heading1", "Our Guarantees"));
add(B("{#GUARANTEES}"));
add(P("Heading3", "{GUARANTEE_HEADING}"));
add(B("{GUARANTEE_TEXT}"));
add(B("{/GUARANTEES}"));

// 6 — Online Project Management
add(P("Heading1", "Online Project Management"));
add(B("{ONLINE_PM_BODY}"));

// 7 — Inclusions
add(P("Heading1", "Inclusions"));
add(B("{#INCLUSION_SECTIONS}"));
add(P("Heading3", "{SECTION_HEADING}"));
add(B("{#SECTION_ITEMS}"));
add(B("•  {ITEM_TEXT}"));
add(B("{/SECTION_ITEMS}"));
add(B("{/INCLUSION_SECTIONS}"));

// 8 — Prime Cost & Provisional Sums
add(P("Heading1", "Prime Cost & Provisional Sums"));
add(B("The following allowances are included for items not yet fully selected or confirmed. Any adjustment is treated as a variation."));
add(B("{#PC_SUMS}"));
add(B("{PC_DESCRIPTION} — {PC_AMOUNT}"));
add(B("{/PC_SUMS}"));

// 9 — Optional Upgrades
add(P("Heading1", "Optional Upgrades & Cost Saving Alternatives"));
add(B("{#OPTIONAL_ITEMS}"));
add(B("{OPTION_DESCRIPTION} — {OPTION_PRICE}"));
add(B("{/OPTIONAL_ITEMS}"));

// 10 — Construction Schedule
add(P("Heading1", "Construction Schedule"));
add(B("{CONSTRUCTION_SCHEDULE_INTRO}"));
add(B("{#CONSTRUCTION_SCHEDULE}"));
add(P("Heading3", "{PHASE_LABEL}  ({PHASE_WEEKS})"));
add(B("{#TASKS}"));
add(B("•  {TASK_NAME} — {TASK_WEEKS} (starts week {START_WEEK})"));
add(B("{/TASKS}"));
add(B("{/CONSTRUCTION_SCHEDULE}"));

// 11 — Testimonials
add(P("Heading1", "What Our Clients Say"));
add(B("{#TESTIMONIALS}"));
add(B("“{TESTIMONIAL_TEXT}”"));
add(B("— {TESTIMONIAL_AUTHOR}"));
add(B("{/TESTIMONIALS}"));

// 12 — Licences & Associations
add(P("Heading1", "Licences & Associations"));
add(B("{#LICENCES}"));
add(B("{LICENCE_TEXT}"));
add(B("{/LICENCES}"));

// 13 — Responsibilities / Exclusions / Quote Summary / Fee Schedule / Next Step / Summary
add(P("Heading1", "Responsibilities"));
add(P("Heading3", "Our responsibilities"));
add(B("{#RESPONSIBILITIES_OURS}"));
add(B("•  {RESP_TEXT}"));
add(B("{/RESPONSIBILITIES_OURS}"));
add(P("Heading3", "Your responsibilities"));
add(B("{#RESPONSIBILITIES_YOURS}"));
add(B("•  {RESP_TEXT}"));
add(B("{/RESPONSIBILITIES_YOURS}"));

add(P("Heading1", "Exclusions"));
add(B("{#EXCLUSIONS}"));
add(B("•  {EXCLUSION_TEXT}"));
add(B("{/EXCLUSIONS}"));

add(P("Heading1", "Quote Summary"));
add(B("{#SUMMARY_ROWS}"));
add(B("{CATEGORY_NAME}    {CATEGORY_COST_GST}"));
add(B("{/SUMMARY_ROWS}"));
add(P("Heading2", "Total: {TOTAL_COST_GST} (inc GST)"));

add(P("Heading1", "Fee Schedule"));
add(B("{#FEE_SCHEDULE}"));
add(B("{STAGE_CLAIM}    {MILESTONE}    {PERCENTAGE}"));
add(B("{/FEE_SCHEDULE}"));

add(P("Heading1", "The Next Step"));
add(B("{NEXT_STEPS}"));

add(P("Heading1", "Summary"));
add(B("{APB_SUMMARY_BODY}"));

const newDoc = `${openTag}${out.join("")}${sectPr}</w:body></w:document>`;

// Clone every part of the original, swapping ONLY word/document.xml.
const zip = new PizZip();
for (const name of Object.keys(src.files)) {
  if (src.files[name].dir) continue;
  if (name === "word/document.xml") zip.file(name, newDoc);
  else zip.file(name, src.files[name].asUint8Array());
}
const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(new URL("../docs/fee-proposal-apb-template.docx", import.meta.url).pathname, buf);
console.log(`Wrote docs/fee-proposal-apb-template.docx (${buf.length} bytes, ${out.length} paragraphs, cloned ${Object.keys(src.files).length} parts)`);
