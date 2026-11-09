/**
 * register-structured-mapping.test.mjs — R05 P3 (Tab 27 Gate 0.2): the Tab 21 answer map covers every
 * approved question exactly once, in the approved words, and its readable document is current.
 * No server, no database. Run: node scripts/tests/register-structured-mapping.test.mjs
 */
import { readFileSync } from "node:fs";
import { QUESTIONS } from "../../src/lib/registerQuestions.js";
import { OPEN_OPTION_IDS } from "../../src/lib/register.js";
import { JSON_PATH, MD_PATH, validateAnswerMap, renderAnswerMap } from "../register/build-answer-map-doc.mjs";
import { buildStructuredRegister } from "./lib/registerStructuredFixture.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };

const map = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const by = new Map(map.questions.map((q) => [q.id, q]));
const copy = () => JSON.parse(JSON.stringify(map));
const failsWith = (mutate, rx) => { const m = copy(); mutate(m); return validateAnswerMap(m).some((e) => rx.test(e)); };
const flat = (list) => (list || []).flatMap((o) => [o, ...flat(o.children)]);

console.log("\nCoverage");
ok("the approved library really has 147 questions", QUESTIONS.length === 147, QUESTIONS.length);
ok("all 147 are mapped, one entry each", map.questions.length === 147 && by.size === 147);
ok("the shipped map passes every structural check", validateAnswerMap(map).length === 0, validateAnswerMap(map).join("\n"));
ok("every question keeps its verbatim Tab 21 wording", QUESTIONS.every((q) => by.get(q.id)?.text === q.text));
ok("every question has a mapping, a nature and a meeting tier", map.questions.every((q) => q.mapping && q.nature && q.tier));
ok("relevance is recorded for project type, room type and stage", map.questions.every((q) => q.relevance.projects && q.relevance.stage && "rooms" in q.relevance));
const counts = map.questions.reduce((m, q) => ({ ...m, [q.mapping]: (m[q.mapping] || 0) + 1 }), {});
ok("all eight mapping classes are used", Object.keys(counts).length === 8, JSON.stringify(counts));
console.log(`    ${JSON.stringify(counts)}`);

console.log("\nTab 27 decisions show up in the map");
ok("site access is several selectable facts, never a work disposition (MR-UX-02)", by.get("W-001").mapping === "multi_select" && by.get("W-001").nature === "fact" && by.get("W-001").disposition === "none" && by.get("W-001").options.length >= 7);
ok("living on site branches from Yes / No / Unsure", by.get("W-007").mapping === "progressive_branch" && by.get("W-007").options.map((o) => o.id).join() === "yes,no,unsure" && by.get("W-007").options[0].children.length > 0);
ok("unknown conditions are a risk with an owner, not scope", by.get("W-011").mapping === "action_risk" && by.get("W-011").nature === "risk" && by.get("W-011").disposition === "none");
ok("existing works are repeatable with real dispositions", by.get("W-004").mapping === "repeatable_scope" && by.get("W-004").disposition === "element" && by.get("W-004").actions.some((a) => a.disposition === "remove"));
const ew = map.presentationGroups.find((g) => g.key === "existing_works");
ok("W-004, W-006 and W-008 present together with every source id kept", ew.primary === "W-004" && ew.aliases.includes("W-006") && ew.aliases.includes("W-008") && by.has("W-006") && by.has("W-008"));
ok("Tab 21's Protect and Match actions survive on the merged path", ["protect", "match"].every((id) => by.get("W-004").actions.find((a) => a.id === id)?.aliasOf === "W-006"));
ok("external works ask details only for work being done (B07)", by.get("W-010").actions.filter((a) => a.details).map((a) => a.id).join() === "new,replace,alter");
ok("walls hold several systems by zone (B01)", by.get("W-013").repeat.by === "zone" && by.get("W-013").options.some((o) => o.id === "lightweight_cladding" && o.children.some((c) => c.id === "aac")));
ok("gutters are a separate linked item (MR-UX-01B)", by.get("W-014").linked?.key === "gutters");
ok("floors have main, bedroom and wet zones (MR-UX-01E)", ["main_floor", "bedroom_floor", "wet_area_floor"].every((z) => by.get("W-017").zones.some((o) => o.id === z)));
ok("doors offer 2040, 2340, floor to ceiling and P50 shadowline (MR-UX-01F)", ["2040", "2340", "floor_to_ceiling", "p50_shadowline"].every((id) => flat(by.get("W-018").options).some((o) => o.id === id)));
ok("paint has no generic sheen option (MR-UX-01G)", !flat(by.get("W-019").options).some((o) => /sheen/i.test(o.label)) && !flat(by.get("W-019").zones).some((o) => /sheen/i.test(o.label)));
ok("performance goals are independent and not certification (MR-UX-01D)", by.get("W-016").control === "multi" && by.get("W-016").options.length === 4 && /not certification/i.test(by.get("W-016").notes));
ok("the client's quality priority is kept apart from the Blue Leaf baseline tier", /Not the Blue Leaf baseline/.test(by.get("W-009").notes));
ok("no option can record an approval, a verification or a price", !map.questions.some((q) => JSON.stringify(q.options || []).match(/client_approved|verified|\$\s?\d/)));
ok("waterproofing stays an office technical check, apart from wet-area looks (B03)", by.get("B-012").mapping === "technical_only" && by.get("B-012").tier === "office_only");
ok("element technical prompts never reach a client meeting", map.questions.filter((q) => q.family === "E").every((q) => q.tier === "office_only"));
ok("every Sales fact stays prefilled, none is re-asked", QUESTIONS.filter((q) => q.kind === "FACT" || q.prefill).every((q) => by.get(q.id).mapping === "fact_prefill"));

