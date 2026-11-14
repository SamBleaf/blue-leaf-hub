// design-system.mjs — the Blue Leaf document design system (authoring time only).
//
// One set of tokens and building blocks for every controlled document. Templates are authored with docx-js
// and filled at runtime by the existing renderer (server/lib/docTemplates.mjs, text-only docxtemplater) and
// converted by LibreOffice (server/lib/docxToPdf.mjs). Nothing here runs in the Hub.
//
// Rules the blocks encode (docs/documents/DOCUMENT_SUITE.md §3):
//   • Real Word header and footer parts, so every page carries the logo, document type, project, identity
//     and "Page X of Y".
//   • Tables: a header row that repeats (tblHeader), rows that never split (cantSplit), and never two
//     tables back to back — LibreOffice merges adjacent tables, which stops the header repeating.
//   • Headings are Word styles (Heading 1/2), kept with what follows, so no orphan headings and a PDF outline.
//   • Optional sections are wrapped in a condition tag and simply disappear when empty.
//   • Lato only. Status is always written in words, never colour alone.
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Header, Footer, WidthType, BorderStyle, ShadingType,
  AlignmentType, VerticalAlign, TabStopType, PageNumber, LevelFormat, TableLayoutType, HeadingLevel,
} from "docx";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");

// ── Tokens ─────────────────────────────────────────────────────────────────────────────────────────
export const FONT = "Lato";
export const C = {
  blue: "006C9B",      // Blue Leaf blue (logo frame and leaf)
  ink: "23313A",       // charcoal text
  grey: "61717A",      // secondary text, labels
  surface: "F1F5F6",   // panels
  tint: "E6F0F5",      // status callout
  hair: "D3DCE0",      // rules and row separators
  white: "FFFFFF",
};
/** Sizes in half-points (Word's unit): 20 = 10 pt. */
export const S = { title: 52, subtitle: 22, h1: 32, h2: 22, kicker: 16, body: 20, table: 19, th: 16, small: 17, meta: 16, chrome: 16 };   // nothing below 8 pt (Tab 17)
/** A4 portrait in twips. Header 10 mm from the edge, logo inside a 26 mm top margin. */
export const PAGE = { w: 11906, h: 16838, margin: { top: 1474, bottom: 1191, left: 1077, right: 1077, header: 567, footer: 567, gutter: 0 } };
export const CW = PAGE.w - PAGE.margin.left - PAGE.margin.right;   // 9752 twips ≈ 172 mm

export const LOGO = fs.readFileSync(join(REPO, "public/brand/logo-black.png"));   // original artwork, 3320 × 1512
const LOGO_W = 112, LOGO_H = Math.round(LOGO_W * (1512 / 3320));                 // ≈ 30 × 13.5 mm

// ── Primitives ─────────────────────────────────────────────────────────────────────────────────────
export const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || S.body, color: o.color || C.ink, bold: !!o.bold, italics: !!o.italics, allCaps: !!o.caps, characterSpacing: o.spacing });
export function para(children, o = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children], style: o.style, heading: o.heading,
    spacing: { before: o.before ?? 0, after: o.after ?? 100, line: o.line ?? 264 }, alignment: o.align,
    keepNext: !!o.keepNext, keepLines: o.keepLines !== false, widowControl: true, border: o.border, indent: o.indent,
    numbering: o.numbering, tabStops: o.tabStops,
  });
}
const none = () => ({ style: BorderStyle.NONE, size: 0, color: C.white });
export const rule = (color = C.hair, size = 4) => ({ style: BorderStyle.SINGLE, size, color });
export const noBorders = () => ({ top: none(), bottom: none(), left: none(), right: none(), insideHorizontal: none(), insideVertical: none() });

