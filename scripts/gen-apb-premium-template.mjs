// Build the PREMIUM APB fee-proposal template by taking the designed source template
// (docs/apb-premium-source.docx — the v2.0 premium layout: all 67 merge tags run-safe, BLB paragraph
// styles, inline images, tables only for summary/PC/fee, no floating shapes) and swapping its 6
// placeholder images for curated real Blue Leaf project photos (docs/assets/apb-template-images/).
//
// Image slots (by the source's display aspect ratios):
//   image1 = cover hero       (AR 1.58, landscape)  ← IMG_6770 modern glass home
//   image2-5 = header strips  (AR ~6:1, thin bands) ← framing / timber / gable / Pro Clima
//   image6 = back-cover hero  (AR 1.32)             ← Millswood timber+brick interior
//
// The curated images were cropped to each slot's aspect ratio (no distortion) + downsized to web-res
// with sips, e.g.:
//   sips -s format jpeg -s formatOptions 82 -c <cropH> <cropW> <src> --out imageN.jpeg; sips -Z <maxW> imageN.jpeg
// Re-skin later by replacing the files in docs/assets/apb-template-images/ (keep the slot aspect ratios)
// and re-running: node scripts/gen-apb-premium-template.mjs
import PizZip from "pizzip";
import { readFileSync, writeFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url).pathname;
const SRC = here("../docs/apb-premium-source.docx");
const IMG = (n) => here(`../docs/assets/apb-template-images/image${n}.jpeg`);
const OUTS = [here("../public/BLB_APB_TEMPLATE.docx"), here("../docs/fee-proposal-apb-template.docx")];

const z = new PizZip(readFileSync(SRC));
for (const n of [1, 2, 3, 4, 5, 6]) {
  z.remove(`word/media/image${n}.png`);
  z.file(`word/media/image${n}.jpeg`, readFileSync(IMG(n)));
}
let rels = z.file("word/_rels/document.xml.rels").asText().replace(/media\/image(\d+)\.png/g, "media/image$1.jpeg");
z.file("word/_rels/document.xml.rels", rels);
let ct = z.file("[Content_Types].xml").asText();
if (!/Extension="jpeg"/.test(ct)) ct = ct.replace("</Types>", `<Default Extension="jpeg" ContentType="image/jpeg"/></Types>`);
z.file("[Content_Types].xml", ct);

// --- Cleanup pass ---
let doc = z.file("word/document.xml").asText();

// (a) Drop EMPTY dusty-blue (#B9CEDB) single-cell banner tables. The one in the source sits INSIDE the
//     {#INCLUSION_SECTIONS} loop, so it rendered as a big empty block before EVERY inclusion category
//     (~10×) — the main "spacing blocks too big" + page bloat. Text/image banners are kept.
doc = doc.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (t) => {
  if (!t.includes("B9CEDB")) return t;
  const hasText = (t.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).some((s) => s.replace(/<[^>]+>/g, "").trim());
  const hasImg = /<w:drawing/.test(t);
  return hasText || hasImg ? t : "";
});

// (b) Trim forced page breaks before SHORT secondary sections so they flow onto the prior page.
//     #2 Document guide, #6 Guarantees, #10 Optional upgrades, #12 Testimonials, #13 Licences,
//     #14 Responsibilities, #15 Exclusions, #18 Next step, #19 Closing summary.
//     #3 Introduction letter is KEPT (APB rapport beat) but de-blanked — drop its break so it flows.
const DROP_BREAKS = new Set([2, 3, 6, 10, 12, 13, 14, 15, 18, 19]);
const segs = doc.split('<w:br w:type="page"/>');
doc = segs.reduce((acc, seg, i) => (i === 0 ? seg : acc + (DROP_BREAKS.has(i) ? "" : '<w:br w:type="page"/>') + seg), "");

// (c-pre) Remove the PC/PS header row (Description | Amount) — the user requested these labels gone.
//         Target: the <w:tr> with <w:tblHeader> that contains "Description" (unique to this table).
doc = doc.replace(
  /<w:tr><w:trPr><w:tblHeader w:val="true"\/><\/w:trPr>(?:(?!<\/w:tr>)[\s\S])*?<w:t>Description<\/w:t>(?:(?!<\/w:tr>)[\s\S])*?<\/w:tr>/,
  ""
);

