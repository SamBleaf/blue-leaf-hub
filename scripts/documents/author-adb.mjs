// author-adb.mjs — DESIGN-TIME: writes the Architect Design Brief template (BLB-ADB) from the shared design system.
//
//   node scripts/documents/author-adb.mjs        → public/templates/blb-architect-brief-template.docx
//
// Needs the docx-js authoring library (`npm i --no-save docx@9`); the Hub never loads it at runtime.
// Every {TAG} is filled by buildArchitectBriefPayload (server/lib/documents/documentPayloads.mjs).
// Coordination first (Master Register Tab 17:36, Tab 22:19): the project and its design basis → what we need from the design team
// → decisions that affect the drawings → what the design must achieve → changes to the building → design direction by
// location. The documents on file sit with the project; how to respond is said once, in the requests. Every section is optional and vanishes when empty; the numbers count
// only what prints. Built on the client brief's accepted design (cpb-2.4): same tokens, header, footer, tables.
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Document, Packer } from "docx";
import { fixDocxFooterFields } from "./fix-footer-page-fields.mjs";
import {
  CW, C, S, when, gap, titleBlock, metaGrid, callout, sectionHead, body, paraLoop,
  dataTable, groupedTable, labelledList, pageHeader, pageFooter, sectionProps, documentStyles, documentNumbering,
} from "./design-system.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/templates/blb-architect-brief-template.docx");
export const ADB_TEMPLATE_VERSION = "adb-1.0";   // first design on the CPB foundation (16 Nov 2026)

const REF = { head: "Ref", field: "REF", width: 1500, color: C.blue, size: S.small };

const sectionProject = when("HAS_S1", [
  ...sectionHead("S1_NUM", "The project", "The project and its design basis"),
  ...paraLoop("OVERVIEW", "PARA"),
  // The drawing basis is on the cover; the documents on file are listed here, with the project (Tab 11:28, section 1).
  ...when("HAS_REFS", [labelledList("REFS", "REFS_LABEL"), gap(60)]),
]);

const sectionRequests = when("HAS_S2", [
  ...sectionHead("S2_NUM", "Requests", "What we need from the design team"),
  body("{REQUESTS_INTRO}", { keepNext: true }),
  dataTable("REQUESTS", [REF, { head: "Request", field: "TEXT", width: 6052 }, { head: "Who", field: "WHO", width: 2200 }], { bounded: true }),
  gap(80),
]);

const sectionDecisions = when("HAS_S3", [
  ...sectionHead("S3_NUM", "Decisions", "Decisions that affect the drawings"),
  body("{DECISIONS_INTRO}", { keepNext: true }),
  dataTable("DECISIONS", [REF, { head: "Decision", field: "TEXT", width: 6052 }, { head: "Who", field: "WHO", width: 2200 }], { bounded: true }),
  gap(80),
]);

const sectionRequirements = when("HAS_S4", [
  ...sectionHead("S4_NUM", "Requirements", "What the design must achieve"),
  body("{REQS_INTRO}", { keepNext: true }),
  dataTable("REQS", [REF, { head: "Requirement", field: "TEXT", width: 6452 }, { head: "Status", field: "STATUS", width: 1800, color: C.grey, size: S.small }], { bounded: true }),
  gap(80),
]);

// Grouped as the client brief groups its preferences: one table per group, its header row "REF · <GROUP> · CHECK"
// repeating when the group runs onto the next page.
const sectionScope = when("HAS_S5", [
  ...sectionHead("S5_NUM", "Scope", "Changes to the building"),
  body("{SCOPE_INTRO}", { keepNext: true, after: 120 }),
  ...groupedTable("SCOPE_GROUPS", "SG", "SROWS", [
    REF,
    { head: "Work", field: "TEXT", width: 6452 },
    { head: "{SCOPE_CHECK_HEAD}", field: "CHECK", width: 1800, color: C.grey, size: S.small },
  ], { lastKey: "S_LAST" }),
  gap(80),
]);

// What applies throughout the house once, then each room (or rooms that share the same choices) with its own items.
const sectionDirection = when("HAS_S6", [
  ...sectionHead("S6_NUM", "Design direction", "Design direction by location"),
  ...when("HAS_DIRECTION", [body("{DIRECTION}")]),
  body("{DIR_INTRO}", { keepNext: true, after: 120 }),
  ...groupedTable("DIR_GROUPS", "DG", "DROWS", [
    { head: "Item", field: "ITEM", sub: "ITEM_REF", width: 2350, bold: true },
    { head: "Direction", field: "TEXT", width: 5602 },
    { head: "Status", field: "STATUS", width: 1800, color: C.grey, size: S.small },
  ], { lastKey: "D_LAST", lastGap: false }),
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
      ...sectionRequests,
      ...sectionDecisions,
      ...sectionRequirements,
      ...sectionScope,
      ...sectionDirection,
    ],
  }],
});

const { buffer } = fixDocxFooterFields(await Packer.toBuffer(doc));
fs.writeFileSync(OUT, buffer);
console.log(`wrote ${OUT} (${buffer.length} bytes, ${ADB_TEMPLATE_VERSION}, content width ${CW})`);
