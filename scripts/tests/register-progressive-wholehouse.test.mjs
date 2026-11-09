/**
 * register-progressive-wholehouse.test.mjs — R05 P4b (Tab 27 Gate 3, B01, B03, B04, B05, MR-UX-01A–H, DEC-MRUX-01/03).
 * Whole House: several systems per category, zone-driven defaults, surface finishes, linked gutters, shared standards,
 * the staff-only pricing guide and the performance review list. What a tier may not do is tested as hard as what it does.
 * No server, no database, no browser. Run: node scripts/tests/register-progressive-wholehouse.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTIONS, ANSWER_CONFIG } from "../../src/lib/registerQuestions.js";
import {
  makeItem, makeRoom, emptyMeta, readRegister, writeRegister, toggleOption, toggleNotDecided, toggleNotApplicable, chooseZone, choiceView, configForRow, isLinkedRow, itemPatch,
  standardPrompts, roomDefaultFor, defaultItemsFor, exceptionAnswerFrom, clientSafeAnswer, answerSummary, outstandingReasons, isClientSelection, editOutrunsApproval, hasExplicitChoice,
  normaliseBaseline, partAssumptionFor, mergeBaseline, assumptionIsDraft, setProjectTier, setCategoryTier, applyProjectGuide, baselineView, baselineAssumptions, assumptionFor, performanceSuggestions, resolvePromptId,
  BASELINE_CATEGORIES, BASELINE_VERSION, BASELINE_TIERS, PERFORMANCE_SUGGESTIONS, PERFORMANCE_REVIEW_CHECKS, REVIEW_DISCLAIMER, PASSIVE_HOUSE_NOTE, PROJECT_TOPICS, promptsFor,
} from "../../src/lib/register.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = (id) => ANSWER_CONFIG[id];
const q = (id) => QUESTIONS.find((x) => x.id === id);
const pick = (c, ...steps) => steps.reduce((a, p) => toggleOption(c, a, p), null);
const live = (a) => (a?.selected || []).filter((s) => !s.stale);
const paths = (a) => live(a).map((s) => s.path.join("/")).sort();
const level = (v, key) => v.levels.find((l) => l.key === key);
const ids = (l) => (l?.options || []).map((o) => o.id);
const whole = (id, more = {}) => makeItem({ itemKind: q(id).itemKind, category: q(id).category, promptKey: id, section: "project", isDefault: true, technicalStatus: q(id).technical, ...more });
const inRoom = (id, room, more = {}) => makeItem({ itemKind: q(id).itemKind, category: q(id).category, promptKey: id, roomId: room.id, room: room.name, technicalStatus: q(id).technical, ...more });
const zoneAnswer = (c, key, ...steps) => { let a = chooseZone(c, null, key); for (const s of steps) a = toggleOption(c, a, s); return a; };
const std = (id, key, ...steps) => whole(id, { answer: zoneAnswer(configForRow(id, makeItem({})), key, ...steps) });
const reg = (items = [], meta = {}) => ({ meta: emptyMeta(meta), items });
const STAMP = { at: "2026-11-10T02:00:00.000Z", by: "Sandbox Staff" };

section("Several wall systems, roof systems and gutters (B01, DEC-MRUX-01, MR-UX-01A/B)");
{
  const c = cfg("W-013");
  ok("walls repeat by zone and each row is its own record", c.repeat.by === "zone" && !c.repeat.eachZone);
  const aac = zoneAnswer(c, "main_walls", ["render", "rendered_aac"]);
  const feature = zoneAnswer(c, "feature", ["lightweight_cladding", "fibre_cement_sheet"]);
  ok("AAC render on main walls and fibre cement on a feature zone are both held", answerSummary({ answer: aac }).includes("Rendered AAC") && answerSummary({ answer: feature }).includes("Fibre cement sheet"));
  ok("two systems can share a zone on walls: nothing forces one winner", !choiceView(c, null, { usedZones: null }).zone.options.some((o) => o.disabled));
  ok("metal cladding is offered among the lightweight systems", cfg("W-013").options.find((o) => o.id === "lightweight_cladding").children.some((o) => o.id === "metal_cladding"));

  const r = cfg("W-014");
  ok("roofs now have zones to tell them apart", r.zones.map((z) => z.id).join() === "main_roof,alfresco_or_verandah,garage,other");
  const main = zoneAnswer(r, "main_roof", ["metal_roofing"], ["metal_roofing", "pitched"], ["metal_roofing", "pitched", "corrugated"], ["metal_roofing", "pitched", "corrugated", "dark_tone"]);
  const alfresco = zoneAnswer(r, "alfresco_or_verandah", ["metal_roofing"], ["metal_roofing", "flat_or_low_pitch"], ["metal_roofing", "flat_or_low_pitch", "standing_seam"]);
  ok("a pitched main roof takes a colour with no typing", live(main)[0].label === "Metal roofing · Pitched · Corrugated · Dark tone");
  ok("a low-pitch alfresco is its own answer", paths(alfresco).join() === "metal_roofing/flat_or_low_pitch/standing_seam" && alfresco.zone.key === "alfresco_or_verandah");
  ok("the colour choices are headed Colour", choiceView(r, main).levels.at(-1).heading === "Colour" && ids(choiceView(r, main).levels.at(-1)).join() === "light_tone,mid_tone,dark_tone");
  ok("Other has no colour step to choose words against", !cfg("W-014").options.find((o) => o.id === "tile_roofing").children.find((o) => o.id === "other").children);
  const swap = toggleOption(r, main, ["metal_roofing", "pitched", "standing_seam"]);
  ok("changing profile carries the colour across, because the new profile has it", paths(swap).join() === "metal_roofing/pitched/standing_seam/dark_tone");

  const roofItem = whole("W-014", { answer: main });
  const gutter = makeItem({ ...whole("W-014"), isDefault: false, answer: { element: { id: `el_gutters_${roofItem.id}`, key: "gutters", label: "Gutters" }, linkedItemIds: [roofItem.id] } });
  ok("a roof isn't a linked row", !isLinkedRow(r, roofItem));
  ok("a gutter is, by its element", isLinkedRow(r, gutter));
  ok("an older gutter with only a link is too (the P3 record shape)", isLinkedRow(r, makeItem({ answer: { v: 1, state: "recorded", linkedItemIds: [roofItem.id], selected: [{ path: ["quad"], label: "Quad" }] } })));
  const gc = configForRow("W-014", gutter);
  ok("the gutter row asks about gutters, single answer, nothing about the roof", gc.linkedLabel === "Gutters" && gc.options.map((o) => o.id).join() === "quad,half_round,fascia_integrated,box_gutter,other" && gc.select === "single");
  ok("a gutter row stays a client choice with settle-outs", gc.nature === "choice" && gc.dispositionUse === "settled_only");
  const quad = makeItem({ ...gutter, ...itemPatch(gutter, gc, toggleOption(gc, gutter.answer, ["quad"])) });
  ok("choosing a gutter keeps the link and element", quad.answer.linkedItemIds[0] === roofItem.id && quad.answer.element.key === "gutters" && live(quad.answer)[0].label === "Quad");
  ok("it reads as gutters, separate from the roof", answerSummary(quad) === "Gutters — Quad" && !answerSummary(roofItem).includes("Gutters"));
  ok("it isn't a project default, so a room can't inherit a gutter", !defaultItemsFor(reg([quad]), "W-014").length);
  ok("it is a client selection in its own right", isClientSelection(quad) && quad.certainty === "preference");
}

section("Windows, doors and the rest (MR-UX-01C/F/H)");
{
  const w = cfg("W-015");
  ok("glazing, frame, frame colour and priorities are core; opening style waits for More detail", ids(level(choiceView(w, null), "glazing")).length === 3 && !!level(choiceView(w, null), "frame_colour") && !level(choiceView(w, null), "opening_style") && !!level(choiceView(w, null, { showDetail: true }), "opening_style"));
  ok("no glazing label claims compliance", !JSON.stringify(w.options).match(/compli|certif|rated to/i));
  const a = pick(w, ["glazing", "double_glazing"], ["frame", "aluminium"], ["frame_colour", "dark"]);
  ok("glazing, frame and colour are held side by side", paths(a).join() === "frame/aluminium,frame_colour/dark,glazing/double_glazing");

  const d = cfg("W-018");
  ok("doors are one record now: the groups are the separate defaults", !d.repeat);
  const v = choiceView(d, null);
  ok("door height, jamb and hardware first", v.levels.map((l) => l.key).join() === "door_height,jamb_or_edge_detail,hardware_style");
  ok("the rest wait for More detail, and the card says there's more", v.hidden && choiceView(d, null, { showDetail: true }).levels.map((l) => l.key).join() === "door_height,door_type,jamb_or_edge_detail,skirting,architraves,cornice,hardware_style");
  const usedDetail = pick(d, ["skirting", "other"]);
  ok("a detail group that holds an answer stays visible", choiceView(d, usedDetail).levels.some((l) => l.key === "skirting"));
  ok("P50 shadowline and the door heights are still one tap", ["2040", "2340", "floor_to_ceiling"].every((id) => ids(level(v, "door_height")).includes(id)) && ids(level(v, "jamb_or_edge_detail")).includes("p50_shadowline"));
  const r7 = cfg("R-007");
  const fire = pick(r7, ["internal_door"], ["internal_door", "fire_rated"], ["internal_door", "acoustic"]);
  ok("a room can record fire and acoustic door exceptions together", paths(fire).join() === "internal_door/acoustic,internal_door/fire_rated");
  ok("every inclusion line has an owner on the card and by others is a real answer", cfg("W-022").repeat.owner === true && cfg("W-023").repeat.owner === true && cfg("W-022").options.find((o) => o.id === "by_others").disposition === "by_others");
  ok("services stay as they were: progressive, preference only", cfg("W-020").nature === "requirement" && cfg("W-020").dispositionUse === "none" && cfg("W-021").nature === "requirement");
}

section("Floors by zone and paint by surface (MR-UX-01E/G)");
{
  const f = cfg("W-017");
  ok("each zone is its own row, wet areas separate", f.repeat.eachZone && ["main_floor", "bedroom_floor", "wet_area_floor"].every((z) => f.zones.some((o) => o.id === z && !o.detail)));
  const timber = pick(f, ["timber"], ["timber", "engineered"]);
  ok("a family takes a finish", live(timber)[0].label === "Timber · Engineered");
  ok("room floors and laundry floors offer the same tree", ["R-005", "L-004"].every((id) => JSON.stringify(cfg(id).options) === JSON.stringify(f.options)));
  ok("used zones are refused for a row that hasn't one", (() => { const v = choiceView(f, null, { usedZones: new Set(["main_floor"]) }); return v.zone.options.find((o) => o.id === "main_floor").disabled && !v.zone.options.find((o) => o.id === "bedroom_floor").disabled; })());
  ok("a row keeps its own zone lit even when that zone counts as used", !choiceView(f, chooseZone(f, null, "main_floor"), { usedZones: new Set(["main_floor"]) }).zone.options.find((o) => o.id === "main_floor").disabled);

  const p = cfg("W-019");
  ok("paint is one row per surface", p.repeat.eachZone && p.zones.map((z) => z.id).join() === "walls,ceiling,trim,wet_area");
  const at = (surface, more = {}) => choiceView(p, chooseZone(p, null, surface), more);
  ok("walls offer palette and feature areas, not ceiling types", !!level(at("walls"), "palette") && !level(at("walls"), "ceiling") && level(at("walls"), "root").options.some((o) => o.id === "feature_areas"));
  ok("the ceiling row offers ceiling types, not a paint palette", !!level(at("ceiling"), "ceiling") && !level(at("ceiling"), "palette"));
  ok("trim offers a palette and nothing about ceilings", !!level(at("trim"), "palette") && !level(at("trim"), "ceiling"));
  ok("a finish level only appears behind More detail, under a surface", !level(at("walls"), "finish_level") && !!level(at("walls", { showDetail: true }), "finish_level"));
  ok("each surface says what is usual until someone chooses", [["walls", "Low sheen"], ["ceiling", "Flat"], ["trim", "Semi-gloss"], ["wet_area", "Semi-gloss"]].every(([s, u]) => at(s).usual === u));
  const chose = toggleOption(p, chooseZone(p, null, "walls"), ["finish_level", "matt"]);
  ok("choosing a finish replaces the usual line", choiceView(p, chose).usual === "");
  ok("the usual finish is never recorded by being shown", chooseZone(p, null, "walls").selected.length === 0 && !hasExplicitChoice({ answer: chooseZone(p, null, "walls") }));
  const old = pick(p, ["ceiling", "square_set"], ["palette", "warm"]);
  ok("an older answer with no surface keeps every group and offers no finish level", ids(level(choiceView(p, old, { showDetail: true }), "palette")).length === 2 && !level(choiceView(p, old, { showDetail: true }), "finish_level"));
  const moved = chooseZone(p, pick(p, ["palette", "warm"]), "ceiling");
  ok("moving a row to another surface never hides what it already holds", !!level(choiceView(p, moved), "palette"));
  ok("a room's paint card has no finish level to fill in", !level(choiceView(cfg("R-006"), null, { showDetail: true }), "finish_level"));
}

section("Shared standards, set once on Whole House (B03, Gate 3.2)");
{
  ok("kitchen, wet-area and laundry standards use the existing question ids", standardPrompts().map((x) => x.id).sort().join() === "B-003,B-004,B-008,B-009,K-004,K-005,K-006,L-003");
  ok("the library is still the 147 approved questions: nothing was added", QUESTIONS.length === 147);
  ok("each has a topic on the page", standardPrompts().every((x) => PROJECT_TOPICS.some((t) => t.key === cfg(x.id).standard.topic)));
  ok("waterproofing stays a separate office check, not a standard (B03)", !cfg("B-012").standard && cfg("B-012").tier === "office_only");
  ok("a standard shows zones on the whole-house row", configForRow("K-005", makeItem({})).zones.map((z) => z.id).join() === "kitchen,scullery");
  ok("the same question inside a room has no zone chips and no repeat", !configForRow("K-005", makeItem({ roomId: "room_1" })).zones && !configForRow("K-005", makeItem({ roomId: "room_1" })).repeat);
  ok("the rarer zones wait behind a button", configForRow("B-009", makeItem({})).zones.filter((z) => z.detail).map((z) => z.id).join() === "ensuite,powder");
  ok("the standards don't appear twice in the room prompt lists", promptsFor("project", {}).every((x) => !cfg(x.id).standard));
}

section("Rooms read the right default (Gate 3 CHECK)");
{
  const main = whole("W-017", { answer: zoneAnswer(cfg("W-017"), "main_floor", ["timber"]) });
  const bed = whole("W-017", { answer: zoneAnswer(cfg("W-017"), "bedroom_floor", ["carpet"]) });
  const wet = whole("W-017", { answer: zoneAnswer(cfg("W-017"), "wet_area_floor", ["tile"]) });
  const r = reg([main, bed, wet]);
  ok("living reads the main floor", roomDefaultFor(r, q("R-005"), "living")?.id === main.id);
  ok("a bedroom reads the bedroom floor", roomDefaultFor(r, q("R-005"), "bedroom")?.id === bed.id);
  ok("a walk-in robe reads the bedroom floor", roomDefaultFor(r, q("R-005"), "wir")?.id === bed.id);
  ok("a laundry reads the wet-area floor", roomDefaultFor(r, q("L-004"), "laundry")?.id === wet.id);
  ok("a garage reads no floor default", roomDefaultFor(r, q("R-005"), "garage") === null);
  ok("a room with no default for its zone asks the question", roomDefaultFor(reg([main]), q("R-005"), "bedroom") === null);
  const legacy = whole("W-017", { description: "Oak throughout" });
  ok("an older default with no zone still feeds every room", roomDefaultFor(reg([legacy]), q("R-005"), "bedroom")?.id === legacy.id);
  const parked = whole("W-017", { answer: toggleNotDecided(cfg("W-017"), chooseZone(cfg("W-017"), null, "bedroom_floor")) });
  ok("a default parked as Not decided can't be inherited", roomDefaultFor(reg([parked]), q("R-005"), "bedroom") === null);
  const na = whole("W-017", { answer: toggleNotApplicable(cfg("W-017"), zoneAnswer(cfg("W-017"), "bedroom_floor", ["carpet"])) });
  ok("nor one marked N/A", roomDefaultFor(reg([na]), q("R-005"), "bedroom") === null);

  const kitchen = std("K-005", "kitchen", ["engineered_stone"]);
  const scullery = std("K-005", "scullery", ["laminate"]);
  ok("a kitchen reads the kitchen standard", roomDefaultFor(reg([kitchen, scullery]), q("K-005"), "kitchen")?.id === kitchen.id);
  ok("a scullery reads its own", roomDefaultFor(reg([kitchen, scullery]), q("K-005"), "scullery")?.id === scullery.id);
  ok("with none of its own, a scullery falls back to the kitchen", roomDefaultFor(reg([kitchen]), q("K-005"), "scullery")?.id === kitchen.id);
  const bath = std("B-009", "bathroom", ["full_height"]);
  const ens = std("B-009", "ensuite", ["partial_height"]);
  ok("a bathroom and an ensuite read different standards", roomDefaultFor(reg([bath, ens]), q("B-009"), "bathroom")?.id === bath.id && roomDefaultFor(reg([bath, ens]), q("B-009"), "ensuite")?.id === ens.id);
  ok("a powder room falls back to the bathroom", roomDefaultFor(reg([bath, ens]), q("B-009"), "wc")?.id === bath.id);
  const l = std("L-003", "laundry", ["cabinetry"]);
  ok("a mudroom falls back to the laundry", roomDefaultFor(reg([l]), q("L-003"), "mudroom")?.id === l.id);
  ok("a question with no default behind it has none", roomDefaultFor(reg([kitchen]), q("K-007"), "kitchen") === null);

  const exc = exceptionAnswerFrom(kitchen);
  ok("an exception starts from the default's own option path, valid on the room card", paths(exc).join() === "engineered_stone" && cfg("K-005").options.some((o) => o.id === "engineered_stone"));
  const room = makeRoom({ name: "Kitchen", roomType: "kitchen" });
  const roomOverride = inRoom("K-005", room, { overridesDefaultId: kitchen.id, answer: exc });
  const after = toggleOption(configForRow("K-005", roomOverride), roomOverride.answer, ["natural_stone"]);
  ok("changing the exception leaves the whole-house default alone", paths(after).join() === "natural_stone" && paths(kitchen.answer).join() === "engineered_stone");
  ok("and no duplicate default appears: a room item is never a default", defaultItemsFor(reg([kitchen, roomOverride]), "K-005").length === 1);
}

section("Pricing guide: what it holds");
{
  ok("the config is versioned", /^blue-leaf-baseline-v\d/.test(BASELINE_VERSION));
  ok("every category has all three tiers in words", BASELINE_CATEGORIES.every((c) => Object.keys(BASELINE_TIERS).every((t) => c.tiers[t]?.length > 10)));
  ok("every category points at real questions", BASELINE_CATEGORIES.every((c) => c.questions.length && c.questions.every((id) => q(id))));
  const allText = JSON.stringify(BASELINE_CATEGORIES.map((c) => c.tiers));
  ok("no amounts, so Tender Notes can carry it", !/[$]|\baud\b|\d+\s?(k|m2)\b|per (m|square)/i.test(allText));
  ok("no promises", !/guarantee|fixed price|warrant|approved|certif|complian|will meet/i.test(allText));
  ok("no brand names", !/colorbond|dulux|caesarstone|taubmans|james hardie|hardie|weathertex|pro clima|intello|bradnam|velux/i.test(allText));
  ok("waterproofing, insulation and performance goals can't be assumed (B04)", !BASELINE_CATEGORIES.some((c) => c.questions.some((id) => ["W-016", "W-024", "B-012", "E-008", "E-010"].includes(id))) && !/waterproof|insulat|airtight/i.test(allText));
  ok("the meta is normalised: an unknown tier is dropped", (() => { const b = normaliseBaseline({ projectTier: "platinum", categories: { roof: { tier: "gold", text: "x" }, walls: { tier: "premium", text: "y" } } }); return b.projectTier === "" && !b.categories.roof && b.categories.walls.tier === "premium"; })());
  ok("junk meta is safe", ["x", 5, [], null, { categories: 3 }, { categories: { roof: null } }].every((v) => JSON.stringify(normaliseBaseline(v)) === '{"projectTier":"","categories":{}}'));
  ok("a new register has an empty guide", JSON.stringify(emptyMeta({}).baseline) === '{"projectTier":"","categories":{}}');
  ok("an older meta reads the same", JSON.stringify(emptyMeta({ planRev: "A" }).baseline) === '{"projectTier":"","categories":{}}');
  const setB = setCategoryTier(null, "roof", "upgraded", STAMP);
  ok("choosing copies the wording, version, who and when", setB.categories.roof.text === BASELINE_CATEGORIES.find((c) => c.key === "roof").tiers.upgraded && setB.categories.roof.baselineVersion === BASELINE_VERSION && setB.categories.roof.by === STAMP.by && setB.categories.roof.origin === "blue_leaf_baseline" && setB.categories.roof.categoryKey === "roof");
  ok("a second tap takes it off", !setCategoryTier(setB, "roof", "upgraded", STAMP).categories.roof);
  ok("an unknown category or tier changes nothing", JSON.stringify(setCategoryTier(setB, "pool", "premium", STAMP)) === JSON.stringify(setB) && JSON.stringify(setCategoryTier(setB, "roof", "gold", STAMP)) === JSON.stringify(setB));
  const old = normaliseBaseline({ categories: { roof: { tier: "standard", text: "Wording Blue Leaf used in 2025", baselineVersion: "blue-leaf-baseline-v0.9", at: "2025-01-01" } } });
  ok("wording already copied is kept when the guide is reworded later", old.categories.roof.text === "Wording Blue Leaf used in 2025" && old.categories.roof.baselineVersion === "blue-leaf-baseline-v0.9");
  const r2 = readRegister({ selections_schedule: writeRegister({ meta: emptyMeta({ baseline: setB }), items: [] }) });
  ok("it survives the lead scratchpad", r2.meta.baseline.categories.roof.tier === "upgraded");
  ok("a guide alone is enough for meta to be stored", writeRegister({ meta: emptyMeta({ baseline: setProjectTier(null, "premium") }), items: [] }).length === 1);
}

section("Pricing guide: what it can never do (B05)");
{
  const chosen = whole("W-014", { answer: pick(cfg("W-014"), ["tile_roofing"], ["tile_roofing", "terracotta_tile"]), certainty: "preference" });
  const blank = whole("W-017");
  const items = [chosen, blank];
  const before = JSON.stringify(items);
  let b = setProjectTier(null, "premium");
  b = setCategoryTier(b, "roof", "standard", STAMP);
  b = setCategoryTier(b, "floors", "upgraded", STAMP);
  const r = reg(items, { baseline: b });
  ok("setting tiers changes no item at all", JSON.stringify(r.items) === before);
  ok("a tier is independent per category: the project guide filled nothing in", !r.meta.baseline.categories.walls && r.meta.baseline.categories.roof.tier === "standard" && r.meta.baseline.categories.floors.tier === "upgraded");
  ok("changing the project guide moves no category", (() => { const m = setProjectTier(b, "standard"); return m.categories.roof.tier === "standard" && m.categories.floors.tier === "upgraded" && Object.keys(m.categories).length === 2; })());
  ok("an explicit choice has no assumption, whatever the tier", assumptionFor(r, chosen) === null);
  ok("an unchosen row carries it, labelled with where it came from", assumptionFor(r, blank)?.tier === "upgraded" && assumptionFor(r, blank)?.origin === "blue_leaf_baseline");
  ok("changing the tier still leaves the explicit choice alone", assumptionFor(reg(items, { baseline: setCategoryTier(b, "roof", "premium", STAMP) }), chosen) === null && JSON.stringify(r.items) === before);
  const preferred = makeItem({ ...blank, answer: toggleOption(cfg("W-017"), blank.answer, ["hybrid"]) });
  ok("the moment someone chooses, the assumption goes", assumptionFor(reg([preferred], { baseline: b }), preferred) === null);
  ok("an assumption is not a preference", blank.certainty === "not_considered" && assumptionFor(r, blank) && !hasExplicitChoice(blank));
  ok("it can't make an item look answered", answerSummary(blank) === "" && clientSafeAnswer(blank) === null);
  const carrying = makeItem({ ...blank, answer: { v: 1, state: "not_discussed", assumption: assumptionFor(r, blank) } });
  ok("even stamped on an item it can't reach a client view", JSON.stringify(clientSafeAnswer(carrying)).indexOf(assumptionFor(r, blank).text) === -1);
  ok("nor count as a material change to an approved item", !editOutrunsApproval(makeItem({ ...chosen, certainty: "client_approved", evidence: { at: "x", by: "y" } }), { answer: { ...chosen.answer, assumption: { tier: "premium", text: "t" } } }));
  ok("not applicable has no assumption", assumptionFor(reg([], { baseline: b }), whole("W-017", { answer: toggleNotApplicable(cfg("W-017"), null) })) === null);
  ok("by others has no assumption", assumptionFor(reg([], { baseline: b }), whole("W-017", { disposition: "by_others" })) === null);
  ok("a parked row can use it: not decided is exactly what it is for", assumptionFor(reg([], { baseline: b }), whole("W-017", { answer: toggleNotDecided(cfg("W-017"), null) }))?.tier === "upgraded");
  ok("a question in no category has none", assumptionFor(reg([], { baseline: b }), whole("W-016")) === null);
  const withAssumption = makeItem({ ...blank, answer: { v: 1, state: "not_discussed", assumption: b.categories.floors } });
  ok("the test really has an assumption on the record", !!withAssumption.answer?.assumption);
  ok("the register's outstanding list doesn't change with a tier", outstandingReasons(blank).join() === outstandingReasons(withAssumption).join());
}

section("Pricing guide: one answer is not the whole category");
{
  const tiered = (key) => setCategoryTier(null, key, "standard", STAMP);
  const view = (items, key) => baselineView(reg(items, { baseline: tiered(key) })).find((c) => c.key === key);
  const inTender = (items, key) => baselineAssumptions(reg(items, { baseline: tiered(key) })).find((a) => a.key === key);
  const stone = whole("K-005", { answer: pick(cfg("K-005"), ["engineered_stone"]), isDefault: true });
  ok("a kitchen with only a benchtop is part chosen", view([stone], "kitchen").status === "part");
  ok("and names what is missing", view([stone], "kitchen").partGaps.join() === "cabinetry,splashback");
  ok("Tender still carries the assumption for the kitchen", !!inTender([stone], "kitchen") && inTender([stone], "kitchen").gaps.join() === "cabinetry,splashback");
  const taps = whole("B-008", { answer: pick(cfg("B-008"), ["chrome"]), isDefault: true });
  ok("a wet area with only tapware is part chosen", view([taps], "wet_areas").status === "part" && view([taps], "wet_areas").partGaps.join() === "toilet,vanity,tiling");
  const metalOnly = whole("W-014", { answer: pick(cfg("W-014"), ["metal_roofing"]) });
  ok("metal roofing with no profile or gutters is part chosen", view([metalOnly], "roof").partGaps.join() === "roof profile,gutters");
  ok("the row says the same as the guide", partAssumptionFor(reg([metalOnly], { baseline: tiered("roof") }), metalOnly)?.coversOnly.join() === "roof profile,gutters");
  const doorHeight = whole("W-018", { answer: pick(cfg("W-018"), ["door_height", "2340"]) });
  ok("a door height alone leaves jambs and hardware", view([doorHeight], "doors").partGaps.join() === "jambs,hardware");
  const glazing = whole("W-015", { answer: pick(cfg("W-015"), ["glazing", "double_glazing"]) });
  ok("glazing alone leaves the frames", view([glazing], "windows").partGaps.join() === "frames");
  const hotWater = whole("W-020", { answer: pick(cfg("W-020"), ["hot_water", "heat_pump"]) });
  ok("hot water alone leaves heating and cooling", view([hotWater], "hvac").partGaps.join() === "heating and cooling");
  const wordsOnly = whole("W-018", { description: "As per the Smith house" });
  ok("an older typed answer is taken at its word", view([wordsOnly], "doors").status === "chosen" && partAssumptionFor(reg([wordsOnly], { baseline: tiered("doors") }), wordsOnly) === null);
  const roofOut = whole("W-014", { disposition: "by_others" });
  ok("a roof by others needs no profile or gutters", view([roofOut], "roof").status === "settled");
  ok("a choice is never changed by the guide", JSON.stringify(partAssumptionFor(reg([metalOnly], { baseline: tiered("roof") }), metalOnly)?.text ?? null) !== "null" && metalOnly.certainty === whole("W-014", { answer: pick(cfg("W-014"), ["metal_roofing"]) }).certainty);
  ok("no tier held, nothing to say", partAssumptionFor(reg([metalOnly]), metalOnly) === null);
  ok("draft wording is marked until Blue Leaf confirms it", assumptionIsDraft(tiered("roof").categories.roof) && assumptionIsDraft({ tier: "standard", text: "copied earlier" }) && !assumptionIsDraft({ tier: "standard", text: "x", wordingStatus: "confirmed" }));
}

section("Pricing guide: the words only describe what is still open (audit R05-05)");
{
  const held = setCategoryTier(null, "kitchen", "standard", STAMP);
  const stone = whole("K-005", { answer: pick(cfg("K-005"), ["engineered_stone"]), isDefault: true });
  const r = reg([stone], { baseline: held });
  const line = baselineAssumptions(r).find((a) => a.key === "kitchen");
  ok("the benchtop is chosen, so the assumption doesn't mention one", !/bench/i.test(line.text), line.text);
  ok("it describes the cabinetry and splashback", /cabinetry/i.test(line.text) && /splashback/i.test(line.text), line.text);
  ok("the guide reads the same", baselineView(r).find((c) => c.key === "kitchen").assumptionText === line.text);
  const blank = whole("K-004");
  ok("a blank cabinetry row reads only cabinetry", /^Laminate flat-panel cabinetry\.$/.test(assumptionFor(r, blank)?.text || ""), assumptionFor(r, blank)?.text);
  const nothing = baselineAssumptions(reg([], { baseline: held })).find((a) => a.key === "kitchen");
  ok("with nothing chosen it is the whole wording", nothing.text === BASELINE_CATEGORIES.find((c) => c.key === "kitchen").tiers.standard);
  const older = { ...held, categories: { kitchen: { ...held.categories.kitchen } } };
  delete older.categories.kitchen.pieces;
  ok("wording copied before parts existed keeps its text", baselineAssumptions(reg([stone], { baseline: older })).find((a) => a.key === "kitchen").text === held.categories.kitchen.text);
  const floors = setCategoryTier(null, "floors", "upgraded", STAMP);
  const main = whole("W-017", { answer: { ...pick(cfg("W-017"), ["timber"]), zone: { key: "main_floor", label: "Main floor" } } });
  const fl = baselineAssumptions(reg([main], { baseline: floors })).find((a) => a.key === "floors");
  ok("a floor zone that is chosen drops out of the words", !/living/i.test(fl.text) && /bedrooms/i.test(fl.text) && /wet areas/i.test(fl.text), fl.text);
  const metal = whole("W-014", { answer: pick(cfg("W-014"), ["metal_roofing", "pitched", "corrugated"]) });
  ok("the row's part wording matches its gaps", /gutters/i.test(partAssumptionFor(reg([metal], { baseline: setCategoryTier(null, "roof", "standard", STAMP) }), metal)?.text || "") && !/Corrugated/.test(partAssumptionFor(reg([metal], { baseline: setCategoryTier(null, "roof", "standard", STAMP) }), metal)?.text || ""));
  ok("every part has all three tiers in words", BASELINE_CATEGORIES.every((c) => (c.parts || []).every((p) => p.tiers?.standard && p.tiers?.upgraded && p.tiers?.premium)));
  ok("every priced zone does too", BASELINE_CATEGORIES.every((c) => (c.pricedZones || []).every((z) => c.zoneTiers?.[z]?.standard && c.zoneTiers?.[z]?.premium)));
  const pieceText = JSON.stringify(BASELINE_CATEGORIES.map((c) => [(c.parts || []).map((p) => p.tiers), c.zoneTiers]));
  ok("no amounts in the part wording either", !/[$]|\baud\b|per (m|square)/i.test(pieceText));
}

section("Pricing guide: two people at once");
{
  const base = setCategoryTier(null, "windows", "standard", STAMP);
  const a = setCategoryTier(base, "roof", "standard", STAMP);
  const b = setCategoryTier(base, "walls", "premium", STAMP);
  const merged = mergeBaseline(base, b, a);
  ok("an edit to another category is kept", merged.baseline.categories.roof?.tier === "standard" && merged.baseline.categories.walls?.tier === "premium" && merged.conflicts.length === 0);
  const both = mergeBaseline(base, setCategoryTier(base, "roof", "premium", STAMP), a);
  ok("the same category changed twice names a conflict", both.conflicts.join() === "roof");
  ok("and the saved value stands", both.baseline.categories.roof.tier === "standard");
  const off = setCategoryTier(base, "windows", "standard", STAMP);
  ok("a tier taken off stays off", !mergeBaseline(base, off, a).baseline.categories.windows);
  const tierA = setProjectTier(base, "upgraded"), tierB = setProjectTier(base, "premium");
  ok("two different project tiers conflict", mergeBaseline(base, tierB, tierA).conflicts.join() === "projectTier");
}

section("Pricing guide: applying the project guide");
{
  const chosenRoof = whole("W-014", { answer: pick(cfg("W-014"), ["metal_roofing", "pitched", "corrugated"]) });
  const roofGutters = whole("W-014", { isDefault: false, answer: { v: 1, state: "recorded", selected: [{ optionId: "quad", path: ["quad"], label: "Quad" }], element: { id: "el_g", key: "gutters", label: "Gutters" }, linkedItemIds: [chosenRoof.id] } });
  const byOthers = whole("W-022", { disposition: "by_others" });
  const r = reg([chosenRoof, roofGutters, byOthers], { baseline: setCategoryTier(setProjectTier(null, "premium"), "walls", "standard", STAMP) });
  const next = applyProjectGuide(r, STAMP);
  ok("a category already set keeps its own tier", next.categories.walls.tier === "standard");
  ok("a category the client has fully chosen is left out", !next.categories.roof);
  ok("the open ones take the guide", next.categories.windows.tier === "premium" && next.categories.floors.tier === "premium");
  ok("with no guide chosen it does nothing", JSON.stringify(applyProjectGuide(reg([]), STAMP)) === '{"projectTier":"","categories":{}}');
  const zeroed = reg([], { baseline: next });
  ok("changing the guide afterwards moves none of them", setProjectTier(zeroed.meta.baseline, "standard").categories.windows.tier === "premium");
}

section("Pricing guide: what estimators read (Gate 3 CHECK)");
{
  const mainF = whole("W-017", { answer: zoneAnswer(cfg("W-017"), "main_floor", ["timber"]) });
  const parkedRoof = whole("W-014", { answer: toggleNotDecided(cfg("W-014"), null) });
  const wall = whole("W-013", { answer: zoneAnswer(cfg("W-013"), "main_walls", ["render", "rendered_aac"]) });
  const r = reg([mainF, parkedRoof, wall], { baseline: { categories: { floors: { tier: "standard", text: "floors text" }, roof: { tier: "upgraded", text: "roof text" }, walls: { tier: "premium", text: "wall text" }, windows: { tier: "standard", text: "window text" } } } });
  const view = Object.fromEntries(baselineView(r).map((c) => [c.key, c]));
  ok("nothing chosen reads open", view.windows.status === "open" && view.roof.status === "open");
  ok("main floor chosen, two zones left: part, and it says which", view.floors.status === "part" && view.floors.zoneGaps.join() === "Bedroom floor,Wet-area floor");
  ok("a category covered by choices reads chosen", view.walls.status === "chosen" && view.walls.chosen[0].id === wall.id);
  ok("an open row is listed by id", view.roof.openItemIds[0] === parkedRoof.id);
  const list = baselineAssumptions(r);
  ok("only assumptions in use are listed", list.map((a) => a.key).sort().join() === "floors,roof,windows");
  ok("each is labelled with tier, wording, version and what it covers", list.find((a) => a.key === "floors").tierLabel === "Standard" && list.find((a) => a.key === "floors").text === "floors text" && list.find((a) => a.key === "floors").status === "part");
  ok("no amount field exists on a line", list.every((a) => !Object.keys(a).some((k) => /price|cost|amount|rate/i.test(k))));
  const excluded = whole("W-017", { disposition: "excluded", answer: zoneAnswer(cfg("W-017"), "bedroom_floor") });
  const wetOut = whole("W-017", { disposition: "by_others", answer: zoneAnswer(cfg("W-017"), "wet_area_floor") });
  ok("a zone settled out needs no assumption", baselineView(reg([mainF, excluded, wetOut]))[3].status === "chosen");
  ok("every row settled reads settled", baselineView(reg([whole("W-018", { disposition: "by_others" })])).find((c) => c.key === "doors").status === "settled");
  const roomOnly = inRoom("R-005", makeRoom({ name: "Bed", roomType: "bedroom" }), { answer: toggleOption(cfg("R-005"), null, ["carpet"]) });
  ok("a room exception doesn't settle the whole-house standard", baselineView(reg([roomOnly])).find((c) => c.key === "floors").status === "open");
  const unzoned = whole("W-017", { description: "Oak throughout" });
  ok("an older default with no zone covers the whole category", baselineView(reg([unzoned])).find((c) => c.key === "floors").status === "chosen");
}

section("Performance goals give staff-only suggestions (B04, DEC-MRUX-03)");
{
  const c = cfg("W-016");
  ok("the card is flagged to list suggestions", c.reviewSuggestions === true);
  ok("every goal has suggestions", c.options.every((o) => PERFORMANCE_SUGGESTIONS[o.id]?.length));
  const a = pick(c, ["airtightness"], ["passive_house_target"]);
  const groups = performanceSuggestions(a);
  ok("each chosen goal gives its own list", groups.map((g) => g.goal).join() === "airtightness,passive_house_target");
  ok("none is chosen until a goal is", performanceSuggestions(null).length === 0);
  ok("a goal taken off stops suggesting", performanceSuggestions(toggleOption(c, a, ["airtightness"])).map((g) => g.goal).join() === "passive_house_target");
  ok("N/A stops all of them", performanceSuggestions(toggleNotApplicable(c, a)).length === 0);
  const text = JSON.stringify(PERFORMANCE_SUGGESTIONS);
  ok("no product, brand or membrane name", !/pro clima|intello|solitex|tescon|tyvek|wrap\b|bradford|knauf|fletcher/i.test(text));
  ok("no certification or compliance claim in a suggestion", !/certif|complian|complies|meets |guarantee|achieve/i.test(text));
  ok("no blanket insulation spec", !/\bR\d|R-value|\d+\s?mm/i.test(text));
  ok("airtightness doesn't imply one membrane does it (MR-UX-01D)", /continuous air-control layer/.test(text) && /sealed at junctions/.test(text));
  ok("the review checks are the ones Blue Leaf named", ["Climate zone", "Wall and roof build-up", "Vapour and condensation control", "Continuity of each layer", "Compliance and approvals", "Roof pitch", "Manufacturer details"].every((x) => PERFORMANCE_REVIEW_CHECKS.includes(x)));
  ok("the panel says nothing is selected, specified, priced or agreed", /Nothing here is selected, specified, priced or agreed/.test(REVIEW_DISCLAIMER));
  ok("Passive House is an intent, never an outcome", /intent/.test(PASSIVE_HOUSE_NOTE) && /doesn't mean/.test(PASSIVE_HOUSE_NOTE));
  const item = whole("W-016", { answer: a });
  ok("choosing a goal writes the goal only: no suggestion lands on the record", !JSON.stringify(item).includes(PERFORMANCE_SUGGESTIONS.airtightness[0].text));
  ok("and the goal stays a requirement, with verification still open", item.answer.nature === "requirement" && item.technicalStatus === "needs_verification" && outstandingReasons(item).join() === "verification");
  ok("a client view shows the goal and no suggestion", clientSafeAnswer(item).selected.map((s) => s.label).join() === "Airtightness,Passive House target");
  ok("no baseline tier is offered for the goal", !BASELINE_CATEGORIES.some((x) => x.questions.includes("W-016")));
}

section("Source");
{
  const read = (p) => readFileSync(join(REPO, p), "utf8");
  const guide = read("src/components/sales/lead-detail/register/BaselineGuide.jsx");
  ok("the guide screen can only write register meta", /mutateMeta\?\.\(\{ baseline: next \}\)/.test(guide) && !/updateItem|upsertItem|addItem|replaceItems/.test(guide));
  const docs = read("server/lib/registerDocuments.mjs") + read("server/lib/documents/documentPayloads.mjs");
  const docSource = readFileSync(join(REPO, "server/lib/registerDocuments.mjs"), "utf8");
  const notesStart = docSource.indexOf("function tenderNotesFixture"), notesEnd = docSource.indexOf("export function buildRegisterFixture");
  const outsideNotes = docSource.slice(0, notesStart) + docSource.slice(notesEnd);
  const importLine = /import \{[^}]*\} from "\.\.\/\.\.\/src\/lib\/register\.js";/;
  ok("no client document reads the pricing guide: only Tender Notes does", notesStart > 0 && /baselineAssumptions\(/.test(docSource.slice(notesStart, notesEnd)) && !/baselineAssumptions\(|performanceSuggestions\(|meta\.baseline|assumptionFor\(/.test(outsideNotes.replace(importLine, "")));
  const portal = read("server/lib/registerStore.mjs");
  ok("the store only carries it through meta", portal.includes("baseline: m.baseline"));
  ok("resolvePromptId is what ties a category to a question, legacy keys included", resolvePromptId("wh_flooring") === "W-017" && BASELINE_CATEGORIES.find((c) => c.key === "floors").questions.includes("W-017"));
}

console.log(`\nregister-progressive-wholehouse: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
