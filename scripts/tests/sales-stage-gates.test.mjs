/**
 * sales-stage-gates.test.mjs — unit tests for the canonical gate module (src/lib/stageGates.js) and the
 * pure PDF check. No server, no database. Run: node scripts/tests/sales-stage-gates.test.mjs
 */
import assert from "node:assert/strict";
import {
  STAGE_GATES, STAGE_ORDER, evaluateGate, stagesCrossed, forwardMoveBlock, forwardBlockReason, hardBlockReason,
  resolveEngagementPathway, showsQualifyingScorecard, canPerformControlledSalesWrite, canUnsignContract, SALES_CONTROLLED_ROLES,
  nextStageFor, stageApplies, requirementsFor, gateRows, consultantDocsReady, deliverableIsReady, flagReissue,
} from "../../src/lib/stageGates.js";
import { decodePdfUpload } from "../../server/lib/leadContractEvidence.mjs";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

const label = (s) => ({ discovery: "Discovery", winning_offer: "Concept", won: "Won", tender: "Tender" }[s] || s);
// A row as stored after each migration has run: every gated column present, nothing met.
const BLANK = { qualify_score: 0, discovery_meeting_booked_at: null, concept_agreement_status: null, contract_status: null, contract_evidence_present: false };
const QUALIFIED = { ...BLANK, qualify_score: 8, discovery_meeting_booked_at: "2026-11-01T00:00:00Z" };
const PAST_CONCEPT = { ...QUALIFIED, concept_agreement_status: "accepted" };
const SIGNED = { ...PAST_CONCEPT, contract_status: "signed", contract_evidence_present: true };

console.log("\n▸ stagesCrossed");
t("a one-step advance crosses only the target", () => assert.deepEqual(stagesCrossed("qualify", "discovery", BLANK), ["discovery"]));
t("a jump crosses every stage in order, target included", () => assert.deepEqual(stagesCrossed("qualify", "fee_proposal", BLANK), ["discovery", "winning_offer", "fee_proposal"]));
t("backward crosses nothing", () => assert.deepEqual(stagesCrossed("tender", "qualify", BLANK), []));
t("same stage crosses nothing", () => assert.deepEqual(stagesCrossed("tender", "tender", BLANK), []));
t("out to nurture or lost crosses nothing", () => { assert.deepEqual(stagesCrossed("tender", "nurture", BLANK), []); assert.deepEqual(stagesCrossed("tender", "lost", BLANK), []); });
t("back from nurture starts at the beginning of the pipeline", () => assert.deepEqual(stagesCrossed("nurture", "discovery", BLANK), ["enquiry", "qualify", "discovery"]));
t("back from lost does too", () => assert.equal(stagesCrossed("lost", "won", BLANK).length, STAGE_ORDER.length));
t("a legacy `accepted` row counts as past PTSA / Plans", () => assert.deepEqual(stagesCrossed("accepted", "won", BLANK), ["consultants", "tender", "won"]));
t("Architect Tender skips Concept and PTSA in the middle of a move, and keeps Discovery (D6)", () => assert.deepEqual(stagesCrossed("qualify", "consultants", { lead_type: "architect_tender" }), ["discovery", "consultants"]));
t("…so a jump over Discovery still meets its hard gate", () => assert.equal(forwardMoveBlock("enquiry", "consultants", { ...BLANK, lead_type: "architect_tender" }).stage, "discovery"));
t("…but the target itself is never skipped", () => assert.deepEqual(stagesCrossed("discovery", "winning_offer", { lead_type: "architect_tender" }), ["winning_offer"]));

console.log("\n▸ pathway and delivery model");
t("default is design_build", () => assert.equal(resolveEngagementPathway({}), "design_build"));
t("lead_type drives Architect Tender", () => assert.equal(resolveEngagementPathway({ lead_type: "architect_tender" }), "architect_tender"));
for (const delivery_model of ["build_only", "construction_management", "other", "design_build"]) {
  t(`delivery_model ${delivery_model} waives nothing`, () => {
    assert.equal(resolveEngagementPathway({ delivery_model }), "design_build");
    assert.equal(forwardMoveBlock("enquiry", "won", { ...BLANK, delivery_model }).stage, "discovery");
  });
}

