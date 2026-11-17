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
  BUDGET_BAND_RX, disagreeingScope, hasRoomBrief, isEmptyRecord, briefSectionTitles, forNextIssue, HELD_BACK_WORDS, deletableEmpty, referencedIds, waitsAsPoint,
} from "../../src/lib/briefModel.js";
import { contentChecks, roomsNeedingBrief, roomBriefBlocker, upperFloorHint, releaseBlockers } from "../../src/lib/registerQuality.js";
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
ok("36 printed lines, 48 of 72 records printed, 24 not", lines.length === 36 && m.counts.printed === 48 && m.counts.notPrinted === 24, flat({ lines: lines.length, ...m.counts }));
const reached = new Set([...lines.flatMap((l) => l.ids), ...m.notPrinted.map((x) => x.id)]);
ok("every record is reachable: on a printed line or in 'Not in this brief' with a reason", register.items.every((i) => reached.has(i.id)), register.items.filter((i) => !reached.has(i.id)).map((i) => i.id));
ok("no reference codes in the reading text", !/\b[A-Z]\d{3}-[A-Z0-9]{3}\b/.test(allText));
ok("engineered stone is never printed (the benchtop says why it is open, as S6 line 2)", !/engineered stone/i.test(allText) && /Kitchen benchtop: material still to be chosen; designer to confirm\./.test(allText));
ok("no contradiction or fragment prints ('New kitchen', 'Retain', 'stairs -', 'curtain -')", !/New kitchen|\bRetain\b|stairs -|curtain|shouldn't/.test(allText), allText.match(/New kitchen|\bRetain\b|stairs -|curtain|shouldn't/g));
ok("01: what's planned, funding and timing, budget to be confirmed, priorities", flat(m.project.map((r) => r.text)) === flat(["An extension and renovation: 16 rooms, 8 new and 8 renovated.",
  "Cash. Target start April 2027.", "To be confirmed by Blue Leaf.", "Natural light and space. Quality priorities: upgraded."]), flat(m.project.map((r) => r.text)));
ok("02: council and zone, bushfire, complexity, access, occupancy", flat(m.site.map((r) => r.label)) === flat(["Council and zone", "Bushfire", "Site complexity", "Access", "During the works"])
  && m.site[0].text === "City of Seaview. Hills Neighbourhood zone." && m.site[1].text === "In a mapped bushfire area. BAL to be assessed.", flat(m.site));
ok("03: the seven whole-house and site points in print order (architect, energy assessor, client, then to be agreed)", flat(m.points.map((p) => p.who)) === flat(["Architect", "Architect", "Energy assessor", "Client", "To be agreed", "To be agreed", "To be agreed"]), flat(m.points.map((p) => p.who)));
ok("03: retaining and pool asked once", m.points.at(-1).text === "Retaining and pool: are they part of this job?" && flat(m.points.at(-1).ids) === flat(["i71", "i72"]));
ok("03: '(agreed with the client)' only on an evidenced approval", m.points.filter((p) => /agreed with the client/.test(p.text)).map((p) => p.ids[0]).join() === "i07,i08");
ok("03: one parenthesis when both notes apply (D4): '(agreed with the client; for consultant review)'", /6\.0 \(agreed with the client; for consultant review\)\.$/.test(m.points[2].text) && !/\) \(/.test(allText), m.points[2].text);
ok("03: no By column while no point has a by-when", m.hasBy === false && m.points.every((p) => !p.by));
const rooms = m.roomGroups[0].rows;
ok("04: one floor, no bands; rooms with content in walk order, then the bare rooms grouped by Work", !m.floorBands && flat(rooms.map((r) => r.room)) === flat(["Living", "Kitchen", "Pantry", "Laundry", "Bathroom", "Bedroom",
  "Entry, Bathroom 2, Ensuite, Bedroom 2", "Dining, Bedroom 3, Bedroom 4, WC, WC 2, Lounge"]), flat(rooms.map((r) => r.room)));
ok("04: the Kitchen prints its brief, must-haves and cooking; Work from the room card", rooms[1].work === "Renovated" && !rooms[1].placeholder
  && rooms[1].text === "Feature range hood, meditrean curved micro cement, love the curves. Layout & family use: island. Storage: full-height, walk-in, drawers. Cooking & exhaust: induction.", rooms[1].text);
