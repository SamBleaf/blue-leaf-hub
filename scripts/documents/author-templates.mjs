// Authors the R02 redesign of the three docxtemplater TEMPLATES (brand v2, per register Tab 17).
// Design-time tool only; RUNTIME engine stays docTemplates.renderDocxTemplate. Output: public/templates/*.docx
import fs from "fs";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, Footer, PageNumber, Tab, TabStopType, AlignmentType, PageOrientation, VerticalAlign,
} from "docx";

const REPO = "/Users/samuelmorris/Desktop/blue-leaf-hub.nosync";
const OUT = `${REPO}/public/templates`;
fs.mkdirSync(OUT, { recursive: true });
const LOGO = fs.readFileSync(`${REPO}/public/brand/logo-black.png`); // 3320x1512 official wordmark

// ── Brand tokens v2 (Tab 17) ──────────────────────────────────────────────
const FONT = "Lato";
const BLUE = "006C9B", INK = "26323A", MUTE = "5A6B73", PALE = "F3F5F6", BAND = "E7ECEF", HAIR = "D7DCDF", WHITE = "FFFFFF";
const SZ = { title: 50, h1: 25, body: 21, sched: 18, meta: 17, small: 16 }; // half-points: 25/12.5/10.5/9/8.5/8
const MARGIN = { top: 620, bottom: 620, left: 1077, right: 1077 }; // sides 19mm; top/bottom ~11mm
const PORT_CW = 11906 - MARGIN.left - MARGIN.right;   // 9752
const LAND_CW = 16838 - MARGIN.left - MARGIN.right;   // 14684

const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: o.size || SZ.body, color: o.color || INK, bold: !!o.bold, italics: !!o.italics, allCaps: !!o.caps });
const P = (children, o = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [children],
  spacing: { before: o.before ?? 0, after: o.after ?? 50, line: o.line ?? 230 },
  alignment: o.align, keepNext: o.keepNext, keepLines: o.keepLines !== false, widowControl: true, border: o.border, shading: o.shading,
});
const nb = () => ({ style: BorderStyle.NONE, size: 0, color: WHITE });
const hair = (c = HAIR, sz = 2) => ({ style: BorderStyle.SINGLE, size: sz, color: c });
const noBorders = () => ({ top: nb(), bottom: nb(), left: nb(), right: nb(), insideHorizontal: nb(), insideVertical: nb() });
// Calm table: horizontal hairlines only, no vertical grid, light outer frame.
const calmBorders = () => ({ top: hair(HAIR), bottom: hair(HAIR), left: nb(), right: nb(), insideHorizontal: hair("E4E8EA"), insideVertical: nb() });

function cell(children, w, o = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: o.pad ?? 70, bottom: o.pad ?? 70, left: 110, right: 110 },
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: o.span,
    borders: o.topRule ? { top: hair(BLUE, 6) } : undefined,
    children: Array.isArray(children) ? children : [children],
  });
}

