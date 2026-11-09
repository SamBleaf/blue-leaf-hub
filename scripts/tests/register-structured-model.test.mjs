/**
 * register-structured-model.test.mjs — R05 P3 (Tab 27 Gate 1): the typed answer on a register item.
 * No server, no database. Run: node scripts/tests/register-structured-model.test.mjs
 */
import { readFileSync } from "node:fs";
import {
  makeItem, makeRoom, emptyMeta, readRegister, writeRegister, isClientSelection, defaultItemFor, defaultItemsFor, applyDefaultToRooms,
  contractInclusionOf, itemAxes, normaliseAnswer, stableStringify, answerStateOf, unresolvedOf, clientSafeAnswer, answerSummary,
  answerMaterialChanged, answerFingerprint, hasExplicitChoice, activeAssumption, applyPricingAssumption, exceptionAnswerFrom,
  confirmRoomDefaults, roomDefaultStatus, ANSWER_SCHEMA_VERSION, UNRESOLVED_REASONS,
} from "../../src/lib/register.js";
import { INTERNAL_MARK, buildStructuredRegister, LEGACY_ROWS } from "./lib/registerStructuredFixture.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const same = (a, b) => stableStringify(a) === stableStringify(b);
const shuffle = (v) => (Array.isArray(v) ? v.map(shuffle) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, shuffle(v[k])])) : v);
const fx = buildStructuredRegister();
const N = fx.named;

console.log("\nCanonical form");
const full = { v: 1, state: "recorded", nature: "choice", configVersion: "m1", selected: [{ optionId: "b", path: ["a", "b"], label: "B" }], element: { id: "e1", key: "driveway", label: "Front" }, zone: { key: "main", label: "Main" },
  areaIds: ["r1", "r1", "r2"], sourceQuestionIds: ["W-004"], linkedItemIds: ["x"], unresolved: { reason: "decide_later", note: "n" }, assumption: { tier: "standard", text: "t" }, delivery: { method: "subcontract", trade: "Tiler" }, note: "hello" };
const c1 = normaliseAnswer(full);
ok("carries every field the brief names", ["state", "selected", "element", "zone", "areaIds", "unresolved", "assumption", "delivery", "sourceQuestionIds", "linkedItemIds"].every((k) => k in c1 && c1[k]));
ok("stamped with the schema version", c1.v === ANSWER_SCHEMA_VERSION);
ok("normalising twice changes nothing", same(normaliseAnswer(c1), c1) && JSON.stringify(normaliseAnswer(c1)) === JSON.stringify(c1));
ok("key order in the source doesn't matter (Postgres jsonb reorders)", JSON.stringify(normaliseAnswer(shuffle(full))) === JSON.stringify(c1));
ok("duplicate area ids collapse", c1.areaIds.join() === "r1,r2");
ok("an empty answer is no answer", normaliseAnswer({}) === null && normaliseAnswer({ v: 1, state: "not_discussed" }) === null && normaliseAnswer(null) === null && normaliseAnswer("x") === null && normaliseAnswer([1]) === null);
ok("a bare option id is accepted as a one-step path", same(normaliseAnswer({ selected: ["tile"] }).selected, [{ optionId: "tile", path: ["tile"], label: "" }]));
ok("a path gives the option id", normaliseAnswer({ selected: [{ path: ["metal", "pitched"] }] }).selected[0].optionId === "pitched");
ok("a repeated option at two levels stays in the path", normaliseAnswer({ selected: [{ path: ["other", "other"] }] }).selected[0].path.length === 2);
ok("the same path twice is one selection", normaliseAnswer({ selected: [{ path: ["a"] }, { path: ["a"] }] }).selected.length === 1);
ok("selected implies recorded, unresolved implies unresolved", normaliseAnswer({ selected: ["a"] }).state === "recorded" && normaliseAnswer({ unresolved: { reason: "decide_later" } }).state === "unresolved");
ok("an unknown state falls back rather than being trusted", normaliseAnswer({ state: "client_approved", selected: ["a"] }).state === "recorded");
ok("an unknown nature is dropped", normaliseAnswer({ nature: "approved", selected: ["a"] }).nature === null);
ok("unknown keys are kept", normaliseAnswer({ selected: ["a"], future: { x: 1 } }).future?.x === 1);
ok("a newer schema is kept whole, never downgraded", same(normaliseAnswer({ v: 99, shape: "new", state: "weird" }), { v: 99, shape: "new", state: "weird" }));
ok("the stored answer is a copy, not a shared reference", (() => { const raw = { selected: [{ path: ["a"] }] }; const it = makeItem({ answer: raw }); raw.selected[0].path.push("b"); return it.answer.selected[0].path.length === 1; })());
ok("every unresolved reason from B09 exists with no forced note", ["decide_later", "blue_leaf_to_advise", "designer_to_confirm", "awaiting_info"].every((r) => UNRESOLVED_REASONS[r] && normaliseAnswer({ unresolved: { reason: r } }).unresolved.note === ""));

