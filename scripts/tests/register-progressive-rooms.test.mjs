/**
 * register-progressive-rooms.test.mjs — R05 P4c and P4d (Tab 27 Gates 4 and 5, B06, B07, B08, B10, DEC-MRUX-02, MR-UX-02).
 * What a room takes from Whole House, what confirming may and may not do, one record seen from Site & Existing and from a
 * room, the merged existing-works path, scope-first external works, and site facts that can't become work.
 * No server, no database, no browser. Run: node scripts/tests/register-progressive-rooms.test.mjs
 */
import { QUESTIONS, ANSWER_CONFIG } from "../../src/lib/registerQuestions.js";
import {
  makeItem, makeRoom, emptyMeta, toggleOption, chooseElement, chooseZone, toggleArea, itemPatch, choiceView, roomDefaultFor, roomDefaultsFor, roomInheritedLines, roomLinesToConfirm,
  confirmRoomDefaults, exceptionFieldsFrom, outstandingByPlace, roomLabel, roomDefaultStatus, contractInclusionOf, outstandingReasons,
} from "../../src/lib/register.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const cfg = (id) => ANSWER_CONFIG[id];
const q = (id) => QUESTIONS.find((x) => x.id === id);
const whole = (id, more = {}) => makeItem({ itemKind: q(id).itemKind, category: q(id).category, promptKey: id, section: "project", isDefault: true, technicalStatus: q(id).technical, ...more });
const surface = (key, label, path, optLabel) => whole("W-019", { answer: { v: 1, state: "recorded", nature: "choice", zone: { key, label }, selected: [{ optionId: path[path.length - 1], path, label: optLabel }] } });
const reg = (items, rooms) => ({ meta: emptyMeta({ rooms }), items });
const bed = makeRoom({ id: "r_bed", name: "Bed 1", roomType: "bedroom" });
const bed2 = makeRoom({ id: "r_bed2", name: "Bed 2", roomType: "bedroom" });
const laundry = makeRoom({ id: "r_lau", name: "Laundry", roomType: "laundry" });
const STAMP = { at: "2026-11-10T00:00:00Z", by: "Staff" };
const walls = surface("walls", "Walls", ["palette", "warm"], "Palette · Warm");
const ceiling = surface("ceiling", "Ceiling", ["ceiling", "square_set"], "Ceiling · Square set");
const wet = surface("wet_area", "Wet area", ["palette", "cool"], "Palette · Cool");
const floor = whole("W-017", { answer: { v: 1, state: "recorded", nature: "choice", zone: { key: "bedroom_floor", label: "Bedrooms" }, selected: [{ optionId: "carpet", path: ["carpet"], label: "Carpet" }] } });

section("A room reads every surface that applies (R-006)");
{
  const r = reg([walls, ceiling, wet], [bed, laundry]);
  const ids = (list) => list.map((d) => d.answer.zone.key).join();
  ok("a bedroom reads walls and ceiling", ids(roomDefaultsFor(r, q("R-006"), "bedroom")) === "walls,ceiling");
  ok("a laundry also reads the wet-area surface", ids(roomDefaultsFor(r, q("R-006"), "laundry")) === "walls,ceiling,wet_area");
  ok("a floor still reads one default", roomDefaultsFor(reg([floor], [bed]), q("R-005"), "bedroom").length === 1);
  ok("the single-default reader is unchanged", roomDefaultFor(r, q("R-006"), "bedroom")?.id === walls.id);
  ok("with no surfaces set there is nothing to read", roomDefaultsFor(reg([], [bed]), q("R-006"), "bedroom").length === 0);
  const older = whole("W-019", { description: "Warm palette throughout" });
  ok("an older default with no surface still feeds the room", roomDefaultsFor(reg([older], [bed]), q("R-006"), "bedroom")[0]?.id === older.id);
}

section("The room's list (B10, DEC-MRUX-02)");
{
  const qs = [q("R-005"), q("R-006")];
  const r = reg([floor, walls, ceiling], [bed]);
  const lines = roomInheritedLines(r, bed, qs);
  ok("one line per default", lines.length === 3);
  ok("each surface is named", lines.filter((l) => l.surface).map((l) => l.surface).join() === "Walls,Ceiling");
  ok("all start as to confirm", lines.every((l) => l.status === "inherited") && roomLinesToConfirm(lines).length === 3);
  const before = JSON.stringify(r.items);
  roomInheritedLines(r, bed, qs);
  ok("reading it writes nothing and makes no copies", JSON.stringify(r.items) === before);
  const own = makeItem({ itemKind: "selection", promptKey: "R-005", category: "flooring", roomId: bed.id, description: "Timber here" });
  ok("a question the room answered itself isn't listed", roomInheritedLines(reg([floor, own], [bed]), bed, qs.slice(0, 1)).length === 0);
}

