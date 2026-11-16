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
  HeightRule,
  Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Header, Footer, WidthType, BorderStyle, ShadingType,
  AlignmentType, VerticalAlign, TabStopType, PageNumber, LevelFormat, TableLayoutType, HeadingLevel, LineRuleType, PageOrientation,
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
/** A4 landscape (the technical selections schedule, Tab 17:86): the same margins, so the header and footer sit alike. */
export const CW_LANDSCAPE = PAGE.h - PAGE.margin.left - PAGE.margin.right;   // 14684 twips ≈ 259 mm
// The width every block below is built at. Portrait unless a template calls usePage("landscape") before building, so
// the portrait documents (CPB, ADB) are byte-for-byte what they were.
let W = CW;
let ORIENTATION = "portrait";
/** Choose the page for the blocks built after this call: "portrait" (default) or "landscape". Returns the content width. */
export function usePage(orientation = "portrait") {
  ORIENTATION = orientation === "landscape" ? "landscape" : "portrait";
  W = ORIENTATION === "landscape" ? CW_LANDSCAPE : CW;
  return W;
}
export const contentWidth = () => W;

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
  const L = Math.round(W * 0.42), R = W - L;
  const left = cell(new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ type: "png", data: LOGO, transformation: { width: LOGO_W, height: LOGO_H }, altText: { name: "Blue Leaf Building", title: "Blue Leaf Building", description: "Blue Leaf Building logo" } })] }),
    L, { pt: 0, pb: 60, pr: 0, va: VerticalAlign.BOTTOM });
  const right = cell([
    para(run("{HDR_DOC_TYPE}", { size: S.chrome, color: C.grey, caps: true, spacing: 24 }), { align: AlignmentType.RIGHT, after: 20, line: 220 }),
    para(run("{HDR_PROJECT}", { size: S.chrome + 1, color: C.ink }), { align: AlignmentType.RIGHT, after: 0, line: 230 }),
  ], R, { pt: 0, pb: 70, pr: 0, va: VerticalAlign.BOTTOM });
  return new Header({ children: [
    new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [L, R], layout: TableLayoutType.FIXED, borders: { ...noBorders(), bottom: rule(C.hair, 4) }, rows: [new TableRow({ children: [left, right] })] }),
    new Paragraph({ spacing: { after: 0, line: 120 }, children: [run("", { size: 2 })] }),
  ] });
}

/** Identity and status left, "Page X of Y" right, a hairline above. Page fields are separate runs (fix-footer-page-fields). */
export function pageFooter() {
  const o = { size: S.chrome, color: C.grey };
  return new Footer({ children: [new Paragraph({
    spacing: { before: 80, after: 0, line: 220 }, border: { top: rule(C.hair, 4) }, tabStops: [{ type: TabStopType.RIGHT, position: W }],
    children: [
      run("{FTR_IDENTITY}", o), run("\t", o), run("Page ", o),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: o.size, color: o.color }),
      run(" of ", o),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: o.size, color: o.color }),
    ],
  })] });
}

/**
 * Full-width rows that close a table (a note, the closing callout). LibreOffice keeps table rows together but not a
 * table with the paragraph after it, so a closing block that must never sit alone on a page is the table's last rows.
 * cond: an optional condition key wrapping the row. keep: glue it to the next row.
 */
export function tailNoteRow(field, { cond = null, keep = false } = {}) {
  // {-w:tr …} removes the whole row when the condition is false, so an absent note leaves no padded empty row
  // (final inspection CONSISTENCY-09).
  return new TableRow({ cantSplit: true, children: [cell(
    para([run(cond ? `{-w:tr ${cond}}` : "", { size: 2 }), run(`{${field}}`, { size: S.small, color: C.grey }), run(cond ? `{/${cond}}` : "", { size: 2 })], { after: 0, line: 252, keepNext: keep }),
    W, { span: 2, pt: 140, pb: 60, pl: 0, pr: 0, borders: { top: none(), left: none(), right: none(), bottom: none() } })] });
}
export function tailCalloutRow(labelTag, bodyTag, span) {
  // The gap above the box is its own borderless row (tailSpacerRow), not a white top border: a heavy white border
  // painted over the closing rule of the table's last row whenever a conditional row between them was removed
  // (final-inspection verification REG-01).
  return new TableRow({ cantSplit: true, children: [cell([
    para(run(`{${labelTag}}`, { size: S.kicker, bold: true, color: C.blue, caps: true, spacing: 16 }), { after: 40, keepNext: true }),
    para(run(`{${bodyTag}}`, { size: S.small + 1 }), { after: 0, line: 252 }),
  ], W, { span, fill: C.tint, pt: 110, pb: 110, pl: 180, pr: 180, borders: { left: rule(C.blue, 18), top: none(), bottom: none(), right: none() } })] });
}
/** A fixed-height empty row with no borders: the space above a closing callout. Always present, so the rule above it stays. */
export function tailSpacerRow(span, height = 100) {
  return new TableRow({ cantSplit: true, height: { value: height, rule: HeightRule.EXACT }, children: [cell(
    para(run("", { size: 2 }), { after: 0, line: 120, keepNext: true }),
    W, { span, pt: 0, pb: 0, pl: 0, pr: 0, borders: { top: none(), left: none(), right: none(), bottom: none() } })] });
}

