// Generate the SYNTHETIC plan PDFs used by ui-review + viewer stress tests (no customer data).
//   node scripts/takeoff/make-review-fixtures.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { buildPlanSetPdf } from "../tests/lib/takeoffPdfFixture.mjs";

const out = new URL("../../src/ui-review/fixtures/takeoff/", import.meta.url);
mkdirSync(out, { recursive: true });
const set = buildPlanSetPdf([
  { kind: "known" },
  { kind: "known", rotate: 90, origin: { x: 30, y: -40 } },
  ...Array.from({ length: 10 }, () => ({ kind: "dense", size: { w: 2384, h: 1684 } })), // ≥10-page A1 set
]);
writeFileSync(new URL("synthetic-plan-set.pdf", out), set.bytes);
writeFileSync(new URL("synthetic-plan-set.json", out), JSON.stringify({ pages: set.pages }, null, 2));
console.log(`synthetic-plan-set.pdf: ${set.pages.length} pages, ${(set.bytes.length / 1024).toFixed(0)} KiB`);