ok("04: the Living's 'stairs -' is held back, so its brief is to follow", rooms[0].placeholder && /^Layout, outlook & acoustics: gas fire place/.test(rooms[0].text));
ok("04: 'Pantry' in a pantry is skipped, but the record still rides on the row", !/Layout & family use: pantry/i.test(rooms[2].text) && rooms[2].ids.includes("i57"));
ok("04: the laundry's cabinetry (a house default reaching only the laundry) prints in its row", rooms[3].text.startsWith("Cabinetry, bench & trough: cabinetry, bench, splashback, mixer, trough.") && rooms[3].ids.includes("i44"));
ok("04: the laundry's own open point prints in its row with Who (group by room), and is not in 03", rooms[3].text.endsWith("Open: Washer / dryer layout: still to be decided. Who: To be agreed.")
  && rooms[3].open.length === 1 && rooms[3].ids.includes("i61") && !m.points.some((p) => p.ids.includes("i61")), rooms[3].text);
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

section("Empty answers hold nothing at all (review B1)");
{
  const brief = (extra) => makeItem({ id: "rb", promptKey: "R-004", itemKind: "requirement", section: "room", roomId: "ld", category: "layout", ...extra });
  const withBrief = (it) => ({ meta: register.meta, items: [...register.items.filter((i) => !(i.roomId === "ld" && i.promptKey === "R-004")), it] });
  const ld = register.meta.rooms.find((r) => r.id === "ld");
  const links = brief({ answer: { v: 1, state: "recorded", nature: "requirement", selected: [], connectsTo: ["kt"] } });
  const users = brief({ answer: { v: 1, state: "recorded", nature: "requirement", selected: [], usedBy: ["whole_family"] } });
  const size = brief({ quantity: 6, unit: "m²" });
  ok("a room brief holding only 'Connects to' isn't empty", !isEmptyRecord(links));
  ok("…nor one holding only 'Who uses it'", !isEmptyRecord(users));
  ok("…nor one holding only a rough size", !isEmptyRecord(size));
  for (const [what, it] of [["links", links], ["users", users], ["size", size]]) {
    const r = withBrief(it);
    const cc2 = contentChecks("architect_brief", r, context, architectBriefModel(r, context, {}));
    ok(`the empty-answers check never offers the room brief (${what})`, !cc2.some((c) => c.key.startsWith("empty") && c.targets.some((t) => t.id === "rb")));
    ok(`'Not in this brief' never calls it empty (${what})`, !architectBriefModel(r, context, {}).notPrinted.some((x) => x.id === "rb" && x.group === "empty"));
  }
  ok("the Laundry row still prints what the brief holds", roomRow(withBrief(links), context, ld).text.includes("Connects to the kitchen.") && roomRow(withBrief(users), context, ld).text.includes("Used by whole family.")
    && roomRow(withBrief(size), context, ld).text.includes("About 6 m²."), roomRow(withBrief(links), context, ld).text);
  ok("…and the row stands for it (a tap opens it)", roomRow(withBrief(links), context, ld).ids.includes("rb"));
  ok("a choice holding only a manufacturer isn't empty", !isEmptyRecord(makeItem({ promptKey: "K-008", itemKind: "selection", roomId: "kt", category: "appliances", manufacturer: "Miele" })));
  ok("…nor one with a colour, a supplier, a by-when, evidence or a 'Not needed here'", ["colour", "supplier"].every((f) => !isEmptyRecord(makeItem({ promptKey: "K-008", [f]: "x" })))
    && !isEmptyRecord(makeItem({ promptKey: "K-008", actionDue: "next_issue" })) && !isEmptyRecord(makeItem({ promptKey: "K-008", evidence: { at: "2026-11-15", by: "Sam" } }))
    && !isEmptyRecord(makeItem({ promptKey: "K-008", answer: { v: 1, state: "not_applicable", selected: [] } })));
  ok("…nor one on the client portal or in the contract baseline", !isEmptyRecord(makeItem({ promptKey: "K-008", sync: { clientVisible: true } })) && !isEmptyRecord(makeItem({ promptKey: "K-008", sync: { baselined: true } })));
  ok("an answer from a newer screen is never empty", !isEmptyRecord(makeItem({ promptKey: "K-008", answer: { v: 99, state: "recorded" } })));
  ok("a blank seeded row (areas, owner, answer version) is still empty", isEmptyRecord(makeItem({ promptKey: "W-017", responsibility: "client", answer: { v: 1, state: "not_discussed", areaIds: ["kt"] } })));
  ok("the real job's three empty Laundry answers are still offered, with their place for the confirm", cc.at(-1).targets.map((t) => t.id).join() === "i62,i63,i64" && cc.at(-1).place === "Laundry");
}