/** A paragraph that only holds a template tag (loop or condition). paragraphLoop removes it when rendered. */
export const tag = (t) => new Paragraph({ spacing: { before: 0, after: 0, line: 120 }, children: [run(`{${t}}`, { size: 2 })] });
/** Wrap blocks in a condition / loop: {#KEY} … {/KEY}. */
export const when = (key, blocks) => [tag(`#${key}`), ...blocks, tag(`/${key}`)];
/** The paragraph between two tables (stops LibreOffice merging them, which would break the repeating header). */
export const gap = (after = 120) => new Paragraph({ spacing: { before: 0, after, line: 120 }, children: [run("", { size: 2 })] });

export function cell(children, width, o = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: o.pt ?? 70, bottom: o.pb ?? 70, left: o.pl ?? 0, right: o.pr ?? 160 },
    verticalAlign: o.va || VerticalAlign.TOP, borders: o.borders, columnSpan: o.span,
    children: Array.isArray(children) ? children : [children],
  });
}

// ── Page chrome ────────────────────────────────────────────────────────────────────────────────────
/** Logo left; document type and project right; a hairline below. Same on every page. */
export function pageHeader() {
  const L = Math.round(CW * 0.42), R = CW - L;
  const left = cell(new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ type: "png", data: LOGO, transformation: { width: LOGO_W, height: LOGO_H }, altText: { name: "Blue Leaf Building", title: "Blue Leaf Building", description: "Blue Leaf Building logo" } })] }),
    L, { pt: 0, pb: 60, pr: 0, va: VerticalAlign.BOTTOM });
  const right = cell([
    para(run("{HDR_DOC_TYPE}", { size: S.chrome, color: C.grey, caps: true, spacing: 24 }), { align: AlignmentType.RIGHT, after: 20, line: 220 }),
    para(run("{HDR_PROJECT}", { size: S.chrome + 1, color: C.ink }), { align: AlignmentType.RIGHT, after: 0, line: 230 }),
  ], R, { pt: 0, pb: 70, pr: 0, va: VerticalAlign.BOTTOM });
  return new Header({ children: [
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [L, R], layout: TableLayoutType.FIXED, borders: { ...noBorders(), bottom: rule(C.hair, 4) }, rows: [new TableRow({ children: [left, right] })] }),
    new Paragraph({ spacing: { after: 0, line: 120 }, children: [run("", { size: 2 })] }),
  ] });
}

/** Identity and status left, "Page X of Y" right, a hairline above. Page fields are separate runs (fix-footer-page-fields). */
export function pageFooter() {
  const o = { size: S.chrome, color: C.grey };
  return new Footer({ children: [new Paragraph({
    spacing: { before: 80, after: 0, line: 220 }, border: { top: rule(C.hair, 4) }, tabStops: [{ type: TabStopType.RIGHT, position: CW }],
    children: [
      run("{FTR_IDENTITY}", o), run("\t", o), run("Page ", o),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: o.size, color: o.color }),
      run(" of ", o),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: o.size, color: o.color }),
    ],
  })] });
}

export const sectionProps = () => ({ page: { size: { width: PAGE.w, height: PAGE.h }, margin: PAGE.margin } });

// ── Styles and lists ───────────────────────────────────────────────────────────────────────────────
export function documentStyles() {
  return {
    default: { document: { run: { font: FONT, size: S.body, color: C.ink }, paragraph: { spacing: { after: 100, line: 264 } } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: FONT, size: S.title, bold: true, color: C.ink }, paragraph: { spacing: { before: 0, after: 60, line: 240 }, keepNext: true } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: S.h1, bold: true, color: C.ink }, paragraph: { spacing: { before: 60, after: 120, line: 240 }, keepNext: true, keepLines: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: S.h2, bold: true, color: C.ink }, paragraph: { spacing: { before: 200, after: 80, line: 240 }, keepNext: true, keepLines: true, outlineLevel: 1 } },
    ],
  };
}
export function documentNumbering() {
  return { config: [{ reference: "blb-bullet", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 300, hanging: 220 } }, run: { color: C.blue, font: FONT } } }] }] };
}

