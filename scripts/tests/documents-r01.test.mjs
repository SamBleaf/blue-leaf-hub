// documents-r01.test.mjs — R01 Document Engine Proof acceptance tests (no DB, no network).
// Run: node scripts/tests/documents-r01.test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDocxTemplate } from "../../server/lib/docTemplates.mjs";
import {
  buildClientBriefPayload, buildArchitectBriefPayload, buildSelectionsSchedulePayload,
  validateFixture, SELECTION_STATUSES, DOC_DEFS,
} from "../../server/lib/documents/documentPayloads.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const reno = JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/fixtures/reno-extension.json"), "utf8"));
const long = JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/fixtures/long-newbuild.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// 1. Client-brief payload maps the fixture's lists 1:1 (no concatenation/loss).
const cb = buildClientBriefPayload(reno);
ok("T1 client brief: 3 scope-in + 2 scope-out + 2 summary paras + 3 preference groups",
  cb.SCOPE_IN.length === 3 && cb.SCOPE_OUT.length === 2 && cb.SUMMARY_PARAS.length === 2 && cb.PREFERENCE_GROUPS.length === 3);

// 2. Architect-brief schedule maps every item with all six columns.
const ab = buildArchitectBriefPayload(reno);
ok("T2 architect brief: 5 schedule items, each with ITEM_ID+STATUS+DWG_REF",
  ab.SCHEDULE_ITEMS.length === 5 && ab.SCHEDULE_ITEMS.every((r) => r.ITEM_ID && r.STATUS && r.DWG_REF));

// 3. Selections payload is group-sorted, composes CATEGORY, and defaults blank qty to em dash.
const ss = buildSelectionsSchedulePayload(long);
const groups = ss.SCHEDULE_ROWS.map((r) => r.CATEGORY.split(" / ")[0]);
const groupOrder = ["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"];
const sortedOk = groups.every((g, i) => i === 0 || groupOrder.indexOf(g) >= groupOrder.indexOf(groups[i - 1]));
ok("T3 selections: 22 rows, group-sorted, CATEGORY composed, qty defaults to em dash",
  ss.SCHEDULE_ROWS.length === 22 && sortedOk && ss.SCHEDULE_ROWS.every((r) => r.QTY && r.STATUS));

// 4. Good fixtures are issue-ready.
ok("T4 validation: both fixtures pass in issue mode", validateFixture(reno, { mode: "issue" }).ok && validateFixture(long, { mode: "issue" }).ok);

// 5. Missing client name BLOCKS issue.
const noClient = JSON.parse(JSON.stringify(reno)); noClient.project.clientName = "";
ok("T5 validation: missing client name blocks issue", validateFixture(noClient, { mode: "issue" }).ok === false);

// 6. Placeholder / TODO text BLOCKS issue (but only warns in draft).
const placeholder = JSON.parse(JSON.stringify(reno)); placeholder.clientBrief.summaryParas[0] = "TODO: write the real summary {{CLIENT}}";
const issueCheck = validateFixture(placeholder, { mode: "issue" });
ok("T6 validation: placeholder text blocks issue, warns in draft",
  issueCheck.ok === false && issueCheck.errors.length >= 1 && validateFixture(placeholder, { mode: "draft" }).ok === true);

// 7. A fabricated $0 money value BLOCKS issue.
const zeroMoney = JSON.parse(JSON.stringify(reno)); zeroMoney.clientBrief.decisions.push("Fixed price is $0.00 for the whole build");
ok("T7 validation: $0 money value blocks issue", validateFixture(zeroMoney, { mode: "issue" }).ok === false);

// 8. Unknown selection status BLOCKS issue; the special non-decision states are allowed.
const badStatus = JSON.parse(JSON.stringify(long)); badStatus.selections[0].status = "Maybe-ish";
ok("T8 validation: unknown status blocks; By Others / N/A / Excluded / Existing to Remain allowed",
  validateFixture(badStatus, { mode: "issue" }).ok === false &&
  ["By Others", "N/A", "Excluded", "Existing to Remain", "Undecided"].every((s) => SELECTION_STATUSES.includes(s)));

// 9. Rendering is DETERMINISTIC — the same (template, payload) yields byte-identical output.
//    This underpins the immutable-issue model: a re-render of an issued revision reproduces the exact bytes.
const tpl = fs.readFileSync(path.join(REPO, "public/templates", DOC_DEFS.client_brief.templateFile));
const r1 = renderDocxTemplate(tpl, buildClientBriefPayload(reno));
const r2 = renderDocxTemplate(tpl, buildClientBriefPayload(reno));
ok("T9 render is deterministic (issued-snapshot reproducibility)", Buffer.compare(r1, r2) === 0 && r1.length > 5000);

console.log(`\nR01 document tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