console.log("\nThe answer rides on the existing item");
ok("makeItem keeps the answer", same(makeItem({ answer: full }).answer, c1));
ok("no answer is null, so a legacy item looks the same as before", makeItem({ description: "x" }).answer === null);
ok("readRegister / writeRegister are lossless", (() => { const back = readRegister({ selections_schedule: JSON.parse(JSON.stringify(writeRegister({ meta: fx.meta, items: fx.items }))) }); return back.items.length === fx.items.length && fx.items.every((i) => same(back.items.find((b) => b.id === i.id).answer, i.answer)); })());
ok("a legacy item isn't given an answer key on write", (() => { const r = writeRegister({ meta: emptyMeta(), items: [makeItem({ description: "old" })] }); return !("answer" in r[0]); })());
ok("room ids and room confirmations survive the scratchpad", (() => { const back = readRegister({ selections_schedule: JSON.parse(JSON.stringify(writeRegister({ meta: fx.meta, items: [] }))) }); const r = back.meta.rooms.find((x) => x.id === fx.rooms.bed1.id); return Object.keys(r.defaultConfirmations).length === 2; })());

console.log("\nLegacy records");
const legacy = readRegister({ selections_schedule: JSON.parse(JSON.stringify(LEGACY_ROWS)) });
ok("old free-text rows read with no answer", legacy.items.length === 2 && legacy.items.every((i) => i.answer === null));
ok("their text is intact, not parsed", legacy.items[1].description === "Engineered oak, matt, living zones" && /Blackbutt boards/.test(legacy.items[0].description));
ok("they report as legacy text, not as unanswered", legacy.items.every((i) => answerStateOf(i) === "legacy_text"));
ok("a blank new prompt reports as not discussed", answerStateOf(makeItem({})) === "not_discussed");
ok("a legacy default still counts as the default", defaultItemFor(legacy, "W-017")?.id === "ri_w017_plain_text");

console.log("\nStore classification (scope versus client choice)");
ok("a part-finished progressive selection stays a client selection", isClientSelection(N.roof));
ok("an unresolved selection stays a client selection", isClientSelection(N.parked));
ok("an excluded selection leaves the client store", !isClientSelection(N.excluded));
ok("an N/A selection leaves the client store", !isClientSelection(N.notApplicable));
ok("a fact filed as a selection can't reach the client store", !isClientSelection(N.misfiledFact));
ok("a plain legacy selection is unaffected", isClientSelection(makeItem({ itemKind: "selection", description: "x" })));
ok("site facts are never client selections", !isClientSelection(N.access) && !isClientSelection(N.occupied));
ok("each repeated element keeps its own stable id", N.driveway.id !== N.fence.id && N.wallMain.id !== N.wallFeature.id);

