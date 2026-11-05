// Authors the R03 redesign — matches the Blue Leaf document mock-ups (register Tab 17 refs + owner-approved
// design studies). Design-time tool only; RUNTIME engine stays docTemplates.renderDocxTemplate.
import fs from "fs";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, Footer, PageNumber, Tab, TabStopType, AlignmentType, VerticalAlign,
} from "docx";

const REPO = "/Users/samuelmorris/Desktop/blue-leaf-hub.nosync";
const OUT = `${REPO}/public/templates`;
fs.mkdirSync(OUT, { recursive: true });

// ── Brand tokens (sampled from the approved mock-up .docx) ──────────────────
const FONT = "Lato";
const NAVY = "142B39", BLUE = "006C9B", INK = "24343D", GREY = "62737D", BAND = "E9F0F3", SURF = "F3F6F6", HAIR = "D7DCDF", WHITE = "FFFFFF";
const SZ = { wm: 24, wmSub: 16, crumb: 16, label: 17, title: 64, tag: 24, mLbl: 15, mVal: 21, hNum: 17, h1: 30, body: 21, tbl: 17, small: 15 };
const MARGIN = { top: 820, bottom: 760, left: 1077, right: 1077 };
const CW = 11906 - MARGIN.left - MARGIN.right; // 9752

const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: o.size || SZ.body, color: o.color || INK, bold: !!o.bold, italics: !!o.italics, allCaps: !!o.caps, characterSpacing: o.spacing });
const P = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children],
  spacing: { before: o.before ?? 0, after: o.after ?? 70, line: o.line ?? 252 }, alignment: o.align, keepNext: o.keepNext, keepLines: o.keepLines !== false, widowControl: true, border: o.border, shading: o.shading, indent: o.indent });
const nb = () => ({ style: BorderStyle.NONE, size: 0, color: WHITE });
const line = (c = HAIR, sz = 2) => ({ style: BorderStyle.SINGLE, size: sz, color: c });
const noBorders = () => ({ top: nb(), bottom: nb(), left: nb(), right: nb(), insideHorizontal: nb(), insideVertical: nb() });

function cell(children, w, o = {}) {
  return new TableCell({ width: { size: w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: o.pad ?? 54, bottom: o.pad ?? 54, left: o.px ?? 120, right: o.px ?? 120 },
    verticalAlign: o.va || VerticalAlign.CENTER, columnSpan: o.span, borders: o.borders,
    children: Array.isArray(children) ? children : [children] });
}