export const sectionProps = () => (ORIENTATION === "landscape"
  // docx swaps the two dimensions for a landscape page: pass them as portrait.
  ? { page: { size: { width: PAGE.w, height: PAGE.h, orientation: PageOrientation.LANDSCAPE }, margin: PAGE.margin } }
  : { page: { size: { width: PAGE.w, height: PAGE.h }, margin: PAGE.margin } });

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
  const half = Math.round(W / 2);
  const mk = (l, v, open, close) => cell([
    para([run(open || "", { size: S.meta }), run(`{${l}}`, { size: S.meta, bold: true, color: C.blue, caps: true, spacing: 16 })], { after: 30, line: 220 }),
    para([run(`{${v}}`, { size: S.body }), run(close || "", { size: S.body })], { after: 0, line: 252 }),
  ], half, { fill: C.surface, pt: 90, pb: 90, pl: 160, pr: 160, borders: { top: none(), left: none(), right: none(), bottom: rule(C.white, 12) } });
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [half, W - half], layout: TableLayoutType.FIXED, borders: noBorders(),
    rows: [new TableRow({ cantSplit: true, children: [mk("LA", "VA", "{#META_ROWS}"), mk("LB", "VB", null, "{/META_ROWS}")] })] });
}

/** Shaded callout with a blue edge: a label and one paragraph. */
export function callout(labelTag, bodyTag) {
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], layout: TableLayoutType.FIXED, borders: noBorders(),
    rows: [new TableRow({ cantSplit: true, children: [cell([
      para(run(`{${labelTag}}`, { size: S.kicker, bold: true, color: C.blue, caps: true, spacing: 16 }), { after: 40 }),
      para(run(`{${bodyTag}}`, { size: S.small + 1 }), { after: 0, line: 252 }),
    ], W, { fill: C.tint, pt: 110, pb: 110, pl: 180, pr: 180, borders: { left: rule(C.blue, 18), top: none(), bottom: none(), right: none() } })] })] });
}

