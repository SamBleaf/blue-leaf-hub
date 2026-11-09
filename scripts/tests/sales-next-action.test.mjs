/**
 * sales-next-action.test.mjs — the one next action a lead shows in the header and the mobile sticky bar (R05 P2).
 * Pure logic, no browser or server. Also checks that every control the pointer can land on is really tagged in
 * the page source, so a renamed or removed control fails here instead of silently pointing at nothing.
 *
 * Run: node scripts/tests/sales-next-action.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeLeadNextAction as nextAction, currentTenderStep, ADVANCE_TARGET, ENQUIRY_CALL_TARGET, QUALIFY_CONFIRM_TARGET, RFQ_START_TARGET, PROPOSAL_PRESENTATION_TARGET, WON_HANDOFF_TARGET, OPS_READY_TARGET, STAGE_EMAIL_TARGET } from "../../src/lib/leadNextAction.js";
import { STAGE_GATES, STAGE_ORDER, gateRows } from "../../src/lib/stageGates.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${String(e.message).slice(0, 300)}`); }
}

const NEXT = { enquiry: "Qualify", qualify: "Discovery", discovery: "Concept", winning_offer: "PTSA / Plans", fee_proposal: "Consultants", consultants: "Tender", tender: "Won" };
const at = (stage, fields = {}) => {
  const lead = { id: "l1", stage, ...fields };
  const next = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1] || null;
  return nextAction(lead, { next, nextLabel: NEXT[stage] });
};
const SCORED = { qualify_budget: 2, qualify_timeframe: 2, qualify_site: 2, qualify_decision_maker: 2, qualify_score: 8 };
const BOOKED = { ...SCORED, discovery_meeting_booked_at: "2026-11-01T00:00:00Z" };
const targets = new Set();
const seen = (a) => { targets.add(a.target); return a; };

console.log("\n▸ Enquiry");
t("before anything is recorded, it points at the call", () => assert.deepEqual(seen(at("enquiry")), { label: "Run the enquiry call", target: ENQUIRY_CALL_TARGET, mobileTab: "action" }));
t("once answers exist, it asks for the outcome at the bottom panel", () => assert.equal(seen(at("enquiry", { qualify_budget: 1 })).target, ADVANCE_TARGET));

console.log("\n▸ Qualify");
t("a web lead's score is confirmed first", () => assert.equal(seen(at("qualify", { ...BOOKED, web_prescored: true })).target, QUALIFY_CONFIRM_TARGET));
t("a confirmed web lead doesn't ask again", () => assert.equal(at("qualify", { ...BOOKED, web_prescored: true, qualify_confirmed_at: "2026-11-01" }).target, ADVANCE_TARGET));
t("lands on the first unanswered question, not the top of the card", () => assert.equal(seen(at("qualify", { qualify_budget: 2, qualify_timeframe: 0, qualify_score: 2, discovery_meeting_booked_at: null })).target, "qualify_site"));
for (const f of ["qualify_budget", "qualify_timeframe", "qualify_decision_maker"]) seen({ target: f });
t("all answered but under 5 points at the scorecard", () => {
  const a = seen(at("qualify", { qualify_budget: 1, qualify_timeframe: 0, qualify_site: 0, qualify_decision_maker: 0, qualify_score: 1, discovery_meeting_booked_at: null }));
  assert.equal(a.target, "qualify_score"); assert.match(a.label, /5 or more/);
});
t("score met, no booking: points at the build conversation", () => {
  const a = seen(at("qualify", { ...SCORED, discovery_meeting_booked_at: null }));
  assert.equal(a.target, "discovery_meeting_booked_at"); assert.match(a.label, /Book or log/);
});
t("after the email went, it says to check for the booking", () => assert.match(at("qualify", { ...SCORED, discovery_meeting_booked_at: null, qualify_intro_sent_at: "2026-11-01" }).label, /Check whether the client has booked/));
t("both met: Move to Discovery, at the bottom panel", () => assert.deepEqual(at("qualify", BOOKED), { label: "Move to Discovery", target: ADVANCE_TARGET, mobileTab: "action" }));

console.log("\n▸ Never claims ready when something is unmet");
t("an unmet hard gate is never reported as ready", () => assert.notEqual(at("discovery", { concept_agreement_status: "draft", discovery_notes: "x", design_stage: "concept", desired_start_date: "2027-01-01" }).target, ADVANCE_TARGET));
t("an unmet recommended item is not reported as ready either (the button waits for it)", () => assert.equal(seen(at("discovery", { concept_agreement_status: "accepted", design_stage: "concept", desired_start_date: "2027-01-01" })).target, "discovery_notes"));
t("hard gates come before recommended ones", () => assert.equal(seen(at("discovery", { concept_agreement_status: "draft" })).target, "concept_agreement_status"));
t("once the agreement exists it asks to mark it accepted", () => assert.match(at("discovery", { concept_agreement_status: "draft", concept_agreement_document_path: "a.pdf" }).label, /Mark the concept agreement accepted/));

console.log("\n▸ Every gate row has a concrete action");
for (const [stage, reqs] of Object.entries(STAGE_GATES)) {
  for (const r of reqs) {
    t(`${stage}: ${r.field}`, () => {
      const from = STAGE_ORDER[STAGE_ORDER.indexOf(stage) - 1];
      // Everything in the gate met except this row; Tender is past the estimate so its contract gate is the next thing.
      const lead = { id: "l1", stage: from, contract_status: "signed", contract_evidence_present: true, tender_substatus: "contract_sent",
        ...BOOKED, concept_agreement_status: "accepted", discovery_notes: "n", design_stage: "c", desired_start_date: "2027-01-01",
        concept_design_status: "approved", concept_pathway_explained: true, preconstruction_fee: 1, ptsa_status: "signed",
        consultant_roster: [{ deliverables: [{ status: "received" }] }], fee_proposal_id: "f", provisional_ff_issued: true, site_address: "1 Test St", job_id: "j" };
      lead[r.field] = r.field === "contract_status" ? "sent" : r.field === "contract_evidence_present" ? false : r.field === "qualify_score" ? 0 : r.field === "consultant_roster" ? [] : null;
      if (r.field === "qualify_score") Object.assign(lead, { qualify_budget: 0, qualify_timeframe: 0, qualify_site: 0, qualify_decision_maker: 0 });
      assert.equal(gateRows(stage, lead).allMet, false, "the fixture must fail this row");
      const a = seen(nextAction(lead, { next: stage, nextLabel: stage }));
      assert.notEqual(a.target, ADVANCE_TARGET);
      assert.ok(a.label.length <= 45, `too long for a button: ${a.label}`);
    });
  }
}

console.log("\n▸ A control under Lead details opens the Summary tab on a phone");
t("design stage", () => assert.equal(at("discovery", { concept_agreement_status: "accepted", discovery_notes: "n" }).mobileTab, "summary"));
t("stage work stays on Action", () => assert.equal(at("discovery", { concept_agreement_status: "draft" }).mobileTab, "action"));

console.log("\n▸ Tender");
t("at the start it's the estimate, not the contract", () => assert.equal(seen(at("tender", { site_address: "1 Test St" })).target, RFQ_START_TARGET));
t("no site address comes first, because the RFQ button needs one", () => assert.equal(at("tender", {}).target, "site_address"));
t("proposal generated: present it", () => assert.equal(seen(at("tender", { site_address: "x", tender_substatus: "proposal_generated" })).target, PROPOSAL_PRESENTATION_TARGET));
t("client reviewing: the contract is next", () => assert.equal(at("tender", { site_address: "x", tender_substatus: "client_reviewing", contract_status: null }).target, "contract_status"));
t("signed with no PDF is not ready", () => {
  const a = at("tender", { site_address: "x", contract_status: "signed", contract_evidence_present: false });
  assert.equal(a.target, "contract_status"); assert.match(a.label, /signed contract PDF/);
});
t("signed with the PDF: Move to Won", () => assert.equal(at("tender", { contract_status: "signed", contract_evidence_present: true }).label, "Move to Won"));
t("a saved 'contract signed' step with no signed contract reads as sent", () => assert.equal(currentTenderStep({ tender_substatus: "contract_signed", contract_status: "sent" }), "contract_sent"));

console.log("\n▸ Won");
t("no job: create it", () => assert.equal(seen(at("won", { site_address: "x" })).target, WON_HANDOFF_TARGET));
t("no job, no address: add the address first", () => assert.equal(at("won", {}).target, "site_address"));
t("job but not Ops Ready: the checklist, not the dashboard", () => { const a = seen(at("won", { job_id: "j" })); assert.equal(a.target, OPS_READY_TARGET); assert.doesNotMatch(a.label, /dashboard/); });
t("Ops Ready: the dashboard", () => assert.match(at("won", { job_id: "j", won_substatus: "ops_ready" }).label, /job dashboard/));

console.log("\n▸ Nothing to point at");
t("nurture", () => assert.equal(nextAction({ stage: "nurture" }, { next: null }), null));
t("lost", () => assert.equal(nextAction({ stage: "lost" }, { next: null }), null));
t("a legacy accepted lead", () => assert.equal(nextAction({ stage: "accepted" }, { next: null }), null));
t("no lead", () => assert.equal(nextAction(null, {}), null));

console.log("\n▸ Every target is a real control in the page source");
const dir = join(REPO, "src/components/sales/lead-detail");
const source = [join(REPO, "src/pages/LeadDetail.jsx"), ...readdirSync(dir).filter((f) => f.endsWith(".jsx")).map((f) => join(dir, f))].map((f) => readFileSync(f, "utf8")).join("\n");
const CONST_NAMES = { [ADVANCE_TARGET]: "ADVANCE_TARGET", [ENQUIRY_CALL_TARGET]: "ENQUIRY_CALL_TARGET", [QUALIFY_CONFIRM_TARGET]: "QUALIFY_CONFIRM_TARGET", [RFQ_START_TARGET]: "RFQ_START_TARGET", [PROPOSAL_PRESENTATION_TARGET]: "PROPOSAL_PRESENTATION_TARGET", [WON_HANDOFF_TARGET]: "WON_HANDOFF_TARGET", [OPS_READY_TARGET]: "OPS_READY_TARGET", [STAGE_EMAIL_TARGET]: "STAGE_EMAIL_TARGET" };
targets.add(STAGE_EMAIL_TARGET); targets.add("site_address");
for (const target of [...targets].sort()) {
  t(target, () => {
    const c = CONST_NAMES[target];
    const tagged = source.includes(`data-next-target="${target}"`) || source.includes(`targetId="${target}"`) || (c && source.includes(`data-next-target={${c}}`));
    assert.ok(tagged, `no control is tagged ${target}`);
  });
}

console.log(`\n${fail ? "FAILED" : "PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
