/**
 * sales-correspondence-status.test.mjs — what the Client correspondence area says and offers (R05 P2). Pure logic.
 * The point of these checks is honesty: "sent" is never dressed up as "delivered", a failed read never looks like
 * an empty history, and a template is only marked as gone when something was actually recorded.
 *
 * Run: node scripts/tests/sales-correspondence-status.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAGE_EMAIL_TEMPLATES, stageEmailTemplates, stageCorrespondenceNote, correspondenceStatus, recordedSendAt, defaultStageTemplate,
  isSendingOff, templateBlockedReason, templateSendOptions, patchAfterStageEmail,
} from "../../src/lib/leadCorrespondence.js";
import { STAGE_ORDER } from "../../src/lib/stageGates.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${String(e.message).slice(0, 300)}`); }
}
const out = (subject, sentAt, messageId) => ({ id: subject, direction: "outbound", subject, sentAt, messageId });
const inn = (subject, sentAt) => ({ id: subject, direction: "inbound", subject, sentAt, messageId: "<abc@gmail.com>" });
const tpl = (stage, key) => stageEmailTemplates(stage).find((x) => x.key === key);

console.log("\n▸ The status line only states what is recorded");
t("no messages", () => assert.equal(correspondenceStatus({ messages: [] }).line, "No emails recorded for this lead yet."));
t("loading isn't described as empty", () => assert.equal(correspondenceStatus({ loading: true }).line, "Loading…"));
t("a failed read is not shown as an empty history", () => { const s = correspondenceStatus({ loadFailed: true, messages: [] }); assert.match(s.line, /Couldn't load/); assert.doesNotMatch(s.line, /No emails/); });
t("a missing column says so", () => assert.match(correspondenceStatus({ columnMissing: true }).line, /migration 175/));
t("latest outbound", () => {
  const s = correspondenceStatus({ messages: [out("Older", "2026-10-01T02:00:00Z"), out("Hello there", "2026-11-03T02:00:00Z")] });
  assert.equal(s.line, "Sent 3 Nov 2026: Hello there");
});
t("sent is not delivered", () => {
  const { detail } = correspondenceStatus({ messages: [out("A", "2026-11-03T02:00:00Z")] });
  assert.match(detail, /can't see whether it was delivered/); assert.doesNotMatch(detail.replace("whether it was delivered", ""), /delivered/i);
});
t("the latest inbound is shown as received", () => {
  const s = correspondenceStatus({ messages: [out("A", "2026-11-01T02:00:00Z"), inn("Re: A", "2026-11-04T02:00:00Z")] });
  assert.equal(s.line, "Received 4 Nov 2026: Re: A"); assert.match(s.detail, /from the client/);
});
t("order doesn't matter", () => assert.match(correspondenceStatus({ messages: [out("New", "2026-11-05T02:00:00Z"), out("Old", "2026-01-05T02:00:00Z")] }).line, /New/));
t("no subject doesn't print undefined", () => assert.match(correspondenceStatus({ messages: [out(undefined, "2026-11-05T02:00:00Z")] }).line, /\(no subject\)/));

console.log("\n▸ A template counts as sent only from a record");
const brief = tpl("winning_offer", "brief_questions");
t("nothing recorded", () => assert.equal(recordedSendAt(brief, [], {}), null));
t("matched by Message-ID, so an edited subject still counts", () => assert.equal(recordedSendAt(brief, [out("I changed this subject", "2026-11-02T00:00:00Z", "<concept-brief_questions-l1-1@blueleafbuilding.com.au>")], {}), "2026-11-02T00:00:00Z"));
t("another template's row doesn't count", () => assert.equal(recordedSendAt(brief, [out("x", "2026-11-02T00:00:00Z", "<concept-interim-l1-1@blueleafbuilding.com.au>")], {}), null));
t("an inbound row doesn't count", () => assert.equal(recordedSendAt(brief, [{ direction: "inbound", sentAt: "2026-11-02T00:00:00Z", messageId: "<concept-brief_questions-l1-1@x>" }], {}), null));
t("a lead stamp is a record too", () => assert.equal(recordedSendAt(brief, [], { concept_brief_questions_sent_at: "2026-10-09" }), "2026-10-09"));
t("the row wins over the stamp", () => assert.equal(recordedSendAt(brief, [out("x", "2026-11-02T00:00:00Z", "<concept-brief_questions-l1-1@x>")], { concept_brief_questions_sent_at: "2026-10-09" }), "2026-11-02T00:00:00Z"));
t("the most recent send is the one shown", () => assert.equal(recordedSendAt(brief, [out("b", "2026-11-09T00:00:00Z", "<concept-brief_questions-2@x>"), out("a", "2026-11-02T00:00:00Z", "<concept-brief_questions-1@x>")], {}), "2026-11-09T00:00:00Z"));

console.log("\n▸ Which template is offered first");
const tenderList = stageEmailTemplates("tender");
t("the first one not yet sent", () => assert.equal(defaultStageTemplate(tenderList, [out("x", "2026-11-02T00:00:00Z", "<pipeline-tender_started-1@x>")], {}).key, "proposal_followup"));
t("all sent falls back to the first", () => assert.equal(defaultStageTemplate(stageEmailTemplates("nurture"), [out("x", "2026-11-02T00:00:00Z", "<pipeline-nurture-1@x>")], {}).key, "nurture"));
t("a stage with none has none", () => assert.equal(defaultStageTemplate(stageEmailTemplates("enquiry")), null));

console.log("\n▸ Sending switch");
t("off", () => assert.equal(isSendingOff("qualify", { qualify: false }), true));
t("on", () => assert.equal(isSendingOff("qualify", { qualify: true }), false));
t("unknown is not claimed as off", () => assert.equal(isSendingOff("qualify", null), false));

console.log("\n▸ Each stage's emails match the real families");
const src = (f) => readFileSync(join(REPO, "server/lib", f), "utf8");
const pipelineKeys = [...src("pipelineGapEmails.mjs").matchAll(/^\s{2}([a-z_]+): \{\s*$/gm)].map((m) => m[1]);
t("every stage is covered or explained", () => {
  for (const s of [...STAGE_ORDER, "nurture", "lost"]) assert.ok(stageEmailTemplates(s).length || stageCorrespondenceNote(s), s);
});
t("enquiry demands no email", () => { assert.equal(stageEmailTemplates("enquiry").length, 0); assert.match(stageCorrespondenceNote("enquiry"), /call/); });
t("pipeline templates are real keys", () => {
  for (const list of Object.values(STAGE_EMAIL_TEMPLATES)) for (const x of list) if (x.endpoint === "pipeline-email") assert.ok(pipelineKeys.includes(x.which), x.which);
});
t("the server accepts every concept template key", () => {
  const route = readFileSync(join(REPO, "server/lib/salesRoutes.mjs"), "utf8");
  for (const x of [...STAGE_EMAIL_TEMPLATES.winning_offer, ...STAGE_EMAIL_TEMPLATES.fee_proposal]) if (x.endpoint === "concept-email" && x.which !== "brief_questions") assert.match(route, new RegExp(`"${x.which}"`));
});
t("a template's Message-ID prefix is the family's real format", () => {
  for (const [file, family] of [["qualifyEmail.mjs", "qualify"], ["discoveryEmail.mjs", "discovery"], ["conceptEmails.mjs", "concept"], ["tenderEmails.mjs", "tender"], ["pipelineGapEmails.mjs", "pipeline"]]) {
    assert.match(src(file), new RegExp(`<${family}-\\$\\{which\\}-`), file);
  }
});
t("qualify and discovery send under the 'intro' id the templates expect", () => {
  assert.match(src("qualifyEmail.mjs"), /buildQualifyEmail\(lead, "intro"/);
  assert.match(src("discoveryEmail.mjs"), /buildDiscoveryEmail\(lead, "intro"/);
});
t("no key is offered twice", () => { const keys = Object.values(STAGE_EMAIL_TEMPLATES).flat().map((x) => x.key); assert.equal(new Set(keys).size, keys.length); });

console.log("\n▸ Existing send rules kept");
const discovery = tpl("discovery", "discovery_intro");
t("discovery still needs a designer", () => { assert.match(templateBlockedReason(discovery, {}), /Select a designer/); assert.equal(templateBlockedReason(discovery, { selected_designer_contact_id: "c" }), null); });
t("other templates aren't blocked", () => assert.equal(templateBlockedReason(brief, {}), null));
t("the agreement can only be attached once generated", () => {
  assert.equal(templateSendOptions(discovery, {})[0].disabled, true);
  assert.equal(templateSendOptions(discovery, { concept_agreement_document_path: "a.docx" })[0].disabled, false);
  assert.equal(templateSendOptions(discovery, {})[0].key, "attachAgreement");
});
t("no options elsewhere", () => assert.deepEqual(templateSendOptions(brief, {}), []));

console.log("\n▸ What a sent Tender email records");
t("Contract sent records Sent with today's date", () => assert.deepEqual(patchAfterStageEmail({ contract_status: "prepared" }, "contract_sent", "2026-11-09"), { contract_status: "sent", contract_sent_date: "2026-11-09" }));
t("it keeps an earlier sent date", () => assert.equal(patchAfterStageEmail({ contract_sent_date: "2026-10-01" }, "contract_sent", "2026-11-09").contract_sent_date, "2026-10-01"));
t("it never moves a signed contract backwards", () => assert.equal(patchAfterStageEmail({ contract_status: "signed" }, "contract_sent", "2026-11-09"), null));
t("the proposal follow-up moves on to Client reviewing", () => assert.deepEqual(patchAfterStageEmail({ tender_substatus: "proposal_presented" }, "proposal_followup"), { tender_substatus: "client_reviewing" }));
t("it never moves the tender backwards", () => assert.equal(patchAfterStageEmail({ tender_substatus: "contract_prep" }, "proposal_followup"), null));
t("other emails change nothing", () => assert.equal(patchAfterStageEmail({}, "review_followup"), null));

console.log(`\n${fail ? "FAILED" : "PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