/** Section opening: "01  /  THE PROJECT" with a rule, then the Heading 1 title. */
export function sectionHead(numTag, kicker, title) {
  return [
    para([run(`{${numTag}}`, { size: S.kicker, bold: true, color: C.blue }), run(`  /  ${kicker}`, { size: S.kicker, bold: true, color: C.blue, caps: true, spacing: 16 })],
      { before: 280, after: 100, keepNext: true, border: { bottom: rule(C.blue, 6) } }),
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
export function bulletLoop(key, { textField = "TEXT", refField = null, keep = false } = {}) {
  const kids = [run(`{${textField}}`)];
  if (refField) kids.push(run(`{${refField}}`, { size: S.meta, color: C.grey }));
  return when(key, [para(kids, { numbering: { reference: "blb-bullet", level: 0 }, after: 60, line: 252, keepNext: keep })]);
}

/**
 * A bounded bullet list (the payload's boundedRows split): a short list stays whole with its label, a long one keeps
 * its first two and last two bullets together, so a label never ends a page with one bullet under it.
 */
export const boundedBullets = (key) => [...bulletLoop(`${key}_KEEP`, { keep: true }), ...bulletLoop(key), ...bulletLoop(`${key}_PEN`, { keep: true }), ...bulletLoop(`${key}_LAST`)];

/** The column header row. */
const headerRow = (cols) => new TableRow({ tableHeader: true, cantSplit: true, children: cols.map((c, i) => cell(
  para(run(c.head, { size: S.th, bold: true, color: C.blue, caps: true, spacing: 14 }), { after: 0, line: 220, keepNext: true }),
  c.width, { fill: C.surface, pt: 80, pb: 80, pl: i === 0 ? 140 : 0, pr: 140, va: VerticalAlign.CENTER, borders: { top: none(), left: none(), right: none(), bottom: rule(C.blue, 6) } })) });

/** One looped data row: {#key} in the first cell, {/key} (plus any closers) in the last. keep glues it to the next row. */
function loopRow(key, cols, { keep = false, closeExtra = "" } = {}) {
  return new TableRow({ cantSplit: true, children: cols.map((c, i) => {
    const kids = [];
    if (i === 0) kids.push(run(`{#${key}}`, { size: 2 }));
    // c.pre: words printed first in grey italic, for a gap Blue Leaf still has to fill ("Brief to follow."; drafts only).
    if (c.pre) kids.push(run(`{${c.pre}}`, { size: c.size || S.table, color: C.grey, italics: true }));
    kids.push(run(`{${c.field}}`, { size: c.size || S.table, bold: !!c.bold, color: c.color || C.ink }));
    // c.again: the same value printed quietly (the payload fills one of field / again, never both).
    if (c.again) kids.push(run(`{${c.again}}`, { size: c.size || S.table, color: C.grey }));
    if (c.sub) kids.push(run(`{${c.sub}}`, { size: S.meta, color: C.grey }));
    if (i === cols.length - 1) kids.push(run(`{/${key}}${closeExtra}`, { size: 2 }));
    return cell(para(kids, { after: 0, line: 252, keepNext: keep }), c.width, { pt: 60, pb: 60, pl: i === 0 ? 140 : 0, pr: 140, borders: { top: none(), left: none(), right: none(), bottom: rule(C.hair, 4) } });
  }) });
}

/**
 * A data table: a header row that repeats on every page, then looped rows that never split.
 * cols: [{ head, field, width, bold?, color?, size?, sub? }]. Rows loop over KEY.
 * o.bounded: the payload splits the rows into KEY_KEEP (glued to the next row), KEY (free), KEY_PEN (glued to the
 * last) and KEY_LAST, so a short table stays whole and a long one never leaves a single row on a page: the header
 * keeps its first two rows and the last two rows stay together (independent review CPB-04/08).
 * o.lastKeepNext: the last row also stays with what follows (the closing block after the final table).
 */
export function dataTable(key, cols, o = {}) {
  const total = cols.reduce((a, c) => a + c.width, 0);
  if (total !== W) throw new Error(`dataTable ${key}: column widths ${total} must equal ${W}`);
  const rows = [headerRow(cols)];
  if (o.bounded) {
    rows.push(loopRow(`${key}_KEEP`, cols, { keep: true }), loopRow(key, cols), loopRow(`${key}_PEN`, cols, { keep: true }), loopRow(`${key}_LAST`, cols, { keep: !!o.lastKeepNext || !!(o.tail && o.tail.length) }));
    rows.push(...(o.tail || []));
    return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cols.map((c) => c.width), layout: TableLayoutType.FIXED, borders: noBorders(), rows });
  }
  rows.push(loopRow(key, cols));
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cols.map((c) => c.width), layout: TableLayoutType.FIXED, borders: noBorders(), rows });
}

/**
 * A definition list: label on the left (grey, bold), words on the right, a hairline between rows, no header. Bounded like
 * a data table (KEY_KEEP / KEY / KEY_PEN / KEY_LAST), so neither end is ever a single row on a page. Rows: { LABEL, TEXT }.
 */
export function defTable(key, labelWidth = 1930) {
  const cols = [{ field: "LABEL", width: labelWidth, bold: true, color: C.grey, size: S.table }, { field: "TEXT", width: W - labelWidth }];
  const row = (k, keep) => new TableRow({ cantSplit: true, children: cols.map((c, i) => {
    const kids = [];
    if (i === 0) kids.push(run(`{#${k}}`, { size: 2 }));
    kids.push(run(`{${c.field}}`, { size: c.size || S.table, bold: !!c.bold, color: c.color || C.ink }));
    if (i === cols.length - 1) kids.push(run(`{/${k}}`, { size: 2 }));
    return cell(para(kids, { after: 0, line: 252, keepNext: keep }), c.width, { pt: 60, pb: 60, pl: 0, pr: 160, borders: { top: none(), left: none(), right: none(), bottom: rule(C.hair, 4) } });
  }) });
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cols.map((c) => c.width), layout: TableLayoutType.FIXED, borders: noBorders(),
    rows: [row(`${key}_KEEP`, true), row(key, false), row(`${key}_PEN`, true), row(`${key}_LAST`, false)] });
}