section("'Delete all empty' never takes a choice or a record something points at (review R6)");
{
  const withItems = (...extra) => ({ meta: register.meta, items: [...register.items, ...extra.map((x) => makeItem(x))] });
  const emptyIds = (r, o) => (contentChecks("architect_brief", r, context, null, o).filter((c) => c.action === "delete_empty").flatMap((c) => c.targets.map((t) => t.id)));
  // An Other zone's label is typed words (registerChoice: "the only copy of what was said"), and a zone picked on a
  // question whose zones are a choice (cladding) is a choice.
  const other = { id: "z1", promptKey: "W-013", itemKind: "selection", category: "cladding", answer: { v: 1, state: "not_discussed", selected: [], zone: { key: "other", label: "Rear studio walls" } } };
  const chosen = { id: "z2", promptKey: "W-013", itemKind: "selection", category: "cladding", answer: { v: 1, state: "not_discussed", selected: [], zone: { key: "main_walls", label: "Main walls" } } };
  const otherFloor = { id: "z3", promptKey: "W-017", itemKind: "selection", category: "flooring", answer: { v: 1, state: "not_discussed", selected: [], zone: { key: "other_zone", label: "Rear studio walls" } } };
  ok("an Other zone's typed label isn't empty", !isEmptyRecord(makeItem(other)));
  ok("…nor is a zone picked on a question whose zones are a choice", !isEmptyRecord(makeItem(chosen)));
  ok("…nor an Other zone 'Rear studio walls' on a floor laid out one row per zone", !isEmptyRecord(makeItem(otherFloor)));
  const rz = withItems(other, chosen, otherFloor);
  ok("none is offered for deletion", !emptyIds(rz).some((id) => ["z1", "z2", "z3"].includes(id)) && !deletableEmpty(rz).some((i) => ["z1", "z2", "z3"].includes(i.id)));
  ok("'Not in this brief' never calls them empty", !architectBriefModel(rz, context, {}).notPrinted.some((x) => ["z1", "z2", "z3"].includes(x.id) && x.group === "empty"));
  // A roof row with nothing on it yet, with a gutter row linked under it.
  const roof = { id: "rf1", promptKey: "W-014", itemKind: "selection", category: "roof", answer: { v: 1, state: "not_discussed", selected: [] } };
  const gutter = { id: "gt1", promptKey: "W-014", itemKind: "selection", category: "roof", answer: { v: 1, state: "recorded", selected: [], element: { id: "el_g", key: "gutters", label: "Gutters" }, linkedItemIds: ["rf1"] } };
  const rg = withItems(roof, gutter);
  ok("the empty roof row is still empty on its own", isEmptyRecord(item(rg, "rf1")));
  ok("…but a row linked under it points at it, so it isn't offered", referencedIds(rg).has("rf1") && !emptyIds(rg).includes("rf1") && !deletableEmpty(rg).some((i) => i.id === "rf1"));
  ok("…and without the gutter row it is", emptyIds(withItems(roof)).includes("rf1"));
  // A whole-house default that a room's own answer overrides, and one a room confirmed.
  const def = { id: "df1", promptKey: "W-018", itemKind: "selection", category: "doors", isDefault: true, answer: { v: 1, state: "not_discussed", selected: [] } };
  const own = { id: "ow1", promptKey: "W-018", itemKind: "selection", category: "doors", roomId: "kt", overridesDefaultId: "df1", description: "Cavity slider" };
  ok("a default a room's own answer overrides isn't offered", !emptyIds(withItems(def, own)).includes("df1") && emptyIds(withItems(def)).includes("df1"));
  const confirmed = { meta: { ...register.meta, rooms: register.meta.rooms.map((r) => (r.id === "kt" ? { ...r, defaultConfirmations: { df1: { at: "2026-11-17T01:00:00Z", by: "Sam" } } } : r)) }, items: [...register.items, makeItem(def)] };
  ok("…nor one a room confirmed", referencedIds(confirmed).has("df1") && !emptyIds(confirmed).includes("df1"));
  ok("records a received document links (keepIds) aren't offered either", !emptyIds(register, { keepIds: ["i63"] }).includes("i63") && emptyIds(register, { keepIds: ["i63"] }).join() === "i62,i64");
  ok("the real job: the three Laundry answers are still the ones offered", deletableEmpty(register).map((i) => i.id).join() === "i62,i63,i64");
}

