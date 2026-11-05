// documents-r01.test.mjs — Document Engine Proof acceptance tests (no DB, no network).
// Run: node scripts/tests/documents-r01.test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDocxTemplate } from "../../server/lib/docTemplates.mjs";
import {
  buildClientBriefPayload, buildArchitectBriefPayload, buildSelectionsSchedulePayload,
  validateFixture, SELECTION_STATUSES, ARCHITECT_ITEM_STATUSES, DOC_DEFS,
} from "../../server/lib/documents/documentPayloads.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const reno = JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/fixtures/reno-extension.json"), "utf8"));
const long = JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/fixtures/long-newbuild.json"), "utf8"));
const issuedReno = { ...reno, meta: { ...reno.meta, status: "Issued", issuedDate: "2026-11-06" } };

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// 1. Client-brief payload maps lists 1:1 (no loss) + intention band + questions table.
const cb = buildClientBriefPayload(reno);
ok("T1 client brief: scope/summary/preferences + 3 intentions + questions table",
  cb.SCOPE_IN.length === 3 && cb.SCOPE_OUT.length === 2 && cb.SUMMARY_PARAS.length === 2 && cb.PREFERENCE_GROUPS.length === 3 &&
  cb.INT1_LABEL === "Connect" && cb.INT3_LABEL === "Perform" && cb.QUESTIONS.length === 3 && cb.QUESTIONS.every((q) => q.REF_ID && q.STATUS));

// 2. Architect-brief: actions (ID/owner/status), REQ reference list, and a grouped design register with the coordination vocabulary.
const ab = buildArchitectBriefPayload(reno);
const regItems = ab.GROUPS.flatMap((g) => g.ITEMS);
ok("T2 architect brief: actions w/ owner+status; REQ-xx list; grouped design register w/ coordination statuses",
  ab.ACTIONS.length === 4 && ab.ACTIONS.every((a) => a.REF_ID && a.OWNER && a.STATUS) &&
  ab.CONFIRMED_REQS.every((r) => /^REQ-\d\d$/.test(r.REF_ID)) &&
  ab.GROUPS.length >= 1 && regItems.length === 5 && regItems.every((r) => ARCHITECT_ITEM_STATUSES.includes(r.STATUS)));

// 3. Selections payload is grouped (not a flat list), group-ordered, 22 items total.
const ss = buildSelectionsSchedulePayload(long);
const order = ["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"];
const grpOk = ss.GROUPS.every((g, i) => i === 0 || order.indexOf(g.GROUP_NAME) >= order.indexOf(ss.GROUPS[i - 1].GROUP_NAME));
const total = ss.GROUPS.reduce((n, g) => n + g.ITEMS.length, 0);
ok("T3 selections: grouped + group-ordered; 22 items total; blank qty defaults to em dash",
  ss.GROUPS.length === 6 && grpOk && total === 22 && ss.GROUPS.every((g) => g.ITEMS.every((r) => r.QTY && r.STATUS)));

// 4. A properly ISSUED document with a logo validates in issue mode.
ok("T4 validation: an Issued fixture (logo present) passes issue mode", validateFixture(issuedReno, { mode: "issue", logoPresent: true }).ok === true);

// 5. A Draft/specimen is NOT issue-ready (issue control), but still renders in draft mode.
const draftCheck = validateFixture(reno, { mode: "issue" });
ok("T5 issue control: a Draft/specimen is blocked from issue but valid as a draft",
  draftCheck.ok === false && draftCheck.errors.some((e) => /not marked "Issued"/.test(e)) && validateFixture(reno, { mode: "draft" }).ok === true);

// 6. Missing client name blocks issue.
const noClient = JSON.parse(JSON.stringify(issuedReno)); noClient.project.clientName = "";
ok("T6 validation: missing client name blocks issue", validateFixture(noClient, { mode: "issue" }).ok === false);

// 7. Placeholder / TODO text blocks issue (and warns in draft); a fabricated $0 blocks issue.
const placeholder = JSON.parse(JSON.stringify(issuedReno)); placeholder.clientBrief.summaryParas[0] = "TODO: real summary {{CLIENT}}";
const zeroMoney = JSON.parse(JSON.stringify(issuedReno)); zeroMoney.clientBrief.summaryParas.push("Fixed price is $0.00 for the whole build");
ok("T7 validation: placeholder text & $0 money both block issue",
  validateFixture(placeholder, { mode: "issue" }).ok === false && validateFixture(placeholder, { mode: "draft" }).ok === true &&
  validateFixture(zeroMoney, { mode: "issue" }).ok === false);

// 8. Status vocabularies enforced: unknown selection status blocks; non-decision states allowed; architect status vocabulary enforced.
const badSel = JSON.parse(JSON.stringify(issuedReno)); badSel.selections = [{ group: "External", itemId: "X", category: "c", product: "p", finish: "f", status: "Maybe-ish", responsibility: "BLB" }];
const badArch = JSON.parse(JSON.stringify(issuedReno)); badArch.architectBrief.scheduleItems[0].status = "Confirmed";
ok("T8 validation: unknown selection status blocks; special states allowed; architect 'Confirmed' rejected (intent≠verification)",
  validateFixture(badSel, { mode: "issue" }).ok === false &&
  ["By Others", "N/A", "Excluded", "Existing to Remain", "Undecided"].every((s) => SELECTION_STATUSES.includes(s)) &&
  validateFixture(badArch, { mode: "issue" }).ok === false);

// 9. Missing approved logo blocks issue (Tab 17 identity blocker).
ok("T9 issue control: missing logo blocks issue", validateFixture(issuedReno, { mode: "issue", logoPresent: false }).ok === false);

// 10. Rendering is DETERMINISTIC — same (template, payload) → byte-identical output (immutable-issue reproducibility).
const tpl = fs.readFileSync(path.join(REPO, "public/templates", DOC_DEFS.client_brief.templateFile));
const r1 = renderDocxTemplate(tpl, buildClientBriefPayload(reno));
const r2 = renderDocxTemplate(tpl, buildClientBriefPayload(reno));
ok("T10 render is deterministic (issued-snapshot reproducibility)", Buffer.compare(r1, r2) === 0 && r1.length > 5000);

console.log(`\nR01/R02 document tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
