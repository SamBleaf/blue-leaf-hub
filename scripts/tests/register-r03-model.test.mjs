// register-r03-model.test.mjs — Master Register R03 model + question-library tests (pure, no DB).
// Exercises src/lib/register.js + src/lib/registerQuestions.js: Tab 21 coverage + verbatim wording,
// relevance by room / project type / stage / delivery model, the four item kinds, independent status
// axes, deferred ≠ selection, outstanding reasons, inherited defaults, stable references.
// Run: npm run test:register-r03-model

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  promptsFor, roomPrompts, questionById, resolvePromptId, makeItem, makeRoom, emptyMeta, isClientSelection, outstandingReasons,
  itemIssues, defaultItemFor, refCode, readRegister, writeRegister, QUESTION_LIBRARY_VERSION, ITEM_KINDS, REGISTER_DISPOSITIONS,
  TECHNICAL_STATUSES, PRICING_STATUSES,
} from "../../src/lib/register.js";
import { QUESTIONS } from "../../src/lib/registerQuestions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${detail}` : ""}`); } };
const ids = (qs) => qs.map((q) => q.id);

// ── library coverage + wording ──────────────────────────────────────────────────────────────────
{
  const parsed = JSON.parse(readFileSync(join(__dirname, "../../docs/master_register/question-library/tab21-parsed-v1.0.json"), "utf8"));
  const families = new Set(QUESTIONS.map((q) => q.id[0]));
  ok("library: all 147 Tab 21 question IDs present, every family P W R K B L V D H O E M", QUESTIONS.length === 147 && parsed.length === 147
    && "PWRKBLVDHOEM".split("").every((f) => families.has(f)));
  const verbatim = parsed.every((p) => { const q = questionById(p.id); return q && q.text.endsWith(p.text); });
  ok("library: question wording is the approved Tab 21 text, verbatim", verbatim);
  ok("library: versioned", QUESTION_LIBRARY_VERSION === "tab21-v1.0");
  ok("library: every non-FACT question maps to a register item kind (no per-question columns)",
    QUESTIONS.every((q) => q.kind === "FACT" ? q.itemKind == null : Object.keys(ITEM_KINDS).includes(q.itemKind)));
  ok("library: FACT questions (client, address, budget, drawings, consultants) are never prompts",
    !promptsFor("project", { showDetail: true }).some((q) => q.kind === "FACT"));
  ok("library: TECH questions become owned actions needing verification — never client selections",
    QUESTIONS.filter((q) => q.kind === "TECH").every((q) => q.itemKind === "action" && q.technical === "needs_verification"));
}

// ── relevance: rooms ────────────────────────────────────────────────────────────────────────────
{
  const bath = ids(promptsFor("room", { roomType: "bathroom", roomScope: "renovated", projectType: "renovation" }));
  const living = ids(promptsFor("room", { roomType: "living", roomScope: "new", projectType: "new_build" }));
  const kitchen = ids(promptsFor("room", { roomType: "kitchen", roomScope: "new", projectType: "new_build" }));
  const wc = ids(promptsFor("room", { roomType: "wc", roomScope: "new" }));
  ok("rooms: bathroom shows wet-area fixtures (toilet, vanity, shower, tiles); living room does not",
    ["B-003", "B-004", "B-006", "B-009"].every((x) => bath.includes(x)) && !living.some((x) => x.startsWith("B-")));
  ok("rooms: kitchen gets K-* and the shared card; no bathroom/laundry prompts leak", kitchen.includes("K-004") && kitchen.includes("R-003") && !kitchen.some((x) => /^(B|L)-/.test(x)));
  ok("rooms: WC/powder gets toilet + basin but no shower or bath", wc.includes("B-003") && wc.includes("B-005") && !wc.includes("B-006") && !wc.includes("B-007"));
  ok("rooms: wet areas use their tile prompt, not the generic floor/wall finish", !bath.includes("R-005") && !bath.includes("R-006"));
  ok("rooms: R-002 room disposition is folded into the R-003 scope row (one row, not two)", !kitchen.includes("R-002") && kitchen.includes("R-003"));
  ok("rooms: concept stage hides detailed (stage D) prompts; consultants stage shows them; staff can work ahead",
    !kitchen.includes("K-011") && ids(promptsFor("room", { roomType: "kitchen", roomScope: "new", stage: "consultants" })).includes("K-011")
    && ids(promptsFor("room", { roomType: "kitchen", roomScope: "new", stage: "winning_offer", showDetail: true })).includes("K-011"));
  const kitchenRoomCount = kitchen.length;
  ok(`rooms: a Concept kitchen card shows a manageable set (${kitchenRoomCount} prompts, grouped by topic)`, kitchenRoomCount > 8 && kitchenRoomCount <= 22);
}

