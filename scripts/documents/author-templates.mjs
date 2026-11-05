// Authors the R04 redesign — matches the approved Blue Leaf mock-up kit (00–04). Design-time tool only;
// RUNTIME engine stays docTemplates.renderDocxTemplate (text-only docxtemplater, no image/style module).
// R04 changes vs R03:
//   1. Architect brief — deliberate pagination: tight single-page layout; the Design register moves to its
//      own page ({#ARCH_BREAK}) only for genuinely long briefs.
//   2. Client brief — no blank photo placeholder; a composed closing page (process stage band + working
//      assumptions + status callout) so both pages are intentional.
//   3. Technical Selection Register — A4 LANDSCAPE with properly sized columns.
//   4. Two selection documents — editorial Client Selections Presentation (mock-up 03) beside the dense
//      Technical register (mock-up 04); both built from the same selections data.
//   5. Real approved Blue Leaf logo embedded in every header (not typed branding).
import fs from "fs";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, PageBreak, PageOrientation,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, Footer, PageNumber,
  Tab, TabStopType, AlignmentType, VerticalAlign,
} from "docx";

const REPO = "/Users/samuelmorris/Desktop/blue-leaf-hub.nosync";
const OUT = `${REPO}/public/templates`;
fs.mkdirSync(OUT, { recursive: true });

// Real approved logo (3320×1512, black wordmark + blue leaf, transparent) — embedded at authoring time.
const LOGO = fs.readFileSync(`${REPO}/public/brand/logo-black.png`);
const LOGO_W = 132, LOGO_H = Math.round(LOGO_W * (1512 / 3320)); // 60

// ── Brand tokens (sampled from the approved mock-up .docx) ──────────────────
const FONT = "Lato";
const NAVY = "142B39", BLUE = "006C9B", INK = "24343D", GREY = "62737D", BAND = "E9F0F3", SURF = "F3F6F6", HAIR = "D7DCDF", WHITE = "FFFFFF";
const SZ = { crumb: 16, label: 17, title: 64, tag: 24, mLbl: 15, mVal: 21, hNum: 17, h1: 30, body: 21, tbl: 17, small: 15, micro: 14 };
const MARGIN = { top: 760, bottom: 700, left: 1077, right: 1077 };
const MARGIN_L = { top: 680, bottom: 600, left: 1077, right: 1077 };
const CW = 11906 - MARGIN.left - MARGIN.right;        // 9752  (A4 portrait)
const CW_L = 16838 - MARGIN_L.left - MARGIN_L.right;  // 14684 (A4 landscape)
const COL4 = [900, 5300, 1900, 1652];                 // shared ID/action/owner/status table

const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: o.size || SZ.body, color: o.color || INK, bold: !!o.bold, italics: !!o.italics, allCaps: !!o.caps, characterSpacing: o.spacing });
const P = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children],
  spacing: { before: o.before ?? 0, after: o.after ?? 56, line: o.line ?? 240 }, alignment: o.align, keepNext: o.keepNext, keepLines: o.keepLines !== false, widowControl: true, border: o.border, shading: o.shading, indent: o.indent });
const nb = () => ({ style: BorderStyle.NONE, size: 0, color: WHITE });
const line = (c = HAIR, sz = 2) => ({ style: BorderStyle.SINGLE, size: sz, color: c });
const noBorders = () => ({ top: nb(), bottom: nb(), left: nb(), right: nb(), insideHorizontal: nb(), insideVertical: nb() });

function cell(children, w, o = {}) {
  return new TableCell({ width: { size: w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: o.pad ?? 46, bottom: o.pad ?? 46, left: o.px ?? 120, right: o.px ?? 120 },
    verticalAlign: o.va || VerticalAlign.CENTER, columnSpan: o.span, borders: o.borders,
    children: Array.isArray(children) ? children : [children] });
}