section("A zone that came with its row is seed data: a slot tapped then cleared is still empty (round 3, M1)");
{
  const withItems = (...extra) => ({ meta: register.meta, items: [...register.items, ...extra.map((x) => makeItem(x))] });
  const emptyIds = (r) => (contentChecks("architect_brief", r, context, null).filter((c) => c.action === "delete_empty").flatMap((c) => c.targets.map((t) => t.id)));
  const cleared = (id, promptKey, category, key, label, extra = {}) => ({ id, promptKey, itemKind: "selection", category, ...extra, answer: { v: 1, state: "not_discussed", selected: [], zone: { key, label } } });
  // The fixed-zone slots ChoiceRepeat / PromptRow lay out (seedFor): floors, paint surfaces, and the whole-house kitchen and wet-area standards.
  const slots = [
    cleared("s1", "W-017", "flooring", "bedroom_floor", "Bedroom floor"),
    cleared("s2", "W-019", "painting", "walls", "Walls"),
    cleared("s3", "K-005", "kitchen", "kitchen", "Kitchen"),
    cleared("s4", "B-008", "wet_areas", "ensuite", "Ensuite"),
    cleared("s5", "K-004", "kitchen", "scullery", "Scullery"),
  ];
  const ids = slots.map((s) => s.id);
  for (const s of slots) ok(`a cleared ${s.promptKey} '${s.answer.zone.label}' slot is empty`, isEmptyRecord(makeItem(s)), flat(s));
  const rs = withItems(...slots);
  ok("…so 'Delete all empty answers' offers them", ids.every((id) => emptyIds(rs).includes(id)) && ids.every((id) => deletableEmpty(rs).some((i) => i.id === id)), flat(emptyIds(rs)));
  const np = Object.fromEntries(architectBriefModel(rs, context, {}).notPrinted.filter((x) => ids.includes(x.id)).map((x) => [x.id, x.group]));
  ok("…and 'Not in this brief' calls them empty, never 'in the schedule'", ids.every((id) => np[id] === "empty"), flat(np));
  ok("a bare 'Other zone' slot with no words typed is empty too", isEmptyRecord(makeItem(cleared("s6", "W-017", "flooring", "other_zone", "Other zone"))));
  ok("a slot with a finish on it isn't empty", !isEmptyRecord(makeItem({ ...cleared("s7", "W-017", "flooring", "bedroom_floor", "Bedroom floor"),
    answer: { v: 1, state: "recorded", selected: [{ optionId: "wool", path: ["carpet", "wool"], label: "Wool" }], zone: { key: "bedroom_floor", label: "Bedroom floor" } } })));
  ok("…nor one with words typed on it", !isEmptyRecord(makeItem({ ...cleared("s8", "W-019", "painting", "ceiling", "Ceiling"), description: "Raked ceiling in the living room" })));
  ok("a zone this screen doesn't know is kept (never offered)", !isEmptyRecord(makeItem(cleared("s9", "W-017", "flooring", "mezzanine_floor", "Mezzanine floor"))));
  ok("a kitchen standard's zone inside a room is not a laid-out slot, so it is kept", !isEmptyRecord(makeItem(cleared("s10", "K-005", "kitchen", "kitchen", "Kitchen", { roomId: "kt" }))));
}

