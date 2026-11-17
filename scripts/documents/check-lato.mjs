// check-lato.mjs — can this machine's LibreOffice print Lato through the Hub's real DOCX→PDF path?
//
//   node scripts/documents/check-lato.mjs [--json]
//
// Exit 0 when the test PDF embeds Lato-Regular, Lato-Bold and Lato-Italic; 1 otherwise. The same check the API logs
// once per boot on Railway ("[document-fonts] …"). No database, no network, nothing stored.
import { checkLatoRendering, latoCheckLine } from "../../server/lib/documentFonts.mjs";

const r = await checkLatoRendering();
console.log(latoCheckLine(r));
if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);
