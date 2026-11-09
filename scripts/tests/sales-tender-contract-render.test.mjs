/**
 * sales-tender-contract-render.test.mjs — renders the real BuildingContract panel from TenderStage.jsx for each
 * contract state and checks what staff are offered. Bundles it with esbuild and renders to a string, so it needs
 * no browser, server or database. It proves the panel renders and offers the right controls; it does not
 * exercise clicks or uploads (those are API-tested in sandbox-sales-integrity.test.mjs).
 *
 * Run: node scripts/tests/sales-tender-contract-render.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(join(tmpdir(), "tender-render-"));
const out = join(REPO, "node_modules", ".cache", `tender-render-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import { BuildingContract, TenderProgress } from ${JSON.stringify(join(REPO, "src/components/sales/lead-detail/TenderStage.jsx"))};
export function render(lead, isAdmin) {
  return renderToStaticMarkup(<BuildingContract lead={lead} patch={() => {}} reload={() => {}} isAdmin={isAdmin} />);
}
export function renderStrip(lead) {
  return renderToStaticMarkup(<TenderProgress lead={lead} onSet={() => {}} />);
}
`);

await build({
  entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
  define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
});

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message.slice(0, 300)}`); }
}

try {
  const { render, renderStrip } = await import(pathToFileURL(out).href);
  const base = { id: "lead-1", stage: "tender", site_address: "1 Test St", proposal_checklist: {}, selections_schedule: [] };
  

  console.log("\n▸ Not yet signed");
  const open = render({ ...base, contract_status: "sent", contract_sent_date: "2026-11-01" }, true);
  t("offers the upload that marks it signed", () => assert.match(open, /Mark contract as signed/));
  t("Prepared and Sent are still statuses", () => { assert.match(open, />(✓ )?Prepared</); assert.match(open, />Sent</); });
  t("there is no Signed button to click", () => assert.doesNotMatch(open, />(✓ )?Signed</));
  t("says the PDF is what Won needs", () => assert.match(open, /required to move to Won/));
  t("takes PDFs only", () => assert.match(open, /accept="application\/pdf,\.pdf"/));
  t("no undo offered", () => assert.doesNotMatch(open, /Undo signed status/));

  console.log("\n▸ Marked signed with no file");
  const legacy = render({ ...base, contract_status: "signed", contract_signed_date: "2025-03-01", contract_evidence_present: false }, true);
  t("says the PDF is missing and why it matters", () => assert.match(legacy, /isn.{1,8}t on file\. Upload it to move this lead to Won/));
  t("offers the upload", () => assert.match(legacy, /Attach signed PDF/));
  t("doesn't ask for a date it already has", () => assert.doesNotMatch(legacy, /Date signed/));
  const undated = render({ ...base, contract_status: "signed", contract_signed_date: null, contract_evidence_present: false }, true);
  t("asks for the date when none was ever recorded", () => assert.match(undated, /Date signed/));

  console.log("\n▸ Signed with the PDF on file");
  const done = render({ ...base, contract_status: "signed", contract_signed_date: "2026-10-03", contract_evidence_present: true }, true);
  t("shows it as signed with the date", () => assert.match(done, /✓ Signed 2026-10-03/));
  t("shows the evidence", () => assert.match(done, /Signed PDF on file/));
  t("no longer asks for an upload", () => { assert.doesNotMatch(done, /type="file"/); assert.doesNotMatch(done, /Mark contract as signed/); });
  t("a director can undo it", () => assert.match(done, /Undo signed status/));
  const notAdmin = render({ ...base, contract_status: "signed", contract_evidence_present: true }, false);
  t("nobody else is offered the undo", () => assert.doesNotMatch(notAdmin, /Undo signed status/));

  console.log("\n▸ Tender progress strip");
  const chip = (html, label) => html.match(new RegExp(`<(button|span)[^>]*>(?:✓ )?${label}<`))?.[1];
  const stripOpen = renderStrip({ ...base, contract_status: "sent", tender_substatus: "contract_sent" });
  t("earlier steps are still buttons", () => assert.equal(chip(stripOpen, "Contract sent"), "button"));
  t("Contract signed can't be pressed", () => assert.equal(chip(stripOpen, "Contract signed"), "span"));
  t("and it isn't lit before the upload", () => assert.doesNotMatch(stripOpen, /bg-primary[^>]*>Contract signed/));
  t("says what sets it", () => assert.match(stripOpen, /uploaded under Building contract/));
  const stripSigned = renderStrip({ ...base, contract_status: "signed", tender_substatus: "contract_sent", contract_evidence_present: true });
  t("the upload lights Contract signed without any stored step", () => assert.match(stripSigned, /bg-primary[^>]*>Contract signed/));
  t("once signed the earlier steps show done and can't be pressed", () => { assert.match(stripSigned, /✓ Contract sent/); assert.match(stripSigned, /<button[^>]*disabled=""[^>]*>✓ Contract sent/); });
  const stripForged = renderStrip({ ...base, contract_status: "sent", tender_substatus: "contract_signed" });
  t("a row that says Contract signed with no signed contract doesn't show as signed", () => { assert.doesNotMatch(stripForged, /bg-primary[^>]*>Contract signed/); assert.match(stripForged, /bg-primary[^>]*>Contract sent/); });
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
