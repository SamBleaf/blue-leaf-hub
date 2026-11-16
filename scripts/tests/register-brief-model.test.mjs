/**
 * register-brief-model.test.mjs — the brief model (src/lib/briefModel.js) and the content checks (src/lib/registerQuality.js),
 * on the anonymised REAL job (scripts/documents/fixtures/real-extension-job.mjs) as well as made-up records.
 * REGISTER_SCREENS_SPEC.md S4–S6; owner decisions 17 Nov 2026. No database, no network.
 *
 *   node scripts/tests/register-brief-model.test.mjs
 */
import { makeItem, emptyMeta, makeRoom, ROOM_SCOPES, writeRegister, readRegister } from "../../src/lib/register.js";
import { mergeItem } from "../../src/lib/registerMerge.js";
import {
  architectBriefModel, architectBriefLines, openPoints, roomRow, whoOf, dueLabel, isUnfinished, tidy, chipWords, budgetLine, budgetWords,
  BUDGET_BAND_RX, disagreeingScope, hasRoomBrief,
} from "../../src/lib/briefModel.js";
import { contentChecks, roomsNeedingBrief, roomBriefBlocker, upperFloorHint } from "../../src/lib/registerQuality.js";
import { realJob } from "../documents/fixtures/real-extension-job.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);
const load = (tweak) => { const j = realJob(); tweak?.(j); return { ...j, register: { meta: emptyMeta(j.register.meta), items: j.register.items.map((i) => makeItem(i)) } }; };
const item = (reg, id) => reg.items.find((i) => i.id === id);

const { register, context } = load();
const m = architectBriefModel(register, context, {});
const lines = architectBriefLines(m, { siteAddress: "Site address, Seaview Park", clientName: "Client", drawingBasis: "DA rev 3" });
const allText = lines.map((l) => `${l.label} ${l.text}`).join("\n");

section("The real job, through the brief model (S6)");
ok("37 printed lines, 48 of 72 records printed, 24 not", lines.length === 37 && m.counts.printed === 48 && m.counts.notPrinted === 24, flat({ lines: lines.length, ...m.counts }));
const reached = new Set([...lines.flatMap((l) => l.ids), ...m.notPrinted.map((x) => x.id)]);
ok("every record is reachable: on a printed line or in 'Not in this brief' with a reason", register.items.every((i) => reached.has(i.id)), register.items.filter((i) => !reached.has(i.id)).map((i) => i.id));
ok("no reference codes in the reading text", !/\b[A-Z]\d{3}-[A-Z0-9]{3}\b/.test(allText));
ok("engineered stone is never printed (the benchtop says why it is open)", !/engineered stone/i.test(allText) && /Kitchen benchtop: still to be chosen; designer to confirm\./.test(allText));
ok("no contradiction or fragment prints ('New kitchen', 'Retain', 'stairs -', 'curtain -')", !/New kitchen|\bRetain\b|stairs -|curtain|shouldn't/.test(allText), allText.match(/New kitchen|\bRetain\b|stairs -|curtain|shouldn't/g));
ok("01: what's planned, funding and timing, budget to be confirmed, priorities", flat(m.project.map((r) => r.text)) === flat(["An extension and renovation: 16 rooms, 8 new and 8 renovated.",
  "Cash. Target start April 2027.", "To be confirmed by Blue Leaf.", "Natural light and space. Quality priorities: upgraded."]), flat(m.project.map((r) => r.text)));
ok("02: council and zone, bushfire, complexity, access, occupancy", flat(m.site.map((r) => r.label)) === flat(["Council and zone", "Bushfire", "Site complexity", "Access", "During the works"])
  && m.site[0].text === "City of Seaview. Hills Neighbourhood zone." && m.site[1].text === "In a mapped bushfire area. BAL to be assessed.", flat(m.site));
