// Design-time tool. Builds public/templates/blb-tender-notes-template.docx from the approved Architect Brief template, so the
// internal Tender Notes share its logo, title block, metadata grid, callout, table style and footer without a second design.
// Needs no new dependency. Run: node scripts/documents/build-tender-notes-template.mjs
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public/templates");
const zip = new PizZip(fs.readFileSync(join(DIR, "blb-architect-brief-template.docx")));
const xml = zip.file("word/document.xml").asText();

const bodyStart = xml.indexOf("<w:body>") + "<w:body>".length;
const bodyEnd = xml.indexOf("</w:body>");
const parts = [];
let pos = bodyStart;
while (pos < bodyEnd) {
  const close = xml.startsWith("<w:tbl>", pos) ? "</w:tbl>" : xml.startsWith("<w:sectPr", pos) ? "</w:sectPr>" : "</w:p>";
  const selfClosing = /^<w:p\/>/.test(xml.slice(pos, pos + 6));
  const end = selfClosing ? pos + 6 : xml.indexOf(close, pos) + close.length;
  parts.push(xml.slice(pos, end));
  pos = end;
}
const at = (needle) => { const i = parts.findIndex((p) => p.includes(needle)); if (i < 0) throw new Error(`template has no ${needle}`); return i; };
const callout = at("{CALLOUT_BODY}");
const heading = parts[at("Priority coordination actions")];
const openTag = parts[at("{#ACTIONS_INTRO}")];
const intro = parts[at("{PARA_TEXT}")];
const closeTag = parts[at("{/ACTIONS_INTRO}")];
const table = parts[at("{#ACTIONS}")];
const sect = parts[parts.length - 1];
if (!sect.startsWith("<w:sectPr")) throw new Error("expected the section properties last");

const WIDTHS = [850, 1500, 4252, 1300, 1850];
const cellsOf = (row) => row.match(/<w:tc>.*?<\/w:tc>/gs);
const withWidth = (cell, w) => cell.replace(/<w:tcW [^>]*\/>/, `<w:tcW w:type="dxa" w:w="${w}"/>`);
const rows = table.match(/<w:tr[ >].*?<\/w:tr>/gs);
if (rows.length !== 2) throw new Error(`expected a header row and a data row, found ${rows.length}`);
const rebuild = (row, order) => { const open = row.slice(0, row.indexOf("<w:tc>")); return `${open}${order.map((c, i) => withWidth(c, WIDTHS[i])).join("")}</w:tr>`; };

const [hId, hWhat, hArea, hStatus] = cellsOf(rows[0]);
const header = rebuild(rows[0], [hId, hArea.replace(">Owner<", ">Area<"), hWhat.replace(">Required action<", ">What<"), hStatus, hStatus.replace(">Status<", ">Note / next step<")]);
const [dId, dText, dArea, dStatus] = cellsOf(rows[1]);
const closeRun = dStatus.match(/<w:r>(?:(?!<w:r>).)*?\{\/ACTIONS\}.*?<\/w:r>/s)[0];
const data = rebuild(rows[1], [dId.replace("{#ACTIONS}", "{#ROWS}"), dArea.replace("{OWNER}", "{AREA}"), dText.replace("{ACTION}", "{TEXT}"), dStatus.replace(closeRun, ""), dStatus.replace("{STATUS}", "{NOTE}").replace("{/ACTIONS}", "{/ROWS}")]);
const grid = `<w:tblGrid>${WIDTHS.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
const newTable = table.slice(0, table.indexOf("<w:tr")).replace(/<w:tblGrid>.*?<\/w:tblGrid>/s, grid) + header + data + "</w:tbl>";

const body = [
  ...parts.slice(0, callout + 1),
  openTag.replace("{#ACTIONS_INTRO}", "{#SECTIONS}"),
  heading.replace(">01  <", ">{SEC_NUM}  <").replace(">Priority coordination actions<", ">{SEC_TITLE}<"),
  intro.replace("{PARA_TEXT}", "{SEC_INTRO}"),
  newTable,
  closeTag.replace("{/ACTIONS_INTRO}", "{/SECTIONS}"),
  sect,
].join("");

zip.file("word/document.xml", xml.slice(0, bodyStart) + body + xml.slice(bodyEnd));
const out = join(DIR, "blb-tender-notes-template.docx");
fs.writeFileSync(out, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("wrote", out);