section("Confirming records that a default applies, and nothing else");
{
  const qs = [q("R-005"), q("R-006")];
  const r = reg([floor, walls, ceiling], [bed, bed2]);
  const lines = roomInheritedLines(r, bed, qs);
  const confirmed = confirmRoomDefaults(bed, lines.map((l) => l.def), STAMP);
  const after = reg([floor, walls, ceiling], [confirmed, bed2]);
  ok("every line reads confirmed", roomInheritedLines(after, confirmed, qs).every((l) => l.status === "confirmed"));
  ok("nothing is left to confirm", roomLinesToConfirm(roomInheritedLines(after, confirmed, qs)).length === 0);
  ok("the items are untouched: no approval, no verification, no price", [floor, walls, ceiling].every((i) => i.certainty !== "client_approved" && i.technicalStatus !== "verified" && i.pricingStatus === "not_reviewed"));
  ok("a sibling room is not confirmed by it", roomInheritedLines(after, bed2, qs).every((l) => l.status === "inherited"));
  const moved = { ...ceiling, answer: { ...ceiling.answer, selected: [{ optionId: "cornice", path: ["ceiling", "cornice"], label: "Ceiling · Cornice" }] } };
  const changedView = roomInheritedLines(reg([floor, walls, moved], [confirmed]), confirmed, qs);
  ok("a default that moved is flagged on the confirmed room", changedView.find((l) => l.surface === "Ceiling").status === "changed");
  ok("the others stay confirmed", changedView.filter((l) => l.surface !== "Ceiling").every((l) => l.status === "confirmed"));
  ok("only the changed one is offered again", roomLinesToConfirm(changedView).length === 1);
}

section("Audit fixes: what a room shows");
{
  const c = cfg("D-003");
  const shown = (opts) => choiceView(c, null, opts).levels[0].options.map((o) => o.id).join();
  ok("D-003 offers everything when nothing else covers it", shown({}).includes("floor_finish") && shown({}).includes("general_paint"));
  ok("floor and paint go when the room's own questions cover them (R05-06)", shown({ coveredQuestions: new Set(["R-005", "R-006"]) }) === "feature_wall,trim,doors_and_hardware");
  const older = toggleOption(c, null, ["floor_finish"]);
  ok("an answer already on the record still shows", choiceView(c, older, { coveredQuestions: new Set(["R-005", "R-006"]) }).levels[0].options.some((o) => o.id === "floor_finish"));
  const qs = [q("R-006")];
  const confirmed = confirmRoomDefaults(bed, [walls], STAMP);
  ok("confirming keeps what the default said", confirmed.defaultConfirmations[walls.id].words.includes("Warm"));
  const moved = { ...walls, answer: { ...walls.answer, selected: [{ optionId: "cool", path: ["palette", "cool"], label: "Palette · Cool" }] } };
  const line = roomInheritedLines(reg([moved, ceiling], [confirmed]), confirmed, qs).find((l) => l.surface === "Walls");
  ok("a flagged room can show what it was", line.status === "changed" && line.confirmedWords.includes("Warm") && !line.confirmedWords.includes("Cool"));
}

section("An exception belongs to one room and one surface");
{
  const fields = exceptionFieldsFrom(ceiling, { keepZone: true });
  ok("it records which surface", fields.answer.zone.key === "ceiling" && fields.overridesDefaultId === ceiling.id);
  ok("a floor exception drops the zone: the room is the zone", exceptionFieldsFrom(floor).answer.zone === null);
  const approved = whole("W-017", { certainty: "client_approved", evidence: { at: "x", by: "y" }, answer: floor.answer });
  ok("a client approval never carries to a room that differs", exceptionFieldsFrom(approved).certainty === "proposed");
  const ex = makeItem({ ...fields, promptKey: "R-006", category: "walls_ceiling", roomId: bed.id });
  const r = reg([walls, ceiling, ex], [bed, bed2]);
  const lines = roomInheritedLines(r, bed, [q("R-006")]);
  ok("the walls stay inherited", lines.find((l) => l.surface === "Walls").status === "inherited");
  ok("the ceiling reads as different here", lines.find((l) => l.surface === "Ceiling").status === "overridden");
  ok("a sibling room is untouched", roomInheritedLines(r, bed2, [q("R-006")]).every((l) => l.status === "inherited"));
  ok("confirm skips the overridden one", !(ceiling.id in confirmRoomDefaults(bed, [walls, ceiling], { ...STAMP, exceptionFor: (id) => (id === ceiling.id ? ex : null) }).defaultConfirmations));
  ok("status reads overridden whatever was confirmed", roomDefaultStatus(confirmRoomDefaults(bed, [ceiling], STAMP), ceiling, ex) === "overridden");
}