t("an Architect Tender lead at Tender has no scorecard", () => assert.equal(showsQualifyingScorecard({ lead_type: "architect_tender", stage: "tender" }), false));
for (const stage of ["enquiry", "qualify"]) {
  t(`…but moved back to ${stage} it can meet the Discovery gate`, () => assert.equal(showsQualifyingScorecard({ lead_type: "architect_tender", stage }), true));
}
t("a standard lead always has the scorecard", () => assert.equal(showsQualifyingScorecard({ lead_type: "standard", stage: "won" }), true));

console.log("\n▸ forward moves");
t("a jump stops at the first unmet hard gate", () => assert.equal(forwardMoveBlock("enquiry", "won", BLANK).stage, "discovery"));
t("once Discovery is met it stops at Concept", () => assert.equal(forwardMoveBlock("enquiry", "won", QUALIFIED).stage, "winning_offer"));
t("once Concept is met it stops at Won", () => assert.equal(forwardMoveBlock("enquiry", "won", PAST_CONCEPT).stage, "won"));
t("all met → clear", () => assert.equal(forwardMoveBlock("enquiry", "won", SIGNED), null));
t("advisory-only stages never block a move", () => assert.equal(forwardMoveBlock("winning_offer", "tender", BLANK), null));
t("a backward move is never blocked", () => assert.equal(forwardMoveBlock("won", "enquiry", BLANK), null));
t("a one-step block reads as before", () => assert.equal(forwardBlockReason("qualify", "discovery", BLANK, label), "Can't advance to Discovery yet — needs a qualifying score of at least 5 and a booked build conversation."));
t("a jump names the stage it would skip", () => assert.equal(forwardBlockReason("enquiry", "won", BLANK, label), "Can't move to Won yet — Discovery still needs a qualifying score of at least 5 and a booked build conversation."));
t("no block → no message", () => assert.equal(forwardBlockReason("enquiry", "won", SIGNED, label), null));

console.log("\n▸ Won gate");
t("needs both a signed status and the PDF", () => assert.deepEqual(evaluateGate("won", BLANK).hardMissing.map((r) => r.field), ["contract_status", "contract_evidence_present"]));
t("signed with no file is still blocked, and says why", () => assert.equal(hardBlockReason("won", { ...PAST_CONCEPT, contract_status: "signed", contract_evidence_present: false }, "Won"), "Can't advance to Won yet — needs the signed contract PDF on file."));
t("a file with no signed status is still blocked", () => assert.equal(hardBlockReason("won", { ...PAST_CONCEPT, contract_status: "sent", contract_evidence_present: true }, "Won"), "Can't advance to Won yet — needs the building contract signed."));
t("a lead with no evidence flag attached fails closed", () => { const { contract_evidence_present: _drop, ...l } = SIGNED; assert.equal(evaluateGate("won", l).ok, false); });
t("before migration 194 the gate stays open (deploy-ahead)", () => assert.equal(evaluateGate("won", {}).ok, true));
t("each hard requirement explains itself", () => { for (const r of STAGE_GATES.won) { assert.ok(r.hard); assert.ok(r.hint.length > 20); } });

console.log("\n▸ hard: false stays advisory (D4)");
t("PTSA signed does not hard-block Consultants", () => assert.equal(evaluateGate("consultants", { ptsa_status: "draft" }).hardMissing.length, 0));
t("…but is listed for the normal advance button", () => assert.equal(evaluateGate("consultants", { ptsa_status: "draft" }).ok, false));

console.log("\n▸ roles");
t("admin and supervisor perform controlled writes", () => assert.deepEqual(SALES_CONTROLLED_ROLES, ["admin", "supervisor"]));
for (const [role, allowed] of [["admin", true], ["supervisor", true], ["employee", false], ["client", false], [undefined, false]]) {
  t(`${role} controlled write: ${allowed}`, () => assert.equal(canPerformControlledSalesWrite(role), allowed));
}
t("only a director can un-sign", () => { assert.equal(canUnsignContract("admin"), true); assert.equal(canUnsignContract("supervisor"), false); assert.equal(canUnsignContract("employee"), false); });

