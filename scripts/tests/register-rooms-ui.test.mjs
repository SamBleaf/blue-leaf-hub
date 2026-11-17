/**
 * register-rooms-ui.test.mjs — the pure rules behind the new Rooms list and room screen (src/lib/roomScreen.js),
 * REGISTER_SCREENS_SPEC.md S2, S3, S3p. On the anonymised REAL job (scripts/documents/fixtures/real-extension-job.mjs)
 * and on made-up rooms. No database, no network, no React.
 *
 *   node scripts/tests/register-rooms-ui.test.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { makeItem, emptyMeta, makeRoom, answerConfigFor, choiceView, ROOM_SCOPES } from "../../src/lib/register.js";
import { upperFloorHint, roomsNeedingBrief } from "../../src/lib/registerQuality.js";
import { disagreeingScope, hasRoomBrief } from "../../src/lib/briefModel.js";
import {
  normaliseFloor, floorKey, floorsOf, walkOrder, floorChoices, nextRoomName, addRoomMeta, duplicateRoomMeta, moveRoomToFloor, moveRoomStep,
  dropRoomBefore, tickMoveMeta, restoreLevels, renameRoomMeta, setRoomScope, answerCount, removeRoomPlan, briefPreview, roomListRow, listCounts,
  filterRooms, workSummary, earlierWords, workWordFor, keepWorkPlan, changeWorkPlan, readdable, contractFixed, roomLayout, houseLinesFor,
  stripView, exceptionSeedFrom, roomActionPoints, otherWords, briefSeed, standardBriefText, toggleAnswerList, connectedFrom, connectCandidates,
  usableNotedWords, adelaideDay, timeOfDay, saveWords, onFloor, addFloorOptions, notAllowedOption, ACTION_PROMPT,
  floorBlocks, roomPosition, actionsPillText, removeRoomText, addedText, duplicatedText, movedText, tickMoveLabel, tickCount, storeysNote, roomSaveState,
  flushWithin, isExistingWorksRow, existingWorksFor, existingWorkSeed, actionSeed,
} from "../../src/lib/roomScreen.js";
import { realJob } from "../documents/fixtures/real-extension-job.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);
const load = () => { const j = realJob(); return { ...j, register: { meta: emptyMeta(j.register.meta), items: j.register.items.map((i) => makeItem(i)) } }; };
const { register, context } = load();
const rooms = register.meta.rooms;
const room = (id, reg = register) => reg.meta.rooms.find((r) => r.id === id);
const ctx = { projectType: "extension", stage: "consultants" };
const ids = (list) => list.map((q) => q.id);

section("Floors");
ok("names are trimmed and capitalised; 'upper' joins 'Upper'", normaliseFloor("  upper ") === "Upper" && floorKey("UPPER") === floorKey("Upper") && floorKey("upper floor") === "upper");
ok("a known name drops ' floor'; a custom one keeps its words", normaliseFloor("Lower ground floor") === "Lower ground" && normaliseFloor("loft studio") === "Loft studio" && normaliseFloor("") === "Ground");
const one = floorsOf(rooms);
ok("the real job is one floor: GROUND FLOOR · 16", one.length === 1 && one[0].label === "Ground floor" && one[0].rooms.length === 16, flat(one.map((f) => [f.label, f.rooms.length])));
const mixed = [makeRoom({ id: "a", name: "Bed", level: "Upper" }), makeRoom({ id: "b", name: "Kitchen", level: "ground" }), makeRoom({ id: "c", name: "Rumpus", level: "Lower ground" }), makeRoom({ id: "d", name: "Bed 2", level: "upper" })];
ok("floors sort in building order and merge spellings", flat(floorsOf(mixed).map((f) => `${f.label}:${f.rooms.map((r) => r.id).join("")}`)) === flat(["Lower ground:c", "Ground floor:b", "Upper floor:ad"]), flat(floorsOf(mixed).map((f) => f.label)));
ok("walk order runs floor by floor", walkOrder(mixed).map((r) => r.id).join("") === "cbad");
ok("floor chips always offer Ground floor and Upper floor", flat(floorChoices(rooms).map((f) => f.label)) === flat(["Ground floor", "Upper floor"]));
ok("'+ Add a floor' offers only floors the job hasn't got", flat(addFloorOptions(rooms)) === flat(["Upper", "Lower ground"]) && flat(addFloorOptions(mixed)) === flat([]));

section("Adding rooms (the add panel)");
ok("'Bedroom' → 'Bedroom 5' on the real job; 'WC' → 'WC 3'; a new name stays bare", nextRoomName(rooms, "Bedroom") === "Bedroom 5" && nextRoomName(rooms, "WC") === "WC 3" && nextRoomName(rooms, "Study") === "Study" && nextRoomName(rooms, "Kitchen") === "Kitchen 2");
const added = addRoomMeta(rooms, { name: "Bedroom", roomType: "bedroom", level: "Ground", scope: "new" });
ok("a chip adds a numbered room at the end of the floor, with the type and the Work word chosen once",
  added.room.name === "Bedroom 5" && added.room.roomType === "bedroom" && added.room.scope === "new" && added.rooms.at(-1).id === added.room.id && added.rooms.length === 17);
ok("nothing is preset: the Work word is the one passed (Renovated stays Renovated)", addRoomMeta(rooms, { name: "Kitchen", roomType: "kitchen", level: "Ground", scope: "renovated" }).room.scope === "renovated");
ok("every room keeps its id and order is renumbered", added.rooms.slice(0, 16).every((r, i) => r.id === rooms[i].id && r.order === i) && added.room.order === 16);
const upAdd = addRoomMeta(mixed, { name: "Bedroom", roomType: "bedroom", level: "upper", scope: "new" });
ok("a room added to an existing floor joins its spelling and sits after its last room", upAdd.room.level === "Upper" && upAdd.rooms.findIndex((r) => r.id === upAdd.room.id) === 4);
const midAdd = addRoomMeta(mixed, { name: "Rumpus", roomType: "family", level: "Lower ground", scope: "new" });
ok("adding to a floor in the middle of the list inserts it there", midAdd.rooms.map((r) => r.name).join(",") === "Bed,Kitchen,Rumpus,Rumpus 2,Bed 2", midAdd.rooms.map((r) => r.name).join(","));
ok("toast words: 'on the ground floor'", onFloor("Ground") === "on the ground floor" && onFloor("Lower ground") === "on the lower ground");

section("Changing rooms (row ⋯ menu)");
const dup = duplicateRoomMeta(rooms, "bd4");
ok("Duplicate copies type, floor and Work, takes the next number and sits directly below",
  dup.room.name === "Bedroom 5" && dup.room.roomType === "bedroom" && dup.room.level === "Ground" && dup.room.scope === "new"
  && dup.rooms[dup.rooms.findIndex((r) => r.id === "bd4") + 1].id === dup.room.id && dup.room.id !== "bd4");
const dupK = duplicateRoomMeta(rooms, "kt");
ok("Duplicate never copies answers, the brief, the drawing sheet or confirmations (the copy shows 'Brief needed')",
  Object.keys(dupK.room.defaultConfirmations).length === 0 && dupK.room.sheet === "" && !register.items.some((i) => i.roomId === dupK.room.id)
  && briefPreview({ ...register, meta: { ...register.meta, rooms: dupK.rooms } }, dupK.room).needed);
const moved = moveRoomToFloor(rooms, "bd3", "Upper");
ok("Move to another floor writes the chip value and keeps every other room", moved.find((r) => r.id === "bd3").level === "Upper" && moved.length === 16 && floorsOf(moved).length === 2);
ok("Move up / Move down swap with the neighbour on the same floor", moveRoomStep(rooms, "kt", -1).map((r) => r.id).slice(2, 4).join() === "kt,dn" && moveRoomStep(rooms, "e", -1)[0].id === "e");
ok("Move up skips rooms on other floors", moveRoomStep(mixed, "d", -1).map((r) => r.id).join("") === "dbca");
ok("drag: drop a room before another, taking its floor", dropRoomBefore(mixed, "c", "b").map((r) => `${r.id}${floorKey(r.level)[0]}`).join("") === "aucgbgdu");
ok("Rename trims, and an empty name changes nothing", renameRoomMeta(rooms, "kt", "  Kitchen and scullery ").find((r) => r.id === "kt").name === "Kitchen and scullery" && renameRoomMeta(rooms, "kt", "  ") === rooms);
ok("the Work pill sets room.scope, the only scope control", setRoomScope(rooms, "kt", "altered").find((r) => r.id === "kt").scope === "altered" && ROOM_SCOPES.altered === "Altered");
ok("Remove names the answer count: Laundry has 6", answerCount(register, "ld") === 6);
const afterRemove = removeRoomPlan("ld")(register);
ok("Remove takes the room and its records (the existing removal) and renumbers", !afterRemove.meta.rooms.some((r) => r.id === "ld") && !afterRemove.items.some((i) => i.roomId === "ld")
  && afterRemove.items.length === register.items.length - 6 && afterRemove.meta.rooms.every((r, i) => r.order === i));

section("Tick mode ('Choose upstairs rooms')");
ok("the banner shows on the real job (every room on Ground, cladding for the upper level, stairs typed)", !!upperFloorHint(register));
const tick = tickMoveMeta(rooms, ["bd1", "bd2", "bd3", "bd4", "en"], "Upper");
const tickReg = { ...register, meta: { ...register.meta, rooms: tick.rooms } };
ok("one save moves 5 rooms: GROUND FLOOR · 11 and UPPER FLOOR · 5", tick.moved === 5 && flat(floorsOf(tick.rooms).map((f) => `${f.label} · ${f.rooms.length}`)) === flat(["Ground floor · 11", "Upper floor · 5"]));
ok("after the move the floor banner disappears", upperFloorHint(tickReg) === null);
ok("Undo puts every level back", flat(restoreLevels(tick.rooms, tick.previous).map((r) => r.level)) === flat(rooms.map((r) => r.level)));
ok("a room already upstairs isn't counted again", tickMoveMeta(tick.rooms, ["bd1", "kt"], "upper").moved === 1);

section("Room rows (line 2) and the filter");
const row = (id) => roomListRow(register, context, room(id));
ok("Kitchen: the brief preview, and 'Check work' (i18 'New kitchen' disagrees with Renovated)", row("kt").text.startsWith("feature range hood - meditrean") && row("kt").checkWork && !row("kt").needed);
ok("Living: 'Brief needed' with the tag 'Unfinished: “stairs -”'", row("lv").needed && row("lv").unfinished === "stairs -");
ok("Pantry: 'Brief needed · Walk-in, appliance garage, full-height' ('Pantry' in a pantry is skipped)", row("pn").needed && row("pn").mustHaves === "Walk-in, appliance garage, full-height" && row("pn").checkWork, row("pn").mustHaves);
ok("Bathroom: 'Brief needed · Bath'", row("b1").mustHaves === "Bath");
ok("Bedroom: the typed words of an agreeing earlier answer show muted", row("bd1").mustHaves === "sliding doors to robe in bedrooms", row("bd1").mustHaves);
ok("Laundry: 1 action (i61 washer / dryer layout, still to be decided)", row("ld").actions === 1 && row("ld").checkWork);
const counts = listCounts(register);
ok("filter: All 16 · Brief needed 15 · Check work 3", counts.all === 16 && counts.brief === 15 && counts.check === 3 && counts.brief === roomsNeedingBrief(register).length, flat(counts));
ok("the filters list the same rooms", filterRooms(register, rooms, "check").map((r) => r.id).join() === "kt,pn,ld" && filterRooms(register, rooms, "brief").length === 15);
ok("summary: '8 new · 8 renovated'", workSummary(rooms) === "8 new · 8 renovated", workSummary(rooms));
ok("a room with No change needs no brief", !briefPreview(register, { ...room("e"), scope: "existing_remain" }).needed);

section("The earlier-answer banner");
const kt = room("kt");
ok("the Kitchen banner quotes “New kitchen” and offers Change to New", earlierWords(disagreeingScope(register, kt)[0]) === "New kitchen" && workWordFor(disagreeingScope(register, kt)[0]) === "new");
ok("an earlier 'Alter' reads as Altered; 'Renovate' as Renovated", workWordFor(register.items.find((i) => i.id === "i48")) === "altered" && workWordFor(register.items.find((i) => i.id === "i53")) === "renovated");
const keep = keepWorkPlan(register, kt);
ok("[Keep Renovated] removes only i18", flat(keep.remove.map((i) => i.id)) === flat(["i18"]));
const keptReg = { ...register, items: register.items.filter((i) => i.id !== "i18") };
ok("then nothing disagrees (i53 'Renovate' agrees)", disagreeingScope(keptReg, kt).length === 0);
const change = changeWorkPlan(register, kt, "new");
ok("[Change to New] sets New and removes whichever now disagree (i53)", change.scope === "new" && flat(change.remove.map((i) => i.id)) === flat(["i53"]));
const second = { ...register, items: [...register.items, makeItem({ id: "x1", roomId: "kt", promptKey: "R-003", itemKind: "scope", disposition: "retain", answer: { v: 1, nature: "scope", selected: [{ optionId: "retain", path: ["retain"], label: "Retain" }], state: "recorded" } })] };
ok("a second disagreeing answer shows next after Keep", flat(disagreeingScope({ ...second, items: second.items.filter((i) => i.id !== "i18") }, kt).map((i) => i.id)) === flat(["x1"]));
const back = makeItem(readdable(register.items.find((i) => i.id === "i18")));
ok("Undo re-adds the same words under a fresh id with no sync", back.id !== "i18" && back.sync === null && back.answer.selected[0].label === "New kitchen" && back.roomId === "kt");
ok("after the contract the banner sends staff to a variation", contractFixed({ sync: { baselined: true } }) && contractFixed({ sync: { locked: true } }) && !contractFixed(register.items[0]));

section("Which prompt goes where (the Kitchen, S3)");
const L = roomLayout(register, context, kt, ctx);
ok("choices: Sink & mixer and Cooking & exhaust", flat(ids(L.primary)) === flat(["K-007", "K-009"]), flat(ids(L.primary)));
ok("More choices (6): appliances, power, budget drivers, doors, existing junctions, supplied by others", flat(ids(L.more)) === flat(["K-008", "K-010", "R-007", "R-013", "R-014", "K-012"]), flat(ids(L.more)));
ok("Office only (5)", flat(ids(L.office)) === flat(["K-011", "K-013", "K-014", "R-012", "R-015"]), flat(ids(L.office)));
const asked = new Set([...ids(L.primary), ...ids(L.more), ...ids(L.office)]);
ok("whole-room scope questions are never asked (R-003, K-001)", !asked.has("R-003") && !asked.has("K-001"));
ok("the brief and must-haves sit in the brief card (R-004, K-002, K-003), not in Choices", !asked.has("R-004") && !asked.has("K-002") && !asked.has("K-003") && flat(L.mustHaves.map((m) => [m.question.id, m.item?.id])) === flat([["K-002", "i20"], ["K-003", "i21"]]) && L.brief.id === "i22");
ok("house choices sit in the strip (floor, walls and ceiling, cabinetry, benchtop, splashback)", ["R-005", "R-006", "K-004", "K-005", "K-006"].every((q) => L.stripIds.has(q) && !asked.has(q)), flat([...L.stripIds]));
ok("follow-ups are the room's actions, not a choice (R-010)", !asked.has(ACTION_PROMPT));
ok("the Kitchen has R-004's chips only when it has no must-have question", L.ownChips === false && roomLayout(register, context, makeRoom({ id: "g1", name: "Garage", roomType: "garage", scope: "new" }), ctx).ownChips === true);
ok("Other things recorded here (1): i53 'Renovate', agrees with the room", flat(L.other.map((i) => i.id)) === flat(["i53"]) && otherWords(register, kt, L.other[0]) === "Earlier answer: Renovate — agrees with the room", flat(L.other.map((i) => i.id)));
ok("an earlier scope record with only typed words reads as an earlier note, not an agreement (Bedroom i19)",
  otherWords(register, room("bd1"), register.items.find((i) => i.id === "i19")) === "Earlier note: “sliding doors to robe in bedrooms”");
ok("the banner holds i18 and the Kitchen has no actions", flat(L.banner.map((i) => i.id)) === flat(["i18"]) && L.actions.length === 0);
const exc = { ...register, items: [...register.items, makeItem({ id: "x2", roomId: "kt", promptKey: "K-004", itemKind: "selection", overridesDefaultId: "i36" })] };
ok("a room exception brings its question back as a choice row", !roomLayout(exc, context, kt, ctx).stripIds.has("K-004") && roomLayout(exc, context, kt, ctx).more.some((q) => q.id === "K-004"));

section("Nothing is hidden: every record of every room has a place");
for (const r of rooms) {
  const lay = roomLayout(register, context, r, ctx);
  const own = register.items.filter((i) => i.roomId === r.id);
  const placed = new Set([...lay.banner.map((i) => i.id), ...lay.actions.flatMap((p) => p.ids), ...(lay.brief ? [lay.brief.id] : []),
    ...lay.mustHaves.filter((m) => m.item).map((m) => m.item.id), ...[...lay.primary, ...lay.more, ...lay.office].flatMap((q) => lay.rowItems(q).map((i) => i.id)), ...lay.other.map((i) => i.id)]);
  const lost = own.filter((i) => !placed.has(i.id));
  ok(`${r.name}: all ${own.length} record(s) reachable`, lost.length === 0, flat(lost.map((i) => [i.id, i.promptKey])));
}
const noChange = roomLayout(register, context, { ...kt, scope: "existing_remain" }, ctx);
ok("Work = No change: the brief and choices collapse, their records move to 'Other things recorded here', and both earlier answers now disagree",
  noChange.collapsed && flat(noChange.other.map((i) => i.id)) === flat(["i20", "i21", "i22", "i54"]) && flat(noChange.banner.map((i) => i.id)) === flat(["i18", "i53"]));
const outOfJob = roomLayout(register, context, { ...kt, scope: "not_in_scope" }, ctx);
ok("Not in this job: every record stays listed", outOfJob.other.length === register.items.filter((i) => i.roomId === "kt").length);

section("The house strip");
const S = stripView(register, kt, L.questions);
ok("the red line: 'Benchtop: engineered stone can't be used — choose another with the client' (i38)",
  S.houseLines.some((h) => h.item.id === "i38" && h.tone === "red" && h.text === "Benchtop: engineered stone can't be used — choose another with the client" && h.action === "Change"), flat(S.houseLines.map((h) => h.text)));
ok("the amber line: 'Splashback: tiles allowed, client to decide' (i39)", S.houseLines.some((h) => h.item.id === "i39" && h.tone === "amber" && h.text === "Splashback: tiles allowed, client to decide"), flat(S.houseLines.map((h) => h.text)));
ok("the summary leaves the benchtop out", !/benchtop|engineered stone/i.test(S.summary) && /^Floor: .*Walls: .*Ceiling: square set, flat · Cabinetry: flat-panel, laminate$/.test(S.summary), S.summary);
ok("'✓ Confirmed 16 Nov' (Adelaide day of 15 Nov 22:11 UTC); nothing left to confirm", S.confirmedOn === "16 Nov" && S.pending.length === 0 && S.confirmedCount === 4, flat({ on: S.confirmedOn, pending: S.pending.length, n: S.confirmedCount }));
const bed = room("bd2");
const bedLines = houseLinesFor(register, bed, roomLayout(register, context, bed, ctx).questions);
ok("a bedroom shows the open bedroom floor (i29: carpet, the client will decide later)", bedLines.some((h) => h.item.id === "i29" && h.tone === "amber" && h.text === "Floor: carpet — the client will decide later"), flat(bedLines.map((h) => h.text)));
const fresh = { ...register, meta: { ...register.meta, rooms: register.meta.rooms.map((r) => (r.id === "kt" ? { ...r, defaultConfirmations: {} } : r)) } };
ok("before confirming: 'Confirm all (4)' (the parked benchtop is never confirmed)", stripView(fresh, room("kt", fresh), L.questions).pending.length === 4);
const line = S.lines.find((l) => l.def.id === "i38");
const seed = exceptionSeedFrom(line, kt);
ok("'Different here' on the benchtop never carries engineered stone into the room", seed.overridesDefaultId === "i38" && seed.roomId === "kt" && !(seed.answer?.selected || []).some((s) => s.optionId === "engineered_stone"));
ok("an exception from a walls line keeps its zone", exceptionSeedFrom(S.lines.find((l) => l.def.id === "i32"), kt).answer.zone.key === "walls");

section("Engineered stone is never a chip");
const k5 = answerConfigFor("K-005");
ok("K-005's fresh chips don't include it", !choiceView(k5, null, { showDetail: true }).levels[0].options.filter((o) => o.id !== "engineered_stone" || o.on).some((o) => o.id === "engineered_stone"));
ok("an existing engineered-stone value is recognised as not allowed", notAllowedOption("K-005", register.items.find((i) => i.id === "i38"))?.optionId === "engineered_stone" && !notAllowedOption("K-005", makeItem({ promptKey: "K-005" })));

section("Actions in this room");
ok("Laundry's actions are its own open records (i61)", flat(roomActionPoints(register, context, room("ld")).map((p) => p.ids)) === flat([["i61"]]));
ok("a whole-house point never shows in a room (the rangehood action is Throughout)", !rooms.some((r) => roomActionPoints(register, context, r).some((p) => p.ids.includes("i46"))));

section("The room brief");
ok("the seed is the build contract's", flat(briefSeed(kt, "x")) === flat({ id: "x", roomId: "kt", promptKey: "R-004", itemKind: "requirement", category: "layout", section: "room" }));
ok("'Nothing special': 'Standard WC; no special requirements.' for WC 2, 'Standard kitchen…' for the Kitchen",
  standardBriefText(room("wc2")) === "Standard WC; no special requirements." && standardBriefText(kt) === "Standard kitchen; no special requirements." && standardBriefText(room("b2")) === "Standard bathroom; no special requirements.");
const standard = { ...register, items: [...register.items, makeItem({ id: "x3", ...briefSeed(room("wc2")), description: standardBriefText(room("wc2")) })] };
ok("…and it counts as a room brief (owner decision 3)", hasRoomBrief(standard, room("wc2")));
const a1 = toggleAnswerList(null, "connectsTo", "dn");
const a2 = toggleAnswerList({ ...a1, usedBy: ["adults"] }, "connectsTo", "outside");
ok("Connects to writes answer.connectsTo and keeps answer.v: 1 and other keys", a1.v === 1 && flat(a1.connectsTo) === flat(["dn"]) && flat(a2.connectsTo) === flat(["dn", "outside"]) && flat(a2.usedBy) === flat(["adults"]));
const a3 = toggleAnswerList(toggleAnswerList(a1, "connectsTo", "dn"), "usedBy", "children");
ok("taking the last one off drops the key", !("connectsTo" in a3) && flat(a3.usedBy) === flat(["children"]) && a3.v === 1);
const kitchenBrief = register.items.find((i) => i.id === "i22");
const linked = { ...register, items: register.items.map((i) => (i.id === "i22" ? makeItem({ ...i, answer: toggleAnswerList(i.answer, "connectsTo", "dn") }) : i)) };
ok("a link shows on the other room, read live", flat(connectedFrom(linked, room("dn")).map((r) => r.id)) === flat(["kt"]) && connectedFrom(register, room("dn")).length === 0);
ok("Connects to keeps an existing brief's description untouched", makeItem({ ...kitchenBrief, answer: toggleAnswerList(kitchenBrief.answer, "connectsTo", "dn") }).description === kitchenBrief.description);
const cand = connectCandidates(rooms, kt);
ok("Connects to offers the nearest rooms in walk order, the rest under '+ More rooms'", flat(cand.shown.map((r) => r.name)) === flat(["Entry", "Living", "Dining", "Pantry", "Laundry"]) && cand.more.length === 10, flat(cand.shown.map((r) => r.name)));
const k3 = answerConfigFor("K-003");
const used = usableNotedWords(k3, register.items.find((i) => i.id === "i21"));
ok("'Use these' ticks Full-height, Walk-in and Drawers and removes those words", flat(used.matched) === flat(["Full-height", "Walk-in", "Drawers"])
  && flat(used.patch.answer.selected.map((s) => s.optionId)) === flat(["full_height", "walk_in", "drawers"]) && used.patch.description === "", flat(used));
const partly = usableNotedWords(k3, makeItem({ roomId: "kt", promptKey: "K-003", itemKind: "requirement", description: "full-height, spice rack" }));
ok("unmatched words stay", flat(partly.matched) === flat(["Full-height"]) && partly.patch.description === "spice rack");
ok("nothing matches: no 'Use these'", usableNotedWords(k3, makeItem({ description: "big" })) === null);

section("Words");
ok("Adelaide day and time", adelaideDay("2026-11-15T22:11:37.563Z") === "16 Nov" && timeOfDay(new Date("2026-11-16T11:11:00Z")) === "9:41 pm", `${adelaideDay("2026-11-15T22:11:37.563Z")} ${timeOfDay(new Date("2026-11-16T11:11:00Z"))}`);
ok("room bar save words", saveWords({ state: "saved", at: new Date("2026-11-16T11:11:00Z") }).text === "Saved 9:41 pm" && saveWords({ state: "error" }).text === "Not saved — will retry" && saveWords({ state: "error" }).tone === "warn" && saveWords(null) === null);
ok("no question codes in any list-row or strip text", !/\b[A-Z]-\d{3}\b/.test(flat([...rooms.map((r) => roomListRow(register, context, r)), S.summary, S.houseLines.map((h) => h.text), L.other.map((i) => otherWords(register, kt, i))])));

section("The list's floor blocks and words");
const blocks = floorBlocks(register, "all");
ok("one block on the real job: Ground floor with all 16 rooms in walk order", blocks.length === 1 && blocks[0].label === "Ground floor" && blocks[0].rooms.length === 16 && blocks[0].total === 16 && blocks[0].rooms[3].id === "kt");
ok("the Check work filter keeps only Kitchen, Pantry and Laundry", flat(floorBlocks(register, "check")[0].rooms.map((r) => r.id)) === flat(["kt", "pn", "ld"]));
const upReg = { ...register, meta: { ...register.meta, rooms: tick.rooms } };
ok("a filtered floor with nothing to show is left out; with All it shows", floorBlocks(upReg, "check").length === 1 && floorBlocks(upReg, "all").length === 2);
ok("a floor just added shows empty under All (so the add panel can open on it)", flat(floorBlocks(register, "all", ["Upper"]).map((f) => `${f.label}:${f.rooms.length}`)) === flat(["Ground floor:16", "Upper floor:0"]));
const toUpper = addRoomMeta(rooms, { name: "Bedroom", roomType: "bedroom", level: "Upper", scope: "new" });
ok("adding to that new floor puts the room there and makes it a real floor", toUpper.room.level === "Upper" && floorsOf(toUpper.rooms).length === 2 && toUpper.rooms.at(-1).id === toUpper.room.id);
ok("toasts: 'Added Bedroom 5 on the ground floor', 'Added Bedroom 5 below Bedroom 4 — its answers weren't copied'",
  addedText(added.room) === "Added Bedroom 5 on the ground floor" && duplicatedText(dup.room, dup.source) === "Added Bedroom 5 below Bedroom 4 — its answers weren't copied", `${addedText(added.room)} | ${duplicatedText(dup.room, dup.source)}`);
ok("remove confirm: 'Remove Laundry and its 6 answers? Anything already on the client portal is kept.'",
  removeRoomText(register, room("ld")) === "Remove Laundry and its 6 answers? Anything already on the client portal is kept." && removeRoomText(register, added.room) === "Remove Bedroom 5? Nothing has been recorded in it yet.");
const undoAdd = removeRoomPlan(added.room.id)({ ...register, meta: { ...register.meta, rooms: added.rooms } });
ok("Undo after an add takes the new room off and leaves the list as it was", flat(undoAdd.meta.rooms.map((r) => r.id)) === flat(rooms.map((r) => r.id)) && undoAdd.items.length === register.items.length);
ok("tick bar: 'Move 0 rooms to Upper floor' · 'Move 1 room…' · 'Move 5 rooms…'", tickMoveLabel(0, "Upper") === "Move 0 rooms to Upper floor" && tickMoveLabel(1, "Upper") === "Move 1 room to Upper floor" && tickMoveLabel(5, "Upper") === "Move 5 rooms to Upper floor");
ok("the count leaves out a ticked room that is already upstairs", tickCount(tick.rooms, ["bd1", "kt", "lv"], "Upper") === 2 && tickCount(rooms, [], "Upper") === 0);
ok("after the move: 'Moved 5 rooms to the upper floor'", movedText(5, "Upper") === "Moved 5 rooms to the upper floor" && movedText(1, "Lower ground") === "Moved 1 room to the lower ground", movedText(1, "Lower ground"));
ok("the action pill reads '1 action' / '2 actions', nothing for none", actionsPillText(1) === "1 action" && actionsPillText(2) === "2 actions" && actionsPillText(0) === "");
ok("storeys note only when the fact is on file and the rooms span more floors", storeysNote(tick.rooms, 1) === "Rooms are on 2 floors; the job says 1 storey — check in Sales." && storeysNote(rooms, 1) === "" && storeysNote(tick.rooms, null) === "" && storeysNote(tick.rooms, 2) === "");

section("Moving between rooms");
const p4 = roomPosition(rooms, "kt");
ok("Kitchen is 'Room 4 of 16', after Dining and before Pantry", p4.number === 4 && p4.total === 16 && p4.prev.id === "dn" && p4.next.id === "pn");
ok("the first room has no previous; the last says 'Done — back to Rooms' (no next)", roomPosition(rooms, "e").prev === null && roomPosition(rooms, "lg").next === null);
ok("Next follows walk order across floors (the Lounge, last downstairs, is followed by the first room upstairs)",
  roomPosition(tick.rooms, "lg").next?.level === "Upper" && roomPosition(tick.rooms, "lg").next.id === "en" && roomPosition(tick.rooms, "lg").number === 11, flat(roomPosition(tick.rooms, "lg")));
ok("the room bar's save state is the worst of the room's records", roomSaveState(register.items.slice(0, 3), () => "saved") === "saved"
  && roomSaveState(register.items.slice(0, 3), (id) => (id === register.items[1].id ? "dirty" : "saved")) === "dirty"
  && roomSaveState(register.items.slice(0, 3), (id) => (id === register.items[0].id ? "error" : "dirty")) === "error"
  && roomSaveState(register.items.slice(0, 3), (id) => (id === register.items[2].id ? "rejected" : "error")) === "rejected" && roomSaveState([], null) === "saved");
// flushWithin on a fake clock: no real waiting. The deadline only fires when the save itself never answers.
const clock = () => { let t = 0; return { now: () => t, wait: (ms) => { t += ms; return Promise.resolve(); }, timeout: () => new Promise(() => {}) }; };
const answers = (list) => { let k = 0; return () => { const v = list[Math.min(k, list.length - 1)]; k += 1; if (v instanceof Error) throw v; return Promise.resolve(v); }; };
const run = async () => {
  const c1 = clock(); const r1 = await flushWithin(answers([true]), c1);
  const c2 = clock(); const r2 = await flushWithin(answers([false, false, true]), c2);
  const c3 = clock(); const r3 = await flushWithin(answers([false]), { ...c3, ms: 8000, retryMs: 500 });
  const c4 = clock(); const r4 = await flushWithin(answers([new Error("offline")]), c4);
  const c5 = clock(); const r5 = await flushWithin(() => new Promise(() => {}), { ...c5, timeout: (ms) => { c5.wait(ms); return Promise.resolve(); } });
  return { r1, r2, r3, r4, r5, t3: c3.now(), t2: c2.now() };
};
const fw = await run();
ok("Next saves first: a clean save moves on; a save already in flight is asked again until it lands", fw.r1 === true && fw.r2 === true && fw.t2 === 1000, flat(fw));
ok("…and a save that never lands gives up within 8 s (stay on the room, answers kept); a throw or a hung save counts as not saved",
  fw.r3 === false && fw.t3 <= 8000 && fw.r4 === false && fw.r5 === false, flat(fw));

section("Where the room screen puts things (every room, every Work word)");
for (const r of rooms) {
  for (const scope of ["renovated", "existing_remain", "not_in_scope"]) {
    const rr = { ...r, scope };
    const lay = roomLayout(register, context, rr, ctx);
    const own = register.items.filter((i) => i.roomId === r.id);
    const placed = new Set([...lay.banner.map((i) => i.id), ...lay.actions.flatMap((p) => p.ids), ...(lay.brief ? [lay.brief.id] : []),
      ...(lay.collapsed ? [] : lay.mustHaves.filter((m) => m.item).map((m) => m.item.id)),
      ...(lay.collapsed ? [] : [...lay.primary, ...lay.more, ...lay.office].flatMap((q) => lay.rowItems(q).map((i) => i.id))), ...lay.other.map((i) => i.id)]);
    const lost = own.filter((i) => !placed.has(i.id));
    if (lost.length) ok(`${r.name} (${scope}): every record reachable`, false, flat(lost.map((i) => [i.id, i.promptKey])));
  }
}
ok("every record of every real room is reachable whatever its Work word", true);
const groupsClean = rooms.every((r) => {
  const lay = roomLayout(register, context, r, ctx);
  const all = [...lay.primary, ...lay.more, ...lay.office].map((q) => q.id);
  return new Set(all).size === all.length && !all.some((id) => ["R-003", "K-001", "B-001", "L-001", "V-001", "D-001", "H-001", "O-001", "R-004", ACTION_PROMPT].includes(id));
});
ok("no question is in two groups, and no room asks a whole-room scope question, the brief or the follow-up as a choice", groupsClean);
const outside = makeRoom({ id: "ox", name: "Outside", roomType: "external", scope: "new" });
const outReg = { ...register, meta: { ...register.meta, rooms: [...rooms, outside] } };
const outLay = roomLayout(outReg, context, outside, ctx);
const outAsked = [...outLay.primary, ...outLay.more, ...outLay.office].map((q) => q.id);
ok("a question that is a site record's other face (driveway and fences, O-006) isn't asked in the room", !outAsked.includes("O-006"), flat(outAsked));
const outWith = { ...outReg, items: [...outReg.items, makeItem({ id: "x5", roomId: "ox", promptKey: "O-006", itemKind: "scope" })] };
const outWithLay = roomLayout(outWith, context, outside, ctx);
ok("…until the room already has a record of it: then the row comes back", [...outWithLay.primary, ...outWithLay.more].some((q) => q.id === "O-006") && !outWithLay.other.some((i) => i.id === "x5"));
ok("the existing-works row stays (Existing-to-new junctions & make good, the same record as Site & existing)", L.more.some((q) => q.id === "R-013") && isExistingWorksRow(L.more.find((q) => q.id === "R-013")));
const w4 = makeItem({ id: "x6", ...existingWorkSeed(kt) });
const w4Reg = { ...register, items: [...register.items, w4, makeItem({ id: "x7", ...existingWorkSeed(room("pn")) })] };
ok("an existing work started in the Kitchen is the site record, with the Kitchen as its area", w4.roomId == null && w4.section === "site" && w4.promptKey === "W-004" && flat(w4.answer.areaIds) === flat(["kt"]) && w4.answer.v === 1);
ok("…and the Kitchen's row shows it (not the Pantry's)", flat(existingWorksFor(w4Reg, kt).map((i) => i.id)) === flat(["x6"]) && flat(existingWorksFor(w4Reg, room("pn")).map((i) => i.id)) === flat(["x7"]));
const fol = makeItem({ id: "x8", ...actionSeed(kt), description: "Confirm the island overhang", nextAction: "Confirm the island overhang" });
ok("'+ Needs action from…' makes a follow-up for this room (R-010, an action), so it shows under its actions", fol.promptKey === "R-010" && fol.itemKind === "action" && fol.roomId === "kt"
  && roomActionPoints({ ...register, items: [...register.items, fol] }, context, kt).some((p) => p.ids.includes("x8")));

// ── Rendered (esbuild → string, no browser): the screens draw from the real job without throwing ──────────────────
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REG = join(REPO, "src/components/sales/lead-detail/register");
const dir = mkdtempSync(join(tmpdir(), "register-rooms-ui-"));
const out = join(REPO, "node_modules", ".cache", `register-rooms-ui-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import RoomsList from ${JSON.stringify(join(REG, "RoomsList.jsx"))};
import RoomScreen from ${JSON.stringify(join(REG, "RoomScreen.jsx"))};
import RoomBriefCard from ${JSON.stringify(join(REG, "RoomBriefCard.jsx"))};
const noop = () => {};
const store = { mutateMeta: noop, replaceItems: noop, upsertItem: noop, updateItem: noop, deleteItem: noop, addItem: noop, saveState: () => "saved", flush: async () => true };
export const list = (props) => renderToStaticMarkup(<RoomsList openRoom={noop} readOnly={false} {...store} {...props} />);
export const screen = (props) => renderToStaticMarkup(<RoomScreen stage="consultants" actor={{ id: "u1" }} onBack={noop} onOpenRoom={noop} onPortalItem={noop} {...store} {...props} />);
export const card = (props) => renderToStaticMarkup(<RoomBriefCard {...store} {...props} />);
`);
try {
  await build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
    define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
  });
  const R = await import(pathToFileURL(out).href);
  const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const codes = (h) => /\b[A-Z]-\d{3}\b/.test(text(h));
  const withRooms = (list) => ({ ...register, meta: { ...register.meta, rooms: list } });

  section("Rendered: the Rooms list (the real job)");
  const lh = R.list({ reg: register, context });
  const lt = text(lh);
  ok("title, summary and '+ Add room'", lt.includes("Rooms 16 rooms · 8 new · 8 renovated") && lt.includes("Add room"), lt.slice(0, 300));
  ok("the floor banner, with both buttons", lt.includes("Is anything upstairs? Every room is on the ground floor, but the cladding is recorded for the upper level and the living room mentions stairs.")
    && lt.includes("Choose upstairs rooms") && lt.includes("Not now"), lt.slice(0, 600));
  ok("the filter: All 16 · Brief needed 15 · Check work 3", lt.includes("All 16") && lt.includes("Brief needed 15") && lt.includes("Check work 3"));
  ok("one floor: 'Ground floor · 16', and no '+ Add room here' with a single floor", lt.includes("Ground floor · 16") && !lt.includes("Add room here"));
  ok("rows in walk order with their lines and tags", /Entry .*Living .*Dining .*Kitchen .*Pantry .*Laundry .*Lounge/.test(lt)
    && lt.includes("feature range hood - meditrean curved micro cement - love the curves Check work") && lt.includes("Unfinished: “stairs -”")
    && lt.includes("Brief needed · Walk-in, appliance garage, full-height") && lt.includes("1 action"), lt);
  ok("each row has its Work pill and ⋯ (44 px targets)", (lh.match(/change work for /g) || []).length === 16 && (lh.match(/aria-label="More for /g) || []).length === 16 && /h-11 w-11/.test(lh));
  ok("no question codes on the list", !codes(lh));
  const th = R.list({ reg: register, context, startTickMode: true });
  const tt = text(th);
  ok("startTickMode opens straight into tick mode: title, 16 unticked boxes, 'Cancel' · 'Move 0 rooms to Upper floor' (disabled)",
    tt.includes("Tick the rooms that are upstairs") && (th.match(/role="checkbox" aria-checked="false"/g) || []).length === 16 && tt.includes("Cancel") && /disabled=""[^>]*>Move 0 rooms to Upper floor</.test(th)
    && !tt.includes("Is anything upstairs?") && !tt.includes("Brief needed 15"), tt.slice(0, 400));
  ok("tick mode hides line 2 except the 'Unfinished' tag", !tt.includes("feature range hood") && tt.includes("Unfinished: “stairs -”"));
  const th2 = text(R.list({ reg: withRooms(tick.rooms), context }));
  ok("two floors: both headers with '+ Add room here', and no banner", th2.includes("Ground floor · 11") && th2.includes("Upper floor · 5") && (th2.match(/\+ Add room here/g) || []).length === 2 && !th2.includes("Is anything upstairs?"));
  const eh = text(R.list({ reg: withRooms([]), context }));
  ok("empty state", eh.includes("Add the rooms off the drawings, in the order you'd walk through. You can rename, move and reorder any time without losing anything.") && eh.includes("Add room"));
  const roh = R.list({ reg: register, context, readOnly: true });
  ok("read-only: rows still open, but nothing to change", /aria-label="Open Kitchen"/.test(roh) && !/aria-label="More for /.test(roh) && !text(roh).includes("Add room"));

  section("Rendered: the Kitchen (S3)");
  const kh = R.screen({ reg: register, context, roomId: "kt" });
  const kx = text(kh);
  ok("the room bar: '‹ Rooms' · Kitchen over 'Ground floor ▾ · Room 4 of 16' · Saved, and no ‹ › buttons", kx.includes("‹ Rooms") && kx.includes("Kitchen") && kx.includes("Ground floor ▾ · Room 4 of 16") && kx.includes("Saved"), kx.slice(0, 300));
  ok("Work: New · Renovated (chosen) · Altered · No change", /aria-pressed="true"[^>]*>Renovated</.test(kh) && kx.includes("New Renovated Altered No change"));
  ok("the banner: 'An earlier answer says “New kitchen”…' [Keep Renovated] [Change to New]",
    kx.includes("An earlier answer says “New kitchen”, but this room is set to Renovated. Only one can print.") && kx.includes("Keep Renovated") && kx.includes("Change to New"));
  ok("the room brief card first, with its sentence and 'In the architect's brief'", kx.includes("Room brief In the architect's brief What must this room do?") && kh.includes("feature range hood - meditrean curved micro cement - love the curves"));
  ok("Choices: Cooking & exhaust and Sink & mixer, then 'More choices (6)'", /Choices for this room .*Sink &amp; mixer|Choices for this room .*Sink & mixer/.test(kx) && kx.includes("Cooking & exhaust") && kx.includes("More choices (6)"), kx);
  ok("each choice has ⚑ and ⋯", /aria-label="Needs action from… /.test(kh) && /aria-label="More for Cooking &amp; exhaust"/.test(kh));
  ok("the house strip with the red benchtop line and the amber splashback line", kx.includes("Same as the rest of the house") && kx.includes("✓ Confirmed 16 Nov")
    && kx.includes("Benchtop: engineered stone can't be used — choose another with the client Change") && kx.includes("Splashback: tiles allowed, client to decide Open"));
  ok("'Actions in this room': nothing waiting, and '+ Needs action from…'", kx.includes("Actions in this room Nothing waiting on anyone here.") && kx.includes("+ Needs action from…"));
  ok("'Other things recorded here (1)', collapsed", kx.includes("Other things recorded here (1)") && !kx.includes("Earlier answer: Renovate"));
  ok("the footer: '‹ Dining' · 'Next: Pantry ›'", kx.includes("‹ Dining") && kx.includes("Next: Pantry ›"));
  ok("no question codes on the room screen", !codes(kh), kx.match(/\b[A-Z]-\d{3}\b/)?.[0]);
  ok("phone text inputs are 16 px (the brief box)", /<textarea[^>]*class="[^"]*text-base/.test(kh));
  const lgx = text(R.screen({ reg: register, context, roomId: "lg" }));
  ok("the last room: 'Done — back to Rooms'", lgx.includes("Done — back to Rooms") && !lgx.includes("Next:"));
  const ldx = text(R.screen({ reg: register, context, roomId: "ld" }));
  ok("the Laundry lists its action (washer / dryer layout) with a ✓", /Actions in this room .*Mark done|aria-label="Mark/.test(ldx) || /Mark done/.test(R.screen({ reg: register, context, roomId: "ld" })), ldx.slice(ldx.indexOf("Actions in this room"), ldx.indexOf("Actions in this room") + 300));
  const nc = text(R.screen({ reg: withRooms(rooms.map((r) => (r.id === "kt" ? { ...r, scope: "existing_remain" } : r))), context, roomId: "kt" }));
  ok("Work = No change: 'No work planned here — no brief needed.' in place of the brief and choices", nc.includes("No work planned here — no brief needed.") && !nc.includes("Room brief") && !nc.includes("Choices for this room") && nc.includes("Other things recorded here (4)"));
  const oj = text(R.screen({ reg: withRooms(rooms.map((r) => (r.id === "kt" ? { ...r, scope: "not_in_scope" } : r))), context, roomId: "kt" }));
  ok("Not in this job: only the bar, 'This room isn't part of the job. Bring it back', and what's still recorded", oj.includes("This room isn't part of the job.") && oj.includes("Bring it back")
    && !oj.includes("Room brief") && !oj.includes("Actions in this room") && !oj.includes("Same as the rest of the house") && oj.includes(`Other things recorded here (${answerCount(register, "kt")})`));
  ok("a removed room says so", text(R.screen({ reg: register, context, roomId: "gone" })).includes("This room has been removed."));

  section("Rendered: the room brief card in the Documents drawer (compact)");
  const ch = text(R.card({ reg: register, room: kt, context, compact: true, onOpenRoom: () => {} }));
  ok("name, floor, Work, banner, brief, Connects to, must-haves and 'Open the full room ›'", ch.includes("Room name") && ch.includes("Floor") && ch.includes("Work")
    && ch.includes("An earlier answer says “New kitchen”") && ch.includes("What must this room do?") && ch.includes("Connects to") && ch.includes("Must-haves") && ch.includes("Open the full room ›"));
  const k5h = R.card({ reg: register, room: kt, context });
  ok("the full card never offers engineered stone as a chip", !/>Engineered stone</.test(k5h));
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
