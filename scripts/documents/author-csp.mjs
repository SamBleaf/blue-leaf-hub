// author-csp.mjs — DESIGN-TIME: writes the Client Selections Presentation template (BLB-CSP) from the shared design system.
//
//   node scripts/documents/author-csp.mjs        → public/templates/blb-client-presentation-template.docx
//
// Needs the docx-js authoring library (`npm i --no-save docx@9`); the Hub never loads it at runtime.
// Every {TAG} is filled by buildClientPresentationPayload (server/lib/documents/documentPayloads.mjs).
// Spec: docs/documents/SELECTIONS_SPEC.md §4. A4 portrait, the client brief's design (cpb-2.4): what we need from the
// client first, then their selections by location (throughout the house, then each room). Text-first: the register has
// no cleared images (spec S5). No references, codes, suppliers or technical states.
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Document, Packer } from "docx";
import { fixDocxFooterFields } from "./fix-footer-page-fields.mjs";
import {
  usePage, CW, C, S, when, gap, titleBlock, metaGrid, callout, sectionHead, body,
  dataTable, groupedTable, pageHeader, pageFooter, sectionProps, documentStyles, documentNumbering,
} from "./design-system.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/templates/blb-client-presentation-template.docx");
export const CSP_TEMPLATE_VERSION = "csp-1.0";   // first design on the CPB foundation (16 Nov 2026)
if (usePage("portrait") !== CW) throw new Error("the presentation is built at the portrait width");

const sectionNeeds = when("HAS_S1", [
  ...sectionHead("S1_NUM", "Your decisions", "What we need from you"),
  body("{NEEDS_INTRO}", { keepNext: true }),
  ...when("HAS_NEEDS", [dataTable("NEEDS", [{ head: "Item", field: "ITEM", sub: "WHERE", width: 2800, bold: true }, { head: "What we need", field: "TEXT", width: CW - 2800 }], { bounded: true }), gap(80)]),
]);

// The client brief's grouped table: one per location, its header row "ITEM · <LOCATION> · STATUS" repeating.
const sectionSelections = when("HAS_S2", [
  ...sectionHead("S2_NUM", "Your selections", "Your selections, room by room"),
  body("{SEL_INTRO}", { keepNext: true, after: 120 }),
  ...groupedTable("SEL_GROUPS", "GROUP", "ROWS", [
    { head: "Item", field: "ITEM", width: 2450, bold: true },
    { head: "Your selection", field: "TEXT", sub: "FINISH", width: 5502 },
    { head: "Status", field: "STATUS", width: 1800, color: C.grey, size: S.small },
  ], { lastGap: false }),
]);

const doc = new Document({
  creator: "Blue Leaf Building",
  title: "Client Selections Presentation",
  description: `Blue Leaf Building document template ${CSP_TEMPLATE_VERSION}`,
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
      ...sectionNeeds,
      ...sectionSelections,
    ],
  }],
});

const { buffer } = fixDocxFooterFields(await Packer.toBuffer(doc));
fs.writeFileSync(OUT, buffer);
console.log(`wrote ${OUT} (${buffer.length} bytes, ${CSP_TEMPLATE_VERSION}, content width ${CW})`);