console.log("\nDistinct axes: none implies another");
const base = makeItem({ itemKind: "selection", answer: { selected: [{ path: ["a"], label: "A" }], nature: "choice" } });
const ax = itemAxes(base);
ok("a recorded selection is not a preference, approval, verification or scope", !ax.clientPreference && !ax.clientApproval && ax.technicalVerification === "not_required" && ax.pricingStatus === "not_reviewed" && ax.constructionScope === "undecided" && ax.internalAssumption === null);
ok("selecting never sets certainty", base.certainty === "not_considered");
const flip = (partial) => itemAxes(makeItem({ ...base, ...partial }));
ok("preference moves only preference", (() => { const a = flip({ certainty: "preference" }); return a.clientPreference && !a.clientApproval && a.constructionScope === "undecided"; })());
ok("approval needs evidence", !flip({ certainty: "client_approved" }).clientApproval && flip({ certainty: "client_approved", evidence: { at: "t", by: "b" } }).clientApproval);
ok("verification moves only verification", (() => { const a = flip({ technicalStatus: "verified" }); return a.technicalVerification === "verified" && !a.clientApproval && a.pricingStatus === "not_reviewed"; })());
ok("pricing moves only pricing", (() => { const a = flip({ pricingStatus: "quoted_or_confirmed" }); return a.pricingStatus === "quoted_or_confirmed" && !a.clientApproval && a.technicalVerification === "not_required"; })());
ok("scope moves only scope", (() => { const a = flip({ disposition: "new" }); return a.constructionScope === "included" && !a.clientApproval && !a.clientPreference; })());
ok("a recorded access fact is not construction scope", contractInclusionOf(N.access) === "not_scope");
ok("disposition drives contract inclusion", contractInclusionOf(N.driveway) === "included" && contractInclusionOf(N.fence) === "by_others" && contractInclusionOf(makeItem({ itemKind: "scope", disposition: "retain" })) === "retained");
ok("who delivers it doesn't change whether it's in the contract", (() => { const a = makeItem({ ...N.driveway, answer: { ...N.driveway.answer, delivery: { method: "self_perform" } } }); return contractInclusionOf(a) === contractInclusionOf(N.driveway) && a.answer.delivery.method !== N.driveway.answer.delivery.method; })());

console.log("\nBlue Leaf pricing assumptions");
const blank = makeItem({ itemKind: "selection", category: "joinery", promptKey: "K-004" });
const assumed = applyPricingAssumption(blank, { tier: "standard", text: "Laminate doors", categoryKey: "joinery", baselineVersion: "b1" });
ok("recorded on an unresolved item, labelled with its origin", assumed.answer.assumption.origin === "blue_leaf_baseline" && assumed.answer.assumption.tier === "standard");
ok("never becomes a client preference or approval", assumed.certainty === "not_considered" && !itemAxes(assumed).clientPreference && !itemAxes(assumed).clientApproval);
ok("never fills the product or description", assumed.product === "" && assumed.description === "");
ok("never counts as an answer", assumed.answer.state === "not_discussed" && assumed.answer.selected.length === 0 && !hasExplicitChoice(assumed));
ok("visible to the estimator while nothing is chosen", activeAssumption(assumed)?.text === "Laminate doors");
ok("can't overwrite an explicit selection", applyPricingAssumption(N.floorMain, { tier: "premium", text: "x" }) === N.floorMain);
ok("can't overwrite typed text or a product", (() => { const a = makeItem({ description: "client said oak" }), b = makeItem({ product: "Oak 180" }); return applyPricingAssumption(a, { tier: "standard", text: "x" }) === a && applyPricingAssumption(b, { tier: "standard", text: "x" }) === b; })());
ok("steps aside once a real choice exists", activeAssumption(makeItem({ ...assumed, answer: { ...assumed.answer, selected: [{ path: ["a"] }] } })) === null);

