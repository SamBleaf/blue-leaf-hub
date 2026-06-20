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

const buf = z.generate({ type: "nodebuffer", compression: "DEFLATE" });
for (const out of OUTS) writeFileSync(out, buf);
console.log(`Wrote premium APB template (${(buf.length / 1024).toFixed(0)}KB) → ${OUTS.map((o) => o.split("/").slice(-2).join("/")).join(", ")}`);