function header(cw = CW) {
  const left = new TableCell({ width: { size: Math.round(cw * 0.5), type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.BOTTOM,
    children: [ new Paragraph({ spacing: { after: 0 }, children: [ new ImageRun({ type: "png", data: LOGO, transformation: { width: LOGO_W, height: LOGO_H } }) ] }) ] });
  const right = new TableCell({ width: { size: cw - Math.round(cw * 0.5), type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.BOTTOM,
    children: [ new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [ run("{BREADCRUMB}", { size: SZ.crumb, color: GREY, caps: true, spacing: 20 }) ] }) ] });
  const tbl = new Table({ width: { size: cw, type: WidthType.DXA }, columnWidths: [Math.round(cw * 0.5), cw - Math.round(cw * 0.5)], borders: noBorders(), rows: [ new TableRow({ children: [left, right] }) ] });
  return [ tbl, new Paragraph({ spacing: { before: 54, after: 0 }, border: { bottom: line(BLUE, 10) }, children: [ run("", { size: 2 }) ] }) ];
}
function titleBlock() {
  return [
    P(run("{SECTION_LABEL}", { size: SZ.label, bold: true, color: BLUE, caps: true, spacing: 20 }), { before: 140, after: 36 }),
    new Paragraph({ spacing: { before: 0, after: 8 }, children: [ run("{DOC_TITLE}", { size: SZ.title, bold: true, color: NAVY }) ] }),
    P(run("{TAGLINE}", { size: SZ.tag, color: GREY }), { after: 110 }),
  ];
}
function metaGrid(cw = CW) {
  const half = Math.round(cw / 2);
  const mkCell = (lTag, vTag, openTag, closeTag) => cell([
    P([ openTag ? run(openTag, { size: SZ.mLbl }) : run("", { size: SZ.mLbl }), run(`{${lTag}}`, { size: SZ.mLbl, color: GREY, caps: true, spacing: 16 }) ], { after: 8, line: 196 }),
    P([ run(`{${vTag}}`, { size: SZ.mVal, color: INK }), closeTag ? run(closeTag, { size: SZ.mVal }) : run("", { size: 2 }) ], { after: 0, line: 216 }),
  ], half, { pad: 30, px: 0, borders: { bottom: line(HAIR, 2), top: nb(), left: nb(), right: nb() }, va: VerticalAlign.TOP });
  const row = new TableRow({ children: [ mkCell("LA", "VA", "{#META_ROWS}", null), mkCell("LB", "VB", null, "{/META_ROWS}") ] });
  return new Table({ width: { size: cw, type: WidthType.DXA }, columnWidths: [half, cw - half], borders: noBorders(), rows: [row] });
}
function h1(num, text) {
  return new Paragraph({ spacing: { before: 130, after: 44 }, keepNext: true, keepLines: true, border: { bottom: line(HAIR, 3) },
    children: [ run(num + "  ", { size: SZ.hNum, bold: true, color: BLUE }), run(text, { size: SZ.h1, bold: true, color: NAVY }) ] });
}
function h1var(numTag, textTag) {
  return new Paragraph({ spacing: { before: 140, after: 44 }, keepNext: true, keepLines: true, border: { bottom: line(HAIR, 3) },
    children: [ run(`{${numTag}}  `, { size: SZ.hNum, bold: true, color: BLUE }), run(`{${textTag}}`, { size: SZ.h1, bold: true, color: NAVY }) ] });
}
const tagPara = (t) => new Paragraph({ spacing: { after: 0, line: 196 }, children: [ run(`{${t}}`, { size: 2 }) ] });
const spacer = (after = 40) => new Paragraph({ spacing: { after, line: 120 }, children: [ run("", { size: 2 }) ] });
function bulletLoop(tag, o = {}) {
  return [ tagPara(`#${tag}`), new Paragraph({ bullet: { level: 0 }, spacing: { after: 24, line: 232 }, keepLines: true, children: [ run("{ITEM_TEXT}", { size: o.size || SZ.body }) ] }), tagPara(`/${tag}`) ];
}
function paraLoop(tag, field) { return [ tagPara(`#${tag}`), P(run(`{${field}}`)), tagPara(`/${tag}`) ]; }
function refLoop(tag) {
  return [ tagPara(`#${tag}`), new Paragraph({ spacing: { after: 30, line: 232 }, keepLines: true, indent: { left: 120 },
    children: [ run("{REF_ID}", { size: SZ.body, bold: true, color: BLUE }), run("   ", { size: SZ.body }), run("{REF_TEXT}", { size: SZ.body, color: INK }) ] }), tagPara(`/${tag}`) ];
}
function callout(labelTag, bodyTag, cw = CW) {
  return new Table({ width: { size: cw, type: WidthType.DXA }, columnWidths: [cw], borders: noBorders(),
    rows: [ new TableRow({ children: [ new TableCell({ width: { size: cw, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: BAND, color: "auto" },
      borders: { left: { style: BorderStyle.SINGLE, size: 20, color: BLUE }, top: nb(), bottom: nb(), right: nb() }, margins: { top: 70, bottom: 70, left: 150, right: 150 },
      children: [ P(run(`{${labelTag}}`, { size: SZ.label, bold: true, color: BLUE, caps: true, spacing: 16 }), { after: 26 }), P(run(`{${bodyTag}}`, { size: SZ.body, color: INK }), { after: 0 }) ] }) ] }) ] });
}
function intentionBand() {
  const w = Math.round(CW / 3);
  const mk = (n) => cell([ P(run(`{INT${n}_NUM}`, { size: SZ.body, bold: true, color: BLUE }), { after: 18 }),
    P(run(`{INT${n}_LABEL}`, { size: SZ.body, bold: true, color: NAVY, caps: true, spacing: 16 }), { after: 20 }),
    P(run(`{INT${n}_TEXT}`, { size: SZ.small, color: GREY }), { after: 0 }) ], w, { pad: 56, fill: SURF, va: VerticalAlign.TOP });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [w, w, CW - 2 * w], borders: { top: line(BLUE, 10), bottom: nb(), left: nb(), right: nb(), insideHorizontal: nb(), insideVertical: nb() },
    rows: [ new TableRow({ children: [mk(1), mk(2), mk(3)] }) ] });
}
// Blue Leaf process path (Concept → PTSA → Design → Pricing → Contract); first stage highlighted.
function stageBand() {
  const w = Math.round(CW / 5);
  const mk = (n) => { const hot = n === 1; return cell([
    P(run(`{PROC${n}_NUM}`, { size: SZ.micro, bold: true, color: hot ? WHITE : BLUE }), { after: 22, line: 190 }),
    P(run(`{PROC${n}_LABEL}`, { size: SZ.small, bold: true, color: hot ? WHITE : NAVY, caps: true, spacing: 14 }), { after: 14, line: 196 }),
    P(run(`{PROC${n}_NOTE}`, { size: SZ.micro, color: hot ? "CFE0E9" : GREY }), { after: 0, line: 186 }),
  ], n === 5 ? CW - 4 * w : w, { pad: 54, fill: hot ? NAVY : SURF, va: VerticalAlign.TOP }); };
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [w, w, w, w, CW - 4 * w],
    borders: { top: line(BLUE, 10), bottom: nb(), left: nb(), right: nb(), insideHorizontal: nb(), insideVertical: line(WHITE, 8) },
    rows: [ new TableRow({ children: [mk(1), mk(2), mk(3), mk(4), mk(5)] }) ] });
}
function darkTable(headers, widths, { grouped = false, groupTag = "GROUPS", itemTag = "ITEMS", fields, idCol = true }) {
  const TW = widths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({ tableHeader: true, cantSplit: true,
    children: headers.map((h, i) => cell(P(run(h, { size: SZ.tbl, bold: true, color: WHITE, caps: true, spacing: 14 }), { after: 0 }), widths[i], { fill: NAVY, pad: 52 })) });
  const rows = [headerRow];
  if (grouped) {
    rows.push(new TableRow({ cantSplit: true, children: [ cell(P([ run(`{#${groupTag}}`, { size: SZ.tbl }), run("{GROUP_NAME}", { size: SZ.tbl, bold: true, color: BLUE, caps: true, spacing: 16 }) ], { after: 0 }), TW, { fill: BAND, span: headers.length, pad: 40 }) ] }));
  }
  const loop = grouped ? itemTag : groupTag;
  const dataRow = new TableRow({ cantSplit: true, children: fields.map((f, i) => {
    const kids = [];
    if (i === 0) kids.push(run(`{#${loop}}`, { size: SZ.tbl }));
    kids.push(run(`{${f}}`, { size: SZ.tbl, bold: i === 0 && idCol, color: i === 0 && idCol ? BLUE : INK }));
    if (i === fields.length - 1) { kids.push(run(`{/${loop}}`, { size: SZ.tbl })); if (grouped) kids.push(run(`{/${groupTag}}`, { size: SZ.tbl })); }
    return cell(P(kids, { after: 0, line: 224 }), widths[i], { va: VerticalAlign.TOP, pad: 42 });
  }) });
  rows.push(dataRow);
  return new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: widths,
    borders: { top: nb(), bottom: line(HAIR), left: nb(), right: nb(), insideHorizontal: line("E6EAEC"), insideVertical: nb() }, rows });
}
function mkFooter(cw) {
  return new Footer({ children: [ new Paragraph({ tabStops: [ { type: TabStopType.CENTER, position: cw / 2 }, { type: TabStopType.RIGHT, position: cw } ], border: { top: line(HAIR, 3) }, spacing: { before: 36 },
    children: [ run("BLUE LEAF BUILDING", { size: SZ.small, color: GREY, caps: true, spacing: 14 }), new TextRun({ children: [ new Tab() ] }), run("{FOOTER_MID}", { size: SZ.small, color: GREY }),
      new TextRun({ children: [ new Tab() ] }), run("PAGE ", { size: SZ.small, color: GREY, caps: true, spacing: 10 }), new TextRun({ children: [ PageNumber.CURRENT ], font: FONT, size: SZ.small, color: GREY }), run(" / ", { size: SZ.small, color: GREY }), new TextRun({ children: [ PageNumber.TOTAL_PAGES ], font: FONT, size: SZ.small, color: GREY }) ] }) ] });
}
function makeDoc(children, { landscape = false } = {}) {
  const page = landscape
    ? { margin: MARGIN_L, size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE } }
    : { margin: MARGIN };
  return new Document({ creator: "Blue Leaf Building", styles: { default: { document: { run: { font: FONT, size: SZ.body, color: INK } } } },
    sections: [ { properties: { page }, footers: { default: mkFooter(landscape ? CW_L : CW) }, children } ] });
}