console.log("\nUnresolved answers");
ok("reason and owner read together, owner from the existing field", (() => { const u = unresolvedOf(N.parked); return u.reason === "designer_to_confirm" && u.owner === "architect"; })());
ok("a recorded answer reports nothing unresolved", unresolvedOf(N.floorMain) === null && unresolvedOf(makeItem({})) === null);

console.log("\nClient projection is an allow-list");
const leaked = fx.items.filter((i) => JSON.stringify(clientSafeAnswer(i) ?? "").includes(INTERNAL_MARK) || answerSummary(i).includes(INTERNAL_MARK));
ok("no staff-only text in any item's client view", leaked.length === 0, leaked.map((i) => i.promptKey).join());
ok("the fixture really has staff-only text to find", fx.items.filter((i) => JSON.stringify(i.answer).includes(INTERNAL_MARK)).length >= 5);
ok("only the allowed keys exist", Object.keys(clientSafeAnswer(N.driveway)).sort().join() === "element,selected,state,zone");
ok("each selected row exposes only a label", Object.keys(clientSafeAnswer(N.driveway).selected[0]).join() === "label");
ok("a field added later can't leak", !JSON.stringify(clientSafeAnswer(makeItem({ answer: { selected: ["a"], newInternal: INTERNAL_MARK } }))).includes(INTERNAL_MARK));
ok("an answer from a newer schema gives no client view", clientSafeAnswer({ answer: { v: 99, secret: INTERNAL_MARK } }) === null);
ok("the summary reads from labels", answerSummary(N.wallFeature) === "Fibre cement sheet — Feature" && answerSummary(N.driveway) === "Front driveway — Exposed aggregate");
ok("an assumption alone gives no summary", answerSummary(N.assumed) === "");
ok("flagged choices aren't shown as current", answerSummary(makeItem({ answer: { selected: [{ path: ["a"], label: "A", stale: true }, { path: ["b"], label: "B" }] } })) === "B");

console.log("\nWhat counts as a real change");
const m = (partial) => ({ ...N.floorMain.answer, ...partial });
ok("a different option is a change", answerMaterialChanged(N.floorMain.answer, m({ selected: [{ path: ["carpet"], label: "Carpet" }] })));
ok("a different zone is a change", answerMaterialChanged(N.floorMain.answer, m({ zone: { key: "bedroom_floor", label: "Bed" } })));
ok("a different state is a change", answerMaterialChanged(N.floorMain.answer, m({ state: "client_unsure" })));
ok("a label wording change isn't", !answerMaterialChanged(N.floorMain.answer, m({ selected: [{ path: ["timber"], label: "Timber boards" }] })));
ok("notes, assumptions, delivery and links aren't", !answerMaterialChanged(N.floorMain.answer, m({ note: "n", assumption: { tier: "standard", text: "t" }, delivery: { method: "subcontract" }, linkedItemIds: ["z"] })));
ok("reordering selections isn't", !answerMaterialChanged(normaliseAnswer({ selected: ["a", "b"] }), normaliseAnswer({ selected: ["b", "a"] })));
ok("legacy with nothing chosen equals an empty answer", !answerMaterialChanged(null, { note: "only a note" }));
ok("the first real selection on a legacy item is a change", answerMaterialChanged(null, { selected: ["a"] }));