section("Open work never prints as settled (review R2; D3 only takes Blue Leaf's own points out of 03)");
{
  const shed = (responsibility) => load((j) => {
    j.register.items.push({ id: "sh1", kind: "item", promptKey: "W-004", itemKind: "scope", section: "site", category: "existing", disposition: "remove", description: "Demolish the rear shed",
      nextAction: "Client to confirm the shed goes", responsibility });
    j.register.items.push({ id: "rw1", kind: "item", itemKind: "scope", roomId: "ld", section: "room", category: "demolition", disposition: "remove", description: "Remove the old trough",
      nextAction: "Client to confirm the trough goes", responsibility });
  }).register;
  const where = (r) => {
    const mm = architectBriefModel(r, context, {});
    const ln = architectBriefLines(mm, {});
    return { mm, sel: ln.filter((l) => l.section === "selections" && l.ids.includes("sh1")).map((l) => l.text), room: ln.filter((l) => l.section === "rooms" && l.ids.includes("rw1")).map((l) => l.text),
      pts: mm.points.filter((p) => p.ids.some((id) => ["sh1", "rw1"].includes(id))), np: Object.fromEntries(mm.notPrinted.filter((x) => ["sh1", "rw1"].includes(x.id)).map((x) => [x.id, x.group])),
      text: ln.map((l) => l.text).join("\n") };
  };
  for (const [who, group] of [["client", "client"], ["", "waiting"]]) {
    const r = shed(who), w = where(r);
    ok(`waiting on ${who || "no one"}: neither record is a point for the next drawing issue`, !forNextIssue(item(r, "sh1")) && !forNextIssue(item(r, "rw1")) && !w.pts.length);
    ok(`…'Demolish the rear shed' doesn't print as settled work in 05`, !w.sel.length && !/rear shed/i.test(w.text) && w.mm.selectionsTitle === "Selections that affect the drawings", flat(w.sel));
    ok(`…nor the Laundry's 'Remove the old trough' in 04`, !w.room.length && !/old trough/i.test(w.text)
      && !/old trough/i.test(roomRow(r, context, r.meta.rooms.find((x) => x.id === "ld")).text), flat(w.room));
    ok(`…both wait in 'Not in this brief' (${group})`, w.np.sh1 === group && w.np.rw1 === group, flat(w.np));
    ok(`…and stay in the Actions list's 'everything'`, ["sh1", "rw1"].every((id) => openPoints(r, context, { scope: "all", merge: false }).some((p) => p.ids.includes(id))));
    ok(`…waitsAsPoint says so`, waitsAsPoint(item(r, "sh1")) && waitsAsPoint(item(r, "rw1")));
  }
  const rb = shed("blue_leaf"), wb = where(rb);
  ok("Blue Leaf's own: not a point in 03 (D3)", !wb.pts.length && !forNextIssue(item(rb, "sh1")) && !waitsAsPoint(item(rb, "sh1")));
  ok("…so the work prints where it belongs: 05 and the Laundry's row", flat(wb.sel) === flat(["Demolish the rear shed."]) && wb.mm.selectionsTitle === "Work and selections that affect the drawings"
    && wb.room.length === 1 && /Remove the old trough\./i.test(wb.room[0]), flat({ sel: wb.sel, room: wb.room }));
  ok("…and isn't also in 'Not in this brief'", !("sh1" in wb.np) && !("rw1" in wb.np));
  // A point for the next drawing issue is still said once, in 03.
  const ra = shed("architect"), wa = where(ra);
  ok("the architect's open work: the site point in 03, the Laundry's point in its row in 04 (not in 05), never twice", wa.pts.length === 1 && !wa.sel.length && wa.room.length === 1 && /Open: Demolition/.test(wa.room[0]) && /Who: Architect/.test(wa.room[0]), flat({ pts: wa.pts.map((p) => p.text), sel: wa.sel, room: wa.room }));
  ok("…and the Laundry's row on its own (How this room reads) agrees: no 'old trough'", !/old trough/i.test(roomRow(ra, context, ra.meta.rooms.find((x) => x.id === "ld")).text));
  // A room must-have the client is still to confirm (a requirement: always for the next drawing issue) is a point in 03 only.
  const mh = load((j) => j.register.items.push({ id: "mh1", kind: "item", promptKey: "L-002", itemKind: "requirement", roomId: "ld", section: "room", category: "layout",
    description: "Folding bench under the window", nextAction: "Client to confirm the bench length", responsibility: "client" })).register;
  const mm2 = architectBriefModel(mh, context, {}), ln2 = architectBriefLines(mm2, {});
  ok("a must-have waiting on the client: a point in the Laundry's row (Who: Client), not in 03", !mm2.points.some((p) => p.ids.includes("mh1")) && forNextIssue(item(mh, "mh1"))
  && ln2.some((l) => l.section === "rooms" && l.ids.includes("mh1") && /Open: Washer \/ dryer layout: client to confirm the bench length\.? Who: Client\./i.test(l.text)), flat(ln2.filter((l) => l.section === "rooms" && /Laundry/.test(l.label))));
ok("…said once, and not in the room's own 'How this room reads'", ln2.filter((l) => /bench length/i.test(l.text)).length === 1
  && !/bench length/i.test(roomRow(mh, context, mh.meta.rooms.find((x) => x.id === "ld")).text));
  // Blue Leaf's own must-have point (D3): not in 03, so it prints in the room's row.
  const mhb = load((j) => j.register.items.push({ id: "mh2", kind: "item", promptKey: "L-002", itemKind: "requirement", roomId: "ld", section: "room", category: "layout",
    description: "Folding bench under the window", nextAction: "Check the window sill height", responsibility: "blue_leaf" })).register;
  const ln3 = architectBriefLines(architectBriefModel(mhb, context, {}), {});
  ok("Blue Leaf's own must-have point isn't in 03 but prints in the Laundry's row", !ln3.some((l) => l.section === "points" && l.ids.includes("mh2"))
    && ln3.some((l) => l.section === "rooms" && l.ids.includes("mh2") && /folding bench under the window/i.test(l.text)), flat(ln3.filter((l) => l.section === "rooms" && /Laundry/.test(l.label))));
}