function header() {
  const left = new TableCell({ width: { size: Math.round(CW * 0.5), type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.BOTTOM,
    children: [ new Paragraph({ spacing: { after: 0 }, children: [ run("BLUE LEAF", { size: SZ.wm, bold: true, color: BLUE }), run("  BUILDING", { size: SZ.wmSub, bold: true, color: GREY, caps: true, spacing: 30 }) ] }) ] });
  const right = new TableCell({ width: { size: Math.round(CW * 0.5), type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.BOTTOM,
    children: [ new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [ run("{BREADCRUMB}", { size: SZ.crumb, color: GREY, caps: true, spacing: 20 }) ] }) ] });
  const tbl = new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [Math.round(CW * 0.5), Math.round(CW * 0.5)], borders: noBorders(), rows: [ new TableRow({ children: [left, right] }) ] });
  return [ tbl, new Paragraph({ spacing: { before: 44, after: 0 }, border: { bottom: line(BLUE, 10) }, children: [ run("", { size: 2 }) ] }) ];
}
function titleBlock() {
  return [
    P(run("{SECTION_LABEL}", { size: SZ.label, bold: true, color: BLUE, caps: true, spacing: 20 }), { before: 150, after: 40 }),
    new Paragraph({ spacing: { before: 0, after: 8 }, children: [ run("{DOC_TITLE}", { size: SZ.title, bold: true, color: NAVY }) ] }),
    P(run("{TAGLINE}", { size: SZ.tag, color: GREY }), { after: 120 }),
  ];
}
function metaGrid() {
  const half = Math.round(CW / 2);
  const mkCell = (lTag, vTag, openTag, closeTag) => cell([
    P([ openTag ? run(openTag, { size: SZ.mLbl }) : run("", { size: SZ.mLbl }), run(`{${lTag}}`, { size: SZ.mLbl, color: GREY, caps: true, spacing: 16 }) ], { after: 10, line: 200 }),
    P([ run(`{${vTag}}`, { size: SZ.mVal, color: INK }), closeTag ? run(closeTag, { size: SZ.mVal }) : run("", { size: 2 }) ], { after: 0, line: 220 }),
  ], half, { pad: 40, px: 0, borders: { bottom: line(HAIR, 2), top: nb(), left: nb(), right: nb() }, va: VerticalAlign.TOP });
  const row = new TableRow({ children: [ mkCell("LA", "VA", "{#META_ROWS}", null), mkCell("LB", "VB", null, "{/META_ROWS}") ] });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [half, CW - half], borders: noBorders(), rows: [row] });
}
function h1(num, text) {
  return new Paragraph({ spacing: { before: 180, after: 60 }, keepNext: true, keepLines: true, border: { bottom: line(HAIR, 3) },
    children: [ run(num + "  ", { size: SZ.hNum, bold: true, color: BLUE }), run(text, { size: SZ.h1, bold: true, color: NAVY }) ] });
}
const tagPara = (t) => new Paragraph({ spacing: { after: 0, line: 200 }, children: [ run(`{${t}}`, { size: 2 }) ] });
function bulletLoop(tag, o = {}) {
  return [ tagPara(`#${tag}`), new Paragraph({ bullet: { level: 0 }, spacing: { after: 36, line: 248 }, keepLines: true, children: [ run("{ITEM_TEXT}", { size: o.size || SZ.body }) ] }), tagPara(`/${tag}`) ];
}
function paraLoop(tag, field) { return [ tagPara(`#${tag}`), P(run(`{${field}}`)), tagPara(`/${tag}`) ]; }
function refLoop(tag) {
  return [ tagPara(`#${tag}`), new Paragraph({ spacing: { after: 44, line: 248 }, keepLines: true, indent: { left: 120 },
    children: [ run("{REF_ID}", { size: SZ.body, bold: true, color: BLUE }), run("   ", { size: SZ.body }), run("{REF_TEXT}", { size: SZ.body, color: INK }) ] }), tagPara(`/${tag}`) ];
}
function callout(labelTag, bodyTag) {
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], borders: noBorders(),
    rows: [ new TableRow({ children: [ new TableCell({ width: { size: CW, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: BAND, color: "auto" },
      borders: { left: { style: BorderStyle.SINGLE, size: 20, color: BLUE }, top: nb(), bottom: nb(), right: nb() }, margins: { top: 90, bottom: 90, left: 150, right: 150 },
      children: [ P(run(`{${labelTag}}`, { size: SZ.label, bold: true, color: BLUE, caps: true, spacing: 16 }), { after: 30 }), P(run(`{${bodyTag}}`, { size: SZ.body, color: INK }), { after: 0 }) ] }) ] }) ] });
}
function intentionBand() {
  const w = Math.round(CW / 3);
  const mk = (n) => cell([ P(run(`{INT${n}_NUM}`, { size: SZ.body, bold: true, color: BLUE }), { after: 20 }),
    P(run(`{INT${n}_LABEL}`, { size: SZ.body, bold: true, color: NAVY, caps: true, spacing: 16 }), { after: 24 }),
    P(run(`{INT${n}_TEXT}`, { size: SZ.small, color: GREY }), { after: 0 }) ], w, { pad: 70, fill: SURF, va: VerticalAlign.TOP });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [w, w, CW - 2 * w], borders: { top: line(BLUE, 10), bottom: nb(), left: nb(), right: nb(), insideHorizontal: nb(), insideVertical: nb() },
    rows: [ new TableRow({ children: [mk(1), mk(2), mk(3)] }) ] });
}
function photoPlaceholder() {
  return [ new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], borders: { top: line(HAIR, 2), bottom: line(HAIR, 2), left: line(HAIR, 2), right: line(HAIR, 2), insideHorizontal: nb(), insideVertical: nb() },
    rows: [ new TableRow({ height: { value: 2500, rule: "atLeast" }, children: [ new TableCell({ width: { size: CW, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: SURF, color: "auto" }, verticalAlign: VerticalAlign.CENTER,
      children: [ new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [ run("{PHOTO_CAPTION}", { size: SZ.small, color: GREY, caps: true, spacing: 20 }) ] }) ] }) ] }) ] }),
    P(run("{PHOTO_NOTE}", { size: SZ.small, color: GREY, italics: true }), { before: 20, after: 60 }) ];
}
function darkTable(headers, widths, { grouped = false, groupTag = "GROUPS", itemTag = "ITEMS", fields, idCol = true }) {
  const headerRow = new TableRow({ tableHeader: true, cantSplit: true,
    children: headers.map((h, i) => cell(P(run(h, { size: SZ.tbl, bold: true, color: WHITE, caps: true, spacing: 14 }), { after: 0 }), widths[i], { fill: NAVY, pad: 64 })) });
  const rows = [headerRow];
  if (grouped) {
    rows.push(new TableRow({ cantSplit: true, children: [ cell(P([ run(`{#${groupTag}}`, { size: SZ.tbl }), run("{GROUP_NAME}", { size: SZ.tbl, bold: true, color: BLUE, caps: true, spacing: 16 }) ], { after: 0 }), CW, { fill: BAND, span: headers.length, pad: 46 }) ] }));
  }
  const loop = grouped ? itemTag : groupTag;
  const dataRow = new TableRow({ cantSplit: true, children: fields.map((f, i) => {
    const kids = [];
    if (i === 0) kids.push(run(`{#${loop}}`, { size: SZ.tbl }));
    kids.push(run(`{${f}}`, { size: SZ.tbl, bold: i === 0 && idCol, color: i === 0 && idCol ? BLUE : INK }));
    if (i === fields.length - 1) { kids.push(run(`{/${loop}}`, { size: SZ.tbl })); if (grouped) kids.push(run(`{/${groupTag}}`, { size: SZ.tbl })); }
    return cell(P(kids, { after: 0, line: 240 }), widths[i], { va: VerticalAlign.TOP });
  }) });
  rows.push(dataRow);
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths,
    borders: { top: nb(), bottom: line(HAIR), left: nb(), right: nb(), insideHorizontal: line("E6EAEC"), insideVertical: nb() }, rows });
}
function footer() {
  return new Footer({ children: [ new Paragraph({ tabStops: [ { type: TabStopType.CENTER, position: CW / 2 }, { type: TabStopType.RIGHT, position: CW } ], border: { top: line(HAIR, 3) }, spacing: { before: 40 },
    children: [ run("BLUE LEAF BUILDING", { size: SZ.small, color: GREY, caps: true, spacing: 14 }), new TextRun({ children: [ new Tab() ] }), run("{FOOTER_MID}", { size: SZ.small, color: GREY }),
      new TextRun({ children: [ new Tab() ] }), run("PAGE ", { size: SZ.small, color: GREY, caps: true, spacing: 10 }), new TextRun({ children: [ PageNumber.CURRENT ], font: FONT, size: SZ.small, color: GREY }), run(" / ", { size: SZ.small, color: GREY }), new TextRun({ children: [ PageNumber.TOTAL_PAGES ], font: FONT, size: SZ.small, color: GREY }) ] }) ] });
}
function makeDoc(children) {
  return new Document({ creator: "Blue Leaf Building", styles: { default: { document: { run: { font: FONT, size: SZ.body, color: INK } } } },
    sections: [ { properties: { page: { margin: MARGIN } }, footers: { default: footer() }, children } ] });
}