console.log("\n▸ PDF check");
const PDF = Buffer.from("%PDF-1.7\nbody\n%%EOF\n");
t("a PDF is accepted", () => assert.deepEqual(decodePdfUpload(PDF.toString("base64")), PDF));
t("a data-URL prefix is handled", () => assert.deepEqual(decodePdfUpload(`data:application/pdf;base64,${PDF.toString("base64")}`), PDF));
t("empty or missing is refused", () => { assert.equal(decodePdfUpload(""), null); assert.equal(decodePdfUpload(undefined), null); assert.equal(decodePdfUpload(123), null); });
t("a Word file is refused", () => assert.equal(decodePdfUpload(Buffer.from("PK\u0003\u0004 word/document.xml %%EOF").toString("base64")), null));
t("a JPEG is refused", () => assert.equal(decodePdfUpload(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]).toString("base64")), null));
t("a truncated PDF is refused", () => assert.equal(decodePdfUpload(Buffer.from("%PDF-1.7\nno end marker").toString("base64")), null));
const b64 = (v) => Buffer.from(v).toString("base64");
t("a PDF cut off after an earlier %%EOF is refused (signed or incrementally saved files hold several)", () => assert.equal(decodePdfUpload(b64("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer<<>>\n%%EOF\n2 0 obj\n<< /Sig /Adobe.PPKLite /Contents <0a0b")), null));
t("plain text that mentions both markers is refused", () => assert.equal(decodePdfUpload(b64("these are my notes. %PDF- is not a real header. %%EOF")), null));
t("a JPEG containing both markers is refused", () => assert.equal(decodePdfUpload(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(" %PDF-1.4 xx %%EOF")]).toString("base64")), null));
t("a header with no version is refused", () => assert.equal(decodePdfUpload(b64("%PDF- not a version\n%%EOF")), null));
t("an incrementally saved PDF ending in %%EOF is accepted", () => assert.ok(decodePdfUpload(b64("%PDF-1.7\nbody\n%%EOF\n2 0 obj\n<<>>\nendobj\n%%EOF\n"))));
t("white space before the header is tolerated", () => assert.ok(decodePdfUpload(b64("\r\n %PDF-1.4\nbody\n%%EOF"))));
t("padding after the last %%EOF is tolerated", () => assert.ok(decodePdfUpload(Buffer.concat([Buffer.from("%PDF-1.4\nbody\n%%EOF\r\n"), Buffer.alloc(200)]).toString("base64"))));
t("more than 1 KB after the last %%EOF is refused", () => assert.equal(decodePdfUpload(Buffer.concat([Buffer.from("%PDF-1.4\nbody\n%%EOF"), Buffer.alloc(1025)]).toString("base64")), null));

const PLANS = { plans_supplied_at: "2026-11-10T00:00:00Z", qualify_score: 8, discovery_meeting_booked_at: "x" };
t("a lead with no plans recorded is design and build", () => assert.equal(resolveEngagementPathway({ stage: "discovery", plans_supplied_at: null }), "design_build"));
t("a column not yet migrated reads as design and build", () => assert.equal(resolveEngagementPathway({ stage: "discovery" }), "design_build"));
t("delivery model never chooses a pathway", () => { for (const m of ["build_only", "construction_management", "other"]) assert.equal(resolveEngagementPathway({ delivery_model: m }), "design_build"); });
t("plans supplied is its own pathway", () => assert.equal(resolveEngagementPathway(PLANS), "plans_supplied"));
t("an Architect Tender lead stays one, even with the column set", () => assert.equal(resolveEngagementPathway({ ...PLANS, lead_type: "architect_tender" }), "architect_tender"));
t("plans supplied goes Discovery to Consultants", () => assert.equal(nextStageFor("discovery", PLANS), "consultants"));
t("design and build still goes to Concept", () => assert.equal(nextStageFor("discovery", {}), "winning_offer"));
t("Qualify to Discovery is unchanged on every pathway", () => assert.equal(nextStageFor("qualify", PLANS), "discovery"));
t("Architect Tender keeps its sequential next stage", () => assert.equal(nextStageFor("qualify", { lead_type: "architect_tender" }), "discovery"));
t("Concept and PTSA don't apply to plans supplied", () => assert.ok(!stageApplies("winning_offer", PLANS) && !stageApplies("fee_proposal", PLANS)));
t("every other stage does", () => { for (const st of ["discovery", "consultants", "tender", "won"]) assert.ok(stageApplies(st, PLANS)); });
t("the PTSA requirement drops off Consultants", () => assert.equal(requirementsFor("consultants", PLANS).length, 0));
t("and stays for design and build", () => assert.equal(requirementsFor("consultants", {}).length, 1));
t("Tender readiness is the same on every pathway", () => assert.equal(requirementsFor("tender", PLANS).length, STAGE_GATES.tender.length));
t("Won is the same on every pathway", () => assert.deepEqual(gateRows("won", PLANS).required.map((r) => r.field), gateRows("won", {}).required.map((r) => r.field)));
t("a move across Discovery still meets its gate", () => { const b = forwardMoveBlock("qualify", "consultants", { plans_supplied_at: "x", qualify_score: 1, discovery_meeting_booked_at: null }); assert.equal(b.stage, "discovery"); });
t("no hard requirement can be skipped by pathway", () => { for (const st of Object.keys(STAGE_GATES)) for (const r of STAGE_GATES[st].filter((x) => x.hard)) if (stageApplies(st, PLANS)) assert.ok(requirementsFor(st, PLANS).includes(r), `${st}/${r.field}`); });
const roster = (...statuses) => [{ role: "engineer", deliverables: statuses.map((status) => ({ key: status, status })) }];
t("received isn't ready", () => assert.equal(consultantDocsReady(roster("received")), false));
t("reviewed isn't ready until it is in the set", () => assert.equal(consultantDocsReady(roster("reviewed")), false));
t("in the set is ready", () => assert.equal(consultantDocsReady(roster("included")), true));
t("issued is still ready, so older records keep their state", () => assert.equal(consultantDocsReady(roster("issued")), true));
t("flagged for re-issue isn't ready", () => assert.equal(deliverableIsReady({ status: "included", reissue: true }), false));
t("an empty roster isn't ready", () => assert.equal(consultantDocsReady([]), false));