section("Open work never prints as settled in 06 either (round 3, M2)");
{
  // Open records 06 would otherwise catch: supplied by the client, or by others, while someone is still to confirm them.
  const open = (responsibility, { nextAction = "Client to confirm" } = {}) => load((j) => {
    j.register.items.push({ id: "sh2", kind: "item", promptKey: "W-004", itemKind: "scope", section: "site", category: "existing", disposition: "new", description: "Demolish the rear shed",
      supplyBy: "client", nextAction, responsibility });
    j.register.items.push({ id: "rw2", kind: "item", itemKind: "scope", roomId: "ld", section: "room", category: "demolition", disposition: "new", description: "Install the old trough",
      supplyBy: "client", nextAction, responsibility });
    j.register.items.push({ id: "bo2", kind: "item", itemKind: "scope", section: "site", category: "landscaping", disposition: "by_others", description: "Front fence and gate",
      nextAction, responsibility });
  }).register;
  const ids = ["sh2", "rw2", "bo2"];
  const where = (r) => {
    const mm = architectBriefModel(r, context, {}), ln = architectBriefLines(mm, {});
    return { mm, out: ln.filter((l) => l.section === "outside" && l.ids.some((id) => ids.includes(id))).map((l) => l.text),
      np: Object.fromEntries(mm.notPrinted.filter((x) => ids.includes(x.id)).map((x) => [x.id, x.group])), text: ln.map((l) => l.text).join("\n") };
  };
  for (const [who, group] of [["client", "client"], ["", "waiting"]]) {
    const r = open(who), w = where(r);
    ok(`waiting on ${who || "no one"}: none prints in 06 as 'Supplied by the client' or 'By others'`, !w.out.length && !/rear shed|old trough|front fence/i.test(w.text), flat(w.out));
    ok(`…they wait in 'Not in this brief' (${group})`, ids.every((id) => w.np[id] === group), flat(w.np));
    ok(`…and stay in the Actions list's 'everything'`, ids.every((id) => openPoints(r, context, { scope: "all", merge: false }).some((p) => p.ids.includes(id))));
  }
  // Settled (no next action): 06 still says who supplies it or who does it.
  const rSettled = open("client", { nextAction: "" }), settled = where(rSettled);
  ok("settled: 'By others' still prints in 06", settled.out.some((t) => /front fence and gate/i.test(t)), flat(settled.out));
  ok("…the shed prints as work in 05 and the Laundry's record in its row", architectBriefLines(settled.mm, {}).some((l) => l.section === "selections" && l.ids.includes("sh2"))
    && /old trough/i.test(roomRow(rSettled, context, rSettled.meta.rooms.find((x) => x.id === "ld")).text), flat(settled.mm.selections));
  ok("…and none of them is left in 'Not in this brief'", !ids.some((id) => id in settled.np), flat(settled.np));
}

section("The Actions count records; the brief merges in-or-out elements (review N13)");
{
  const next = openPoints(register, context, { scope: "next_issue", merge: false });
  ok("merge false: 10 next-issue points, 12 in everything", next.length === 10 && openPoints(register, context, { scope: "all", merge: false }).length === 12);
  ok("Retaining and Pool are their own rows", next.filter((p) => p.inOut).map((p) => p.label).join() === "Retaining,Pool" && next.every((p) => p.ids.length === 1));
  ok("…5 with no one named", next.filter((p) => p.who.key === "none").length === 5);
  ok("the default still merges (the printed 03 asks once)", openPoints(register, context).length === 9 && m.points.at(-1).text === "Retaining and pool: are they part of this job?");
  const unnamed = cc.find((c) => c.key === "unnamed");
  ok("'Name who' counts 5 and names each", unnamed.text === "5 points for the next drawing issue have no one named: Gutters, Main walls, Washer / dryer layout, Retaining, Pool.", unnamed.text);
}