ok("03: the eight points in print order (architect, energy assessor, client, then to be agreed)", flat(m.points.map((p) => p.who)) === flat(["Architect", "Architect", "Energy assessor", "Client", "To be agreed", "To be agreed", "To be agreed", "To be agreed"]), flat(m.points.map((p) => p.who)));
ok("03: retaining and pool asked once", m.points.at(-1).text === "Retaining and pool: are they part of this job?" && flat(m.points.at(-1).ids) === flat(["i71", "i72"]));
ok("03: '(agreed with the client)' only on an evidenced approval", m.points.filter((p) => /agreed with the client/.test(p.text)).map((p) => p.ids[0]).join() === "i07,i08");
ok("03: no By column while no point has a by-when", m.hasBy === false && m.points.every((p) => !p.by));
const rooms = m.roomGroups[0].rows;
ok("04: one floor, no bands; rooms with content in walk order, then the bare rooms grouped by Work", !m.floorBands && flat(rooms.map((r) => r.room)) === flat(["Living", "Kitchen", "Pantry", "Laundry", "Bathroom", "Bedroom",
  "Entry, Bathroom 2, Ensuite, Bedroom 2", "Dining, Bedroom 3, Bedroom 4, WC, WC 2, Lounge"]), flat(rooms.map((r) => r.room)));
ok("04: the Kitchen prints its brief, must-haves and cooking; Work from the room card", rooms[1].work === "Renovated" && !rooms[1].placeholder
  && rooms[1].text === "Feature range hood, meditrean curved micro cement, love the curves. Layout & family use: island. Storage: full-height, walk-in, drawers. Cooking & exhaust: induction.", rooms[1].text);
ok("04: the Living's 'stairs -' is held back, so its brief is to follow", rooms[0].placeholder && /^Layout, outlook & acoustics: gas fire place/.test(rooms[0].text));
ok("04: 'Pantry' in a pantry is skipped, but the record still rides on the row", !/Layout & family use: pantry/i.test(rooms[2].text) && rooms[2].ids.includes("i57"));
ok("04: the laundry's cabinetry (a house default reaching only the laundry) prints in its row", rooms[3].text === "Cabinetry, bench & trough: cabinetry, bench, splashback, mixer, trough." && rooms[3].ids.includes("i44"));
ok("04: agreeing scope words print (Bedroom); agreeing records ride on the Work cell", rooms[5].text === "Sliding doors to robe in bedrooms." && rooms[6].ids.includes("i48"));
ok("05: the selections that affect the drawings, said once", flat(m.selections.map((r) => r.label)) === flat(["Internal doors", "Ceilings", "Upper level", "Main roof", "Driveway", "All bathrooms", "Fencing"])
  && m.selections[1].text === "Square set, flat." && /By others\.$/.test(m.selections[3].text), flat(m.selections));
ok("06: nothing outside this job is left to say", m.outside.length === 0);
const np = (g) => m.notPrinted.filter((x) => x.group === g).map((x) => x.id).join();
ok("not printed: 11 in the schedule, 8 held back, 3 empty, 2 for the office", np("schedule") === "i28,i29,i30,i31,i32,i34,i35,i36,i37,i39,i40" && np("held") === "i03,i09,i12,i18,i24,i46,i55,i59"
  && np("empty") === "i62,i63,i64" && np("office") === "i25,i45", flat(m.notPrinted));

