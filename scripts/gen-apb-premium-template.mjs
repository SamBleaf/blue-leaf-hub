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

// --- Cleanup pass (review feedback 2026-06-21: 37pp too long, dusty-blue spacers too big) ---
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

// (b) Trim forced page breaks before SHORT secondary sections so they flow onto the prior page
//     (premium ≠ one page per minor section). Indices are 1-based in document order; see the section
//     map in the build notes. Major chapters (cover, overview, intro, scope, why-build, online-pm,
//     inclusions, prime-cost, schedule, quote-summary, fee-schedule, back-cover) keep their breaks.
//     #2 Document guide, #6 Guarantees, #10 Optional upgrades, #12 Testimonials, #13 Licences,
//     #14 Responsibilities, #15 Exclusions, #18 Next step, #19 Closing summary.
const DROP_BREAKS = new Set([2, 6, 10, 12, 13, 14, 15, 18, 19]);
const segs = doc.split('<w:br w:type="page"/>');
doc = segs.reduce((acc, seg, i) => (i === 0 ? seg : acc + (DROP_BREAKS.has(i) ? "" : '<w:br w:type="page"/>') + seg), "");
z.file("word/document.xml", doc);

// (d) Drop the "Description"/"Amount" header paragraphs that sit INSIDE the {#PC_SUMS} loop — they
//     reprinted before every PC/PS line. Scoped to the loop so other tables keep their headers.
{
  let inPcLoop = false;
  doc = doc.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
    const txt = (para.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, "")).join("").trim();
    if (txt.includes("{#PC_SUMS}")) { inPcLoop = true; return para; }
    if (txt.includes("{/PC_SUMS}")) { inPcLoop = false; return para; }
    if (inPcLoop && (txt === "Description" || txt === "Amount")) return "";
    return para;
  });
}
z.file("word/document.xml", doc);

// (c) Footer: recolor the "Building" word to brand blue (was grey #6B6B6B).
for (const fn of Object.keys(z.files).filter((n) => /word\/footer\d+\.xml/.test(n))) {
  let fx = z.file(fn).asText();
  fx = fx.replace(/<w:r\b[\s\S]*?<\/w:r>/g, (run) => (/<w:t[^>]*>Building<\/w:t>/.test(run) ? run.replace(/6B6B6B/g, "006C9B") : run));
  z.file(fn, fx);
}

const buf = z.generate({ type: "nodebuffer", compression: "DEFLATE" });
for (const out of OUTS) writeFileSync(out, buf);
console.log(`Wrote premium APB template (${(buf.length / 1024).toFixed(0)}KB) → ${OUTS.map((o) => o.split("/").slice(-2).join("/")).join(", ")}`);