section("Blue Leaf's own actions are our list only (decision D3)");
{
  const { register: r8 } = load((j) => {
    j.register.items.push({ id: "bl1", kind: "item", promptKey: "W-025", itemKind: "action", section: "project", category: "notes", description: "Get the window quote", nextAction: "Get the window quote", responsibility: "blue_leaf" });
    j.register.items.push({ id: "bl2", kind: "item", promptKey: "W-015", itemKind: "requirement", section: "project", category: "windows", description: "Thermally broken frames", nextAction: "Price the upgrade", responsibility: "blue_leaf" });
  });
  const m8 = architectBriefModel(r8, context, {});
  ok("not for the next drawing issue, whatever the record", !forNextIssue(item(r8, "bl1")) && !forNextIssue(item(r8, "bl2")));
  ok("not in 03; still in the Actions list's 'everything'", !m8.points.some((p) => p.ids.some((id) => ["bl1", "bl2"].includes(id))) && openPoints(r8, context, { scope: "all" }).filter((p) => p.who.key === "blue_leaf").length === 2);
  ok("a requirement with our follow-up still prints what it needs in 01", m8.project.some((r) => r.ids.includes("bl2") && /Thermally broken frames/.test(r.text)));
  ok("the action itself is kept for the office in 'Not in this brief'", m8.notPrinted.some((x) => x.id === "bl1" && x.group === "office"));
}

section("Release blockers in the browser match the server (review N2)");
{
  const rb = releaseBlockers("architect_brief", register, { recipientName: "", drawingBasis: "DA rev 3" });
  ok("the real job: 3 to fix, the law first and the recipient last", flat(rb.map((b) => b.key)) === flat(["restricted:i38", "room_briefs", "recipient"]), flat(rb.map((b) => b.key)));
  ok("the stone line is short and names the record, the full guidance rides on its target", rb[0].text === "Kitchen benchtop names engineered stone. It can't be supplied or installed in Australia — agree another benchtop with the client and change the record."
    && /in a selection that will be supplied/.test(rb[0].targets[0].help) && rb[0].targets[0].id === "i38", rb[0].text);
  ok("the room-brief rule names its Work words", rb[1].text.startsWith("15 new or renovated rooms have no room brief"));
  ok("an architect named and a recipient: 2", releaseBlockers("architect_brief", register, { recipientName: "Jo Bright", drawingBasis: "DA rev 3" }).length === 2);
  const { register: r9 } = load((j) => {
    j.register.meta.planRev = "";
    j.register.items.find((i) => i.id === "i06").certainty = "client_approved";
    Object.assign(j.register.items.find((i) => i.id === "i27"), { technicalStatus: "verified", technicalEvidence: { at: "2026-11-15", by: "Sam" } });
  });
  const rb9 = releaseBlockers("architect_brief", r9, { recipientName: "Jo Bright" });
  ok("drawing basis (read from the register), approvals without evidence and verified without a reference all count", ["drawing_basis", "approvals", "verified"].every((k) => rb9.some((b) => b.key === k)), flat(rb9.map((b) => b.key)));
  ok("…in plain words, pointing to The project", rb9.find((b) => b.key === "drawing_basis").text === "Record the current drawing set / revision on The project before issuing."
    && rb9.find((b) => b.key === "approvals").text.startsWith("1 item is marked client-approved without evidence"));
  ok("an internal document isn't stopped by the stone (it warns on the server)", !releaseBlockers("tender_scope_notes", register, { recipientName: "Estimating", drawingBasis: "DA rev 3" }).some((b) => b.key.startsWith("restricted")));
  ok("another client document keeps the full guidance as its line", /in a selection that will be supplied/.test(releaseBlockers("client_brief", register, { recipientName: "Client", drawingBasis: "DA rev 3" })[0].text));
}

section("Room-brief rule words, the work clash and held-back words (reviews N14, P3)");
{
  const { register: ra } = load((j) => { j.register.meta.rooms.find((r) => r.id === "e").scope = "altered"; });
  ok("an Altered room without a brief: 'new, renovated or altered rooms'", roomBriefBlocker(ra).text.startsWith("15 new, renovated or altered rooms have no room brief"), roomBriefBlocker(ra).text);
  const { register: rb } = load((j) => { j.register.meta.rooms = j.register.meta.rooms.filter((r) => r.id === "e"); j.register.meta.rooms[0].scope = "altered"; j.register.items = j.register.items.filter((i) => !i.roomId || i.roomId === "e"); });
  ok("one Altered room: '1 altered room has no room brief'", roomBriefBlocker(rb).text === "1 altered room has no room brief: Entry.", roomBriefBlocker(rb).text);
  const clash = cc.find((c) => c.key === "scope_clash");
  ok("the work clash names the Work as the screen does, and has its own Fix", /Kitchen is Renovated;/.test(clash.text) && !/_/.test(clash.text) && clash.action === "clash" && clash.targets.length === 3);
  const { register: rc } = load((j) => { j.register.meta.rooms.find((r) => r.id === "kt").scope = "existing_remain"; });
  ok("…'No change', never a key", /Kitchen is No change;/.test(contentChecks("architect_brief", rc, context).find((c) => c.key === "scope_clash").text));
  ok("a contradiction reads the status's own label", cc.find((c) => c.key.startsWith("contradicts")).text === "Trees, retaining & external structures says “Retain” but is marked New. It won't print until they agree.");
  ok("held-back words read after 'Won't print:' with one colon", `Won't print: ${HELD_BACK_WORDS.unfinished}.` === "Won't print: unfinished — it ends mid-thought.");
}