// (d) Collapse loop-tables from one-table-per-row (header reprinted every row) to a SINGLE table
//     with the loop tags moved into the data row's first/last cells. The previous step (d) that
//     tracked inPcLoop is superseded — PC_SUMS gets the same rowLoop treatment here.
const rowLoop = (d, openTag, closeTag, firstCellTag, lastCellTag) => {
  const esc = (s) => s.replace(/[{}#/]/g, "\\$&");
  const rmPara = (x, tag) => x.replace(new RegExp("<w:p\\b(?:(?!</w:p>)[\\s\\S])*?" + esc(tag) + "(?:(?!</w:p>)[\\s\\S])*?</w:p>"), "");
  d = rmPara(d, openTag);
  d = rmPara(d, closeTag);
  return d.replace(firstCellTag, openTag + firstCellTag).replace(lastCellTag, lastCellTag + closeTag);
};
doc = rowLoop(doc, "{#SUMMARY_ROWS}", "{/SUMMARY_ROWS}", "{CATEGORY_NAME}", "{CATEGORY_COST_GST}");
doc = rowLoop(doc, "{#FEE_SCHEDULE}", "{/FEE_SCHEDULE}", "{STAGE_CLAIM}", "{PERCENTAGE}");
doc = rowLoop(doc, "{#PC_SUMS}", "{/PC_SUMS}", "{PC_DESCRIPTION}", "{PC_AMOUNT}");

// (e) Online PM section — redesign the 3-card feature row:
//     • Expand to 2×3 grid (Progress Photos / Live Schedule / Selections / Variations / Documents / Meetings)
//     • Add a portal-activity checklist
//     • Add a screenshot placeholder frame
//     Identified by the table containing "Selections" (unique at this point in the source).
{
  // Helper: one feature card cell (F4F7F8 bg, blue title, grey description)
  const fc = (title, desc) =>
    `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3278"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tcBorders><w:shd w:fill="F4F7F8"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:start w:w="100" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:end w:w="100" w:type="dxa"/></w:tcMar><w:vAlign w:val="top"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:after="40"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Open Sans" w:hAnsi="Open Sans" w:eastAsia="Open Sans"/><w:b/><w:color w:val="006C9B"/><w:sz w:val="20"/></w:rPr><w:t>${title}</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:spacing w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Open Sans" w:hAnsi="Open Sans" w:eastAsia="Open Sans"/><w:color w:val="4A4A4A"/><w:sz w:val="16"/></w:rPr><w:t>${desc}</w:t></w:r></w:p></w:tc>`;

  const TBLPR = `<w:tblPr><w:tblW w:type="auto" w:w="0"/><w:jc w:val="center"/><w:tblBorders><w:insideH w:val="single" w:sz="2" w:space="0" w:color="D8E6EF"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLook w:firstColumn="1" w:firstRow="0" w:lastColumn="0" w:lastRow="0" w:noHBand="0" w:noVBand="1" w:val="0020"/></w:tblPr><w:tblGrid><w:gridCol w:w="3278"/><w:gridCol w:w="3278"/><w:gridCol w:w="3278"/></w:tblGrid>`;

  const FEATURES_GRID =
    `<w:tbl>${TBLPR}` +
    `<w:tr>${fc("PROGRESS PHOTOS", "Weekly site updates")}${fc("LIVE SCHEDULE", "Track upcoming milestones")}${fc("SELECTIONS", "Approve finishes and fixtures")}</w:tr>` +
    `<w:tr>${fc("VARIATIONS", "Review and sign scope changes")}${fc("DOCUMENTS", "Contracts, plans and certificates")}${fc("MEETINGS", "Book and manage site meetings")}</w:tr>` +
    `</w:tbl>`;

  // Checklist heading
  const CL_HEAD =
    `<w:p><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="Open Sans" w:hAnsi="Open Sans" w:eastAsia="Open Sans"/><w:b/><w:color w:val="2B2B2B"/><w:sz w:val="19"/></w:rPr><w:t>What you can do in the portal:</w:t></w:r></w:p>`;

  // Helper: one checklist table row (left item | right item)
  const clCell = (text) =>
    `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="4917"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders><w:vAlign w:val="top"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="Open Sans" w:hAnsi="Open Sans" w:eastAsia="Open Sans"/><w:b/><w:color w:val="006C9B"/><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">&#x2713; </w:t></w:r>` +
    `<w:r><w:rPr><w:rFonts w:ascii="Open Sans" w:hAnsi="Open Sans" w:eastAsia="Open Sans"/><w:color w:val="2B2B2B"/><w:sz w:val="17"/></w:rPr><w:t>${text}</w:t></w:r>` +
    `</w:p></w:tc>`;

  const clRow = (l, r) => `<w:tr>${clCell(l)}${clCell(r)}</w:tr>`;

  const CHECKLIST =
    CL_HEAD +
    `<w:tbl><w:tblPr><w:tblW w:type="auto" w:w="0"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4917"/><w:gridCol w:w="4917"/></w:tblGrid>` +
    clRow("View weekly site updates", "Approve selections and finishes") +
    clRow("Review progress photos", "Sign off on variations digitally") +
    clRow("Track budget changes in real time", "Access plans, contracts and certificates") +
    clRow("Book and manage site meetings", "Communicate directly with the Blue Leaf team") +
    `</w:tbl>`;

  // Screenshot placeholder — bordered frame with instructional label
  const SCREENSHOT_PH =
    `<w:p><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr></w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:type="auto" w:w="0"/><w:jc w:val="center"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="006C9B"/><w:left w:val="single" w:sz="6" w:space="0" w:color="006C9B"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="006C9B"/><w:right w:val="single" w:sz="6" w:space="0" w:color="006C9B"/></w:tblBorders>` +
    `</w:tblPr><w:tblGrid><w:gridCol w:w="9835"/></w:tblGrid>` +
    `<w:tr><w:trPr><w:trHeight w:val="1700" w:hRule="atLeast"/></w:trPr>` +
    `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="9835"/><w:shd w:fill="EBF3F8"/><w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Open Sans" w:hAnsi="Open Sans" w:eastAsia="Open Sans"/><w:b/><w:color w:val="006C9B"/><w:sz w:val="24"/></w:rPr><w:t>Blue Leaf Client Portal</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Open Sans" w:hAnsi="Open Sans" w:eastAsia="Open Sans"/><w:i/><w:color w:val="6B6B6B"/><w:sz w:val="16"/></w:rPr><w:t>[ Replace with portal screenshot before sending ]</w:t></w:r></w:p>` +
    `</w:tc></w:tr></w:tbl>`;

  doc = doc.replace(
    /<w:tbl>(?:(?!<\/w:tbl>)[\s\S])*?Selections(?:(?!<\/w:tbl>)[\s\S])*?<\/w:tbl>/,
    FEATURES_GRID + CHECKLIST + SCREENSHOT_PH
  );
}

// (f) Density pass — layout spacing only, no content/merge changes:
//   - Blue divider bars: the empty 006C9B cells render a ~14pt block. Replace their empty paragraph
//     with a ~4.5pt exact-height line so each becomes a thin brand rule.
doc = doc.replace(
  /(<w:tc><w:tcPr>(?:(?!<\/w:tc>)[\s\S])*?006C9B(?:(?!<\/w:tc>)[\s\S])*?<\/w:tcPr>)<w:p\/>(<\/w:tc>)/g,
  '$1<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="90" w:lineRule="exact"/><w:rPr><w:sz w:val="6"/></w:rPr></w:pPr></w:p>$2'
);
//   - Cell padding: tcMar 220tw (11pt) is too loose → 100tw (5pt) compact.
doc = doc.replace(/<w:(top|bottom|start|end) w:w="220" w:type="dxa"\/>/g, '<w:$1 w:w="100" w:type="dxa"/>');

// (g) Remove lead empty <w:p/> from table cells. Every source cell has </w:tcPr><w:p/><w:p content>
//     which adds ~6pt of dead top space. Remove when the empty paragraph is followed by real content.
doc = doc.replace(/<\/w:tcPr><w:p\/><w:p\b/g, "</w:tcPr><w:p");

// (h) Top-align all table cells — prevents content floating to vertical centre in tall rows.
doc = doc.replace(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/g, (match, inner) => {
  if (inner.includes("w:vAlign")) return match;
  return `<w:tcPr>${inner}<w:vAlign w:val="top"/></w:tcPr>`;
});

// (i) Reduce paragraph spacing inside tables.
//     after="120" (6pt) → after="40" (2pt) and after="200" (10pt) → after="60" (3pt).
//     Operates only inside <w:tbl>…</w:tbl> to leave body-level breathing room untouched.
doc = doc.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (t) =>
  t.replace(/w:after="120"/g, 'w:after="40"').replace(/w:after="200"/g, 'w:after="60"')
);

// (c) Footer: make ALL footer elements brand blue #006C9B (was mixed with grey #6B6B6B).
for (const fn of Object.keys(z.files).filter((n) => /word\/footer\d+\.xml/.test(n))) {
  z.file(fn, z.file(fn).asText().replace(/6B6B6B/g, "006C9B"));
}

z.file("word/document.xml", doc);
const buf = z.generate({ type: "nodebuffer", compression: "DEFLATE" });
for (const out of OUTS) writeFileSync(out, buf);
console.log(`Wrote premium APB template (${(buf.length / 1024).toFixed(0)}KB) → ${OUTS.map((o) => o.split("/").slice(-2).join("/")).join(", ")}`);
