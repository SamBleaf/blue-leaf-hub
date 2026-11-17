// author-adb.mjs — DESIGN-TIME: writes the Architect Design Brief template (BLB-ADB) from the shared design system.
//
//   node scripts/documents/author-adb.mjs        → public/templates/blb-architect-brief-template.docx
//
// Needs the docx-js authoring library (`npm i --no-save docx@9`); the Hub never loads it at runtime.
// Every {TAG} is filled by buildArchitectBriefPayload (server/lib/documents/documentPayloads.mjs), from the brief model
// (src/lib/briefModel.js). adb-2.0 (owner approval 17 Nov 2026, REGISTER_SCREENS_SPEC.md S6): the project, the site and
// its constraints, a numbered list of what the next drawing issue needs and from whom, one row per room, and only the
// selections that change the drawings. Finishes are in the Technical Selections Schedule. Every section is optional and
// vanishes when empty; the numbers count only what prints. Built on the client brief's accepted design (cpb-2.4).
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Document, Packer } from "docx";
import { fixDocxFooterFields } from "./fix-footer-page-fields.mjs";
import {
  CW, C, S, when, gap, titleBlock, metaGrid, callout, sectionHead, body, bodyGrey, label, para, run, dataTable, defTable, tableGap,
  pageHeader, pageFooter, sectionProps, documentStyles, documentNumbering,
} from "./design-system.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/templates/blb-architect-brief-template.docx");
export const ADB_TEMPLATE_VERSION = "adb-2.0";   // the brief model (owner approval 17 Nov 2026)

const sectionProject = when("HAS_S1", [
  ...sectionHead("S1_NUM", "The project", "The project"),
  defTable("PROJECT_ROWS"),
  gap(80),
]);

const sectionSite = when("HAS_S2", [
  ...sectionHead("S2_NUM", "Site", "Site and constraints"),
  para(run("{SITE_INTRO}", { size: S.small + 1, color: C.grey, italics: true }), { after: 80, keepNext: true }),
  defTable("SITE_ROWS"),
  gap(80),
]);

// No. | What's needed | Who, with a By column once any point has a by-when.
const NUM = { head: "No.", field: "N", width: 780, bold: true, color: C.blue };
const sectionPoints = when("HAS_S3", [
  ...sectionHead("S3_NUM", "Next drawing issue", "Needed for the next drawing issue"),
  body("{POINTS_INTRO}", { keepNext: true }),
  ...when("HAS_BY", [dataTable("POINTS", [NUM, { head: "What's needed", field: "TEXT", width: 5461 }, { head: "Who", field: "WHO", width: 2146 },
    { head: "By", field: "BY", width: 1365, color: C.grey, size: S.small }], { bounded: true })]),
  ...when("NO_BY", [dataTable("POINTS", [NUM, { head: "What's needed", field: "TEXT", width: 6826 }, { head: "Who", field: "WHO", width: 2146 }], { bounded: true })]),
  gap(80),
]);

// One row per room; a floor's own label and table when the job has more than one floor. The header row repeats.
const sectionRooms = when("HAS_S4", [
  ...sectionHead("S4_NUM", "Rooms", "Rooms"),
  body("{ROOMS_INTRO}", { keepNext: true, after: 80 }),
  ...when("FLOORS", [
    ...when("HAS_FLOOR", [label("{FLOOR}", { before: 120 })]),
    dataTable("RROWS", [
      { head: "Room", field: "ROOM", width: 2145, bold: true },
      { head: "Work", field: "WORK", width: 1365, color: C.grey },
      { head: "What it must do and contain", field: "TEXT", pre: "PRE", width: 6242 },
    ], { bounded: true }),
    tableGap(160),
  ]),
  gap(40),
]);

const sectionSelections = when("HAS_S5", [
  ...sectionHead("S5_NUM", "Selections", "{S5_TITLE}"),
  defTable("SEL_ROWS"),
  gap(60),
  bodyGrey("{SEL_CLOSE}", { after: 80, size: S.small }),
]);

const sectionOutside = when("HAS_S6", [
  ...sectionHead("S6_NUM", "Outside this job", "Outside this job"),
  defTable("OUT_ROWS"),
]);

const doc = new Document({
  creator: "Blue Leaf Building",
  title: "Architect Design Brief",
  description: `Blue Leaf Building document template ${ADB_TEMPLATE_VERSION}`,
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
      ...sectionSite,
      ...sectionPoints,
      ...sectionRooms,
      ...sectionSelections,
      ...sectionOutside,
    ],
  }],
});

const { buffer } = fixDocxFooterFields(await Packer.toBuffer(doc));
fs.writeFileSync(OUT, buffer);
console.log(`wrote ${OUT} (${buffer.length} bytes, ${ADB_TEMPLATE_VERSION}, content width ${CW})`);