// ════════ 01 CLIENT PROJECT BRIEF ════════
const clientBrief = makeDoc([
  ...header(), ...titleBlock(), ...photoPlaceholder(), metaGrid(),
  h1("00", "The project in one minute"), ...paraLoop("SUMMARY_PARAS", "PARA_TEXT"),
  intentionBand(),
  h1("01", "Scope & boundaries"),
  P(run("Included", { bold: true, color: INK }), { before: 40, after: 16, keepNext: true }), ...bulletLoop("SCOPE_IN"),
  P(run("Not in the current scope", { bold: true, color: INK }), { before: 30, after: 16, keepNext: true }), ...bulletLoop("SCOPE_OUT"),
  h1("02", "Design direction"),
  tagPara("#PREFERENCE_GROUPS"),
  P(run("{GROUP_NAME}", { bold: true, color: BLUE, caps: true, spacing: 14, size: SZ.small }), { before: 40, after: 18, keepNext: true }),
  ...bulletLoop("ITEMS"),
  tagPara("/PREFERENCE_GROUPS"),
  h1("03", "Key questions to resolve"),
  darkTable(["ID", "Required action", "Owner", "Status"], [760, 5500, 1900, 1592], { fields: ["REF_ID", "ACTION", "OWNER", "STATUS"], groupTag: "QUESTIONS" }),
  h1("04", "What happens next"), ...paraLoop("NEXT_STEPS_PARAS", "PARA_TEXT"),
]);