// Header: logo (left) + issue strip (right) in a borderless 2-col table — compact, never a quarter page.
function headerBlock(cw) {
  const logoPara = new Paragraph({ spacing: { after: 0 }, children: [ new ImageRun({ type: "png", data: LOGO, transformation: { width: 139, height: 63 } }) ] });
  const strip = new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 240 },
    children: [ run("{ISSUE_LINE_1}", { size: SZ.meta, color: MUTE }) ] });
  const strip2 = new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 20, after: 0, line: 240 },
    children: [ run("{ISSUE_LINE_2}", { size: SZ.meta, color: MUTE }) ] });
  const tbl = new Table({ width: { size: cw, type: WidthType.DXA }, columnWidths: [Math.round(cw * 0.5), Math.round(cw * 0.5)], borders: noBorders(),
    rows: [ new TableRow({ children: [
      new TableCell({ width: { size: Math.round(cw * 0.5), type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.CENTER, children: [logoPara] }),
      new TableCell({ width: { size: Math.round(cw * 0.5), type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.CENTER, children: [strip, strip2] }),
    ] }) ] });
  return [ tbl, new Paragraph({ spacing: { before: 56, after: 0 }, border: { bottom: hair(BLUE, 8) }, children: [ run("", { size: 2 }) ] }) ];
}
function titleBlock() {
  return [
    new Paragraph({ spacing: { before: 64, after: 14 }, children: [ run("{DOC_TITLE}", { size: SZ.title, bold: true, color: INK }) ] }),
    P(run("{SUBLINE}", { size: SZ.body, color: MUTE }), { after: 30 }),
    // single, restrained issue-status note (not a heavy grey box)
    new Paragraph({ spacing: { before: 20, after: 80 }, children: [ run("{ISSUE_NOTE}", { size: SZ.meta, color: MUTE, italics: true }) ] }),
  ];
}
// Section heading: INK bold with a small blue square accent; no underline rule.
function h1(text) {
  return new Paragraph({ spacing: { before: 78, after: 34 }, keepNext: true, keepLines: true,
    children: [ run("▪  ", { color: BLUE, bold: true, size: SZ.h1 }), run(text, { color: INK, bold: true, size: SZ.h1 }) ] });
}
const subLabel = (t) => new Paragraph({ spacing: { before: 22, after: 12 }, keepNext: true, children: [ run(t, { bold: true, color: INK, size: SZ.body }) ] });
const tagPara = (t) => new Paragraph({ spacing: { after: 0, line: 220 }, children: [ run(`{${t}}`, { size: 2 }) ] });
function bulletLoop(tag, o = {}) {
  return [ tagPara(`#${tag}`),
    new Paragraph({ bullet: { level: 0 }, spacing: { after: 30, line: 234 }, keepLines: true, children: [ run("{ITEM_TEXT}", { size: o.size || SZ.body }) ] }),
    tagPara(`/${tag}`) ];
}
function paraLoop(tag, field) { return [ tagPara(`#${tag}`), P(run(`{${field}}`)), tagPara(`/${tag}`) ]; }

// Compact 2-col meta strip (label/value) as a borderless loop table — used only where a small grid earns its place.
function metaStrip(cw) {
  const lw = Math.round(cw * 0.26);
  const row = new TableRow({ children: [
    cell([ P([run("{#META_ROWS}", { size: SZ.meta }), run("{LABEL}", { size: SZ.meta, bold: true, color: MUTE })], { after: 0 }) ], lw, { pad: 24 }),
    cell([ P([run("{VALUE}", { size: SZ.meta, color: INK }), run("{/META_ROWS}", { size: SZ.meta })], { after: 0 }) ], cw - lw, { pad: 24 }),
  ] });
  return new Table({ width: { size: cw, type: WidthType.DXA }, columnWidths: [lw, cw - lw], borders: noBorders(), rows: [row] });
}

// A calm flat loop table (header repeats; rows don't split).
function loopTable(cw, headers, widths, loopTag, fields, { headerPad = 70 } = {}) {
  const headerRow = new TableRow({ tableHeader: true, cantSplit: true,
    children: headers.map((h, i) => cell(P(run(h, { size: SZ.sched, bold: true, color: INK }), { after: 0 }), widths[i], { fill: PALE, pad: headerPad, topRule: true })) });
  const dataRow = new TableRow({ cantSplit: true, children: fields.map((f, i) => {
    const kids = [];
    if (i === 0) kids.push(run(`{#${loopTag}}`, { size: SZ.sched }));
    kids.push(run(`{${f}}`, { size: SZ.sched, bold: i === 0, color: i === 0 ? INK : INK }));
    if (i === fields.length - 1) kids.push(run(`{/${loopTag}}`, { size: SZ.sched }));
    return cell(P(kids, { after: 0, line: 248 }), widths[i]);
  }) });
  return new Table({ width: { size: cw, type: WidthType.DXA }, columnWidths: widths, borders: calmBorders(), rows: [headerRow, dataRow] });
}

function footer() {
  const cw = PORT_CW; // footer tabs tuned for portrait; landscape footer re-tuned in makeDoc
  return new Footer({ children: [ new Paragraph({
    tabStops: [ { type: TabStopType.CENTER, position: cw / 2 }, { type: TabStopType.RIGHT, position: cw } ],
    border: { top: hair(HAIR, 3) }, spacing: { before: 40 },
    children: [
      run("{FOOTER_LEFT}", { size: SZ.small, color: MUTE }),
      new TextRun({ children: [ new Tab() ] }),
      run("{FOOTER_MID}", { size: SZ.small, color: MUTE }),
      new TextRun({ children: [ new Tab() ] }),
      run("Page ", { size: SZ.small, color: MUTE }),
      new TextRun({ children: [ PageNumber.CURRENT ], font: FONT, size: SZ.small, color: MUTE }),
      run(" of ", { size: SZ.small, color: MUTE }),
      new TextRun({ children: [ PageNumber.TOTAL_PAGES ], font: FONT, size: SZ.small, color: MUTE }),
    ],
  }) ] });
}
function landscapeFooter() {
  const cw = LAND_CW;
  return new Footer({ children: [ new Paragraph({
    tabStops: [ { type: TabStopType.CENTER, position: cw / 2 }, { type: TabStopType.RIGHT, position: cw } ],
    border: { top: hair(HAIR, 3) }, spacing: { before: 40 },
    children: [
      run("{FOOTER_LEFT}", { size: SZ.small, color: MUTE }),
      new TextRun({ children: [ new Tab() ] }),
      run("{FOOTER_MID}", { size: SZ.small, color: MUTE }),
      new TextRun({ children: [ new Tab() ] }),
      run("Page ", { size: SZ.small, color: MUTE }),
      new TextRun({ children: [ PageNumber.CURRENT ], font: FONT, size: SZ.small, color: MUTE }),
      run(" of ", { size: SZ.small, color: MUTE }),
      new TextRun({ children: [ PageNumber.TOTAL_PAGES ], font: FONT, size: SZ.small, color: MUTE }),
    ],
  }) ] });
}
function makeDoc(children, { landscape = false } = {}) {
  const page = landscape
    ? { size: { orientation: PageOrientation.LANDSCAPE }, margin: MARGIN }
    : { margin: MARGIN };
  return new Document({ creator: "Blue Leaf Building",
    styles: { default: { document: { run: { font: FONT, size: SZ.body, color: INK } } } },
    sections: [ { properties: { page }, footers: { default: landscape ? landscapeFooter() : footer() }, children } ] });
}

// ════════ CLIENT BRIEF (editorial) ════════
const clientBrief = makeDoc([
  ...headerBlock(PORT_CW), ...titleBlock(),
  h1("Project summary"), ...paraLoop("SUMMARY_PARAS", "PARA_TEXT"),
  h1("Scope"), subLabel("Included"), ...bulletLoop("SCOPE_IN"),
  subLabel("Not included / deferred"), ...bulletLoop("SCOPE_OUT"),
  h1("Design direction"),
  tagPara("#PREFERENCE_GROUPS"),
  new Paragraph({ spacing: { before: 80, after: 24 }, keepNext: true, children: [ run("{GROUP_NAME}", { bold: true, color: BLUE, size: SZ.body }) ] }),
  ...bulletLoop("ITEMS"),
  tagPara("/PREFERENCE_GROUPS"),
  h1("Assumptions & things to confirm"),
  subLabel("Working assumptions"), ...bulletLoop("ASSUMPTIONS"),
  subLabel("To confirm before detailed design"), ...bulletLoop("DECISIONS"),
  h1("What happens next"), ...paraLoop("NEXT_STEPS_PARAS", "PARA_TEXT"),
]);

// ════════ ARCHITECT BRIEF (coordination-first) ════════
const architectBrief = makeDoc([
  ...headerBlock(PORT_CW), ...titleBlock(),
  metaStrip(PORT_CW),
  h1("Actions requiring architect attention"), ...bulletLoop("ACTIONS"),
  h1("Purpose & current design basis"), ...paraLoop("PURPOSE_PARAS", "PARA_TEXT"),
  h1("Requirements & preferences"),
  subLabel("Confirmed client requirements"), ...bulletLoop("CONFIRMED_REQS"),
  subLabel("Indicative client preferences (not instructions)"), ...bulletLoop("CLIENT_PREFS"),
  h1("Coordination schedule"),
  loopTable(PORT_CW, ["Item", "Location", "Requirement / selection", "Status", "Action", "Dwg"],
    [1000, 1480, 3200, 1420, 1800, 852], "SCHEDULE_ITEMS",
    ["ITEM_ID", "LOCATION", "REQUIREMENT", "STATUS", "ACTION", "DWG_REF"]),
  P(run("Status key — Client-approved: client intent confirmed. Proposed: design solution to develop. To verify: technical check / consultant sign-off outstanding (not yet approved).", { size: SZ.small, color: MUTE, italics: true }), { before: 70 }),
  h1("Referenced documents"), ...bulletLoop("REFERENCES"),
]);

// ════════ SELECTIONS & FINISHES SCHEDULE (reference-first, LANDSCAPE, grouped) ════════
const selectionsSchedule = makeDoc([
  ...headerBlock(LAND_CW), ...titleBlock(),
  // grouped: per-group title (keepNext) + its own calm table (header repeats, rows cantSplit)
  tagPara("#GROUPS"),
  new Paragraph({ spacing: { before: 160, after: 50 }, keepNext: true, children: [ run("{GROUP_NAME}", { bold: true, color: BLUE, size: SZ.body, caps: true }) ] }),
  loopTable(LAND_CW, ["Item", "Location / Room", "Product / Description", "Finish / Dimensions", "Qty", "Status", "Source / Ref"],
    [900, 2100, 4200, 3200, 900, 1700, 1684], "ITEMS",
    ["ITEM_ID", "CATEGORY", "PRODUCT", "FINISH", "QTY", "STATUS", "RESPONSIBILITY"]),
  tagPara("/GROUPS"),
  P(run("{FOOTER_NOTE}", { size: SZ.small, color: MUTE, italics: true }), { before: 120 }),
], { landscape: true });

const jobs = [
  ["blb-client-brief-template.docx", clientBrief],
  ["blb-architect-brief-template.docx", architectBrief],
  ["blb-selections-schedule-template.docx", selectionsSchedule],
];
for (const [name, doc] of jobs) {
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(`${OUT}/${name}`, buf);
  console.log("wrote template", name, buf.length, "bytes");
}