section("The outstanding list, by place (B09)");
{
  const r = reg([
    whole("W-015", { technicalStatus: "needs_verification" }),
    makeItem({ itemKind: "action", promptKey: "W-011", section: "site", description: "Check footings" }),
    makeItem({ itemKind: "selection", promptKey: "R-005", category: "flooring", roomId: bed.id, description: "Timber?" }),
    makeItem({ itemKind: "action", promptKey: "E-001", description: "Siteworks detail" }),
  ], [bed]);
  const places = outstandingByPlace(r);
  ok("each is grouped where it can be dealt with", places.map((p) => p.key).join() === "whole_house,site,r_bed,register", places.map((p) => p.key).join());
  ok("a room jumps to that room", places.find((p) => p.key === "r_bed").roomId === bed.id && places.find((p) => p.key === "r_bed").step === "rooms");
  ok("it counts by reason", places.find((p) => p.key === "whole_house").verification === 1);
  ok("nothing outstanding, nothing listed", outstandingByPlace(reg([], [bed])).length === 0);
}

section("Site & Existing: one path, one record (B06)");
{
  const c = cfg("W-004");
  ok("W-006 and W-008 are presented with W-004", cfg("W-006").presentedWith === "W-004" && cfg("W-008").presentedWith === "W-004");
  ok("the path starts at the area", c.flow[0] === "area");
  let a = chooseElement(c, null, "joinery");
  a = toggleArea(c, a, bed.id);
  a = toggleOption(c, a, ["demolish"]);
  const item = makeItem({ itemKind: "scope", category: "demolition", promptKey: "W-004", section: "site", disposition: "undecided", answer: a });
  ok("the area is stored by room id", item.answer.areaIds.join() === bed.id);
  ok("the area reads as the room's live name", roomLabel(reg([item], [{ ...bed, name: "Master" }]), item) === "Master");
  ok("no area reads Site / existing", roomLabel(reg([], [bed]), makeItem({ itemKind: "scope", section: "site", promptKey: "W-004" })) === "Site / existing");
  ok("a second tap takes the room off", toggleArea(c, a, bed.id).areaIds.length === 0);
  ok("Demolish sets the work status", itemPatch(makeItem({ ...item, answer: chooseElement(c, null, "joinery") }), c, a).disposition === "remove");
  const prot = itemPatch(item, c, toggleOption(c, item.answer, ["protect"]));
  ok("Protect records that it stands in for W-006", prot.answer.sourceQuestionIds.join() === "W-006");
  const back = itemPatch(makeItem({ ...item, ...prot }), c, toggleOption(c, prot.answer, ["alter"]));
  ok("moving off Protect takes the source id off again", back.answer.sourceQuestionIds.length === 0);
  ok("no quantity field exists on the answer", !("quantity" in item.answer));
  ok("quantity stays null until measured", item.quantity === null);
}

section("External works: scope first (B07)");
{
  const c = cfg("W-010");
  const el = chooseElement(c, null, "driveway");
  const newOne = toggleOption(c, el, ["new"]);
  const viewNew = choiceView(c, newOne);
  ok("New goes on to the construction type", viewNew.levels.some((l) => l.options.some((o) => o.id === "exposed_aggregate")));
  for (const action of ["retain", "excluded", "by_others"]) {
    const v = choiceView(c, toggleOption(c, el, [action]));
    ok(`${action} asks nothing about materials`, v.levels.length === 1, JSON.stringify(v.levels.map((l) => l.key)));
  }
  const item = makeItem({ itemKind: "scope", category: "external", promptKey: "W-010", section: "site", disposition: "undecided", answer: el });
  ok("Retain records work status retain", itemPatch(item, c, toggleOption(c, el, ["retain"])).disposition === "retain");
  ok("Excluded is out of the contract", contractInclusionOf(makeItem({ ...item, disposition: "excluded" })) === "excluded");
}

section("Site facts are never work (MR-UX-02)");
{
  for (const id of ["W-001", "W-007"]) ok(`${id} has no work status`, cfg(id).dispositionUse === "none" && cfg(id).nature === "fact");
  const c = cfg("W-001");
  const a = toggleOption(c, null, ["narrow_or_restricted_access"]);
  const item = makeItem({ itemKind: "scope", category: "site", promptKey: "W-001", section: "site", disposition: "undecided", answer: a });
  ok("recording a constraint writes no status", !("disposition" in itemPatch(item, c, toggleOption(c, a, ["steep_access"]))));
  ok("it isn't construction scope", contractInclusionOf(item) === "not_scope");
  ok("and it isn't an open decision", outstandingReasons(item).length === 0);
  ok("W-011 is a risk with no work status", cfg("W-011").nature === "risk" && cfg("W-011").dispositionUse === "none");
}

console.log(`\nregister-progressive-rooms: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
