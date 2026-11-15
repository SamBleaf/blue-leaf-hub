// documentFonts.mjs — can LibreOffice on this server print the Lato the document templates use?
// Converts a three-line DOCX (Lato Regular, Bold, Italic) through the same convertDocxToPdfBuffer path as every real
// document, then reads which fonts the PDF embeds. Used for one startup log line on Railway (dev-api.mjs) and by
// `node scripts/documents/check-lato.mjs`. It reports font names, timing and a short reason: no document data, no secrets.
import PizZip from "pizzip";
import { convertDocxToPdfBuffer, findSoffice, pdfFontNames } from "./docxToPdf.mjs";

export const LATO_FACES = ["Lato-Regular", "Lato-Bold", "Lato-Italic"];

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** A minimal DOCX: one paragraph each in Lato Regular, Bold and Italic. */
export function latoProbeDocx() {
  const para = (text, props = "") =>
    `<w:p><w:r><w:rPr><w:rFonts w:ascii="Lato" w:hAnsi="Lato" w:cs="Lato" w:eastAsia="Lato"/>${props}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `${XML}<w:document xmlns:w="${W}"><w:body>`
    + para("Blue Leaf font check, Lato Regular") + para("Lato Bold", "<w:b/>") + para("Lato Italic", "<w:i/>")
    + `</w:body></w:document>`);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/** { ok, reason, fonts, missing, ms }: ok when the PDF embeds Lato-Regular, Lato-Bold and Lato-Italic. Never throws. */
export async function checkLatoRendering() {
  const started = Date.now();
  const done = (r) => ({ ...r, ms: Date.now() - started });
  try {
    if (!(await findSoffice())) return done({ ok: false, reason: "LibreOffice was not found", fonts: [], missing: LATO_FACES });
    const fonts = pdfFontNames(await convertDocxToPdfBuffer(latoProbeDocx()));
    const missing = LATO_FACES.filter((f) => !fonts.includes(f));
    return done({ ok: missing.length === 0, reason: missing.length ? `missing ${missing.join(", ")}` : null, fonts, missing });
  } catch (e) {
    return done({ ok: false, reason: `the test conversion failed (${String(e?.message || e).split("\n")[0].slice(0, 160)})`, fonts: [], missing: LATO_FACES });
  }
}

export function latoCheckLine(r) {
  if (r.ok) return `[document-fonts] Lato OK: LibreOffice embeds ${r.fonts.join(", ")} (${r.ms} ms)`;
  const got = r.fonts?.length ? `; the PDF embeds ${r.fonts.join(", ")}` : "";
  return `[document-fonts] Lato NOT AVAILABLE: ${r.reason}${got}. Documents converted on this server will not be in Lato (register documents are refused).`;
}