// ── Blocks ─────────────────────────────────────────────────────────────────────────────────────────
/** Page-1 title block: kicker, title, optional subtitle. */
export function titleBlock() {
  return [
    para(run("{DOC_KICKER}", { size: S.kicker, bold: true, color: C.blue, caps: true, spacing: 24 }), { after: 60, keepNext: true }),
    para(run("{DOC_TITLE}", { size: S.title, bold: true, color: C.ink }), { style: "Title", after: 60, keepNext: true, line: 240 }),
    ...when("HAS_SUBTITLE", [para(run("{DOC_SUBTITLE}", { size: S.subtitle, color: C.grey }), { after: 200, keepNext: true })]),
  ];
}

/** Two-column metadata grid on a light panel (loop META_ROWS of {LA, VA, LB, VB}). */
export function metaGrid() {
  const half = Math.round(CW / 2);
  const mk = (l, v, open, close) => cell([
    para([run(open || "", { size: S.meta }), run(`{${l}}`, { size: S.meta, bold: true, color: C.blue, caps: true, spacing: 16 })], { after: 30, line: 220 }),
    para([run(`{${v}}`, { size: S.body }), run(close || "", { size: S.body })], { after: 0, line: 252 }),
  ], half, { fill: C.surface, pt: 90, pb: 90, pl: 160, pr: 160, borders: { top: none(), left: none(), right: none(), bottom: rule(C.white, 12) } });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [half, CW - half], layout: TableLayoutType.FIXED, borders: noBorders(),
    rows: [new TableRow({ cantSplit: true, children: [mk("LA", "VA", "{#META_ROWS}"), mk("LB", "VB", null, "{/META_ROWS}")] })] });
}

/** Shaded callout with a blue edge: a label and one paragraph. */
export function callout(labelTag, bodyTag) {
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], layout: TableLayoutType.FIXED, borders: noBorders(),
    rows: [new TableRow({ cantSplit: true, children: [cell([
      para(run(`{${labelTag}}`, { size: S.kicker, bold: true, color: C.blue, caps: true, spacing: 16 }), { after: 40 }),
      para(run(`{${bodyTag}}`, { size: S.small + 1 }), { after: 0, line: 252 }),
    ], CW, { fill: C.tint, pt: 110, pb: 110, pl: 180, pr: 180, borders: { left: rule(C.blue, 18), top: none(), bottom: none(), right: none() } })] })] });
}

/** Section opening: "01  /  THE PROJECT" with a rule, then the Heading 1 title. */
export function sectionHead(numTag, kicker, title) {
  return [
    para([run(`{${numTag}}`, { size: S.kicker, bold: true, color: C.blue }), run(`  /  ${kicker}`, { size: S.kicker, bold: true, color: C.blue, caps: true, spacing: 16 })],
      { before: 300, after: 100, keepNext: true, border: { bottom: rule(C.blue, 6) } }),
    para(run(title, { size: S.h1, bold: true }), { heading: HeadingLevel.HEADING_1, before: 40, after: 100, keepNext: true, line: 240 }),
  ];
}
export const h2 = (text) => para(run(text, { size: S.h2, bold: true }), { heading: HeadingLevel.HEADING_2, before: 200, after: 70, keepNext: true, line: 240 });
export const h2tag = (t) => para(run(`{${t}}`, { size: S.h2, bold: true }), { heading: HeadingLevel.HEADING_2, before: 220, after: 80, keepNext: true, line: 240 });
/** Small blue caps label above a list. */
export const label = (t, o = {}) => para(run(t, { size: S.kicker, bold: true, color: C.blue, caps: true, spacing: 16 }), { before: o.before ?? 160, after: 60, keepNext: true });
export const body = (t, o = {}) => para(run(t, { size: o.size || S.body, color: o.color }), { after: o.after ?? 100, keepNext: o.keepNext });
export const bodyGrey = (t, o = {}) => para(run(t, { size: o.size || S.small + 1, color: C.grey }), { after: o.after ?? 100, keepNext: o.keepNext });

