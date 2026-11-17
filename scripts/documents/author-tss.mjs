// author-tss.mjs — DESIGN-TIME: writes the Technical Selections Schedule template (BLB-TSS) from the shared design system.
//
//   node scripts/documents/author-tss.mjs        → public/templates/blb-selections-schedule-template.docx
//
// Needs the docx-js authoring library (`npm i --no-save docx@9`); the Hub never loads it at runtime.
// Every {TAG} is filled by buildSelectionsSchedulePayload (server/lib/documents/documentPayloads.mjs).
// Spec: docs/documents/SELECTIONS_SPEC.md §3. A4 landscape (Tab 17:86): seven columns don't fit a portrait page.
// Same tokens, header, footer and table rules as the CPB and ADB; its own page composition: 01 the selections by trade,
// 02 the requirements they must meet, 03 open actions and checks, 04 the source documents. Every section is optional.
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Document, Packer } from "docx";
import { fixDocxFooterFields } from "./fix-footer-page-fields.mjs";
import {
  usePage, C, S, when, gap, titleBlock, metaGrid, callout, sectionHead, body, label,
  dataTable, bandTable, pageHeader, pageFooter, sectionProps, documentStyles, documentNumbering,
} from "./design-system.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/templates/blb-selections-schedule-template.docx");
export const TSS_TEMPLATE_VERSION = "tss-1.0";   // first design on the CPB/ADB foundation (16 Nov 2026)

const W = usePage("landscape");   // every block below is built at the landscape width (14684 twips)
const REF = { head: "Ref", field: "REF", width: 1250, color: C.blue, size: S.small };

// How to read and the summary sit on page 1 under the status note, so the schedule starts with its heading and
// first trade together (render review: page 1 was otherwise empty below the note).
const reading = [label("Reading this schedule", { before: 220 }), body("{READ_INTRO}", { size: S.small + 1 }), body("{SUMMARY}", { after: 60 })];
const sectionSelections = when("HAS_S1", [
  ...sectionHead("S1_NUM", "Selections", "Selections by trade"),
  // One table per trade: its name and the column labels repeat at the top of every page it runs onto.
  ...bandTable("SEL_GROUPS", "GROUP", "ROWS", [
    REF,
    { head: "Item and location", field: "ITEM", sub: "LOC", width: 2700, bold: true },
    { head: "Selection", field: "SEL", sub: "DETAIL", width: 4500 },
    { head: "Finish", field: "FINISH", width: 2100 },
    { head: "Qty", field: "QTY", width: 900 },
    { head: "Status", field: "STATUS", sub: "TECH", width: 1500, size: S.small },
    { head: "Source", field: "SOURCE", sub: "FLAG", width: W - 1250 - 2700 - 4500 - 2100 - 900 - 1500, color: C.grey, size: S.small },
  ]),
  gap(80),
]);

const sectionRequirements = when("HAS_S2", [
  ...sectionHead("S2_NUM", "Requirements", "Requirements these selections must meet"),
  body("{REQS_INTRO}", { keepNext: true }),
  dataTable("REQS", [REF, { head: "Requirement", field: "TEXT", width: 8434 }, { head: "Applies to", field: "APPLIES", width: 2800, color: C.grey, size: S.small },
    { head: "Status", field: "STATUS", sub: "WHO", width: W - 1250 - 8434 - 2800, size: S.small }], { bounded: true }),
  gap(80),
]);

// In a coordination pack, 03 is what the party is asked for, and the next section what waits on the client or Blue
// Leaf, for information only (owner, checkpoint 01 review).
const sectionActions = when("HAS_S3", [
  ...sectionHead("S3_NUM", "{S3_KICKER}", "{S3_TITLE}"),
  body("{ACTIONS_INTRO}", { keepNext: true }),
  dataTable("ACTIONS", [REF, { head: "What is needed", field: "TEXT", width: 10434 }, { head: "Who", field: "WHO", width: W - 1250 - 10434 }], { bounded: true }),
  gap(80),
]);
const sectionPending = when("HAS_S3B", [
  ...sectionHead("S3B_NUM", "For information", "Waiting on others"),
  body("{PENDING_INTRO}", { keepNext: true }),
  dataTable("PENDING", [REF, { head: "What is open", field: "TEXT", width: 10434 }, { head: "With", field: "WHO", width: W - 1250 - 10434 }], { bounded: true }),
  gap(80),
]);

const sectionSources = when("HAS_S4", [
  ...sectionHead("S4_NUM", "Sources", "Source documents"),
  body("{SOURCES_INTRO}", { keepNext: true }),
  dataTable("SOURCES", [{ head: "Key", field: "KEY", width: 1250, color: C.blue, size: S.small }, { head: "Document", field: "DOC", width: 4500, bold: true },
    { head: "Revision and date", field: "REV", width: 5434 }, { head: "Review status", field: "REVIEW", width: W - 1250 - 4500 - 5434 }], { bounded: true }),
]);

const doc = new Document({
  creator: "Blue Leaf Building",
  title: "Technical Selections Schedule",
  description: `Blue Leaf Building document template ${TSS_TEMPLATE_VERSION}`,
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
      ...reading,
      ...sectionSelections,
      ...sectionRequirements,
      ...sectionActions,
      ...sectionPending,
      ...sectionSources,
    ],
  }],
});

const { buffer } = fixDocxFooterFields(await Packer.toBuffer(doc));
fs.writeFileSync(OUT, buffer);
console.log(`wrote ${OUT} (${buffer.length} bytes, ${TSS_TEMPLATE_VERSION}, landscape content width ${W})`);