// ── relevance: project type, overlays, sections ────────────────────────────────────────────────
{
  const siteNew = ids(promptsFor("site", { projectType: "new_build" }));
  const siteReno = ids(promptsFor("site", { projectType: "renovation" }));
  ok("site: renovation-only existing-building prompts (W-004..W-008) hidden on a new build, shown on a renovation",
    !siteNew.includes("W-004") && siteReno.includes("W-004") && siteReno.includes("W-006") && siteReno.includes("W-007"));
  ok("site: core site prompts (access, external works, unknowns) apply to every project", ["W-001", "W-010", "W-011"].every((x) => siteNew.includes(x)));
  ok("mgmt: management overlay only for build-only / construction-management delivery",
    promptsFor("mgmt", { deliveryModel: "design_build" }).length === 0 && promptsFor("mgmt", { deliveryModel: "construction_management" }).length >= 3);
  ok("tech: element coordination (E-*) never appears in an onsite room card", !QUESTIONS.filter((q) => q.section === "room").some((q) => q.id.startsWith("E-")));
  // Scenario C — small bathroom + laundry renovation: no new-build or kitchen clutter
  const small = [...promptsFor("room", { roomType: "bathroom", roomScope: "renovated", projectType: "renovation" }), ...promptsFor("room", { roomType: "laundry", roomScope: "renovated", projectType: "renovation" })];
  ok("Scenario C: a bathroom + laundry renovation shows no kitchen, living, bedroom or outdoor prompts",
    !small.some((q) => /^(K|V|D|H|O)-/.test(q.id)) && small.some((q) => q.id === "L-002") && small.some((q) => q.id === "R-013"));
}

// ── kinds + independent status axes ────────────────────────────────────────────────────────────
{
  const req = makeItem({ itemKind: "requirement", description: "Improve thermal comfort and reduce air leakage", technicalStatus: "needs_verification" });
  const scope = makeItem({ itemKind: "scope", disposition: "new", description: "Construct new external wall" });
  const sel = makeItem({ itemKind: "selection", description: "Preferred cladding: vertical shiplap, Monument", certainty: "preference" });
  ok("kinds: scope / requirement / selection stay distinct; only the selection is a client choice",
    isClientSelection(sel) && !isClientSelection(req) && !isClientSelection(scope));
  ok("kinds: a deferred selection is a scope-boundary answer, not a client choice", !isClientSelection(makeItem({ itemKind: "selection", disposition: "deferred" })));
  ok("vocab: disposition includes Included and Deferred; technical + pricing are separate three-state axes",
    "included" in REGISTER_DISPOSITIONS && "deferred" in REGISTER_DISPOSITIONS && Object.keys(TECHNICAL_STATUSES).length === 3 && Object.keys(PRICING_STATUSES).length === 3);
  const approvedNoTech = makeItem({ itemKind: "selection", certainty: "client_approved", evidence: { at: "2026-11-12", by: "Sam" }, technicalStatus: "needs_verification" });
  ok("axes: a client-approved glazing choice still shows technical verification outstanding (Tab 23 test E)",
    outstandingReasons(approvedNoTech).includes("verification") && !outstandingReasons(approvedNoTech).includes("decision"));
  ok("axes: client_approved without evidence is flagged; verified without a reference is flagged",
    itemIssues(makeItem({ itemKind: "selection", certainty: "client_approved" })).length === 1
    && itemIssues(makeItem({ itemKind: "requirement", technicalStatus: "verified" })).length === 1);
  ok("outstanding: an open action is outstanding until done", outstandingReasons(makeItem({ itemKind: "action", description: "Confirm peninsula clearance" })).includes("action")
    && outstandingReasons(makeItem({ itemKind: "action", resolved: true })).length === 0);
  ok("outstanding: a requirement captured as a client want is not nagged as a decision", outstandingReasons(makeItem({ itemKind: "requirement", certainty: "preference" })).length === 0);
}

// ── defaults, legacy keys, references, round trip ──────────────────────────────────────────────
{
  const room = makeRoom({ name: "Bed 2", roomType: "bedroom" });
  const def = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", isDefault: true, description: "Engineered oak" });
  const reg = { meta: emptyMeta({ rooms: [room] }), items: [def] };
  ok("defaults: R-005 floor prompt inherits the W-017 whole-house default", questionById("R-005").inherits === "W-017" && defaultItemFor(reg, "W-017")?.id === def.id);
  ok("legacy: R02 prompt keys resolve to Tab 21 IDs (k_bench→K-005, wh_flooring→W-017)", resolvePromptId("k_bench") === "K-005" && resolvePromptId("wh_flooring") === "W-017" && resolvePromptId("K-005") === "K-005");
  ok("refs: an item's document reference is stable across renames and reads", refCode(def) === refCode(makeItem({ ...def, description: "changed" })) && /^W017-[0-9A-Z]{3}$/.test(refCode(def)));
  const round = readRegister({ selections_schedule: writeRegister({ meta: reg.meta, items: [makeItem({ ...def, quantity: 42.5, unit: "m²", supplyBy: "trade", technicalStatus: "not_required", pricingStatus: "allowance_or_estimate", pricingRef: "PC-3", sync: { version: "x" } })] }) });
  const it = round.items[0];
  ok("round trip: quantity/unit/supply/pricing survive the lead scratchpad; server sync is never persisted",
    it.quantity === 42.5 && it.unit === "m²" && it.supplyBy === "trade" && it.pricingRef === "PC-3" && it.sync === null);
  ok("quantity: blank means NOT MEASURED (null), never zero", makeItem({ quantity: "" }).quantity === null && makeItem({}).quantity === null);
  ok("roomPrompts (R02 API) still works on top of the library", roomPrompts("kitchen").some((p) => p.key === "K-005" && p.question));
}

console.log(`\nMaster Register R03 — model + library tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