// ════════ 01 CLIENT PROJECT BRIEF (no photo; composed closing) ════════
const clientBrief = makeDoc([
  ...header(), ...titleBlock(), metaGrid(),
  h1("00", "The project in one minute"), ...paraLoop("SUMMARY_PARAS", "PARA_TEXT"),
  intentionBand(),
  h1("01", "Scope & boundaries"),
  P(run("Included", { bold: true, color: INK }), { before: 36, after: 14, keepNext: true }), ...bulletLoop("SCOPE_IN"),
  P(run("Not in the current scope", { bold: true, color: INK }), { before: 26, after: 14, keepNext: true }), ...bulletLoop("SCOPE_OUT"),
  h1("02", "Design direction"),
  tagPara("#PREFERENCE_GROUPS"),
  P(run("{GROUP_NAME}", { bold: true, color: BLUE, caps: true, spacing: 14, size: SZ.small }), { before: 34, after: 16, keepNext: true }),
  ...bulletLoop("ITEMS"),
  tagPara("/PREFERENCE_GROUPS"),
  tagPara("#CB_BREAK"), new Paragraph({ children: [ new PageBreak() ] }), tagPara("/CB_BREAK"),
  h1("03", "Key questions to resolve"),
  darkTable(["ID", "Required action", "Owner", "Status"], COL4, { fields: ["REF_ID", "ACTION", "OWNER", "STATUS"], groupTag: "QUESTIONS" }),
  h1("04", "What happens next"), ...paraLoop("NEXT_STEPS_PARAS", "PARA_TEXT"),
  tagPara("#HAS_PROCESS"), spacer(26), stageBand(), tagPara("/HAS_PROCESS"),
  h1("05", "Working assumptions"), ...bulletLoop("ASSUMPTIONS"),
  spacer(24), callout("CLOSE_LABEL", "CLOSE_BODY"),
]);

