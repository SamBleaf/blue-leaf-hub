/**
 * sales-stage-gates.test.mjs — unit tests for the canonical gate module (src/lib/stageGates.js) and the
 * pure PDF check. No server, no database. Run: node scripts/tests/sales-stage-gates.test.mjs
 */
import assert from "node:assert/strict";
import {
  STAGE_GATES, STAGE_ORDER, evaluateGate, stagesCrossed, forwardMoveBlock, forwardBlockReason, hardBlockReason,
  resolveEngagementPathway, canPerformControlledSalesWrite, canUnsignContract, SALES_CONTROLLED_ROLES,
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
t("Architect Tender skips Discovery, Concept and PTSA in the middle of a move", () => assert.deepEqual(stagesCrossed("qualify", "consultants", { lead_type: "architect_tender" }), ["consultants"]));
t("…but the target itself is never skipped", () => assert.deepEqual(stagesCrossed("qualify", "discovery", { lead_type: "architect_tender" }), ["discovery"]));

console.log("\n▸ pathway and delivery model");
t("default is design_build", () => assert.equal(resolveEngagementPathway({}), "design_build"));
t("lead_type drives Architect Tender", () => assert.equal(resolveEngagementPathway({ lead_type: "architect_tender" }), "architect_tender"));
for (const delivery_model of ["build_only", "construction_management", "other", "design_build"]) {
  t(`delivery_model ${delivery_model} waives nothing`, () => {
    assert.equal(resolveEngagementPathway({ delivery_model }), "design_build");
    assert.equal(forwardMoveBlock("enquiry", "won", { ...BLANK, delivery_model }).stage, "discovery");
  });
}

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