console.log("\nShared defaults and room exceptions");
const reg = { meta: fx.meta, items: fx.items };
ok("a question can hold several zone defaults", defaultItemsFor(reg, "W-017").length === 2);
ok("a zone finds its own default", defaultItemFor(reg, "W-017", { zoneKey: "wet_area_floor" })?.id === N.floorWet.id);
ok("existing callers still get a single default", defaultItemFor(reg, "W-017")?.id === N.floorMain.id);
ok("an unknown zone with no unzoned default finds nothing", defaultItemFor(reg, "W-017", { zoneKey: "garage" }) === null);
const applied = applyDefaultToRooms(reg, N.floorMain.id, [fx.rooms.bed2.id]);
const exc = applied.items.find((i) => i.overridesDefaultId === N.floorMain.id && i.roomId === fx.rooms.bed2.id);
ok("an exception is its own item with its own id, carrying the choice", !!exc && exc.id !== N.floorMain.id && same(exc.answer.selected, N.floorMain.answer.selected));
ok("an exception doesn't inherit the default's note or assumption", exceptionAnswerFrom({ answer: normaliseAnswer({ selected: ["a"], note: INTERNAL_MARK, assumption: { tier: "standard", text: INTERNAL_MARK } }) }).note === "" && exceptionAnswerFrom({ answer: normaliseAnswer({ selected: ["a"], assumption: { tier: "standard", text: "x" } }) }).assumption === null);
ok("the default itself is untouched", same(applied.items.find((i) => i.id === N.floorMain.id), N.floorMain));

console.log("\nRoom confirmation is applicability only");
const room = makeRoom({ name: "Bed 3", roomType: "bedroom" });
const before = JSON.stringify(fx.items);
const confirmed = confirmRoomDefaults(room, [N.floorMain, N.wallMain], { at: "2026-11-10T00:00:00Z", by: "Staff" });
ok("records who, when and what it was", confirmed.defaultConfirmations[N.floorMain.id].by === "Staff" && !!confirmed.defaultConfirmations[N.floorMain.id].fingerprint);
ok("touches no item: can't approve, verify or duplicate anything", JSON.stringify(fx.items) === before && N.floorMain.certainty === "preference" && N.floorMain.technicalStatus === "not_required");
ok("other rooms are not confirmed by it", roomDefaultStatus(room, N.floorMain) === "inherited");
ok("confirmed room reads confirmed", roomDefaultStatus(confirmed, N.floorMain) === "confirmed");
const changedDefault = makeItem({ ...N.floorMain, answer: { ...N.floorMain.answer, selected: [{ path: ["carpet"], label: "Carpet" }] } });
ok("a changed default flags the confirmed room, and doesn't move it", roomDefaultStatus(confirmed, changedDefault) === "changed" && answerFingerprint(changedDefault) !== confirmed.defaultConfirmations[N.floorMain.id].fingerprint);
ok("a legacy default changes its fingerprint on a text edit", answerFingerprint(makeItem({ description: "oak" })) !== answerFingerprint(makeItem({ description: "ash" })));
ok("an exception reads overridden", roomDefaultStatus(confirmed, N.floorMain, N.kitchenFloor) === "overridden");
ok("an overridden default is skipped by confirm", !(N.floorMain.id in confirmRoomDefaults(room, [N.floorMain], { at: "t", by: "b", exceptionFor: () => N.kitchenFloor }).defaultConfirmations));
ok("a parked default stays open", !(N.parked.id in confirmRoomDefaults(room, [N.parked], { at: "t", by: "b" }).defaultConfirmations));
ok("confirmation survives makeRoom", Object.keys(makeRoom(confirmed).defaultConfirmations).length === 2);
ok("a junk confirmation is dropped", Object.keys(makeRoom({ defaultConfirmations: { a: "x", b: {} } }).defaultConfirmations).length === 0);

console.log("\nThe screens' save store carries it");
const hook = readFileSync(new URL("../../src/components/sales/lead-detail/register/useRegister.js", import.meta.url), "utf8");
ok("autosave's field list comes from makeItem, so it includes answer", /Object\.keys\(makeItem\(\{\}\)\)/.test(hook) && "answer" in makeItem({}));
ok("the conflict merge keeps room confirmations", /ROOM_FIELDS = \[[^\]]*"defaultConfirmations"/.test(hook));
ok("an approved selection steps back when its answer really changes", /"answer" in partial && answerMaterialChanged\(item\.answer, partial\.answer\)/.test(hook));

console.log(`\nregister-structured-model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