// ════════ 02 ARCHITECT DESIGN BRIEF (tight single page; register breaks only when long) ════════
const architectBrief = makeDoc([
  ...header(), ...titleBlock(), metaGrid(),
  callout("CALLOUT_LABEL", "CALLOUT_BODY"),
  h1("01", "Priority coordination actions"), ...paraLoop("ACTIONS_INTRO", "PARA_TEXT"),
  darkTable(["ID", "Required action", "Owner", "Status"], COL4, { fields: ["REF_ID", "ACTION", "OWNER", "STATUS"], groupTag: "ACTIONS" }),
  h1("02", "Confirmed project requirements"), ...refLoop("CONFIRMED_REQS"),
  h1("03", "Indicative preferences"), ...paraLoop("PREFERENCES", "PARA_TEXT"),
  tagPara("#ARCH_BREAK"), new Paragraph({ children: [ new PageBreak() ] }), tagPara("/ARCH_BREAK"),
  h1("04", "Design register"),
  darkTable(["ID", "Location", "Current direction", "Status", "Required response", "Dwg"],
    [900, 1380, 2500, 1240, 2080, 1652], { grouped: true, fields: ["REF_ID", "LOCATION", "DIRECTION", "STATUS", "RESPONSE", "DWG"] }),
  tagPara("#HAS_REFS"),
  h1("05", "Referenced documents"),
  ...bulletLoop("REFERENCES"),
  tagPara("/HAS_REFS"),
]);