section("Open points never print a choice that can't be offered (review N20)");
{
  const { register: rs } = load((j) => { const b = j.register.items.find((i) => i.id === "i38"); b.answer.state = "recorded"; b.answer.unresolved = null; b.technicalStatus = "needs_verification"; });
  const p = openPoints(rs, context).find((x) => x.ids.includes("i38"));
  ok("a K-005 with engineered stone chosen and a check open: says why it's open, not the stone", p && p.text === "Kitchen benchtop: material still to be chosen; designer to confirm." && !/engineered stone/i.test(p.text), p?.text);
  const { register: rt } = load((j) => { const b = j.register.items.find((i) => i.id === "i38"); b.answer.state = "recorded"; b.answer.unresolved = null; b.technicalStatus = "needs_verification";
    b.answer.selected.push({ label: "Porcelain", optionId: "porcelain", path: ["porcelain"] }); });
  ok("…with another option chosen too, only that one is confirmed", openPoints(rt, context).find((x) => x.ids.includes("i38")).text === "Kitchen benchtop: confirm porcelain.", openPoints(rt, context).find((x) => x.ids.includes("i38")).text);
}

section("What prints grey, and the section numbers (reviews P5, N19)");
{
  const ln = (label) => lines.find((l) => l.label === label);
  ok("grey only for gaps that block issue: Prepared for and Brief to follow", ln("Prepared for").placeholder && !ln("Budget").placeholder && ln("Budget").gap && ln("Living").placeholder);
  ok("the drawing basis is grey only when it's missing", !ln("Drawing basis").placeholder && architectBriefLines(m, {}).find((l) => l.label === "Drawing basis").placeholder);
  ok("a room line greys only 'Brief to follow.'", flat(ln("Pantry").segments) === flat([{ text: "Renovated · ", muted: false }, { text: "Brief to follow.", muted: true }, { text: " Storage: walk-in, appliance garage, full-height.", muted: false }])
    && !ln("Kitchen").segments, flat(ln("Pantry").segments));
  ok("the real job: 01–05 as the PDF numbers them", flat(briefSectionTitles(m)) === flat({ cover: "Cover", project: "01 The project", site: "02 Site and constraints", points: "03 Needed for the next drawing issue",
    rooms: "04 Rooms", selections: "05 Selections that affect the drawings", outside: "Outside this job" }), flat(briefSectionTitles(m)));
  const noSite = { ...m, site: [] };
  ok("no site rows: the next-issue list is 02", briefSectionTitles(noSite).points === "02 Needed for the next drawing issue" && briefSectionTitles(noSite).selections === "04 Selections that affect the drawings");
  ok("with work recorded house-wide, 05 is retitled", briefSectionTitles({ ...m, selectionsTitle: "Work and selections that affect the drawings" }).selections === "05 Work and selections that affect the drawings");
}

section("An upside-down budget never prints (review N26)");
{
  ok("budgetWords(1.2m, 800k) is empty", budgetWords(1200000, 800000) === "");
  const inv = { ...context, goals: { ...context.goals, vision: "Light", keyRequirements: "Island" }, budget: { ...context.budget, min: 1200000, max: 800000, confirmed: true } };
  ok("…so the brief says to be confirmed, even when ticked", budgetLine(inv) === "" && architectBriefModel(register, inv).project.find((r) => r.key === "budget").text === "To be confirmed by Blue Leaf.");
  ok("…and 'Before you send' says why", contentChecks("architect_brief", register, inv).some((c) => c.key === "budget_band" && c.targets[0].key === "budget" && /lower figure is more than its upper figure/.test(c.text)));
}

console.log(`\nregister-brief-model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