// Tab 26 retest: a re-issue says what caused it.
const DEPS = { structural_drawings: ["soil_report"], engineer_certificate: ["structural_drawings"] };
const chain = () => [{ role: "engineer", deliverables: [
  { key: "soil_report", status: "included", revision: "C" },
  { key: "structural_drawings", status: "included", revision: "B" },
  { key: "engineer_certificate", status: "included", revision: "A" },
] }];
const del = (r, k) => r[0].deliverables.find((d) => d.key === k);
t("changing a document flags what depends on it, with the cause", () => {
  const r = flagReissue(chain(), "structural_drawings", DEPS, "t1");
  assert.equal(del(r, "engineer_certificate").reissue, true);
  assert.deepEqual(del(r, "engineer_certificate").reissueFrom, [{ key: "structural_drawings", revision: "B", at: "t1" }]);
  assert.equal(del(r, "structural_drawings").reissue, undefined, "the changed document itself isn't flagged");
});
t("the flag travels down the chain and names the root change", () => {
  const r = flagReissue(chain(), "soil_report", DEPS, "t1");
  assert.equal(del(r, "structural_drawings").reissueFrom[0].key, "soil_report");
  assert.equal(del(r, "engineer_certificate").reissueFrom[0].key, "soil_report");
});
t("a second change adds a second cause, newest first", () => {
  const r = flagReissue(flagReissue(chain(), "soil_report", DEPS, "t1"), "structural_drawings", DEPS, "t2");
  assert.deepEqual(del(r, "engineer_certificate").reissueFrom.map((x) => x.key), ["structural_drawings", "soil_report"]);
});
t("the same document changing twice keeps one entry, the newest", () => {
  let r = flagReissue(chain(), "structural_drawings", DEPS, "t1");
  r[0].deliverables[1].revision = "C";
  r = flagReissue(r, "structural_drawings", DEPS, "t2");
  assert.deepEqual(del(r, "engineer_certificate").reissueFrom, [{ key: "structural_drawings", revision: "C", at: "t2" }]);
});
t("documents that haven't arrived aren't flagged", () => {
  const c = chain(); c[0].deliverables[2].status = "requested";
  assert.equal(del(flagReissue(c, "structural_drawings", DEPS, "t1"), "engineer_certificate").reissue, undefined);
});
t("a flagged document with a recorded cause still isn't ready", () => assert.equal(deliverableIsReady(del(flagReissue(chain(), "structural_drawings", DEPS, "t1"), "engineer_certificate")), false));
t("the input roster isn't changed", () => { const c = chain(); flagReissue(c, "structural_drawings", DEPS, "t1"); assert.equal(c[0].deliverables[2].reissue, undefined); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