/**
 * A grouped table (independent reviews CPB-07, CPB2-06, CPB3-04/05). Each group is its own table whose one header row
 * carries the column labels with the group's name in the middle column ("WHERE · BATHROOMS AND LAUNDRY · STATUS"). It
 * is a repeating header row, so a group that runs onto the next page opens it with its name and the column labels.
 * Every row names its place (the payload prints a repeat quietly through the column's `again` field), so a row at the
 * top of a page is never without it. A 10 pt exact paragraph separates the groups, so LibreOffice never merges two.
 * groupKey loops over [{ [lastKey], [bandField], ...boundedRows(rowsKey) }]: the header keeps its first two rows and
 * the last two rows stay together, so neither end of a group is ever a single row on a page.
 * o.tail: a note field printed as the last row of the LAST group only (lastKey), so it always travels with that
 * group's last two rows (the status key under the preferences). Returns blocks (paragraphs and tables).
 */
export function groupedTable(groupKey, bandField, rowsKey, cols, { lastKey = "G_LAST", tail = null, lastGap = true } = {}) {
  const total = cols.reduce((a, c) => a + c.width, 0);
  if (total !== W) throw new Error(`groupedTable ${groupKey}: column widths ${total} must equal ${W}`);
  if (cols.length !== 3) throw new Error(`groupedTable ${groupKey}: the group name takes the middle of three columns`);
  const head = new TableRow({ tableHeader: true, cantSplit: true, children: cols.map((c, i) => cell(
    para(run(i === 1 ? `{${bandField}}` : c.head, { size: S.th, bold: true, color: i === 1 ? C.ink : C.blue, caps: true, spacing: 14 }), { after: 0, line: 220, keepNext: true }),
    c.width, { fill: C.surface, pt: 80, pb: 80, pl: i === 0 ? 140 : 0, pr: 140, va: VerticalAlign.CENTER, borders: { top: none(), left: none(), right: none(), bottom: rule(C.blue, 6) } })) });
  const rows = [head, loopRow(`${rowsKey}_KEEP`, cols, { keep: true }), loopRow(rowsKey, cols), loopRow(`${rowsKey}_PEN`, cols, { keep: true }),
    loopRow(`${rowsKey}_LAST`, cols, { keep: !!tail })];
  // {-w:tr …} makes the condition remove the whole row in every group but the last.
  if (tail) rows.push(new TableRow({ cantSplit: true, children: [cell(
    para([run(`{-w:tr ${lastKey}}`, { size: 2 }), run(`{${tail}}`, { size: S.small, color: C.grey }), run(`{/${lastKey}}`, { size: 2 })], { after: 0, line: 252 }),
    W, { span: cols.length, pt: 120, pb: 40, pl: 0, pr: 0, borders: { top: none(), left: none(), right: none(), bottom: none() } })] }));
  const table = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cols.map((c) => c.width), layout: TableLayoutType.FIXED, borders: noBorders(), rows });
  // The gap separates one group's table from the next; after the last group (the one carrying the tail) the section's
  // own spacing follows, as after any other table (final inspection KESTREL-07).
  // lastGap: false — the table ends the document, so nothing trails the last group onto an empty page.
  return when(groupKey, tail || !lastGap ? [table, tag(`^${lastKey}`), tableGap(200), tag(`/${lastKey}`)] : [table, tableGap(200)]);
}

/**
 * A titled bullet list that may run onto the next page (independent review CPB2-01; review CPB3-L1/L5). The title is
 * the table's header row, so a list that continues on the next page opens with its title again: continued items are
 * never shown without it. Each item is a single-cell row holding a Word list paragraph (the same bullets as anywhere
 * else, so the DOCX edits like a list); {-w:tr …} makes the loop repeat the table row. Rows loop over the payload's
 * boundedRows split of key, so the title keeps its first two items and the last two stay together.
 * head: the header cell's paragraphs. Use listTable (a Heading 2 title) or labelledList (a small label and a note).
 */
