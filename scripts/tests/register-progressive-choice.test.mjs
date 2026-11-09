/**
 * register-progressive-choice.test.mjs — R05 P4a (Tab 27 Gate 2): the generated answer controls and what a tap does.
 * Covers the config (every question handled, ids stable, labels safe), branch changes, unresolved reasons, what a
 * tap may and may not write to an item, and the recomputed outstanding list.
 * No server, no database, no browser. Run: node scripts/tests/register-progressive-choice.test.mjs
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTIONS, ANSWER_CONFIG, ANSWER_CONFIG_VERSION } from "../../src/lib/registerQuestions.js";
import {
  makeItem, outstandingReasons, isClientSelection, contractInclusionOf, answerMaterialChanged, editOutrunsApproval, normaliseAnswer, clientSafeAnswer,
  answerConfigFor, isGuidedConfig, dispositionApplies, settleOptions, toggleOption, setOpenWords, removeChoice, reuseChoice, chooseZone, chooseElement, setZoneWords,
  setElementWords, toggleNotDecided, setClientUnsure, setUnresolvedReason, toggleNotApplicable, setAnswerNote, itemPatch, reasonPatch, settlePatch, choiceView,
  itemTitle, natureOf, ANSWER_MAP_VERSION, UNRESOLVED_REASONS, answerSummary, promptsFor, setClientNote, seedMatchesItem,
} from "../../src/lib/register.js";
import { validateAnswerMap, JSON_PATH } from "../register/build-answer-map-doc.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = (id) => ANSWER_CONFIG[id];
const live = (a) => (a?.selected || []).filter((s) => !s.stale);
const paths = (a) => live(a).map((s) => s.path.join("/")).sort();
const stale = (a) => (a?.selected || []).filter((s) => s.stale).map((s) => s.path.join("/")).sort();
const pick = (id, ...steps) => steps.reduce((a, p) => toggleOption(cfg(id), a, p), null);
const seedOf = (id, more = {}) => { const q = QUESTIONS.find((x) => x.id === id); return makeItem({ itemKind: q.itemKind, category: q.category, promptKey: q.id, technicalStatus: q.technical, section: q.section === "room" ? "project" : q.section, ...more }); };
const apply = (item, patch) => makeItem({ ...item, ...patch, sync: item.sync });

section("Config: every question has explicit handling");
const HANDLINGS = new Set(["prefill", "choice", "record", "note", "context", "folded"]);
ok("all 147 questions have a config", Object.keys(ANSWER_CONFIG).length === 147 && QUESTIONS.every((q) => ANSWER_CONFIG[q.id]));
ok("every handling is one the screens know", Object.values(ANSWER_CONFIG).every((c) => HANDLINGS.has(c.handling)));
ok("config version is the answer map's", ANSWER_CONFIG_VERSION === ANSWER_MAP_VERSION);
ok("registerQuestions.js is what the generator produces", (() => { try { execFileSync(process.execPath, [join(REPO, "scripts/register/build-question-library.mjs"), "--check"], { stdio: "pipe" }); return true; } catch { return false; } })());
for (const fam of ["P", "W", "R", "K", "B", "L", "V", "D", "H", "O", "E", "M"]) {
  const qs = QUESTIONS.filter((q) => q.id.startsWith(`${fam}-`));
  ok(`family ${fam}: all ${qs.length} questions are handled and none is left to the generic row`, qs.length > 0 && qs.every((q) => HANDLINGS.has(ANSWER_CONFIG[q.id]?.handling)));
}
ok("Sales facts are prefilled, never asked", QUESTIONS.filter((q) => q.kind === "FACT" || q.prefill).every((q) => cfg(q.id).handling === "prefill"));
ok("nothing prefilled reaches a prompt list", promptsFor("project", {}).filter((q) => q.topic !== "context").concat(promptsFor("room", { roomType: "kitchen", showDetail: true })).every((q) => cfg(q.id).handling !== "prefill"));
ok("areas and occupancy stay with the Project step", cfg("P-006").handling === "context" && cfg("P-008").handling === "context");
ok("R-002 is answered on the R-003 card", cfg("R-002").handling === "folded" && cfg("R-003").options.some((o) => o.id === "retain_existing"));
ok("element checks are office notes", QUESTIONS.filter((q) => q.id.startsWith("E-")).every((q) => cfg(q.id).handling === "note" && cfg(q.id).tier === "office_only"));
ok("every choice question has something to tap", Object.values(ANSWER_CONFIG).filter((c) => c.handling === "choice").every((c) => c.options?.length || c.elements?.length));
ok("every answer that sets the disposition has actions behind it", Object.entries(ANSWER_CONFIG).filter(([, c]) => c.dispositionUse === "element").every(([, c]) => c.options?.length));
ok("the disposition is only used where it means something", ["W-001", "W-007", "W-011", "W-015", "W-016", "P-005", "M-002"].every((id) => !dispositionApplies(cfg(id))) && ["W-004", "W-010", "K-001", "W-013"].every((id) => dispositionApplies(cfg(id))));
ok("a question with no list of elements asks what the item is", cfg("R-014").asksWhat === true && cfg("W-011").asksWhat === true && !cfg("W-010").asksWhat && !cfg("W-017").asksWhat && !cfg("W-018").asksWhat && !cfg("W-005").asksWhat);
ok("the map still passes every structural check", validateAnswerMap(JSON.parse(readFileSync(JSON_PATH, "utf8"))).length === 0);
ok("room floor and wall finishes reuse the whole-house choices", cfg("R-005").options.map((o) => o.id).join() === cfg("W-017").options.map((o) => o.id).join() && cfg("R-006").select === "groups");

section("Option ids stay put and labels are safe");
const lock = JSON.parse(readFileSync(join(REPO, "docs/master_register/question-library/tab21-option-ids-v1.0.lock.json"), "utf8"));
const idsOf = (c) => { const w = (l, p) => (l || []).flatMap((o) => [p + o.id, ...w(o.children, `${p}${o.id}/`)]); const out = [...w(c.options, ""), ...w(c.zones, "zone:"), ...w(c.elements, "element:")]; for (const [e, l] of Object.entries(c.constructionTypes || {})) out.push(...w(l, `type:${e}/`)); return new Set(out); };
const missing = Object.entries(lock.ids).flatMap(([q, ids]) => ids.filter((id) => !idsOf(cfg(q)).has(id)).map((id) => `${q}:${id}`));
ok("every locked option id still exists", missing.length === 0, missing.join(" "));
ok("the lock covers every question", Object.keys(lock.ids).length === 147);
const allOptions = Object.entries(ANSWER_CONFIG).flatMap(([q, c]) => { const w = (l) => (l || []).flatMap((o) => [{ q, ...o }, ...w(o.children)]); return [...w(c.options), ...w(c.zones), ...w(c.elements), ...Object.values(c.constructionTypes || {}).flatMap(w)]; });
ok("every label is short and plain", allOptions.every((o) => o.label && o.label.length <= 40 && !/[<>{}$]/.test(o.label)), allOptions.filter((o) => !o.label || o.label.length > 40 || /[<>{}$]/.test(o.label)).map((o) => o.q + ":" + o.label).join());
ok("no label claims an approval, a certificate or a price", !allOptions.some((o) => /approved|certifi(ed|cate|cation)|verified|complian|guarantee|warrant(ed|y)\b/i.test(o.label)), allOptions.filter((o) => /approved|certifi(ed|cate|cation)|verified|complian|guarantee|warrant(ed|y)\b/i.test(o.label)).map((o) => o.q + ":" + o.label).join());
ok("paint has no generic sheen choice (MR-UX-01G)", !allOptions.some((o) => o.q === "W-019" && /sheen/i.test(o.label)));
ok("essential and detail are flagged on the options", allOptions.some((o) => o.detail) && allOptions.filter((o) => o.detail).length < allOptions.length / 4);

section("Choosing, and the words kept");
{
  const a = pick("W-001", ["steep_access"], ["limited_parking"]);
  ok("site access takes several answers without typing", paths(a).join() === "limited_parking,steep_access");
  ok("the option label is copied on", live(a).some((s) => s.label === "Steep access"));
  ok("the answer says it is a fact, from which config", a.nature === "fact" && a.state === "recorded" && a.configVersion === ANSWER_MAP_VERSION);
  ok("a second tap takes one back", paths(toggleOption(cfg("W-001"), a, ["steep_access"])).join() === "limited_parking");
  ok("taking the last one back leaves nothing", toggleOption(cfg("W-001"), toggleOption(cfg("W-001"), a, ["steep_access"]), ["limited_parking"]) === null);
  ok("a path the config doesn't have changes nothing", JSON.stringify(toggleOption(cfg("W-001"), a, ["helipad"])) === JSON.stringify(a));
  ok("a parent step reads with its child", live(pick("W-014", ["metal_roofing"], ["metal_roofing", "pitched"], ["metal_roofing", "pitched", "corrugated"]))[0].label === "Metal roofing · Pitched · Corrugated");
  const single = pick("W-017", ["timber"], ["tile"]);
  ok("a plain single choice is simply replaced", paths(single).join() === "tile" && stale(single).length === 0);
  const stop = pick("W-014", ["metal_roofing"], ["metal_roofing", "pitched"]);
  ok("the conversation can stop part-way down (B02)", paths(stop).join() === "metal_roofing/pitched" && stop.state === "recorded");
  const pr = cfg("P-005");
  let p = null; for (const o of ["space", "comfort", "storage"]) p = toggleOption(pr, p, [o]);
  ok("priorities stop at three", paths(toggleOption(pr, p, ["privacy"])).length === 3);
  ok("the view disables the rest at three", choiceView(pr, p).levels[0].options.find((o) => o.id === "privacy").disabled === true && choiceView(pr, p).levels[0].options.find((o) => o.id === "space").disabled === false);
  const overLimit = (() => { let x = toggleNotApplicable(pr, toggleNotApplicable(pr, p)); for (const o of ["privacy", "entertaining", "natural_light"]) x = toggleOption(pr, x, [o]); return x; })();
  ok("Use again can't take priorities past three", paths(reuseChoice(pr, overLimit, overLimit.selected.find((s) => s.stale))).length === 3);
  ok("so the view doesn't offer it at the limit, and Remove stays", choiceView(pr, overLimit).kept.every((k) => !k.canReuse) && choiceView(pr, overLimit).kept.length === 3);
  const roomMade = toggleOption(pr, overLimit, ["privacy"]);
  ok("once one comes off, Use again is back", choiceView(pr, roomMade).kept.some((k) => k.canReuse) && paths(reuseChoice(pr, roomMade, roomMade.selected.find((s) => s.stale))).length === 3);
  const groups = pick("W-018", ["door_height", "2340"], ["jamb_or_edge_detail", "p50_shadowline"]);
  ok("grouped choices sit side by side", paths(groups).join() === "door_height/2340,jamb_or_edge_detail/p50_shadowline" && live(groups)[0].label.includes("·"));
  const swapped = toggleOption(cfg("W-018"), groups, ["door_height", "floor_to_ceiling"]);
  ok("inside a group it is still one answer", paths(swapped).join() === "door_height/floor_to_ceiling,jamb_or_edge_detail/p50_shadowline");
  const off = toggleOption(cfg("W-018"), swapped, ["door_height", "floor_to_ceiling"]);
  ok("taking a group's answer back doesn't record the heading", paths(off).join() === "jamb_or_edge_detail/p50_shadowline");
  const multiKids = pick("W-007", ["yes"], ["yes", "temporary_kitchen"], ["yes", "dust_and_noise_separation"]);
  ok("Yes opens several follow-ups", paths(multiKids).join() === "yes/dust_and_noise_separation,yes/temporary_kitchen");
  ok("taking the last follow-up back leaves Yes standing", paths(toggleOption(cfg("W-007"), toggleOption(cfg("W-007"), multiKids, ["yes", "temporary_kitchen"]), ["yes", "dust_and_noise_separation"])).join() === "yes");
}

section("Other: the person's words");
{
  const c = cfg("K-006");
  let a = toggleOption(c, null, ["other"]);
  ok("Other starts as the bare word", live(a)[0].label === "Other");
  a = setOpenWords(c, a, ["other"], "Other", "Pressed tin");
  ok("typed words become the label, not the staff note", live(a)[0].label === "Pressed tin" && a.note === "");
  ok("the client view shows them", clientSafeAnswer({ answer: a }).selected[0].label === "Pressed tin");
  ok("a tap can't throw typed words away", paths(toggleOption(c, a, ["other"])).join() === "other");
  ok("Remove does", removeChoice(c, a, { path: ["other"], label: "Pressed tin" }) === null);
  const swap = toggleOption(c, a, ["tile"]);
  ok("switching away keeps the words, flagged", stale(swap).join() === "other" && swap.selected.find((s) => s.stale).label === "Pressed tin");
  ok("clearing the words goes back to the option label", live(setOpenWords(c, a, ["other"], "Pressed tin", ""))[0].label === "Other");
  const two = makeItem({ answer: { v: 1, state: "recorded", nature: "choice", selected: [{ path: ["other"], label: "Pressed tin" }, { path: ["other"], label: "Recycled brick" }] } }).answer;
  ok("two Other answers both show", choiceView(c, two).levels[0].options.find((o) => o.id === "other").openRows.length === 2);
  ok("editing one leaves the other", live(setOpenWords(c, two, ["other"], "Pressed tin", "Zinc")).map((s) => s.label).sort().join() === "Recycled brick,Zinc");
}

section("Changing an earlier answer never loses a later one");
{
  const c = cfg("W-013");
  const a = pick("W-013", ["masonry"], ["masonry", "face_brick"]);
  const b = toggleOption(c, a, ["render"]);
  ok("the old branch stays on the record, flagged", stale(b).join() === "masonry/face_brick" && paths(b).join() === "render");
  ok("the view offers it for review", choiceView(c, b).kept.length === 1 && choiceView(c, b).kept[0].canReuse);
  ok("a flagged answer can't reach the client view", clientSafeAnswer({ answer: b }).selected.map((s) => s.label).join() === "Render");
  ok("nor the summary", answerSummary({ answer: b }) === "Render");
  const c2 = reuseChoice(c, b, b.selected.find((s) => s.stale));
  ok("Use again brings it back and flags what it displaces only if that had depth", paths(c2).join() === "masonry/face_brick" && stale(c2).length === 0);
  ok("removing it is explicit", (() => { const r = removeChoice(c, b, b.selected.find((s) => s.stale)); return stale(r).length === 0 && paths(r).join() === "render"; })());
  const on = toggleOption(c, a, ["masonry"]);
  ok("switching a parent off flags its children", stale(on).join() === "masonry/face_brick" && paths(on).length === 0);
  ok("a flagged answer doesn't count as chosen", on.state === "not_discussed");
  const k = cfg("K-004");
  const moved = toggleOption(k, pick("K-004", ["flat_panel"], ["flat_panel", "laminate"]), ["profile"]);
  ok("where the new branch has the same option it moves across", paths(moved).join() === "profile/laminate" && stale(moved).length === 0 && live(moved)[0].label === "Profile · Laminate");
  const w5 = cfg("W-005");
  const inspected = pick("W-005", ["structural"], ["structural", "inspected"]);
  const hazard = toggleOption(w5, inspected, ["asbestos_or_contamination"]);
  ok("a status about one hazard is never restated about another (W-005)", paths(hazard).join() === "asbestos_or_contamination" && !answerSummary({ answer: hazard }).includes("Inspected"));
  ok("the old status stays on the record, flagged for Use again or Remove", stale(hazard).join() === "structural/inspected" && choiceView(w5, hazard).kept[0].canReuse && choiceView(w5, hazard).kept[0].label === "Structural · Inspected");
  ok("Use again puts it back on its own hazard", paths(reuseChoice(w5, hazard, hazard.selected.find((s) => s.stale))).join() === "structural/inspected");
  const pairs = w5.options.flatMap((from) => w5.options.filter((to) => to.id !== from.id).flatMap((to) => from.children.map((st) => [from.id, to.id, st.id])));
  ok(`no switch of W-005 category gives a live status (${pairs.length} combinations)`, pairs.every(([from, to, st]) => { const a = toggleOption(w5, pick("W-005", [from], [from, st]), [to]); return paths(a).join() === to && stale(a).join() === `${from}/${st}`; }));
  ok("only W-005 is bound this way: a real attribute still carries across", Object.entries(ANSWER_CONFIG).filter(([, x]) => x.childrenBoundToParent).map(([id]) => id).join() === "W-005" && !cfg("K-004").childrenBoundToParent);
  const withProduct = toggleOption(cfg("W-017"), pick("W-017", ["timber"]), ["tile"], { keepReplaced: true });
  ok("with product details entered, even a plain replaced answer is kept for review", stale(withProduct).join() === "timber" && paths(withProduct).join() === "tile");
  ok("extending an answer isn't replacing it", stale(toggleOption(c, pick("W-013", ["masonry"]), ["masonry", "face_brick"], { keepReplaced: true })).length === 0);
  const w7 = cfg("W-007");
  const no = toggleOption(w7, pick("W-007", ["yes"], ["yes", "temporary_kitchen"]), ["no"]);
  ok("Yes to No keeps what was said under Yes, flagged", stale(no).join() === "yes/temporary_kitchen" && paths(no).join() === "no");
  const roof = toggleOption(cfg("W-014"), pick("W-014", ["metal_roofing"], ["metal_roofing", "pitched"], ["metal_roofing", "pitched", "corrugated"]), ["metal_roofing", "flat_or_low_pitch"]);
  ok("a profile that doesn't exist under the new pitch is flagged, not assumed", stale(roof).join() === "metal_roofing/pitched/corrugated" && paths(roof).join() === "metal_roofing/flat_or_low_pitch");
  const ext = cfg("W-010");
  let drive = chooseElement(ext, null, "driveway", { id: "el_fixed" });
  drive = toggleOption(ext, drive, ["new"]);
  drive = toggleOption(ext, drive, ["new", "exposed_aggregate"]);
  ok("element, action and type need no typing", drive.element.key === "driveway" && drive.element.id === "el_fixed" && paths(drive).join() === "new/exposed_aggregate" && live(drive)[0].label === "New · Exposed aggregate");
  const fence = chooseElement(ext, drive, "fencing");
  ok("changing the element keeps its identity", fence.element.id === "el_fixed" && fence.element.key === "fencing" && fence.element.label === "Fencing");
  ok("a type that doesn't fit the new element is flagged", stale(fence).join() === "new/exposed_aggregate" && paths(fence).join() === "new");
  const kept = toggleOption(ext, drive, ["retain"]);
  ok("no construction type is asked of retained work, and the old one is kept (B07)", stale(kept).join() === "new/exposed_aggregate" && paths(kept).join() === "retain" && !choiceView(ext, kept).levels.some((l) => l.key === "retain"));
  ok("element without a detail list doesn't invent one", !choiceView(ext, toggleOption(ext, chooseElement(ext, null, "pool"), ["new"])).levels.some((l) => l.key === "new"));
  ok("an unknown stored path is kept and shown, never dropped", (() => { const x = makeItem({ answer: { v: 1, state: "recorded", nature: "choice", selected: [{ path: ["retired_option"], label: "Old choice" }] } }).answer; const v = choiceView(c, x); return v.kept.length === 1 && v.kept[0].label === "Old choice" && !v.kept[0].canReuse && live(toggleOption(c, x, ["render"])).length === 2; })());
}

section("Not decided, reasons and owner (B09)");
{
  const c = cfg("W-013");
  const a = toggleNotDecided(c, null);
  ok("Not decided needs nothing else: no note, no reason", a.state === "unresolved" && !a.note && a.unresolved === null);
  ok("the four approved reasons are offered", Object.values(UNRESOLVED_REASONS).map((r) => r.label).join() === "Decide later,Blue Leaf to advise,Designer / consultant to confirm,Awaiting drawings / info");
  const partial = toggleNotDecided(c, pick("W-013", ["render"]));
  ok("what was chosen so far stays", paths(partial).join() === "render" && partial.state === "unresolved");
  ok("taking Not decided back returns to recorded", toggleNotDecided(c, partial).state === "recorded");
  const reasoned = setUnresolvedReason(c, a, "blue_leaf_to_advise");
  ok("a reason is stored", reasoned.unresolved.reason === "blue_leaf_to_advise" && reasoned.state === "unresolved");
  ok("a second tap clears the reason, not the state", setUnresolvedReason(c, reasoned, "blue_leaf_to_advise").state === "unresolved" && setUnresolvedReason(c, reasoned, "blue_leaf_to_advise").unresolved === null);
  ok("an invented reason is refused", JSON.stringify(setUnresolvedReason(c, a, "because")) === JSON.stringify(a));
  ok("client unsure is its own state", setClientUnsure(c, a).state === "client_unsure" && setClientUnsure(c, setClientUnsure(c, a)).state === "unresolved");
  const decided = toggleOption(c, reasoned, ["render"]);
  ok("answering clears the parked reason", decided.state === "recorded" && decided.unresolved === null);
  const off = toggleOption(c, partial, ["render"]);
  ok("taking a choice back doesn't un-park the question", off.state === "unresolved");
  const owner = seedOf("W-013", { answer: a });
  const p = reasonPatch(owner, c, "blue_leaf_to_advise");
  ok("a reason offers its usual owner", p.responsibility === "blue_leaf");
  const named = seedOf("W-013", { answer: a, responsibility: "trade" });
  ok("it never overrides someone staff named", !("responsibility" in reasonPatch(named, c, "blue_leaf_to_advise")));
  const moved = apply(owner, p);
  ok("changing the reason moves an owner the reason set", reasonPatch(moved, c, "designer_to_confirm").responsibility === "architect");
  ok("awaiting drawings names nobody by itself", !("responsibility" in reasonPatch(seedOf("W-013", { answer: a }), c, "awaiting_info")));
  const unsure = pick("W-007", ["unsure"]);
  ok("W-007 Unsure is client-unsure, not a recorded fact", unsure.state === "client_unsure" && paths(unsure).join() === "unsure");
  ok("taking it back clears the state", toggleOption(cfg("W-007"), unsure, ["unsure"]) === null);
  ok("taking Not decided back takes the Unsure option with it, so the tap isn't dead", toggleNotDecided(cfg("W-007"), unsure) === null);
  ok("and the view agrees it is off", !choiceView(cfg("W-007"), toggleNotDecided(cfg("W-007"), unsure)).notDecided);
  ok("an ordinary answer stays when Not decided comes off", paths(toggleNotDecided(cfg("W-007"), toggleNotDecided(cfg("W-007"), pick("W-007", ["yes"])))).join() === "yes");
  ok("Unsure beside a flagged answer: the flagged one stays", (() => { const a2 = toggleOption(cfg("W-007"), pick("W-007", ["yes"], ["yes", "temporary_kitchen"]), ["unsure"]); const off2 = toggleNotDecided(cfg("W-007"), a2); return stale(off2).join() === "yes/temporary_kitchen" && paths(off2).length === 0 && !choiceView(cfg("W-007"), off2).notDecided; })());
  const note = setAnswerNote(c, a, "Client wants to see samples");
  ok("a note is optional and stays staff only", note.note === "Client wants to see samples" && !JSON.stringify(clientSafeAnswer({ answer: note })).includes("samples"));
}

section("N/A");
{
  const c = cfg("W-017");
  const a = toggleNotApplicable(c, pick("W-017", ["timber"]));
  ok("N/A is its own state and the choice is kept flagged", a.state === "not_applicable" && stale(a).join() === "timber" && paths(a).length === 0);
  ok("N/A on again is undone", toggleNotApplicable(c, a).state === "not_discussed");
  const blank = toggleNotApplicable(c, null);
  ok("N/A is different from not discussed", blank.state === "not_applicable");
  const i = seedOf("W-017", { answer: null });
  const na = apply(i, itemPatch(i, c, blank));
  ok("N/A settles a choice question's disposition", na.disposition === "na" && !isClientSelection(na));
  const back = itemPatch(na, c, toggleNotApplicable(c, na.answer));
  ok("and undoing it reverses that", back.disposition === "undecided");
  const fact = seedOf("W-001");
  ok("N/A on a site fact leaves the disposition alone", !("disposition" in itemPatch(fact, cfg("W-001"), toggleNotApplicable(cfg("W-001"), null))));
  const r3 = pick("R-003", ["n_a"]);
  ok("R-003's own N/A option is the N/A state", r3.state === "not_applicable" && choiceView(cfg("R-003"), r3).ownNotApplicable);
}

section("What a tap may write to the item");
{
  const q = "W-001"; const c = cfg(q);
  const i = seedOf(q);
  const p = itemPatch(i, c, pick(q, ["steep_access"]));
  ok("a fact never touches the disposition", !("disposition" in p) && apply(i, p).disposition === "undecided");
  ok("nor reads as construction scope", contractInclusionOf(apply(i, p)) === "not_scope");
  ok("no field but the answer changes", Object.keys(p).join() === "answer");

  for (const [id, path, want] of [["K-001", ["new_kitchen"], "new"], ["B-001", ["retained"], "retain"], ["R-003", ["remove"], "remove"], ["H-001", ["no_stair"], "na"]]) {
    const item = seedOf(id);
    ok(`${id}: the answer is the disposition`, apply(item, itemPatch(item, cfg(id), pick(id, path))).disposition === want);
  }
  const k = seedOf("K-001");
  const kNew = apply(k, itemPatch(k, cfg("K-001"), pick("K-001", ["new_kitchen"])));
  ok("taking the answer back clears the disposition", apply(kNew, itemPatch(kNew, cfg("K-001"), toggleOption(cfg("K-001"), kNew.answer, ["new_kitchen"]))).disposition === "undecided");

  const ext = cfg("W-010");
  const dri = seedOf("W-010");
  const withEl = apply(dri, itemPatch(dri, ext, chooseElement(ext, null, "driveway")));
  ok("choosing an element sets no disposition", withEl.disposition === "undecided");
  const replaced = apply(withEl, itemPatch(withEl, ext, toggleOption(ext, withEl.answer, ["replace"])));
  ok("the action does", replaced.disposition === "new");
  ok("the action itself is kept, so Replace isn't confused with New", paths(replaced.answer).join() === "replace");
  const legacy = seedOf("W-004", { disposition: "remove", description: "Strip out" });
  const touched = itemPatch(legacy, cfg("W-004"), chooseElement(cfg("W-004"), null, "joinery"));
  ok("tapping an element can't reset a disposition an older record already has", !("disposition" in touched));

  const handSet = seedOf("W-010", { disposition: "alter", answer: toggleOption(cfg("W-010"), chooseElement(cfg("W-010"), null, "paths"), ["new"]) });
  ok("a status set by hand in the office survives a tap that doesn't change the action", !("disposition" in itemPatch(handSet, cfg("W-010"), chooseElement(cfg("W-010"), handSet.answer, "driveway"))));

  const inc = seedOf("W-022");
  const client = apply(inc, itemPatch(inc, cfg("W-022"), toggleOption(cfg("W-022"), chooseElement(cfg("W-022"), null, "appliances"), ["by_client"])));
  ok("By client records who supplies and decides nothing about the contract (Tab 27 Q4)", client.supplyBy === "client" && client.disposition === "undecided" && contractInclusionOf(client) === "undecided");
  const included = apply(client, itemPatch(client, cfg("W-022"), toggleOption(cfg("W-022"), client.answer, ["included"])));
  ok("moving off it clears the supply it set", included.supplyBy === "" && included.disposition === "included");
  const mine = seedOf("W-022", { supplyBy: "trade" });
  ok("a supplier someone set by hand isn't cleared", apply(mine, itemPatch(mine, cfg("W-022"), toggleOption(cfg("W-022"), null, ["included"]))).supplyBy === "trade");

  const sel = seedOf("K-005");
  const chosen = apply(sel, itemPatch(sel, cfg("K-005"), pick("K-005", ["engineered_stone"])));
  ok("a choice is a preference, nothing more", chosen.certainty === "preference" && chosen.evidence === null);
  ok("cleared again, it goes back", apply(chosen, itemPatch(chosen, cfg("K-005"), toggleOption(cfg("K-005"), chosen.answer, ["engineered_stone"]))).certainty === "not_considered");
  ok("typed product text keeps the preference", apply({ ...chosen, product: "Caesarstone" }, itemPatch({ ...chosen, product: "Caesarstone" }, cfg("K-005"), toggleOption(cfg("K-005"), chosen.answer, ["engineered_stone"]))).certainty === "preference");
  for (const id of Object.keys(ANSWER_CONFIG).filter((x) => cfg(x).options?.length)) {
    const qq = QUESTIONS.find((x) => x.id === id); if (!qq.itemKind) continue;
    const it = seedOf(id, { certainty: "proposed" });
    const after = itemPatch(it, cfg(id), toggleOption(cfg(id), null, [cfg(id).options[0].id]));
    if ("certainty" in after) { ok(`${id}: a tap leaves a proposed item proposed`, false); break; }
  }
  ok("no tap on any question moves a proposed item", true);
  const approved = seedOf("K-005", { certainty: "client_approved", evidence: { at: "2026-11-01", by: "Staff", method: "meeting" }, answer: pick("K-005", ["engineered_stone"]) });
  const change = itemPatch(approved, cfg("K-005"), toggleOption(cfg("K-005"), approved.answer, ["porcelain"]));
  ok("changing an approved answer doesn't touch the approval here", !("certainty" in change) && !("evidence" in change));
  ok("the existing guard sees it and steps it back", editOutrunsApproval(approved, change) === true);
  ok("a note on an approved answer isn't a change", editOutrunsApproval(approved, itemPatch(approved, cfg("K-005"), setAnswerNote(cfg("K-005"), approved.answer, "hello"))) === false);
  ok("a typed description is left exactly as it was", (() => { const t = seedOf("W-017", { description: "Engineered oak, matt, living zones" }); const after = apply(t, itemPatch(t, cfg("W-017"), pick("W-017", ["timber"]))); return after.description === "Engineered oak, matt, living zones"; })());

  const by = seedOf("W-013");
  const out = apply(by, settlePatch(by, cfg("W-013"), "by_others"));
  ok("By others settles a choice out", out.disposition === "by_others" && out.answer.state === "recorded" && !isClientSelection(out));
  const back = apply(out, settlePatch(out, cfg("W-013"), "by_others"));
  ok("a second tap takes it back", back.disposition === "undecided" && back.answer === null);
  ok("only choices offer settle-outs", settleOptions(cfg("W-013")).length === 2 && settleOptions(cfg("W-001")).length === 0 && settleOptions(cfg("K-001")).length === 0);
  ok("the rarer ones wait for More detail", settleOptions(cfg("W-013"), { showDetail: true }).length === 4);
}

section("+ More detail");
{
  const c = cfg("K-008");
  const hidden = choiceView(c, null);
  ok("rarer options start hidden", !hidden.element.options.some((o) => o.id === "wine_storage") && hidden.hidden);
  const shown = choiceView(c, null, { showDetail: true });
  ok("More detail reveals them", shown.element.options.some((o) => o.id === "wine_storage") && !shown.hidden);
  const chosen = chooseElement(c, null, "wine_storage");
  ok("one already chosen is never hidden", choiceView(c, chosen).element.options.some((o) => o.id === "wine_storage"));
  const tree = cfg("W-013");
  const a = pick("W-013", ["lightweight_cladding"]);
  ok("the same goes for a follow-up level", !choiceView(tree, a).levels[1].options.some((o) => o.id === "other_cement_sheet_system") && choiceView(tree, a, { showDetail: true }).levels[1].options.some((o) => o.id === "other_cement_sheet_system"));
  ok("Other is always in view", choiceView(cfg("W-001"), null).levels[0].options.some((o) => o.id === "other"));
  const z = chooseZone(cfg("W-017"), null, "other_zone");
  ok("an Other zone takes words", setZoneWords(cfg("W-017"), z, "Sunroom").zone.label === "Sunroom" && choiceView(cfg("W-017"), z).zone.open);
  const el = chooseElement(cfg("W-004"), null, "other");
  ok("an Other element takes words", setElementWords(cfg("W-004"), el, "Bay window").element.label === "Bay window");
  ok("zone tap again clears it", chooseZone(cfg("W-017"), chooseZone(cfg("W-017"), pick("W-017", ["timber"]), "main_floor"), "main_floor").zone === null);
}

section("Outstanding: what the record says");
{
  const reasons = (i) => outstandingReasons(i).join();
  const fact = seedOf("W-001", { answer: pick("W-001", ["steep_access"]) });
  ok("a recorded fact is not an undecided piece of scope", reasons(fact) === "");
  ok("a fact typed on an older record isn't either", reasons(seedOf("W-001", { description: "Steep block" })) === "");
  ok("a fact parked as Not decided is open", reasons(seedOf("W-007", { answer: toggleNotDecided(cfg("W-007"), null) })) === "decision");
  ok("a fact the client is unsure of is open", reasons(seedOf("W-007", { answer: pick("W-007", ["unsure"]) })) === "decision");
  ok("a fact with a follow-up keeps it", reasons(seedOf("W-001", { answer: pick("W-001", ["steep_access"]), nextAction: "Check crane" })) === "action");
  const choice = seedOf("K-005", { answer: pick("K-005", ["engineered_stone"]), certainty: "preference" });
  ok("a choice made on the card is still open: selection is not approval", reasons(choice) === "decision");
  ok("it closes on client approval only", reasons({ ...choice, certainty: "client_approved" }) === "");
  ok("settled out, it isn't open", reasons({ ...choice, disposition: "by_others" }) === "");
  ok("N/A isn't open", reasons(seedOf("K-005", { answer: toggleNotApplicable(cfg("K-005"), null) })) === "");
  const naCard = seedOf("W-020", { technicalStatus: "needs_verification", answer: toggleNotApplicable(cfg("W-020"), null) });
  ok("N/A is not evidence: an item still needing verification stays outstanding", reasons(naCard) === "verification" && naCard.technicalStatus === "needs_verification");
  ok("the same answer reads the same on the card and in the office", reasons(naCard) === reasons(seedOf("W-020", { technicalStatus: "needs_verification", disposition: "na" })));
  ok("a default flag and one set by hand are treated alike", reasons(seedOf("W-015", { technicalStatus: "needs_verification", answer: toggleNotApplicable(cfg("W-015"), null) })) === "verification");
  ok("staff clear it visibly, by changing the technical status", reasons({ ...naCard, technicalStatus: "not_required" }) === "");
  ok("N/A with verification and a follow-up keeps both", reasons({ ...naCard, nextAction: "Ask the engineer" }) === "verification,action");
  ok("an action answered N/A is still finished", reasons(seedOf("W-005", { technicalStatus: "needs_verification", answer: toggleNotApplicable(cfg("W-005"), null) })) === "");
  ok("N/A with a follow-up keeps the follow-up", reasons(seedOf("K-005", { nextAction: "Ask", answer: toggleNotApplicable(cfg("K-005"), null) })) === "action");
  ok("a requirement answered isn't nagged", reasons(seedOf("K-002", { answer: pick("K-002", ["island"]), certainty: "preference" })) === "");
  ok("a requirement parked is open", reasons(seedOf("K-002", { answer: toggleNotDecided(cfg("K-002"), null) })) === "decision");
  ok("verification still shows on a recorded requirement", reasons(seedOf("W-015", { technicalStatus: "needs_verification", answer: pick("W-015", ["glazing", "double_glazing"]) })) === "verification");
  const scope = seedOf("W-010", { disposition: "new", answer: toggleOption(cfg("W-010"), chooseElement(cfg("W-010"), null, "driveway"), ["new"]) });
  ok("scope with an action is not open", reasons(scope) === "");
  ok("scope with only an element is", reasons(seedOf("W-010", { answer: chooseElement(cfg("W-010"), null, "driveway") })) === "decision");
  ok("By client is an answer to who supplies, not an open question", reasons(seedOf("O-001", { supplyBy: "client", answer: pick("O-001", ["by_client"]) })) === "" && contractInclusionOf(seedOf("O-001", { supplyBy: "client", answer: pick("O-001", ["by_client"]) })) === "undecided");
  ok("an answer flagged after a change needs review", reasons(seedOf("W-007", { answer: toggleOption(cfg("W-007"), pick("W-007", ["yes"], ["yes", "temporary_kitchen"]), ["no"]) })) === "decision");
  ok("an open action stays open until done", reasons(seedOf("W-011", { answer: pick("W-011", ["investigation"]) })) === "action" && reasons(seedOf("W-011", { resolved: true, answer: pick("W-011", ["investigation"]) })) === "");
  ok("legacy: a typed selection is still open", reasons(makeItem({ itemKind: "selection", description: "Oak" })) === "decision");
  ok("legacy: an undecided scope item is still open", reasons(makeItem({ itemKind: "scope", description: "Something" })) === "decision");
  ok("a record from a newer schema is read the old way", reasons(makeItem({ itemKind: "scope", answer: { v: 99, state: "not_applicable" } })) === "decision");
  ok("nature comes from the answer, else the question", natureOf(seedOf("W-001")) === "fact" && natureOf(makeItem({ itemKind: "scope" })) === null);
}

section("A note written for the client (P-005)");
{
  const c = cfg("P-005");
  const a = setClientNote(c, toggleOption(c, null, ["comfort"]), "Growing family");
  ok("it sits in its own field, apart from the staff note", a.clientNote === "Growing family" && a.note === "");
  ok("the client view carries it", clientSafeAnswer({ answer: a }).clientNote === "Growing family");
  ok("the staff note still doesn't", !JSON.stringify(clientSafeAnswer({ answer: setAnswerNote(c, a, "Staff only") })).includes("Staff only"));
  ok("a note alone is not thrown away", setClientNote(c, null, "Growing family")?.clientNote === "Growing family");
  ok("clearing it leaves no key behind", !("clientNote" in setClientNote(c, a, "")));
  ok("an answer with no note keeps the shape it always had", !("clientNote" in normaliseAnswer(toggleOption(c, null, ["comfort"]))) && !("clientNote" in clientSafeAnswer({ answer: toggleOption(c, null, ["comfort"]) })));
  ok("it survives a reload", makeItem(JSON.parse(JSON.stringify({ answer: a }))).answer.clientNote === "Growing family");
  ok("the client reads it, so changing it counts as a change", answerMaterialChanged(a, setClientNote(c, a, "Empty nesters")));
  ok("changing the staff note still doesn't", !answerMaterialChanged(a, setAnswerNote(c, a, "Staff only")));
  const approvedBrief = seedOf("P-005", { certainty: "client_approved", evidence: { at: "2026-11-01", by: "Staff", method: "meeting" }, answer: a });
  ok("so editing it after client approval steps the approval back", editOutrunsApproval(approvedBrief, itemPatch(approvedBrief, c, setClientNote(c, a, "Empty nesters"))));
  ok("a staff note on the approved record doesn't", !editOutrunsApproval(approvedBrief, itemPatch(approvedBrief, c, setAnswerNote(c, a, "Staff only"))));
  ok("the view reads it back", choiceView(c, a).clientNote === "Growing family");
  ok("only P-005 asks for one", Object.entries(ANSWER_CONFIG).filter(([, x]) => x.clientNote).map(([id]) => id).join() === "P-005");
}

section("A blank row's id");
{
  const seed = { id: "ri_x", roomId: "room_b", promptKey: "R-010" };
  ok("the same room and question is the same record", seedMatchesItem(makeItem({ id: "ri_x", roomId: "room_b", promptKey: "R-010" }), seed));
  ok("another room's record is not", !seedMatchesItem(makeItem({ id: "ri_x", roomId: "room_a", promptKey: "R-010" }), seed));
  ok("nor another question's", !seedMatchesItem(makeItem({ id: "ri_x", roomId: "room_b", promptKey: "R-009" }), seed));
  ok("project-wide rows match on no room", seedMatchesItem(makeItem({ id: "ri_y", promptKey: "W-010" }), { id: "ri_y", promptKey: "W-010" }));
}

section("Round trip and legacy");
{
  const everyPath = [];
  for (const [id, c] of Object.entries(ANSWER_CONFIG)) {
    const w = (l, p) => (l || []).forEach((o) => { everyPath.push([id, [...p, o.id]]); w(o.children, [...p, o.id]); });
    w(c.options, []);
  }
  let bad = [];
  for (const [id, path] of everyPath) {
    const c = cfg(id);
    let a = null;
    for (let n = 1; n <= path.length; n++) a = toggleOption(c, a, path.slice(0, n));
    if (!a || !live(a).some((s) => s.path.join("/") === path.join("/"))) bad.push(`${id}:${path.join("/")}`);
    const twice = normaliseAnswer(JSON.parse(JSON.stringify(a)));
    if (JSON.stringify(twice) !== JSON.stringify(a)) bad.push(`${id}:${path.join("/")} changed on reload`);
    if (answerMaterialChanged(a, twice)) bad.push(`${id}:${path.join("/")} reads as changed`);
  }
  ok(`all ${everyPath.length} option paths can be chosen and reload unchanged`, bad.length === 0, bad.slice(0, 8).join(" "));
  const item = seedOf("W-017", { answer: chooseZone(cfg("W-017"), pick("W-017", ["timber"]), "bedroom_floor") });
  const back = makeItem(JSON.parse(JSON.stringify(item)));
  ok("zone, choice and state survive makeItem", back.answer.zone.key === "bedroom_floor" && paths(back.answer).join() === "timber" && back.answer.state === "recorded");
  ok("a guided question is one the card handles", isGuidedConfig(cfg("W-001")) && isGuidedConfig(cfg("P-009")) && !isGuidedConfig(cfg("E-001")) && !isGuidedConfig(cfg("P-006")));
  ok("the title falls back to what was chosen", itemTitle(item).startsWith("Timber") && itemTitle(makeItem({ category: "flooring" })) === "Flooring" && itemTitle(makeItem({ description: "Typed" })) === "Typed");
  ok("an unconfigured question has no config", answerConfigFor("Z-1") === null && dispositionApplies(null));
}

console.log(`\nregister-progressive-choice: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
