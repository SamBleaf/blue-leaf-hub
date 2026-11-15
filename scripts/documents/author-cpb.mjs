// author-cpb.mjs — DESIGN-TIME: writes the Client Project Brief template (BLB-CPB) from the shared design system.
//
//   node scripts/documents/author-cpb.mjs        → public/templates/blb-client-brief-template.docx
//
// Needs the docx-js authoring library (`npm i --no-save docx@9`); the Hub never loads it at runtime.
// Every {TAG} is filled by buildClientBriefPayload (server/lib/documents/documentPayloads.mjs).
// Reading sequence (owner's brief, 15 Nov 2026): the project → scope → design direction → assumptions and
// items to confirm → decisions → next steps. Each section after the first is optional and vanishes when empty.
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Document, Packer } from "docx";
import { fixDocxFooterFields } from "./fix-footer-page-fields.mjs";
import {
  CW, S, C, run, para, when, gap, titleBlock, metaGrid, callout, sectionHead, h2, body, paraLoop,
  dataTable, groupedTable, listTable, labelledList, tableGap, cardBand, tailNoteRow, tailCalloutRow, tailSpacerRow, pageHeader, pageFooter, sectionProps, documentStyles, documentNumbering,
} from "./design-system.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/templates/blb-client-brief-template.docx");
export const CPB_TEMPLATE_VERSION = "cpb-2.4";   // final candidate: cpb-2.3 design plus the final-inspection fixes

// Three priorities: cards; two: two columns; one: a single line (CPB-10).
const priorities = [
  ...when("PRI_INLINE", [para([run("Your priority: ", { size: S.h2, bold: true, color: C.grey }), run("{PL1}", { size: S.h2, bold: true })], { before: 200, after: 100 })]),
  ...when("PRI_BAND_3", [h2("What matters most to you"), cardBand(3, "PN", "PL"), gap(60)]),
  ...when("PRI_BAND_2", [h2("What matters most to you"), cardBand(2, "PN", "PL"), gap(60)]),
  ...when("HAS_PRIORITY_NOTE", [para([run("In your words: ", { size: S.body, bold: true, color: C.grey }), run("{PRIORITY_NOTE}", { size: S.body, italics: true })], { after: 100 })]),
];

const sectionProject = when("HAS_S1", [
  ...sectionHead("S1_NUM", "The project", "Your project at a glance"),
  ...paraLoop("OVERVIEW", "PARA"),
  ...when("HAS_PRIORITIES", priorities),
  ...when("HAS_DIRECTION", [h2("The design direction"), body("{DIRECTION}")]),
]);

// Each boundary list is a titled table: its label (and note) repeat when the list runs onto the next page (CPB3-L1).
const boundaryBlocks = when("BOUNDARIES", [labelledList("B_ROWS", "B_LABEL", { noteCond: "HAS_B_NOTE", noteTag: "B_NOTE" }), tableGap()]);

const sectionScope = when("HAS_S2", [
  ...sectionHead("S2_NUM", "Proposed works", "Scope of works"),
  body("{SCOPE_INTRO}"),
  // The title repeats at the top of the next page when the list runs on (CPB2-01).
  ...when("HAS_SCOPE_IN", [listTable("SCOPE_ROWS", "What we propose to build")]),
  // The heading names only the lists that print (final inspection RIDGELINE-11): a new build has nothing that stays.
  ...when("HAS_BOUNDARIES", [h2("{BOUNDARY_TITLE}"), ...boundaryBlocks]),
]);

const sectionDirection = when("HAS_S3", [
  ...sectionHead("S3_NUM", "Design direction", "Your preferences so far"),
  body("{PREF_INTRO}", { keepNext: true, after: 120 }),
  // Grouped by category (CPB-07). Each group is its own table with one header row, "WHERE · <CATEGORY> · STATUS", that
  // repeats when the group runs onto the next page (CPB2-06, CPB3-05); every row names its place, bold where a place's
  // run starts and quiet after that, so a continued row is never without it (CPB3-04). The status key closes the last
  // group (it travels with its last two rows) and explains only the statuses printed (CPB3-06).
  ...groupedTable("PREF_GROUPS", "GROUP", "ROWS", [
    { head: "Where", field: "WHERE", again: "WHERE_AGAIN", width: 2050, bold: true },
    { head: "Your preference", field: "TEXT", width: 5902 },
    { head: "Status", field: "STATUS", width: 1800, color: C.grey, size: S.small },
  ], { tail: "PREF_KEY" }),
  gap(80),
]);

const sectionNoted = when("HAS_S4", [
  ...sectionHead("S4_NUM", "Assumptions", "Assumptions and items to confirm"),
  ...when("NOTED", [labelledList("N_BUL", "N_LABEL"), tableGap()]),
]);

const sectionDecisions = when("HAS_S5", [
  ...sectionHead("S5_NUM", "Decisions", "Decisions to make"),
  body("{DECISIONS_INTRO}", { keepNext: true }),
  dataTable("DECISIONS", [
    { head: "Ref", field: "REF", width: 1400, color: C.blue, size: S.small },
    { head: "Decision or next step", field: "ACTION", width: 6052 },
    { head: "Who", field: "OWNER", width: 2300 },
  ], { bounded: true }),
  gap(80),
]);

const sectionNext = [
  ...sectionHead("S6_NUM", "Next steps", "What happens next"),
  ...when("NEXT_PARAS", [para(run("{PARA}"), { after: 100, keepNext: true })]),
  // The steps, then (as the table's last rows, so they always travel with its last two rows) one concise PTSA
  // clarification when it applies (CPB-12) and the closing note. Never a closing block alone on a page (CPB-04).
  ...when("HAS_STEPS", [
    dataTable("STEPS", [
      { head: "Stage", field: "SLABEL", width: 2900, bold: true, sub: "SNOW" },
      { head: "What happens", field: "STEXT", width: 6852 },
    ], { bounded: true, tail: [tailNoteRow("PTSA_NOTE", { cond: "HAS_PTSA", keep: true }), tailSpacerRow(2), tailCalloutRow("ABOUT_LABEL", "ABOUT_BODY", 2)] }),
  ]),
];

// Without a steps table (a won project) the closing note stands on its own.
const closing = when("NO_STEPS", [para(run("", { size: 2 }), { after: 140, line: 120, keepNext: true }), callout("ABOUT_LABEL", "ABOUT_BODY")]);

const doc = new Document({
  creator: "Blue Leaf Building",
  title: "Client Project Brief",
  description: `Blue Leaf Building document template ${CPB_TEMPLATE_VERSION}`,
  styles: documentStyles(),
  numbering: documentNumbering(),
  sections: [{
    properties: sectionProps(),
    headers: { default: pageHeader() },
    footers: { default: pageFooter() },
    children: [
      ...titleBlock(),
      metaGrid(),
      gap(140),
      callout("STATUS_LABEL", "STATUS_BODY"),
      ...sectionProject,
      ...sectionScope,
      ...sectionDirection,
      ...sectionNoted,
      ...sectionDecisions,
      ...sectionNext,
      ...closing,
    ],
  }],
});

const { buffer } = fixDocxFooterFields(await Packer.toBuffer(doc));
fs.writeFileSync(OUT, buffer);
console.log(`wrote ${OUT} (${buffer.length} bytes, ${CPB_TEMPLATE_VERSION}, content width ${CW})`);