// ════════ 03 CLIENT SELECTIONS PRESENTATION (editorial) ════════
function paletteTable() {
  const w = Math.round(CW / 4);
  const mk = (n) => cell([
    P(run(`{TILE${n}_AREA}`, { size: SZ.small, bold: true, color: BLUE, caps: true, spacing: 16 }), { after: 40, line: 196 }),
    P(run(`{TILE${n}_NAME}`, { size: SZ.body, bold: true, color: INK }), { after: 10 }),
    P(run(`{TILE${n}_NOTE}`, { size: SZ.small, color: GREY }), { after: 0 }),
  ], n === 4 ? CW - 3 * w : w, { pad: 64, fill: SURF, va: VerticalAlign.TOP });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [w, w, w, CW - 3 * w],
    borders: { top: line(BLUE, 10), bottom: nb(), left: nb(), right: nb(), insideHorizontal: nb(), insideVertical: line(WHITE, 8) },
    rows: [ new TableRow({ children: [mk(1), mk(2), mk(3), mk(4)] }) ] });
}
function cardTable() {
  const leftW = 1760, rightW = CW - leftW;
  const left = cell([
    P([ run("{#ITEMS}", { size: 2 }), run("{REF_ID}", { size: SZ.body, bold: true, color: BLUE }) ], { after: 8, line: 216 }),
    P(run("{CAT}", { size: SZ.small, color: GREY, caps: true, spacing: 14 }), { after: 0, line: 196 }),
  ], leftW, { fill: SURF, va: VerticalAlign.TOP, pad: 80 });
  const right = cell([
    P(run("{NAME}", { size: SZ.body, bold: true, color: NAVY }), { after: 12, line: 224 }),
    P(run("{DESC}", { size: SZ.small, color: INK }), { after: 14, line: 230 }),
    P([ run("{STATUS}", { size: SZ.small, bold: true, color: BLUE, caps: true, spacing: 12 }), run("   /   ", { size: SZ.small, color: GREY }), run("{SOURCE}", { size: SZ.small, color: GREY }), run("{/ITEMS}", { size: 2 }) ], { after: 0, line: 216 }),
  ], rightW, { va: VerticalAlign.TOP, pad: 80, borders: { top: line(HAIR, 2), bottom: line(HAIR, 2), left: nb(), right: line(HAIR, 2) } });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [leftW, rightW],
    borders: { top: line(HAIR, 2), bottom: line(HAIR, 2), left: line(HAIR, 2), right: nb(), insideHorizontal: nb(), insideVertical: nb() },
    rows: [ new TableRow({ cantSplit: true, children: [left, right] }) ] });
}
const clientPresentation = makeDoc([
  ...header(), ...titleBlock(),
  P(run("{SUBLINE}", { size: SZ.body, color: GREY }), { after: 110 }),
  h1("00", "The material approach"), ...paraLoop("APPROACH_PARAS", "PARA_TEXT"),
  tagPara("#HAS_PALETTE"), paletteTable(), tagPara("/HAS_PALETTE"),
  spacer(50), callout("READ_LABEL", "READ_BODY"),
  tagPara("#AREAS"),
  h1var("AREA_NUM", "AREA_NAME"),
  P(run("{AREA_TAGLINE}", { size: SZ.small, color: GREY }), { after: 60 }),
  cardTable(),
  spacer(34),
  tagPara("/AREAS"),
  tagPara("#HAS_DECISIONS"),
  h1("", "What still needs a decision"),
  darkTable(["ID", "Item", "Owner", "Status"], COL4, { fields: ["REF_ID", "ITEM", "OWNER", "STATUS"], groupTag: "DECISIONS" }),
  tagPara("/HAS_DECISIONS"),
]);

// ════════ 04 TECHNICAL SELECTIONS SCHEDULE (A4 landscape) ════════
const technicalSchedule = makeDoc([
  ...header(CW_L), ...titleBlock(), metaGrid(CW_L),
  darkTable(["ID", "Room / area", "Selection / description", "Finish / size", "Qty", "Status", "Source / review"],
    [1050, 2000, 3400, 2650, 1000, 1700, 2884], { grouped: true, fields: ["REF_ID", "ROOM", "SELECTION", "FINISH", "QTY", "STATUS", "SOURCE"] }),
  P(run("{FOOTER_NOTE}", { size: SZ.small, color: GREY, italics: true }), { before: 90 }),
], { landscape: true });

const jobs = [
  ["blb-client-brief-template.docx", clientBrief],
  ["blb-architect-brief-template.docx", architectBrief],
  ["blb-client-presentation-template.docx", clientPresentation],
  ["blb-selections-schedule-template.docx", technicalSchedule],
];
for (const [name, doc] of jobs) { const buf = await Packer.toBuffer(doc); fs.writeFileSync(`${OUT}/${name}`, buf); console.log("wrote template", name, buf.length, "bytes"); }