// Spacing matches the paragraph lists it replaced: a list paragraph's "after" doesn't add to the next heading's "before"
// (the larger wins), but a table cell's padding does, so the last item has no bottom padding and the title rows carry
// only the difference (verification V-04).
function bulletRow(key, keep, bottom = 60) {
  return new TableRow({ cantSplit: true, children: [cell(
    para([run(`{-w:tr ${key}}`, { size: 2 }), run("{TEXT}"), run(`{/${key}}`, { size: 2 })], { numbering: { reference: "blb-bullet", level: 0 }, after: 0, line: 252, keepNext: keep }),
    W, { pt: 0, pb: bottom, pl: 0, pr: 0 })] });
}
export function titledList(key, head, { headTop = 120, headBottom = 70 } = {}) {
  const top = new TableRow({ tableHeader: true, cantSplit: true, children: [cell(head, W, { pt: headTop, pb: headBottom, pl: 0, pr: 0 })] });
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], layout: TableLayoutType.FIXED, borders: noBorders(),
    rows: [top, bulletRow(`${key}_KEEP`, true), bulletRow(key, false), bulletRow(`${key}_PEN`, true), bulletRow(`${key}_LAST`, false, 0)] });
}
/** A list under a Heading 2 title (Scope: "What we propose to build"). */
export const listTable = (key, title) => titledList(key, [para(run(title, { size: S.h2, bold: true }), { heading: HeadingLevel.HEADING_2, after: 0, line: 240, keepNext: true })]);
/**
 * A list under a small blue label, with an optional grey note (the scope boundaries, the assumptions). Each list is
 * its own table, so put a hairline paragraph after it inside its loop: two of them never touch.
 */
export const labelledList = (key, labelTag, { noteCond = null, noteTag = null } = {}) => titledList(key, [
  para(run(`{${labelTag}}`, { size: S.kicker, bold: true, color: C.blue, caps: true, spacing: 16 }), { after: 0, keepNext: true }),
  ...(noteCond ? when(noteCond, [para(run(`{${noteTag}}`, { size: S.small + 1, color: C.grey }), { before: 60, after: 0, keepNext: true })]) : []),
], { headTop: 150, headBottom: 60 });   // with the 1 pt gap, the same spacing as the old label (about 8.5 pt above, 3 pt below)
/** The paragraph that keeps two looped tables apart: exactly 1 pt tall (an "auto" line takes the 10 pt default font's height). */
export function tableGap(line = 20) { return new Paragraph({ spacing: { before: 0, after: 0, line, lineRule: LineRuleType.EXACT }, children: [run("", { size: 2 })] }); }

/** A band of n numbered cards across the full width (no loop: one band per count, chosen by a condition). Fields {PREFIX1..n}. */
export function cardBand(n, numPrefix, labelPrefix) {
  const w = Math.floor(W / n), widths = Array.from({ length: n }, (_, i) => (i === n - 1 ? W - w * (n - 1) : w));
  const cells = widths.map((wd, i) => cell([
    para(run(`{${numPrefix}${i + 1}}`, { size: S.kicker, bold: true, color: C.blue }), { after: 40 }),
    para(run(`{${labelPrefix}${i + 1}}`, { size: S.h2, bold: true }), { after: 0, line: 252 }),
  ], wd, { fill: C.surface, pt: 120, pb: 130, pl: 170, pr: 170, borders: { top: rule(C.blue, 12), left: none(), bottom: none(), right: i < n - 1 ? rule(C.white, 24) : none() } }));
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: noBorders(), rows: [new TableRow({ cantSplit: true, children: cells })] });
}

/**
 * A grouped table with any number of columns (the technical selections schedule). Each group is its own table with two
 * repeating header rows: the group's name across the full width, then the column labels. So a group that runs onto the
 * next page opens it with both. Rows are the payload's boundedRows split, so neither end of a group is ever a single
 * row on a page. Separated by a 10 pt exact paragraph, as groupedTable. Returns blocks.
 */
export function bandTable(groupKey, bandField, rowsKey, cols, { lastKey = "G_LAST", lastGap = true } = {}) {
  const total = cols.reduce((a, c) => a + c.width, 0);
  if (total !== W) throw new Error(`bandTable ${groupKey}: column widths ${total} must equal ${W}`);
  const band = new TableRow({ tableHeader: true, cantSplit: true, children: [cell(
    para(run(`{${bandField}}`, { size: S.h2 - 2, bold: true, color: C.ink }), { after: 0, line: 240, keepNext: true }),
    W, { span: cols.length, pt: 60, pb: 70, pl: 0, pr: 0, borders: { top: none(), left: none(), right: none(), bottom: none() } })] });
  const rows = [band, headerRow(cols), loopRow(`${rowsKey}_KEEP`, cols, { keep: true }), loopRow(rowsKey, cols), loopRow(`${rowsKey}_PEN`, cols, { keep: true }), loopRow(`${rowsKey}_LAST`, cols)];
  const table = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cols.map((c) => c.width), layout: TableLayoutType.FIXED, borders: noBorders(), rows });
  return when(groupKey, !lastGap ? [table, tag(`^${lastKey}`), tableGap(200), tag(`/${lastKey}`)] : [table, tableGap(200)]);
}