console.log("\nOpen options");
const everyChoice = map.questions.flatMap((q) => flat([...(q.options || []), ...(q.zones || []), ...(q.elements || [])]));
const catchAll = everyChoice.filter((o) => /^other( zone)?$/i.test(o.label));
ok("every catch-all in the map is one the model treats as open, so its words count as the answer", catchAll.length >= 14 && catchAll.every((o) => OPEN_OPTION_IDS.has(o.id)), catchAll.filter((o) => !OPEN_OPTION_IDS.has(o.id)).map((o) => o.id).join());
ok("named options that only sound open stay configured", !OPEN_OPTION_IDS.has("custom") && !OPEN_OPTION_IDS.has("other_cement_sheet_system") && everyChoice.some((o) => o.id === "other_cement_sheet_system"));

console.log("\nTab 27 Q4 stays open");
const everyAction = map.questions.flatMap((q) => flat([...(q.options || []), ...(q.actions || [])]).map((o) => ({ ...o, q: q.id })));
const clientSupply = everyAction.filter((o) => o.supplyBy === "client");
ok("client supply records who supplies and never decides contract inclusion", clientSupply.length >= 7 && clientSupply.every((o) => !o.disposition), clientSupply.filter((o) => o.disposition).map((o) => o.q).join());
ok("the four By client answers say why", ["W-022", "R-014", "V-005", "O-001"].every((id) => /Tab 27 Q4/.test(by.get(id).notes || "")));
ok("the matching non-client answers keep their disposition", by.get("R-014").actions.find((a) => a.id === "other_trade").disposition === "by_others" && by.get("W-022").actions.find((a) => a.id === "included").disposition === "included");

console.log("\nThe model's option paths exist in the map");
const walk = (list, path) => { let level = list; for (const id of path) { const hit = (level || []).find((o) => o.id === id); if (!hit) return false; level = hit.children; } return true; };
const { named } = buildStructuredRegister();
for (const key of ["wallMain", "wallFeature", "roof", "floorMain", "floorWet", "access", "occupied", "risk", "sink", "twoOthers", "heatingOthers"]) {
  const it = named[key];
  ok(`${it.promptKey} ${it.answer.selected.map((s) => s.path.join(" > ")).join(", ")}`, it.answer.selected.every((s) => walk(by.get(it.promptKey).options, s.path)));
}

console.log("\nRejected paths: a damaged map is refused");
ok("a dropped question", failsWith((m) => { m.questions = m.questions.filter((q) => q.id !== "W-001"); }, /W-001: missing/));
ok("a duplicated question", failsWith((m) => { m.questions.push(m.questions[0]); }, /listed twice/));
ok("a question Tab 21 doesn't have", failsWith((m) => { m.questions.push({ ...m.questions[0], id: "Z-999" }); }, /Z-999: not in the question library/));
ok("reworded question text", failsWith((m) => { m.questions[0].text += " edited"; }, /wording differs/));
ok("changed relevance", failsWith((m) => { m.questions.find((q) => q.id === "W-004").relevance.projects = "all"; }, /relevance differs/));
ok("an unknown mapping class", failsWith((m) => { m.questions[10].mapping = "free_text"; }, /unknown mapping/));
ok("a site fact given the work disposition", failsWith((m) => { m.questions.find((q) => q.id === "W-001").disposition = "element"; }, /can't use the generic work disposition/));
ok("an option with a bad id", failsWith((m) => { m.questions.find((q) => q.id === "W-001").options[0].id = "Not Slug"; }, /bad option id/));
ok("two sibling options with one id", failsWith((m) => { const o = m.questions.find((q) => q.id === "W-001").options; o[1].id = o[0].id; }, /duplicate option id/));
ok("an action pointing at a disposition that doesn't exist", failsWith((m) => { m.questions.find((q) => q.id === "W-004").actions[0].disposition = "bulldoze"; }, /unknown disposition/));
ok("a client-supply option that decides contract inclusion", failsWith((m) => { m.questions.find((q) => q.id === "W-022").actions.find((a) => a.id === "by_client").disposition = "by_others"; }, /Tab 27 Q4/));
ok("a select control with no options", failsWith((m) => { delete m.questions.find((q) => q.id === "W-001").options; }, /needs options/));
ok("a room prompt moved out of the guided set", failsWith((m) => { m.questions.find((q) => q.id === "K-005").tier = "more_detail"; }, /guided primary set/));
ok("a Sales fact turned into a question", failsWith((m) => { m.questions.find((q) => q.id === "P-001").mapping = "single_select"; }, /must stay prefilled/));

console.log("\nReadable document");
ok("TAB21_ANSWER_MAP.md matches the JSON", readFileSync(MD_PATH, "utf8") === renderAnswerMap(map));

console.log(`\nregister-structured-mapping: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
