// docTemplates.mjs — the ONE canonical document renderer for the whole app.
//
// A hand-designed DOCX template (single-brace {VAR} merge fields + {#SECTION}…{/SECTION} loops) +
// a merge-data object → a filled DOCX buffer. Extracted verbatim from the fee-proposal generator
// (module5Routes) so every document type (fee proposal, concept agreement, …) renders identically:
// design the layout once in Word/Docs, drop the {fields} in, and it fills the same way every time.
//
// The filled DOCX is then uploaded to Google Docs (googleDriveClient.uploadDocxToDrive) for final
// edits, and optionally exported to PDF (exportDriveFileAsPdf) + emailed — see salesDocuments.mjs.

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import expressions from "angular-expressions";

/**
 * angular-expressions parser that merges the full scope list (so nested loop scopes resolve).
 * Verbatim from module5Routes so behaviour is identical across all documents.
 */
export function makeAngularParser(tag) {
  if (tag === ".") return { get: (s) => s };
  const expr = expressions.compile(tag.replace(/(’|‘)/g, "'").replace(/(“|”)/g, '"'));
  return {
    get(scope, context) {
      let obj = {};
      const list = context.scopeList;
      for (let i = 0; i <= context.num; i++) Object.assign(obj, list[i]);
      return expr(scope, obj);
    },
  };
}

/**
 * Normalise a DOCX so docxtemplater can parse it reliably:
 *  - {{VAR}} (double-brace) → {VAR} (single-brace) across document/header/footer XML,
 *  - optional per-document header rewrite (e.g. the fee proposal's ">Quote NNNN<" → "{QUOTE_NUMBER}").
 */
export function normaliseDocxTemplate(zip, { transformHeaderXml } = {}) {
  const xmlFiles = Object.keys(zip.files).filter(
    (n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n) && !zip.files[n].dir
  );
  for (const name of xmlFiles) {
    let text = zip.files[name].asText();
    text = text.replace(/\{\{([A-Z_][A-Z_0-9]*)\}\}/g, "{$1}");
    if (name.includes("header") && typeof transformHeaderXml === "function") text = transformHeaderXml(text);
    zip.file(name, text);
  }
  return zip;
}

/**
 * The canonical render: DOCX template bytes (Buffer|Uint8Array|base64 string) + merge data → filled
 * DOCX Buffer. `opts.transformHeaderXml` is an optional per-document header rewrite.
 * Throws docxtemplater errors (the caller surfaces `e.properties.errors` for a helpful message).
 */
export function renderDocxTemplate(templateBytes, data, { transformHeaderXml } = {}) {
  const buf = Buffer.isBuffer(templateBytes)
    ? templateBytes
    : typeof templateBytes === "string"
      ? Buffer.from(templateBytes, "base64")
      : Buffer.from(templateBytes);
  const zip = normaliseDocxTemplate(new PizZip(buf), { transformHeaderXml });
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: makeAngularParser,
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