// ════════ 02 ARCHITECT DESIGN BRIEF ════════
const architectBrief = makeDoc([
  ...header(), ...titleBlock(), metaGrid(),
  callout("CALLOUT_LABEL", "CALLOUT_BODY"),
  h1("01", "Priority coordination actions"), ...paraLoop("ACTIONS_INTRO", "PARA_TEXT"),
  darkTable(["ID", "Required action", "Owner", "Status"], [760, 5500, 1900, 1592], { fields: ["REF_ID", "ACTION", "OWNER", "STATUS"], groupTag: "ACTIONS" }),
  h1("02", "Confirmed project requirements"), ...refLoop("CONFIRMED_REQS"),
  h1("03", "Indicative preferences"), ...paraLoop("PREFERENCES", "PARA_TEXT"),
  h1("04", "Design register"),
  darkTable(["ID", "Location", "Current direction", "Status", "Required response", "Dwg"],
    [880, 1400, 2500, 1240, 2080, 1652], { grouped: true, fields: ["REF_ID", "LOCATION", "DIRECTION", "STATUS", "RESPONSE", "DWG"] }),
]);

// ════════ 04 TECHNICAL SELECTIONS SCHEDULE ════════
const technicalSchedule = makeDoc([
  ...header(), ...titleBlock(), metaGrid(),
  darkTable(["ID", "Room / area", "Selection / description", "Finish / size", "Qty", "Status", "Source / review"],
    [880, 1300, 2360, 1800, 680, 1040, 1692], { grouped: true, fields: ["REF_ID", "ROOM", "SELECTION", "FINISH", "QTY", "STATUS", "SOURCE"] }),
  P(run("{FOOTER_NOTE}", { size: SZ.small, color: GREY, italics: true }), { before: 100 }),
]);

const jobs = [
  ["blb-client-brief-template.docx", clientBrief],
  ["blb-architect-brief-template.docx", architectBrief],
  ["blb-selections-schedule-template.docx", technicalSchedule],
];
for (const [name, doc] of jobs) { const buf = await Packer.toBuffer(doc); fs.writeFileSync(`${OUT}/${name}`, buf); console.log("wrote template", name, buf.length, "bytes"); }