/** Loop of paragraphs: {#KEY}{FIELD}{/KEY}. */
export const paraLoop = (key, field, o = {}) => when(key, [para(run(`{${field}}`, { size: o.size || S.body }), { after: o.after ?? 100 })]);
/** Loop of bullets with a quiet reference after the text: {#KEY} • {TEXT}  {REF} {/KEY}. */
export function bulletLoop(key, { textField = "TEXT", refField = null } = {}) {
  const kids = [run(`{${textField}}`)];
  if (refField) kids.push(run(`{${refField}}`, { size: S.meta, color: C.grey }));
  return when(key, [para(kids, { numbering: { reference: "blb-bullet", level: 0 }, after: 60, line: 252 })]);
}

/**
 * A data table: one header row that repeats on every page, then one looped row (never split).
 * cols: [{ head, field, width, bold?, color?, size? }]. Rows loop over KEY.
 */
export function dataTable(key, cols, o = {}) {
  // o.keepTogether: a short table (decisions, steps) moves to the next page whole rather than leaving one row behind.
  const keep = !!o.keepTogether;
  const total = cols.reduce((a, c) => a + c.width, 0);
  if (total !== CW) throw new Error(`dataTable ${key}: column widths ${total} must equal ${CW}`);
  const hr = new TableRow({ tableHeader: true, cantSplit: true, children: cols.map((c, i) => cell(
    para(run(c.head, { size: S.th, bold: true, color: C.blue, caps: true, spacing: 14 }), { after: 0, line: 220, keepNext: true }),
    c.width, { fill: C.surface, pt: 80, pb: 80, pl: i === 0 ? 140 : 0, pr: 140, va: VerticalAlign.CENTER, borders: { top: none(), left: none(), right: none(), bottom: rule(C.blue, 6) } })) });
  const dr = new TableRow({ cantSplit: true, children: cols.map((c, i) => {
    const kids = [];
    if (i === 0) kids.push(run(`{#${key}}`, { size: 2 }));
    kids.push(run(`{${c.field}}`, { size: c.size || S.table, bold: !!c.bold, color: c.color || C.ink }));
    if (c.sub) kids.push(run(`{${c.sub}}`, { size: S.meta, color: C.grey }));
    if (i === cols.length - 1) kids.push(run(`{/${key}}`, { size: 2 }));
    return cell(para(kids, { after: 0, line: 252, keepNext: keep }), c.width, { pt: 90, pb: 90, pl: i === 0 ? 140 : 0, pr: 140, borders: { top: none(), left: none(), right: none(), bottom: rule(C.hair, 4) } });
  }) });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: cols.map((c) => c.width), layout: TableLayoutType.FIXED, borders: noBorders(), rows: [hr, dr] });
}

/**
 * A band of numbered cards, always on a three-column grid so a card is the same size whether there are one, two
 * or three (no loop: one band per count, chosen by a condition). Fields {PREFIX1..n}; the rest of the grid is blank.
 */
export function cardBand(n, numPrefix, labelPrefix) {
  const w = Math.floor(CW / 3), widths = [w, w, CW - 2 * w];
  const cells = widths.map((wd, i) => (i >= n ? cell(para(run("", { size: 2 }), { after: 0 }), wd, { pt: 0, pb: 0 }) : cell([
    para(run(`{${numPrefix}${i + 1}}`, { size: S.kicker, bold: true, color: C.blue }), { after: 40 }),
    para(run(`{${labelPrefix}${i + 1}}`, { size: S.h2, bold: true }), { after: 0, line: 252 }),
  ], wd, { fill: C.surface, pt: 120, pb: 130, pl: 170, pr: 170, borders: { top: rule(C.blue, 12), left: none(), bottom: none(), right: i < 2 ? rule(C.white, 24) : none() } })));
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: noBorders(), rows: [new TableRow({ cantSplit: true, children: cells })] });
}