section("Content checks (S5 'Before you send') and the room-brief rule");
const cc = contentChecks("architect_brief", register, context, m);
ok("ten checks, in order", flat(cc.map((c) => c.key.split(":")[0])) === flat(["story", "architect", "floors", "scope_clash", "unnamed", "client_check", "unfinished", "contradicts", "no_ask", "empty"]), flat(cc.map((c) => c.key)));
ok("every check has something to fix it", cc.every((c) => c.targets.length > 0));
ok("the story check names what's missing and what the brief does about it", /vision, must-haves and budget aren't recorded\. The brief leaves the first two out and says the budget is “to be confirmed by Blue Leaf”\./.test(cc[0].text), cc[0].text);
ok("the floors check gives its evidence", /cladding is recorded for the upper level and the living room mentions stairs/.test(cc[2].text), cc[2].text);
ok("empty answers are offered for deletion", cc.at(-1).action === "delete_empty" && cc.at(-1).targets.map((t) => t.id).join() === "i62,i63,i64");
ok("15 rooms need a brief (all but the Kitchen); the blocker targets each", roomsNeedingBrief(register).length === 15 && roomBriefBlocker(register).targets.length === 15 && !roomsNeedingBrief(register).some((r) => r.name === "Kitchen"));
ok("the earlier-answer banner finds Kitchen, Pantry and Laundry", ["kt", "pn", "ld"].every((id) => disagreeingScope(register, register.meta.rooms.find((r) => r.id === id)).length === 1)
  && disagreeingScope(register, register.meta.rooms.find((r) => r.id === "e")).length === 0);

section("Room briefs (C2) and 'Nothing special' (owner decision 3)");
{
  const { register: r2 } = load((j) => { j.register.items.push({ id: "n1", kind: "item", promptKey: "R-004", itemKind: "requirement", section: "room", roomId: "wc2", category: "layout", description: "Standard WC; no special requirements." }); });
  ok("'Nothing special' counts as the room brief and prints as written", hasRoomBrief(r2, r2.meta.rooms.find((r) => r.id === "wc2"))
    && roomRow(r2, context, r2.meta.rooms.find((r) => r.id === "wc2")).text === "Standard WC; no special requirements.");
  ok("an unfinished brief doesn't count", !hasRoomBrief(register, register.meta.rooms.find((r) => r.id === "lv")));
  const { register: r3 } = load((j) => { j.register.items.push({ id: "n2", kind: "item", promptKey: "R-004", itemKind: "requirement", section: "room", roomId: "dn", category: "layout", description: "Seats eight, opens to the deck",
    answer: { v: 1, state: "recorded", nature: "requirement", selected: [], connectsTo: ["kt", "outside"], usedBy: ["whole_family"] }, quantity: 18, unit: "m²" }); });
  const dn = roomRow(r3, context, r3.meta.rooms.find((r) => r.id === "dn"));
  ok("a room brief prints with what it connects to, who uses it and its rough size", dn.text === "Seats eight, opens to the deck. Connects to the kitchen and outside. Used by whole family. About 18 m².", dn.text);
}

section("Who and by when (S4): actionRole and actionDue");
{
  const it = makeItem({ id: "w1", promptKey: "W-014", itemKind: "selection", responsibility: "consultant", actionRole: "engineer", actionDue: "next_issue", nextAction: "Size the box gutter" });
  ok("a consultant with actionRole engineer reads Engineer", whoOf(context, it).label === "Engineer" && whoOf(context, it).key === "engineer");
  ok("actionRole is dropped when the who isn't a consultant", makeItem({ responsibility: "client", actionRole: "engineer" }).actionRole === "");
  ok("actionDue keeps next issue, next meeting or a date, nothing else", makeItem({ actionDue: "next_meeting" }).actionDue === "next_meeting" && makeItem({ actionDue: "2026-11-28" }).actionDue === "2026-11-28" && makeItem({ actionDue: "soon" }).actionDue === "");
  ok("by-when words", dueLabel("next_issue") === "Next issue" && dueLabel("2026-11-28") === "28 Nov" && dueLabel("") === "");
  const { register: r4 } = load((j) => { const g = j.register.items.find((i) => i.id === "i27"); g.responsibility = "architect"; g.actionDue = "next_issue"; });
  const m4 = architectBriefModel(r4, context, {});
  ok("a by-when on any point brings the By column, and the point moves to the architect's group", m4.hasBy && m4.points.find((p) => p.ids[0] === "i27").by === "Next issue" && m4.points.findIndex((p) => p.ids[0] === "i27") < 3);
  const named = { ...context, consultants: [{ role: "architect", name: "Jo Bright", company: "Bright Studio", status: "active" }] };
  ok("a named architect names the brief and the Who column", architectBriefModel(register, named, {}).preparedFor === "Jo Bright, Bright Studio" && architectBriefModel(register, named, {}).points[0].who === "Bright Studio"
    && !contentChecks("architect_brief", register, named).some((c) => c.key === "architect"));
  ok("open points 'everything open' adds the client's finish choices (bedroom floor, splashback)", openPoints(register, context, { scope: "all" }).length === 11 && openPoints(register, context).length === 9);
  // Storage: a screen from before the fields can't wipe them; the merge carries them.
  const before = makeItem({ id: "m1", responsibility: "consultant", actionRole: "energy", actionDue: "next_issue" });
  const merged = mergeItem(before, { ...before, actionDue: "2026-12-01" }, before).item;
  ok("the three-way merge carries actionDue", merged.actionDue === "2026-12-01" && merged.actionRole === "energy");
  const round = readRegister({ selections_schedule: writeRegister({ meta: emptyMeta({}), items: [before] }) }).items[0];
  ok("the lead scratchpad keeps them", round.actionRole === "energy" && round.actionDue === "next_issue");
}

section("Budget (owner decision 1) and floors");
ok("band words", budgetWords(800000, 1000000) === "$800k–$1m" && budgetWords(null, 400000) === "Under $400k" && budgetWords(1500000, null) === "Over $1.5m" && budgetWords(750000, 900000) === "$750k–$900k");
const conf = { ...context, budget: { ...context.budget, min: 800000, max: 1000000, confirmed: true } };
ok("a confirmed band prints, in the one form the money check allows", budgetLine(conf) === "$800k–$1m construction budget, ex GST (the client's figure)." && BUDGET_BAND_RX.test(budgetLine(conf)));
ok("an unconfirmed band doesn't print", budgetLine({ ...conf, budget: { ...conf.budget, confirmed: false } }) === "" && architectBriefModel(register, { ...conf, budget: { ...conf.budget, confirmed: null } }).project.find((r) => r.key === "budget").text === "To be confirmed by Blue Leaf.");
ok("the upper-floor hint fires on one floor, not on two", !!upperFloorHint(register) && !upperFloorHint(load((j) => { j.register.meta.rooms[2].level = "Upper"; }).register));
{
  const { register: r5 } = load((j) => { for (const id of ["bd3", "bd4", "b1"]) j.register.meta.rooms.find((r) => r.id === id).level = "Upper"; });
  const m5 = architectBriefModel(r5, context, {});
  ok("two floors: bands 'Ground floor' and 'Upper floor', rooms under their own", m5.floorBands && flat(m5.roomGroups.map((g) => g.floor)) === flat(["Ground floor", "Upper floor"])
    && m5.roomGroups[1].rows.some((r) => r.room === "Bathroom"), flat(m5.roomGroups.map((g) => [g.floor, g.rows.map((r) => r.room)])));
}

section("Altered (owner decision 4) and the room's Work as the only scope");
ok("'Altered' is a work word; old labels read 'No change' and 'Not in this job'", ROOM_SCOPES.altered === "Altered" && ROOM_SCOPES.existing_remain === "No change" && ROOM_SCOPES.not_in_scope === "Not in this job");
ok("an unknown scope from a newer screen is kept, never turned into New", makeRoom({ scope: "rebuilt_later" }).scope === "rebuilt_later" && makeRoom({ scope: "" }).scope === "new" && makeRoom({ scope: "BAD VALUE" }).scope === "new");
{
  const { register: r6 } = load((j) => { j.register.meta.rooms.find((r) => r.id === "e").scope = "altered"; });
  const entry = architectBriefModel(r6, context, {}).roomGroups[0].rows.find((r) => /Entry/.test(r.room));
  ok("an Altered room prints 'Altered'; its 'Alter' answer agrees", entry.work === "Altered" && disagreeingScope(r6, r6.meta.rooms.find((r) => r.id === "e")).length === 0);
  const { register: r7 } = load((j) => { j.register.meta.rooms.find((r) => r.id === "wc2").scope = "not_in_scope"; });
  const m7 = architectBriefModel(r7, context, {});
  ok("a room not in this job leaves 04 and is listed in 06", !m7.roomGroups[0].rows.some((r) => /WC 2/.test(r.room)) && m7.outside[0].text === "WC 2.");
}

section("Words");
ok("unfinished: ends with -, : or —", isUnfinished("stairs - ") && isUnfinished("Note:") && !isUnfinished("love the curves "));
ok("tidy: ' - ' reads as a comma, spaces collapse, a capital", tidy("feature range hood - meditrean  curved") === "Feature range hood, meditrean curved");
ok("chip words: a shared branch once, an attribute group dropped", chipWords(item(register, "i14")) === "Walk-in, niche, hobless" && chipWords(item(register, "i33")) === "Square set, flat" && chipWords(item(register, "i47")) === "Rendered AAC");

console.log(`\nregister-brief-model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
