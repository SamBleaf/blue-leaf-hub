/**
 * documents-cpb.test.mjs — Client Project Brief (BLB-CPB, template cpb-2.3), doc suite checkpoint 4.
 * What the homeowner's brief may and may not say, built from real register records through the real builder, plus the
 * template's structure and a real LibreOffice render. No server, no database.
 * Run: node scripts/tests/documents-cpb.test.mjs
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import { buildRegisterFixture, renderRegisterDocument, registerDocChecks, legacyProjectRef, cpbPathway, fontVerdict, siteAccessSentence, adelaideDay } from "../../server/lib/registerDocuments.mjs";
import { DOC_DEFS, buildClientBriefPayload, boundedRows, PLACEHOLDER_RX } from "../../server/lib/documents/documentPayloads.mjs";
import { pdfFontNames } from "../../server/lib/docxToPdf.mjs";
import { restrictedFindings, restrictedInText } from "../../src/lib/restrictedProducts.js";
import { BASELINE_CATEGORIES } from "../../src/lib/registerGuidance.js";
import { makeItem, makeRoom, refCode, toggleOption } from "../../src/lib/register.js";
import { ANSWER_CONFIG } from "../../src/lib/registerQuestions.js";
import { documentIdentity, issueRevisionLabel } from "../../server/lib/documents/documentIdentity.mjs";
import { REGISTER_PROJECTS, plansSuppliedRevision, KESTREL_SUPPLIED_PLANS } from "../documents/fixtures/register-projects.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const flat = (o) => JSON.stringify(o);
const ISSUED = { status: "Issued", issuedDate: "2026-11-15", revision: 1, issuer: "Blue Leaf Building", recipientName: "Jordan & Mia Whitcombe" };
const build = (name, more = {}, tweak) => { const p = REGISTER_PROJECTS[name](); tweak?.(p); return { p, fx: buildRegisterFixture("client_brief", { lead: p.lead, context: p.context, register: p.register, projectRef: p.projectRef, ...ISSUED, ...more }) }; };

const { p: kp, fx } = build("kestrel");
const cb = fx.clientBrief;
const texts = (list) => list.map((x) => x.text);
const block = (label) => cb.boundaries.find((b) => b.label === label)?.items || [];

section("What the brief says, and doesn't");
ok("scope lines are plain words; the reference stays in the record, not in the client's sentence (CPB-06)", cb.scopeIn.length >= 8 && cb.scopeIn.every((x) => !/\[|\]/.test(x.text) && /^[A-Z]\d{3}-[0-9A-Z]{3}$/.test(x.ref))
  && buildClientBriefPayload(fx).SCOPE_IN.every((x) => !("REF" in x)) && buildClientBriefPayload(fx).BOUNDARIES.every((g) => g.B_ITEMS.every((x) => !("REF" in x))), flat(cb.scopeIn.slice(0, 2)));
ok("project-wide rows read without a place prefix; room rows name the room", cb.scopeIn.some((x) => x.text.startsWith("Remove the rear wall")) && cb.scopeIn.some((x) => x.text.startsWith("Kitchen and living: ")) && !cb.scopeIn.some((x) => /^(Whole house|Site \/ existing):/.test(x.text)));
ok("a site fact is never work", !flat(cb.scopeIn).includes("Steep"));

section("Room-by-room scope, said once per group of rooms (CPB2-02)");
const { p: rp, fx: rfxScope } = build("ridgeline", { recipientName: "X" });
const rScope = rfxScope.clientBrief.scopeIn.map((x) => x.text);
ok("the long home no longer repeats 'as shown on the concept plans' room by room", !rScope.some((t) => /as shown on the concept plans/.test(t)) && rScope.length === 6, flat(rScope));
ok("a group names its rooms only: no category label to get wrong or repeat (CPB3-01/02)", rScope.includes("New kitchen, scullery, living room, dining room and family room")
  && rScope.includes("New main bedroom, bedrooms 2 to 4, walk-in robe and study") && rScope.includes("New bathroom, ensuite and laundry")
  && !/living areas|bedrooms and study|: /.test(flat(rScope.filter((t) => t.startsWith("New") && !/home/.test(t)))), flat(rScope));
ok("the garage the whole-house line already names isn't printed again; that line keeps its words and gains the garage's reference (CPB3-03)",
  !rScope.includes("New garage") && rfxScope.clientBrief.scopeIn[0].text === "New two-storey home with a double garage on a sloping block"
  && flat(rfxScope.clientBrief.scopeIn[0].refs) === flat([refCode(rp.register.items.find((i) => i.id === "ri_rd_002")), refCode(rp.register.items.find((i) => i.id === "ri_rd_017"))]), flat(rfxScope.clientBrief.scopeIn[0]));
{
  // Every record is accounted for by identity, and every room is named once: as a list item, or in the line it was folded into.
  const generic = rp.register.items.filter((i) => i.promptKey === "R-003" && /as shown on the concept plans/.test(i.description || ""));
  const all = rfxScope.clientBrief.scopeIn;
  const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const roomLines = all.filter((x) => x.refs.length > 1 && x.refs.every((r) => generic.map(refCode).includes(r)));
  const listed = roomLines.flatMap((x) => x.text.replace(/^New\s+/, "").split(/,\s*|\s+and\s+/))
    .flatMap((w) => { const m = w.match(/^(\w+)s (\d+) to (\d+)$/); return m ? Array.from({ length: m[3] - m[2] + 1 }, (_, k) => `${m[1]} ${Number(m[2]) + k}`) : [w]; });
  const scopeRecords = rp.register.items.filter((i) => all.some((x) => x.refs.includes(refCode(i))));
  ok("no scope record is lost: the lines carry exactly the records' references, and every room is named once", generic.length === 15 && sameSet(all.flatMap((x) => x.refs).filter((r) => generic.map(refCode).includes(r)), generic.map(refCode))
    && new Set(all.flatMap((x) => x.refs)).size === all.flatMap((x) => x.refs).length && scopeRecords.length === all.flatMap((x) => x.refs).length
    && sameSet([...listed.map((w) => w.replace(/ room$/, "")), "garage"], rp.register.meta.rooms.map((r) => r.name.toLowerCase().replace(/ room$/, ""))), `${flat(listed)} | ${all.flatMap((x) => x.refs).length} refs`);
}
ok("the drawings are named on page 1, and the scope introduction points to them rather than repeating them room by room", /based on the drawing basis above\./.test(buildClientBriefPayload(rfxScope).SCOPE_INTRO)
  && buildClientBriefPayload(rfxScope).META_ROWS.some((r) => /Concept plans Rev B/.test(r.VB)) && !rScope.some((t) => /Concept plans Rev B/.test(t)));
ok("a room record that says anything more keeps its own line (Kestrel unchanged)", cb.scopeIn.length === 9 && cb.scopeIn.every((x) => x.refs.length === 1 && x.refs[0] === x.ref) && cb.scopeIn.some((x) => x.text === "Main bedroom: New main bedroom in the upper-level extension, overlooking the garden"));
{
  const mk = (rooms, descs, disposition = "new") => { const R = rooms.map(([name, roomType], k) => makeRoom({ id: `t_${k}`, name, roomType, order: k }));
    const dispo = (k) => (Array.isArray(disposition) ? disposition[k] : disposition);
    const reg = { meta: { ...rp.register.meta, rooms: R }, items: R.map((r, k) => makeItem({ id: `ri_t_${k}`, itemKind: "scope", category: "scope", promptKey: "R-003", roomId: r.id, room: r.name, section: "room", disposition: dispo(k), description: descs[k] })) };
    return buildRegisterFixture("client_brief", { lead: rp.lead, context: rp.context, register: reg, projectRef: "0631", ...ISSUED }).clientBrief.scopeIn.map((x) => x.text); };
  ok("a recorded renovation groups as renovated; a specific line stays as typed", flat(mk([["Bathroom", "bathroom"], ["Laundry", "laundry"], ["Kitchen", "kitchen"]], ["Renovate the bathroom", "Laundry: full renovation", "New kitchen in the extension, facing the garden"], "alter"))
    === flat(["Renovated bathroom and laundry", "Kitchen: New kitchen in the extension, facing the garden"]), flat(mk([["Bathroom", "bathroom"], ["Laundry", "laundry"], ["Kitchen", "kitchen"]], ["Renovate the bathroom", "Laundry: full renovation", "New kitchen in the extension, facing the garden"], "alter")));
  ok("the printed work word never contradicts the record: a renovation recorded as New, or 'New' on an Alter record, keeps its typed line (review CPB3-C01)",
    flat(mk([["Powder room", "wc"]], ["Full renovation of the powder room"])) === flat(["Powder room: Full renovation of the powder room"])
    && flat(mk([["Study", "study"]], ["New study as shown on the concept plans"], "alter")) === flat(["Study: New study as shown on the concept plans"]));
  ok("Alter, Renovate and Refurbish are never merged or strengthened: each keeps its own word (review CPB3-C02)",
    flat(mk([["Kitchen", "kitchen"], ["Scullery", "scullery"], ["Living room", "living"]], ["Alter", "Renovate", "Refurbished"], "alter")) === flat(["Alterations to the kitchen", "Renovated scullery", "Refurbished living room"]),
    flat(mk([["Kitchen", "kitchen"], ["Scullery", "scullery"], ["Living room", "living"]], ["Alter", "Renovate", "Refurbished"], "alter")));
  ok("a qualifier, a question mark, a plan reference or a hyphenated word keeps the record's own line (review CPB3-C04)",
    flat(mk([["Kitchen", "kitchen"], ["Study", "study"], ["Robe", "wir"], ["Kitchen 2", "kitchen"]], ["Alternative kitchen as shown on the concept plans", "New study?", "Built-in robe", "New kitchen 2 as shown on plan A"]))
    === flat(["Kitchen: Alternative kitchen as shown on the concept plans", "Study: New study?", "Robe: Built-in robe", "Kitchen 2: New kitchen 2 as shown on plan A"]));
  ok("a room named after a person, or with capitals, prints as typed (review CPB3-C05)", flat(mk([["Mia's bedroom", "bedroom"], ["Guest WC", "wc"], ["Jordan's study", "study"]], ["", "New guest WC", "Alter"], ["new", "new", "alter"]))
    === flat(["New Mia's bedroom", "New guest WC", "Alterations to Jordan's study"]), flat(mk([["Mia's bedroom", "bedroom"], ["Guest WC", "wc"], ["Jordan's study", "study"]], ["", "New guest WC", "Alter"], ["new", "new", "alter"])));
  // Card answers, as the room cards record them (second verification round).
  const cardOf = (pk, label) => { const c = ANSWER_CONFIG[pk], o = c.options.find((x) => x.label === label); return { answer: toggleOption(c, null, [o.id]), disposition: o.disposition || "new" }; };
  const mkCards = (rooms, rows) => { const R = rooms.map(([name, roomType], k) => makeRoom({ id: `c_${k}`, name, roomType, order: k }));
    const items = rows.map(([k, pk, d, label], n) => makeItem({ id: `ri_c_${n}`, itemKind: "scope", category: "scope", promptKey: pk, roomId: R[k].id, room: R[k].name, section: "room", description: d, ...(label ? cardOf(pk, label) : { disposition: "new" }) }));
    return buildRegisterFixture("client_brief", { lead: rp.lead, context: rp.context, register: { meta: { ...rp.register.meta, rooms: R }, items }, projectRef: "0631", ...ISSUED }).clientBrief.scopeIn.map((x) => x.text); };
  ok("the card's own word counts even when only filler is typed: Refurbished stays Refurbished and is never merged with Alter (V3-01)",
    flat(mkCards([["Bedroom 2", "bedroom"], ["Bedroom 3", "bedroom"]], [[0, "D-001", "Bedroom 2 as shown on the concept plans", "Refurbished"], [1, "R-003", "", "Alter"]])) === flat(["Refurbished bedroom 2", "Alterations to the bedroom 3"])
    && flat(mkCards([["Ensuite", "ensuite"]], [[0, "B-001", "Ensuite as drawn", "Full renovation"]])) === flat(["Renovated ensuite"]),
    flat(mkCards([["Bedroom 2", "bedroom"], ["Bedroom 3", "bedroom"]], [[0, "D-001", "Bedroom 2 as shown on the concept plans", "Refurbished"], [1, "R-003", "", "Alter"]])));
  ok("a room whose name starts with a work word keeps its own line, never 'New New kitchen' (V3-02)",
    flat(mkCards([["New kitchen", "kitchen"], ["Renovated bathroom", "bathroom"], ["Existing kitchen", "kitchen"]], [[0, "R-003", "", "New"], [1, "B-001", "", "Full renovation"], [2, "R-003", "", "Renovate"]]))
    === flat(["New kitchen: New", "Renovated bathroom: Full renovation", "Existing kitchen: Renovate"]));
  ok("rooms named the Hub's way read naturally: 'Bedroom, Bedroom 2 …' → 'bedrooms 1 to 4'; 'Living' → 'living room' (V-05)",
    flat(mkCards([["Living", "living"], ["Dining", "dining"], ["Kitchen", "kitchen"], ["Pantry", "pantry"], ["Bedroom", "bedroom"], ["Bedroom 2", "bedroom"], ["Bedroom 3", "bedroom"], ["Bedroom 4", "bedroom"], ["Study", "study"]],
      Array.from({ length: 9 }, (_, k) => [k, "R-003", "", "New"]))) === flat(["New kitchen, pantry, living room and dining room", "New bedrooms 1 to 4 and study"]),
    flat(mkCards([["Living", "living"], ["Dining", "dining"], ["Kitchen", "kitchen"], ["Pantry", "pantry"], ["Bedroom", "bedroom"], ["Bedroom 2", "bedroom"], ["Bedroom 3", "bedroom"], ["Bedroom 4", "bedroom"], ["Study", "study"]], Array.from({ length: 9 }, (_, k) => [k, "R-003", "", "New"]))));
  ok("only whole-room scope prompts are grouped; an element prompt (hall finishes) keeps its own line", flat(mkCards([["Entry", "hall"]], [[0, "H-003", "New", null]])) === flat(["Entry: New"]));
  ok("numbered rooms: two are each named; three or more in a run read 'bedrooms 2 to 4'", flat(mk([["Bedroom 2", "bedroom"], ["Bedroom 3", "bedroom"]], ["", ""])) === flat(["New bedroom 2 and bedroom 3"])
    && flat(mk([["Bedroom 2", "bedroom"], ["Bedroom 4", "bedroom"], ["Bedroom 5", "bedroom"]], ["", "", ""])) === flat(["New bedroom 2, bedroom 4 and bedroom 5"])
    && flat(mk([["Bedroom 2", "bedroom"], ["Bedroom 3", "bedroom"], ["Bedroom 4", "bedroom"], ["Bedroom 5", "bedroom"]], ["", "", "", ""])) === flat(["New bedrooms 2 to 5"]));
  // CPB3-03 folds, and when they must not (review CPB4-01, SCOPE4-01..04): a project-wide line plus room records.
  const mkLine = (line, lineDispo, rooms, descs = rooms.map(() => ""), { prompt = "P-006", areaIds = null, roomDispo = "new", projectType = "new_build", extra = [] } = {}) => { const R = rooms.map(([name, roomType], k) => makeRoom({ id: `f_${k}`, name, roomType, order: k }));
    const items = [makeItem({ id: "ri_f_line", itemKind: "scope", category: "scope", promptKey: prompt, section: prompt.startsWith("W") ? "site" : "project", disposition: lineDispo, description: line,
        ...(areaIds ? { answer: { v: 1, state: "recorded", nature: "work", selected: [], areaIds: areaIds.map((k) => `f_${k}`) } } : {}) }),
      ...R.map((r, k) => makeItem({ id: `ri_f_${k}`, itemKind: "scope", category: "scope", promptKey: "R-003", roomId: r.id, room: r.name, section: "room", disposition: roomDispo, description: descs[k] }))];
    items.splice(1, 0, ...extra.map((d, k) => makeItem({ id: `ri_f_x${k}`, itemKind: "scope", category: "scope", promptKey: "P-006", section: "project", disposition: "included", description: d })));
    return buildRegisterFixture("client_brief", { lead: rp.lead, context: { ...rp.context, projectType }, register: { meta: { ...rp.register.meta, rooms: R }, items }, projectRef: "0631", ...ISSUED }).clientBrief.scopeIn; };
  const lines = (x) => x.map((l) => `${l.text} [${l.refs.length}]`);
  const G = [["Garage", "garage"]];
  const folds = (line, dispo, rooms, o) => flat(lines(mkLine(line, dispo, rooms, undefined, o))) === flat([`${line} [${rooms.length + 1}]`]);
  ok("…a New group folds into the project's description line when that line lists it as new work on the whole building",
    folds("New home with a double garage", "new", G) && folds("New two-storey home with a double garage on a sloping block", "included", G) && folds("Brand-new home with a double garage", "new", G)
    && folds("New-build home with two garages", "new", G) && flat(lines(mkLine("New home with a kitchen, scullery and garage", "new", [["Kitchen", "kitchen"], ["Scullery", "scullery"], ["Garage", "garage"]]))) === flat(["New home with a kitchen, scullery and garage [4]"])
    && flat(lines(mkLine("New two-storey home with four bedrooms, a study and a double garage.", "new", [["Study", "study"], ["Garage", "garage"]]))) === flat(["New two-storey home with four bedrooms, a study and a double garage. [3]"])
    && folds("New rear extension with a family room and a study", "new", [["Family room", "family"], ["Study", "study"]], { projectType: "extension" }));
  // Every case below must print the line itself AND the room group on its own: the reviewers' cases where a loose fold
  // hid a room's work.
  const keeps = [
    ["New home, existing garage retained", "included", G], ["New driveway and crossover to the garage", "new", G, { prompt: "W-010" }], ["New single-storey home (no garage, carport only)", "new", G],
    ["New home; space reserved for a future garage", "new", G], ["New roof over the garage and alfresco", "new", G], ["New garage door and opener", "new", G], ["New home with a garage door", "new", G],
    ["New roof over the existing garage", "new", G], ["New home; the existing garage is demolished", "new", G], ["New home, no garage", "new", G], ["New carport; the garage stays as is", "new", G],
    ["Demolish the existing house and garage to make way for the new home", "remove", G, { prompt: "W-004" }], ["Make good the garage slab where it meets the new home", "make_good", G, { prompt: "W-006" }],
    ["New home with a double garage", "new", G, { prompt: "W-004", areaIds: [0] }], ["New home with a double garage or carport", "new", G], ["New home with a garage", "alter", G],
    ["Renovate the house with a new garage", "alter", G], ["Renovate the house and the garage", "alter", G], ["New home", "new", G], ["New home with a new or renovated garage", "new", G],
    ["New deck off the kitchen", "new", [["Kitchen", "kitchen"]]], ["New flooring throughout, except the kitchen", "new", [["Kitchen", "kitchen"]]], ["New home with open-plan living", "new", [["Living", "living"]]],
    ["New exhaust fans in the bathroom and laundry", "new", [["Bathroom", "bathroom"], ["Laundry", "laundry"]]], ["New windows to the bathroom and laundry", "new", [["Bathroom", "bathroom"], ["Laundry", "laundry"]]],
    ["New home with a big kitchen", "new", [["Kitchen", "kitchen"], ["Scullery", "scullery"]]], ["New home with bedroom 10", "new", [["Bedroom 1", "bedroom"]]], ["New home with a garagex", "new", G],
    // Second round (FOLD4B-01/02, T1/T2): exclusions, staging, contracts and conditions; a building element as the subject;
    // a with-list on something that isn't the building; a partial list; another kind of work; a non-New room record.
    ["New two-storey home with a double garage (garage excluded)", "new", G], ["New two-storey home with a double garage under separate contract", "new", G],
    ["New two-storey home with a double garage; the garage isn’t included in this price", "new", G], ["New home with a double garage (garage by owner)", "new", G], ["New home with a double garage at stage 2", "new", G],
    ["New home with a double garage on hold", "new", G], ["New home with a double garage, garage omitted", "new", G], ["New home with a double garage at extra cost", "new", G],
    ["New home with a double garage (future stage)", "new", G], ["New home with a garage, if budget allows", "new", G], ["New home with a double garage, subject to council approval", "new", G],
    ["New ducted heating to the house with a study and bedroom 4", "new", [["Study", "study"], ["Bedroom 4", "bedroom"]]], ["New roof over the house with a double garage", "new", G],
    ["New double-glazed windows to the house with a study", "new", [["Study", "study"]]], ["New crossover for the house with a double garage", "new", G],
    ["New deck with the kitchen and living room", "new", [["Kitchen", "kitchen"], ["Living room", "living"]]], ["New pergola with a garage", "new", G],
    ["New home with a kitchen", "new", [["Kitchen", "kitchen"], ["Scullery", "scullery"]]], ["Refurbished home with a double garage", "included", G],
    ["New home with a double garage", "new", G, { roomDispo: "alter" }],
    // Only a short place after "on" or "at" ("on a sloping block"), never a condition or another element.
    ["New home with a double garage on the existing slab", "new", G], ["New home with a double garage at the owner's option", "new", G], ["New home with a double garage at the rear, by others", "new", G],
    // Round 3 (FOLD4C-01): a second building on the site never absorbs the main house's rooms, and the building word
    // must be the project's own (a home on a new build or knockdown, an extension on an extension or renovation).
    ["New ancillary dwelling with a kitchen, bathroom and laundry", "included", [["Kitchen", "kitchen"]], { projectType: "renovation" }],
    ["New rear dwelling with a double garage", "included", G], ["New front house with a double garage", "included", G], ["New side residence with a double garage", "included", G],
    ["New home with a double garage", "new", G, { projectType: "renovation" }], ["New rear extension with a double garage", "new", G, { projectType: "new_build" }],
  ].filter(([line, dispo, rooms, o]) => { const out = mkLine(line, dispo, rooms, undefined, o); return !(out.length === 2 && out[0].refs.length === 1 && out[1].refs.length === rooms.length); });
  // The Ridgeline shape with a granny flat line beside the house line: the house's rooms stay listed (FOLD4C-01).
  const twoBuildings = lines(mkLine("Renovation of the existing house", "included", [["Kitchen", "kitchen"], ["Bathroom", "bathroom"], ["Laundry", "laundry"]], undefined, { projectType: "renovation", extra: ["New ancillary dwelling with a kitchen, bathroom and laundry"] }));
  if (flat(twoBuildings) !== flat(["Renovation of the existing house [1]", "New ancillary dwelling with a kitchen, bathroom and laundry [1]", "New kitchen [1]", "New bathroom and laundry [2]"])) keeps.push([`two buildings: ${flat(twoBuildings)}`]);
  // A house line worded without a building word, plus a flat line: nothing folds (review FOLD5-01).
  const newBuild = lines(mkLine("Two-storey new build with three bedrooms and a double garage", "included", [["Bathroom", "bathroom"], ["Laundry", "laundry"]], undefined, { extra: ["New two-bedroom dwelling with a bathroom and laundry"] }));
  if (flat(newBuild) !== flat(["Two-storey new build with three bedrooms and a double garage [1]", "New two-bedroom dwelling with a bathroom and laundry [1]", "New bathroom and laundry [2]"])) keeps.push([`new build and flat: ${flat(newBuild)}`]);
  // A house line with no building word at all, plus a flat line: still nothing folds (the description-line count).
  const design = lines(mkLine("Two-storey design with three bedrooms and a double garage", "included", [["Bathroom", "bathroom"], ["Laundry", "laundry"]], undefined, { extra: ["New two-bedroom dwelling with a bathroom and laundry"] }));
  if (flat(design) !== flat(["Two-storey design with three bedrooms and a double garage [1]", "New two-bedroom dwelling with a bathroom and laundry [1]", "New bathroom and laundry [2]"])) keeps.push([`design and flat: ${flat(design)}`]);
  // A description line recorded Alter never takes a New room, even when it is the only building line.
  const altered = lines(mkLine("New home with a double garage", "alter", G, undefined, { extra: ["Landscaping and fencing"] }));
  if (flat(altered) !== flat(["New home with a double garage [1]", "Landscaping and fencing [1]", "New garage [1]"])) keeps.push([`alter line: ${flat(altered)}`]);
  // Two lines that each describe a building (a house and a two-bedroom dwelling): nothing folds (review FOLD4D-01).
  const houseAndFlat = lines(mkLine("New two-storey home with a double garage", "included", [["Garage", "garage"], ["Bathroom", "bathroom"], ["Laundry", "laundry"]], undefined, { extra: ["New two-bedroom dwelling with a bathroom and laundry"] }));
  if (flat(houseAndFlat) !== flat(["New two-storey home with a double garage [1]", "New two-bedroom dwelling with a bathroom and laundry [1]", "New garage [1]", "New bathroom and laundry [2]"])) keeps.push([`house and flat: ${flat(houseAndFlat)}`]);
  ok("…and never into a line that mentions the room in passing, keeps, removes, excludes, stages or conditions it, is about one area or one element, says another kind of work, or doesn't list every room (reviews CPB4-01, FOLD4B-01/02)", keeps.length === 0, flat(keeps.map(([l]) => l)));
  ok("…a room's own typed line never absorbs a group, and a fold never changes the words", flat(lines(mkLine("Driveway and paths", "new", [["Kitchen", "kitchen"], ["Garage", "garage"]], ["New kitchen opening to the garage", ""])))
    === flat(["Driveway and paths [1]", "Kitchen: New kitchen opening to the garage [1]", "New garage [1]"]), flat(lines(mkLine("Driveway and paths", "new", [["Kitchen", "kitchen"], ["Garage", "garage"]], ["New kitchen opening to the garage", ""]))));
}

section("Decisions (Tab 26/27: a preference is never an open action)");
ok("3 to 7 decisions, each a sentence with a register reference", cb.decisions.length >= 3 && cb.decisions.length <= 7 && cb.decisions.every((d) => /^[A-Z]\d{3}-[0-9A-Z]{3}$/.test(d.ref) && /\.$/.test(d.action)), flat(cb.decisions));
ok("a preference with no next action isn't a decision", !cb.decisions.some((d) => /neutral walls|Freestanding bath/i.test(d.action)));
ok("a preference with a real next action is", cb.decisions.some((d) => /basin style/.test(d.action)));
ok("an architect's own task isn't listed as the client's decision", !cb.decisions.some((d) => /stair location/.test(d.action)));
const allDecisions = (pl) => [...pl.DECISIONS_KEEP, ...pl.DECISIONS, ...pl.DECISIONS_PEN, ...pl.DECISIONS_LAST];
ok("no owner is invented: an unassigned decision prints 'To be agreed'", cb.decisions.some((d) => /access route/.test(d.action) && d.owner === "") && allDecisions(buildClientBriefPayload(fx)).some((d) => /access route/.test(d.ACTION) && d.OWNER === "To be agreed"));
ok("the client's decisions come first", cb.decisions[0].owner === "Client");

section("Next steps follow the engagement pathway");
const steps = (f) => f.clientBrief.nextSteps;
ok("design and build before the PTSA: the separate agreement is explained once, Concept is where we are", !!steps(fx).ptsa && steps(fx).steps[0].label === "Concept" && steps(fx).steps[0].current && steps(fx).ptsa.text === "The pre-construction agreement is separate from this brief and from any building contract." && !/PTSA/.test(steps(fx).ptsa.text) && !steps(fx).ptsa.title);
const { fx: buildOnly } = build("powder", { recipientName: "Priya Raman" });
ok("build only: no concept, no agreement, no PTSA; confirm the scope, price, contract, build (CPB-01)", cpbPathway({ engagementPathway: "design_build", deliveryModel: "build_only" }) === "build_only"
  && !steps(buildOnly).ptsa && !/Concept|agreement|PTSA/i.test(flat([steps(buildOnly).paras, steps(buildOnly).steps])) && steps(buildOnly).steps.map((x) => x.label).join("|") === "Confirm the scope|Pricing|Building contract|Construction"
  && buildOnly.project.stageLabel === "Scope review" && !/design develops/.test(buildClientBriefPayload(buildOnly).SCOPE_INTRO));
{
  // Checkpoint 4 review, finding 1: the kicker never promises a price. Every pathway at every stage before won.
  const STAGES = ["enquiry", "qualify", "discovery", "winning_offer", "fee_proposal", "consultants", "tender"];
  const PATHS = [{ engagementPathway: "design_build" }, { engagementPathway: "design_build", deliveryModel: "build_only" }, { engagementPathway: "plans_supplied" }, { engagementPathway: "architect_tender" }];
  const labels = STAGES.flatMap((st) => PATHS.map((c) => build("powder", { recipientName: "Priya Raman" }, (p) => { p.lead.stage = st; Object.assign(p.context, c); }).fx.project.stageLabel));
  ok("no brief's stage label mentions a price, a quote or a cost, on any pathway at any stage (review 4, finding 1)", labels.length === 28 && labels.every((l) => l && !/pric|quot|cost|estimat/i.test(l)), labels.join(" | "));
  const plans = build("powder", { recipientName: "Priya Raman" }, (p) => { p.context.engagementPathway = "plans_supplied"; }).fx;
  ok("…build only reads 'Scope review', plans supplied 'Plans review', and the kicker prints it", buildOnly.project.stageLabel === "Scope review" && plans.project.stageLabel === "Plans review"
    && buildClientBriefPayload(buildOnly).DOC_KICKER === "Preliminary  /  Scope review", buildClientBriefPayload(buildOnly).DOC_KICKER);
}
ok("build only: no claim that design work isn't needed; drawings and approvals are confirmed before the price (CPB2-03)", !/doesn't need|no separate design|not need/i.test(flat(steps(buildOnly)))
  && steps(buildOnly).paras[0] === "This project is proceeding on a build-only pathway. We'll confirm the work, measurements and any drawings or approvals needed before finalising the price."
  && /drawings or approvals needed/.test(steps(buildOnly).steps[0].text));
const assumesOf = (f) => buildClientBriefPayload(f).NOTED.at(-1).N_ITEMS.map((x) => x.TEXT);
ok("a small job with no recorded checks names no consultant disciplines (CPB2-07)", assumesOf(buildOnly).includes("Any required technical checks and approvals will be confirmed before construction.") && !/structural|energy|drainage/i.test(flat(assumesOf(buildOnly))), flat(assumesOf(buildOnly)));
{
  const small = (pathway, more = {}) => build("powder", { recipientName: "X" }, (p) => { p.context.engagementPathway = pathway; p.context.deliveryModel = "design_build"; Object.assign(p.lead, more); if (more.ptsa) p.context.commercial.ptsaStatus = "signed"; }).fx;
  ok("…and on a small job the next steps name no disciplines either (review CPB3-C08)", !/Engineering, energy|structure, services and energy/.test(flat(small("plans_supplied", { stage: "consultants" }).clientBrief.nextSteps))
    && !/structure, services and energy/.test(flat(small("design_build", { stage: "consultants", ptsa: true }).clientBrief.nextSteps)) && /Engineering, energy/.test(flat(build("kestrel", { revision: 2 }, plansSuppliedRevision).fx.clientBrief.nextSteps)));
}
ok("…a new home, an extension or a recorded structural or site check names them", /structural, energy, drainage and approval/.test(flat(assumesOf(fx))) && /structural, energy, drainage and approval/.test(flat(assumesOf(rfxScope)))
  && fx.clientBrief.technicalChecks === "named" && buildOnly.clientBrief.technicalChecks === "general");
const signed = build("kestrel", {}, (p) => { p.context.commercial.ptsaStatus = "signed"; p.lead.stage = "consultants"; }).fx;
ok("PTSA signed: no 'next is the PTSA', and design coordination is current", !steps(signed).ptsa && !/next step is to agree/.test(flat(steps(signed))) && steps(signed).steps[0].label === "Design coordination" && steps(signed).steps[0].current);
const plans = build("kestrel", { revision: 2 }, plansSuppliedRevision).fx;
ok("plans supplied: no PTSA and no concept or agreement step", !steps(plans).ptsa && !/Concept|agreement/i.test(flat(steps(plans).steps)));
ok("…and the supplied plans aren't called complete or ready: the review's own wording (CPB3-07)", steps(plans).paras[0] === "You've supplied plans for this project. We'll confirm the consultant information and any remaining details required before pricing."
  && !/already prepared|ready/i.test(flat(steps(plans))), steps(plans).paras[0]);
const tender = build("kestrel", {}, (p) => { p.context.engagementPathway = "architect_tender"; p.lead.stage = "tender"; }).fx;
ok("architect tender: no PTSA; pricing is current at Tender", !steps(tender).ptsa && steps(tender).steps.find((x) => x.current)?.label === "Pricing");
const won = build("kestrel", {}, (p) => { p.lead.stage = "won"; }).fx;
ok("won: no process steps, no PTSA", !steps(won).ptsa && steps(won).steps.length === 0);

section("Identity: BLB-[TYPE]-[PROJECT REF]-[REVISION]");
const draftPay = buildClientBriefPayload(build("kestrel", { status: "Draft" }).fx);
const r2 = buildClientBriefPayload(build("kestrel", { revision: 2 }).fx);
ok("a draft carries no revision and says it isn't issued", /^BLB-CPB-0417\s+·\s+Draft — not issued$/.test(draftPay.FTR_IDENTITY) && /^Draft/.test(draftPay.DOC_KICKER) && draftPay.STATUS_LABEL.startsWith("Draft"), draftPay.FTR_IDENTITY);
ok("an issued copy prints its revision and date", /^BLB-CPB-0417-R02\s+·\s+Issued 15 November 2026$/.test(r2.FTR_IDENTITY) && r2.META_ROWS.some((r) => r.VA === "BLB-CPB-0417-R02"), r2.FTR_IDENTITY);
ok("issued to the named recipient", r2.META_ROWS.some((r) => r.LB === "Issued to" && r.VB === "Jordan & Mia Whitcombe"));
ok("the drawing basis is printed as recorded, not in Blue Leaf's revision format", r2.META_ROWS.some((r) => r.VB === "Concept Set C-02, 28 October 2026"));
{
  const r02 = buildClientBriefPayload(plans), r01 = buildClientBriefPayload(fx);
  ok("the plans-supplied R02 prints the supplied set it was issued against; R01 keeps the concept set (CPB2-04)", r02.META_ROWS.some((r) => r.VB === KESTREL_SUPPLIED_PLANS) && /based on the drawing basis above\./.test(r02.SCOPE_INTRO)
    && assumesOf(plans).some((t) => t.includes(KESTREL_SUPPLIED_PLANS)) && !/C-02/.test(flat(r02)) && r01.META_ROWS.some((r) => r.VB === "Concept Set C-02, 28 October 2026") && !flat(r01).includes(KESTREL_SUPPLIED_PLANS));
  const words = flat([r02.SCOPE_INTRO, r02.NOTED, allDecisions(r02).map((d) => d.ACTION), r02.NEXT_PARAS, [...r02.STEPS_KEEP, ...r02.STEPS, ...r02.STEPS_PEN, ...r02.STEPS_LAST]]);
  ok("…and the R02 reads as one plans-supplied brief: no concept drawings, no design still developing (review CPB3-H01)", !/concept drawings|design develops|still to be developed|design development|no separate/i.test(words)
    && /against your plans and the consultant documents before pricing/.test(r02.SCOPE_INTRO) && /still to be confirmed/.test(flat(r02.NOTED)), words.slice(0, 400));
  const stageOnly = build("kestrel", { revision: 2 }, (p) => { p.context.engagementPathway = "plans_supplied"; p.lead.stage = "consultants"; }).fx;
  ok("…the drawing basis comes from the record, never from the stage or pathway", buildClientBriefPayload(stageOnly).META_ROWS.some((r) => r.VB === "Concept Set C-02, 28 October 2026"));
}
ok("new issues are R01, R02 …", issueRevisionLabel(1) === "R01" && issueRevisionLabel(12) === "R12");
{
  const refsOf = (f) => { const c = f.clientBrief, m = {}; for (const x of [...c.scopeIn, ...c.boundaries.flatMap((b) => b.items), ...c.preferences.flatMap((g) => g.items)]) m[x.text] = x.ref; for (const d of c.decisions) m[d.action] = d.ref; return m; };
  const a = refsOf(fx), b = refsOf(build("kestrel", { status: "Draft" }).fx), c2 = refsOf(build("kestrel", { revision: 2 }, plansSuppliedRevision).fx);
  const shared = Object.keys(a).filter((k) => k in b && k in c2);
  ok("the same item keeps the same reference across the draft, R01 and R02 (CPB-05)", shared.length >= 30 && shared.every((k) => a[k] === b[k] && a[k] === c2[k]), `${shared.filter((k) => !(a[k] === b[k] && a[k] === c2[k])).length} differ of ${shared.length}`);
}
ok("without an allocated project number, the existing lead reference is used", build("kestrel", { projectRef: undefined }).fx.meta.ref === legacyProjectRef(kp.lead.id) && /^BL[0-9A-F]{6}$/.test(legacyProjectRef(kp.lead.id)));
ok("every document type has a code", ["client_brief", "architect_brief", "selections_schedule", "client_presentation", "tender_scope_notes"].every((t) => /^BLB-[A-Z]{3}-X$/.test(documentIdentity({ type: t, projectRef: "X", status: "Draft" }).number)));

section("Pre-issue checks");
const checks = registerDocChecks("client_brief", fx, { register: kp.register, recipientName: "Jordan & Mia Whitcombe", mode: "issue" });
ok("the Kestrel brief passes the pre-issue checks", checks.errors.length === 0, flat(checks));
ok("no dollar figures, estimate or allowance wording reach the client", !/\$\s?\d|allowance|estimate|margin/i.test(flat(cb)));
const pay = buildClientBriefPayload(fx);
ok("the status panel no longer claims nothing is approved; the brief doesn't itself authorise anything (CPB-03)", !/nothing in it is ordered or approved/.test(pay.STATUS_BODY) && /doesn't itself authorise purchasing, construction or changes to a contract/.test(pay.STATUS_BODY));
ok("consultant confirmation reads as still to come; the closing note uses no system names (CPB-11/12)", pay.NOTED.at(-1).N_ITEMS.some((x) => /will need to confirm/.test(x.TEXT)) && !/register/i.test(pay.ABOUT_BODY) && /information recorded for your project/.test(pay.ABOUT_BODY));
ok("site access reads as a sentence that keeps each qualifier (CPB2-05)", cb.noted.flatMap((g) => g.items).includes("Site access is steep, with narrow or restricted areas.") && !/Steep access and narrow/.test(flat(cb.noted)), flat(cb.noted));
{
  const acc = (...ids) => siteAccessSentence(makeItem({ itemKind: "scope", promptKey: "W-001", answer: { v: 1, state: "recorded", nature: "fact", selected: ids.map((id) => ({ optionId: id, path: [id], label: id })) } }));
  ok("…an 'or' is never upgraded to an 'and'; a constraint to plan for is said as one, never as a feature (review CPB3-H03)", acc("narrow_or_restricted_access", "limited_parking") === "Site access has narrow or restricted areas and limited parking."
    && acc("steep_access", "crane_or_plant_access") === "Site access is steep. Crane or plant access will need to be planned for."
    && acc("crane_or_plant_access") === "Site access: crane or plant access will need to be planned for." && acc("shared_or_neighbour_access") === "Site access: shared or neighbour access will need to be planned for."
    && acc("standard_driveway") === "Site access is by a standard driveway." && acc("standard_driveway", "steep_access") === "Site access is by a standard driveway and is steep."
    && acc("other") === "" && acc() === "", [acc("steep_access", "crane_or_plant_access"), acc("standard_driveway", "steep_access")].join(" | "));
  // Ridgeline records Steep access and Crane or plant access; only the answer's state changes.
  const unsure = (state) => build("ridgeline", {}, (p) => { p.register.items.find((i) => i.promptKey === "W-001").answer.state = state; }).fx.clientBrief.noted.flatMap((g) => g.items);
  ok("a fact the client is unsure about, or still to resolve, is never printed as settled (review CPB3-C03)", unsure("client_unsure").includes("Site access: still to be confirmed (noted so far: steep access and crane or plant access).")
    && unsure("unresolved").includes("Site access: still to be confirmed (noted so far: steep access and crane or plant access).") && !/Site access is/.test(flat(unsure("client_unsure"))), flat(unsure("client_unsure")));
  const branchUnsure = build("kestrel", {}, (p) => { const w = p.register.items.find((i) => i.promptKey === "W-007"); let a = toggleOption(ANSWER_CONFIG["W-007"], null, ["yes", "work_zones"]);
    a = toggleOption(ANSWER_CONFIG["W-007"], a, ["yes", "temporary_kitchen"]); w.answer = { ...a, state: "client_unsure" };
    const acc = p.register.items.find((i) => i.promptKey === "W-001"); acc.answer = { ...acc.answer, state: "unresolved", element: { label: "Driveway" } }; }).fx.clientBrief.noted.flatMap((g) => g.items);
  ok("…what was noted so far is said as a recorded answer would be: the branch once, the element kept (V3-04)", branchUnsure.includes("Living on site during works: still to be confirmed (noted so far: yes — work zones and temporary kitchen).")
    && branchUnsure.includes("Site access: still to be confirmed (noted so far: Driveway — Steep access and narrow or restricted access).") && !/ · /.test(flat(branchUnsure)), flat(branchUnsure));
  const onSiteUnsure = build("kestrel", {}, (p) => { const w = p.register.items.find((i) => i.promptKey === "W-007"); w.answer.state = "client_unsure"; w.answer.selected = [{ optionId: "unsure", path: ["unsure"], label: "Unsure" }]; }).fx.clientBrief.noted.flatMap((g) => g.items);
  ok("…an 'Unsure' answer reads as still to be confirmed, not as a fact called 'Unsure'", onSiteUnsure.includes("Living on site during works: still to be confirmed."), flat(onSiteUnsure));
}
const access = (p) => p.register.items.find((i) => (i.answer?.selected || []).some((x) => x.label === "Steep access"));
const zoned = build("kestrel", {}, (p) => { Object.assign(access(p).answer, { element: { label: "Driveway" }, zone: { label: "Front boundary" } }); access(p).answer.selected.push({ optionId: "nbn", label: "NBN pit in the driveway" }); }).fx.clientBrief.noted.flatMap((g) => g.items);
ok("a fact with an element, a zone or an unlisted option keeps every recorded word, and capitals (fallback)", zoned.includes("Site access: Driveway — Steep access, narrow or restricted access and NBN pit in the driveway — Front boundary."), flat(zoned));
const onSite = build("kestrel", {}, (p) => { const w = p.register.items.find((i) => i.promptKey === "W-007"); w.answer.selected = ["Work zones", "Temporary kitchen", "Dust and noise separation"].map((l, k) => ({ optionId: `c${k}`, path: ["yes", `c${k}`], label: `Yes · ${l}` })); }).fx.clientBrief.noted.flatMap((g) => g.items);
ok("a branch answer is said once: 'Yes — work zones, temporary kitchen and …'", onSite.includes("Living on site during works: Yes — work zones, temporary kitchen and dust and noise separation."), flat(onSite));
ok("a won project keeps its own stage label and has no steps", won.project.stageLabel && !/Concept|Plans review|Scope review|Tender$/.test(won.project.stageLabel) && won.clientBrief.nextSteps.steps.length === 0, `${won.project.stageLabel} | ${flat(won.clientBrief.nextSteps)}`);
ok("priorities: one is a single line, two are two columns, three are cards (CPB-10)", buildClientBriefPayload(buildOnly).PRI_INLINE === true && !buildClientBriefPayload(buildOnly).PRI_BAND_3
  && buildClientBriefPayload({ ...fx, clientBrief: { ...cb, priorities: cb.priorities.slice(0, 2) } }).PRI_BAND_2 === true && pay.PRI_BAND_3 === true);

section("Prohibited products (CPB-02)");
const stone = build("kestrel", {}, (p) => { p.register.items.push(makeItem({ id: "ri_kc_stone", itemKind: "selection", category: "benchtop", promptKey: "K-005", roomId: "k_kitchen", certainty: "preference", description: "Engineered stone island benchtop" })); });
const stoneChecks = registerDocChecks("client_brief", stone.fx, { register: stone.p.register, recipientName: "X", mode: "issue" });
ok("a client document naming engineered stone can't be issued, and says why", stoneChecks.errors.some((e) => /Engineered stone island benchtop/.test(e) && /prohibited in Australia from 1 July 2024/.test(e) && /original wording stays in the register's history/.test(e)), flat(stoneChecks.errors));
ok("the internal estimator's notes get a warning instead", registerDocChecks("tender_scope_notes", buildRegisterFixture("tender_scope_notes", { lead: stone.p.lead, context: stone.p.context, register: stone.p.register, projectRef: "0417", ...ISSUED }), { register: stone.p.register, recipientName: "Blue Leaf estimating", mode: "issue" }).warnings.some((w) => /engineered stone/i.test(w)));
ok("the check catches the card option too, and the client's record is never rewritten", restrictedFindings([makeItem({ itemKind: "selection", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "engineered_stone", path: ["engineered_stone"], label: "Engineered stone" }] } })]).length === 1
  && stone.p.register.items.find((i) => i.id === "ri_kc_stone").description === "Engineered stone island benchtop");
ok("engineered timber, natural, sintered and porcelain stone, and quartzite aren't flagged", restrictedFindings(["Engineered timber flooring", "Natural stone benchtop", "Sintered stone benchtop", "Porcelain benchtop", "Quartzite benchtop", "Granite benchtops"].map((d) => makeItem({ itemKind: "selection", description: d }))).length === 0);
ok("an excluded engineered-stone line isn't flagged", restrictedFindings([makeItem({ itemKind: "selection", disposition: "excluded", description: "Engineered stone benchtop" })]).length === 0);
const sel = (o) => makeItem({ itemKind: "selection", ...o });
const one = (o) => restrictedFindings([sel(o)])[0];
ok("existing stone to stay, or stone being removed, is a warning, not a block", one({ disposition: "retain", description: "Existing engineered stone vanity top" })?.blocking === false && one({ disposition: "remove", description: "Engineered stone benchtop to be removed" })?.blocking === false);
// Review rounds 1-5: free text can't be read for whether stone is new or already installed, so a client document that
// would print engineered stone can't be issued, whatever the wording; work on installed stone is written without the
// material, which stays in the record's Product field (unprinted), so the WHS notice still fires.
const keptStone = build("kestrel", {}, (p) => { p.register.items.push(sel({ id: "ri_kc_keep", category: "vanity", disposition: "retain", certainty: "fact", description: "Existing laundry top", product: "Engineered stone" })); });
const keptChecks = registerDocChecks("client_brief", keptStone.fx, { register: keptStone.p.register, recipientName: "X", mode: "issue" });
const whs = (w) => /New engineered stone can't be supplied or installed/.test(w) && /If it is stone already installed, removing, repairing, making a minor modification to, or disposing of it is controlled work, and SafeWork SA must be notified before it starts/.test(w)
  && /notification-of-work-with-legacy-engineered-stone/.test(w) && /not WHS clearance/.test(w) && !/already installed \(|records engineered stone already installed/.test(w);
ok("…so existing stone recorded with the material in its Product field issues, with a warning that is not WHS clearance and never claims the stone is installed", keptChecks.errors.length === 0
  && keptChecks.warnings.some((w) => /"Existing laundry top" \([^)]*\) names engineered stone \(to remain\)/.test(w) && whs(w)), flat(keptChecks));
{
  const checksWith = (o, doc = "client_brief") => { const x = build("kestrel", {}, (p) => { p.register.items.push(makeItem({ id: "ri_kc_x", category: "benchtop", roomId: "k_kitchen", ...o })); });
    return registerDocChecks(doc, buildRegisterFixture(doc, { lead: x.p.lead, context: x.p.context, register: x.p.register, projectRef: "0417", ...ISSUED }), { register: x.p.register, recipientName: "X", mode: "issue" }); };
  const outcome = (o, doc) => { const c = checksWith(o, doc);
    return [...c.errors.map((e) => `E:${/selection that will be supplied/.test(e) ? "sel" : /in words the .* prints/.test(e) ? "rec" : /would print/.test(e) ? "text" : "?"}`),
      ...c.warnings.filter((w) => /stone|Caesar/i.test(w)).map((w) => `W:${whs(w) ? "kept" : /compliant range/.test(w) && !/SafeWork/.test(w) ? "brand" : /mentions engineered stone/.test(w) && !/SafeWork/.test(w) ? "rule" : /would print|in words the .* prints/.test(w) ? "printed" : "?"}`)].join(" "); };
  const S = (description, disposition, more = {}) => ({ itemKind: "scope", disposition, description, ...more });
  const SEL = (description, disposition, more = {}) => ({ itemKind: "selection", certainty: "preference", disposition, description, ...more });
  const REQ = (description) => ({ itemKind: "requirement", disposition: "new", description });
  // Every wording a reviewer found in five rounds, plus the forms staff should use. Printed words block whatever they say.
  const cases = [
    [S("Remove the existing kitchen benchtops", "remove", { product: "Engineered stone" }), "W:kept"], [S("Repair the existing kitchen benchtop", "make_good", { product: "Engineered stone (existing)" }), "W:kept"],
    [S("Cut-out in the existing benchtop for the cooktop", "alter", { product: "Engineered stone" }), "W:kept"], [SEL("Existing Caesarstone benchtop to be removed", "remove"), "W:kept"],
    [SEL("Caesarstone porcelain range benchtop", "new"), "W:brand"], [SEL("Engineered stone island benchtop", "new"), "E:sel"], [S("New porcelain island benchtop", "new"), ""],
    ...["Remove the existing engineered stone benchtops", "Repair the chipped engineered stone benchtop", "Retain cabinetry - engineered stone benchtops", "Supplied and installed engineered stone benchtops",
      "Existing island gets engineered stone top", "Engineered stone benchtop laminate removed", "Remove existing engineered stone benchtop; new engeneered stone island", "Extend the existing engineered stone benchtop",
      "Island benchtop to match the existing engineered stone", "Lift and refit the existing engineered stone benchtop", "Add a waterfall end to the existing engineered stone island", "Island top in white quartz",
      "Non-existing engineered stone island benchtop", "Partial retrofit: replace laminate benchtops with engineered stone", "Supply, cut and install engineered stone benchtops", "Eng. stone 40mm tops"].map((d) => [S(d, "alter"), "E:rec"]),
    [S("New engineered stone island benchtop", "undecided"), "E:rec"], [S("Engineered stone island benchtop", "deferred"), "E:rec"], [S("Retain cabinetry; new engineered stone benchtops", "retain"), "E:rec"],
    [SEL("Existing engineered stone laundry top", "retain", { certainty: "fact" }), "E:rec"], [S("Engineered stone benchtop by the client's stonemason", "by_others"), "E:rec"],
    [REQ("No engineered stone in the kitchen"), "E:rec"], [SEL("Porcelain island benchtop", "new", { nextAction: "Client to choose the engineered stone colour for the new island", responsibility: "client" }), "E:text"],
  ].map(([o, want]) => [o.description, want, outcome(o)]).filter(([, want, got]) => want !== got);
  ok("…a client brief that would print engineered stone can't be issued, whatever the wording or section; the material kept in Product warns instead (review rounds 1-5)", cases.length === 0, flat(cases));
  // Round 6 (STONE4F-01..03): plurals, a bench word then bare quartz in any printed text, and a printed Product field.
  const r6 = [
    [SEL("Porcelain island benchtop", "new", { nextAction: "Client to choose between engineered stones", responsibility: "client" }), "E:text"],
    [S("Island top in white quartz", "excluded"), "E:text"], [SEL("Island top", "new", { nextAction: "Client to confirm the island top in white quartz", responsibility: "client" }), "E:text"],
  ].map(([o, want]) => [o.description, want, outcome(o)]).filter(([, want, got]) => want !== got);
  const goalQuartz = (() => { const x = build("kestrel", {}, (p) => { p.context.goals.description = "A bright kitchen with a big island benchtop in white quartz"; }); return registerDocChecks("client_brief", x.fx, { register: x.p.register, recipientName: "X", mode: "issue" }).errors; })();
  const sfsQuartz = checksWith(SEL("", "retain", { certainty: "preference", promptKey: "K-005", product: "White quartz" }), "selections_schedule").errors;
  ok("…plurals, a bench word with bare quartz in any printed line, and a printed Product field are caught too (review round 6)", r6.length === 0 && goalQuartz.length === 1 && sfsQuartz.length === 1, flat([r6, goalQuartz, sfsQuartz]));
  ok("…the internal Tender Notes still only warn", outcome(S("New engineered stone island", "new"), "tender_scope_notes") === "W:printed", outcome(S("New engineered stone island", "new"), "tender_scope_notes"));
  ok("…the notification follows SafeWork SA's own list (removal, repair, minor modification, disposal)", keptChecks.warnings.some((w) => /removing, repairing, making a minor modification to, or disposing of it is controlled work/.test(w)));
}
const blocks = (o) => one(o)?.blocking === true;
const warnsOnly = (o) => !!one(o) && one(o).blocking === false;
ok("a requirement to avoid it, or the client's own note, warns and never blocks", warnsOnly({ itemKind: "requirement", description: "No engineered stone in the kitchen" })
  && warnsOnly({ category: "benchtop", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "porcelain", label: "Porcelain" }], clientNote: "We don't want engineered stone" } })
  && warnsOnly({ category: "benchtop", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "other", label: "Other" }], clientNote: "Engineered stone looks the best" } }));
// Two independent red-team rounds showed negation in free text can't be read safely, so on a selection any wording blocks.
const anyWording = ["Not laminate, engineered stone island benchtop", "Replace the laminate with an engineered stone benchtop", "Instead of laminate, engineered stone", "Not sure, engineered stone",
  "No engineered stone splashback, engineered stone benchtop and island", "Engineered stone, changed from Snow to Calacatta per client 3/11", "Engineered stone - looking at the Calacatta range",
  "Client's final pick was engineered stone", "Engineered stone - style: Calacatta Nuvo", "Porcelain instead of engineered stone", "Porcelain benchtop (was engineered stone)", "No engineered stone in the kitchen"];
ok("on a selection that will be supplied, any wording naming engineered stone blocks (negation, history, colour changes)", anyWording.every((d) => blocks({ category: "joinery", description: d })), flat(anyWording.filter((d) => !blocks({ category: "joinery", description: d }))));
const shorthand = ["Eng. stone 40mm", "eng stone, Calacatta", "E-stone, white", "Estone 20mm Calacatta", "Engineerd stone benchtop", "Enginered stone", "Engeneered stone", "Engineered quartz, 20mm", "Agglomerate stone tops", "Reconstituted quartz",
  "Engineered stones, Calacatta", "E-stones", "Agglomerate stones"];   // plurals: review STONE4F-01
ok("shorthand, misspellings, agglomerate and engineered quartz are caught", shorthand.every((d) => blocks({ category: "joinery", description: d })), flat(shorthand.filter((d) => !blocks({ category: "joinery", description: d }))));
ok("quartz as a bench material blocks: next to a bench word, or alone on a benchtop, splashback, vanity or laundry bench record", [
  { category: "joinery", description: "Quartz island bench with waterfall" }, { category: "joinery", description: "Quartz kitchen benchtop" }, { category: "joinery", description: "Quartz benchtop - removed upstand per client" },
  { category: "benchtop", description: "Quartz" }, { promptKey: "K-006", description: "White quartz" }, { category: "benchtop", product: "Quartz - removed waterfall per client" },
  { promptKey: "B-004", category: "sanitary", product: "Quartz" }, { promptKey: "L-003", category: "joinery", description: "Laundry bench", product: "Quartz" }, { category: "joinery", description: "Island", product: "20mm quartz" },
].every(blocks));
ok("quartz as a colour, look, finish, sink, brand, or beside a compliant material doesn't block", [
  { category: "benchtop", description: "Porcelain benchtop", colour: "Quartz Grey" }, { category: "splashback", description: "Glass splashback", colour: "Rose Quartz" }, { category: "benchtop", description: "Porcelain benchtop with undermount quartz sink" },
  { category: "benchtop", description: "Laminate, quartz finish" }, { category: "benchtop", description: "Quartz-look porcelain" }, { category: "benchtop", description: "Porcelain - not quartz" }, { category: "tiles", description: "Rose quartz feature tile" },
].every((o) => !blocks(o)) && one({ category: "benchtop", manufacturer: "Quantum Quartz", product: "Quantum Zero" })?.product.level === "warning");
const avoidReq = build("kestrel", {}, (p) => { p.register.items.push(makeItem({ id: "ri_kc_avoid", itemKind: "requirement", category: "benchtop", roomId: "k_kitchen", certainty: "preference", description: "No engineered stone in the kitchen" })); });
const avoidChecks = registerDocChecks("client_brief", avoidReq.fx, { register: avoidReq.p.register, recipientName: "X", mode: "issue" });
ok("a 'no engineered stone' requirement the brief would print stops the issue too (negation isn't read), naming the record and room", avoidChecks.errors.some((e) => /No engineered stone in the kitchen" \(Kitchen[^)]*\) names engineered stone in words the .* prints/.test(e) && /Product field/.test(e)), flat(avoidChecks.errors));
ok("the block tells staff exactly what to do: name only what will be supplied", stoneChecks.errors.some((e) => /in a selection that will be supplied/.test(e) && /reword it even if it says what was replaced or avoided/.test(e) && /Retain or Remove/.test(e)), flat(stoneChecks.errors));
ok("brands that sold engineered stone warn and never block", one({ description: "Caesarstone porcelain range benchtop" })?.product.level === "warning" && one({ description: "Caesarstone porcelain range benchtop" })?.blocking === false);
ok("cement-based reconstituted or manufactured stone, bluestone and limestone aren't engineered stone", !one({ description: "Reconstituted stone wall veneer" }) && !one({ description: "Manufactured stone retaining blocks" }) && !one({ description: "Bluestone paving edge" }) && !one({ description: "Limestone hearth" }));
ok("printed fields (supplier, source, chosen option) block; the client's note only warns", blocks({ description: "Kitchen bench", supplier: "Engineered stone, Example Stone Co" }) && blocks({ description: "Kitchen bench", source: "Engineered stone sample board" })
  && blocks({ answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "other", label: "Engineered stone" }] } }) && warnsOnly({ description: "Kitchen bench", answer: { v: 1, state: "recorded", nature: "choice", selected: [], clientNote: "We'd like engineered stone if possible" } }));
ok("the product pattern finds a mention in free text (the document check scans what each document prints)", restrictedInText("Allow for an engineered stone island").length === 1 && restrictedInText("No engineered stone on this job").length === 1 && restrictedInText("Porcelain benches").length === 0);
ok("the pricing guide no longer offers engineered stone as a kitchen tier", !/engineered stone/i.test(JSON.stringify(BASELINE_CATEGORIES)));

ok("'replacement' is scope, not a placeholder; REPLACE ME still is (review round 4)", !PLACEHOLDER_RX.test("Full roof replacement") && !PLACEHOLDER_RX.test("Window replacement to the rear")
  && PLACEHOLDER_RX.test("REPLACE ME") && PLACEHOLDER_RX.test("replace_me") && PLACEHOLDER_RX.test("TODO: check"));

section("Font fail-safe (CPB-13)");
ok("Lato only: fine", fontVerdict(["Lato-Regular", "Lato-Bold"]).error === null && fontVerdict(["Lato-Regular"]).warnings.length === 0);
ok("no Lato at all: refused, naming the substitute", /LiberationSans.*needs the Lato font/.test(fontVerdict(["LiberationSans"], {}).error || ""));
ok("…unless DOCUMENT_FONT_CHECK=warn while Lato is being installed", fontVerdict(["LiberationSans"], { DOCUMENT_FONT_CHECK: "warn" }).error === null && fontVerdict(["LiberationSans"], { DOCUMENT_FONT_CHECK: "warn" }).warnings.length === 1);
ok("Lato plus a fallback: a warning naming the fallback font", fontVerdict(["Lato-Regular", "DejaVuSans"]).error === null && /fallback font \(DejaVuSans\)/.test(fontVerdict(["Lato-Regular", "DejaVuSans"]).warnings[0] || ""));
const cjk = build("kestrel", {}, (p) => { p.register.items.find((i) => i.promptKey === "B-005").description = "Basin 洗手盆 ✓"; });
const cjkChecks = registerDocChecks("client_brief", cjk.fx, { register: cjk.p.register, recipientName: "X", mode: "preview" });
ok("characters the font can't print are named before anything is issued", cjkChecks.warnings.some((w) => /may not print/.test(w) && /洗/.test(w) && /✓/.test(w)), flat(cjkChecks.warnings));
const symbolChecks = registerDocChecks("client_brief", build("kestrel", {}, (p) => { p.register.items.find((i) => i.promptKey === "B-005").description = "Basin with ⭐ finish ⌛ ⬜"; }).fx, { register: kp.register, recipientName: "X", mode: "preview" });
ok("…including symbols outside the dingbats block (star, hourglass, white square)", symbolChecks.warnings.some((w) => /may not print/.test(w) && /⭐/.test(w) && /⌛/.test(w) && /⬜/.test(w)), flat(symbolChecks.warnings));
const punct = build("kestrel", {}, (p) => { p.register.items.find((i) => i.promptKey === "B-005").description = "Basin – ‘matte’ “stone-look” — Zoë’s pick, 40° edge, 2 m² × ½, café · Nguyễn → ≤ ™ •"; });
const punctChecks = registerDocChecks("client_brief", punct.fx, { register: punct.p.register, recipientName: "X", mode: "preview" });
ok("ordinary punctuation and accented names don't warn (curly quotes, dashes, °, m², ×, ½, Zoë, Nguyễn, arrows, ™)", /“stone-look”/.test(JSON.stringify(punct.fx)) && !punctChecks.warnings.some((w) => /may not print/.test(w)), flat(punctChecks.warnings));

section("Bounded tables (CPB-04/08)");
const rows = (n) => Array.from({ length: n }, (_, i) => ({ i }));
const shape = (n) => { const r = boundedRows("D", rows(n)); return [r.D_KEEP.length, r.D.length, r.D_PEN.length, r.D_LAST.length].join(","); };
ok("up to three rows stay whole; four or more keep two at the top and two at the bottom", shape(1) === "0,0,0,1" && shape(3) === "2,0,0,1" && shape(4) === "1,1,1,1" && shape(7) === "1,4,1,1");

section("Template structure (cpb-2.4)");
const zip = new PizZip(fs.readFileSync(join(REPO, "public/templates", DOC_DEFS.client_brief.templateFile)));
const docXml = zip.file("word/document.xml").asText(), hdr = zip.file("word/header1.xml")?.asText() || "", ftr = zip.file("word/footer1.xml")?.asText() || "";
const media = Object.keys(zip.files).filter((n) => n.startsWith("word/media/"));
const logo = fs.readFileSync(join(REPO, "public/brand/logo-black.png"));
ok("a real header part carries the original logo, the document type and the project", /HDR_DOC_TYPE/.test(hdr) && /HDR_PROJECT/.test(hdr) && /<a:blip|r:embed/.test(hdr) && media.some((m) => Buffer.compare(zip.file(m).asNodeBuffer(), logo) === 0));
ok("a real footer part carries the identity and Page X of Y", /FTR_IDENTITY/.test(ftr) && /<w:instrText[^>]*>\s*PAGE\s*</.test(ftr) && /<w:instrText[^>]*>\s*NUMPAGES\s*</.test(ftr) && /Page /.test(ftr) && / of /.test(ftr));
ok("no two tables touch (LibreOffice would merge them and lose the repeating header)", !/<\/w:tbl>\s*<w:tbl>/.test(docXml));
ok("each table has a repeating header row: the scope title, each boundary label, each assumptions label, each preference group's header, decisions, steps", (docXml.match(/<w:tblHeader\/>/g) || []).length === 6, (docXml.match(/<w:tblHeader\/>/g) || []).length);
ok("every bullet list is a titled table of Word list paragraphs, one row per item (CPB2-01, review CPB3-L1/L5)", ["SCOPE_ROWS", "B_ROWS", "N_BUL"].every((k) => ["_KEEP", "", "_PEN", "_LAST"].every((sfx) => new RegExp(`<w:numPr>[\\s\\S]{0,400}?\\{-w:tr ${k}${sfx}\\}`).test(docXml)))
  && !/\{#(SCOPE_IN|B_ITEMS|N_BUL_KEEP)\}/.test(docXml));
ok("the status key closes the last preference group only (review CPB3-L4)", /\{-w:tr G_LAST\}[\s\S]{0,300}\{PREF_KEY\}[\s\S]{0,300}\{\/G_LAST\}/.test(docXml) && (docXml.match(/\{PREF_KEY\}/g) || []).length === 1
  && buildClientBriefPayload(fx).PREF_GROUPS.map((g) => g.G_LAST).join() === "false,false,false,false,false,true");
ok("the scope list's title is its header row, so it repeats on the next page (CPB2-01)", /<w:tblHeader\/>[\s\S]{0,1200}What we propose to build/.test(docXml));
{
  // CPB2-06, CPB3-05: one header row per group, the column labels with the group's name in the middle, and it repeats.
  const prefTable = (docXml.match(/\{#PREF_GROUPS\}[\s\S]*?<w:tbl>([\s\S]*?)<\/w:tbl>[\s\S]*?\{\/PREF_GROUPS\}/) || [])[1] || "";
  const firstRow = (prefTable.match(/<w:tr>[\s\S]*?<\/w:tr>/) || [])[0] || "";
  ok("each preference group is its own table with one repeating header row: WHERE · <group> · STATUS (CPB2-06, CPB3-05)", (prefTable.match(/<w:tblHeader\/>/g) || []).length === 1 && /<w:tblHeader\/>/.test(firstRow)
    && /Where[\s\S]*\{GROUP\}[\s\S]*Status/.test(firstRow) && !/G_FIRST/.test(docXml) && !buildClientBriefPayload(fx).PREF_GROUPS.some((g) => "G_FIRST" in g));
  ok("every preference row names its place: bold where the place's run starts, quiet after that (CPB3-04)", /\{WHERE\}[\s\S]{0,400}\{WHERE_AGAIN\}/.test(prefTable)
    && buildClientBriefPayload(fx).PREF_GROUPS.every((g) => { const rows = [...g.ROWS_KEEP, ...g.ROWS, ...g.ROWS_PEN, ...g.ROWS_LAST];
      return rows.every((r, k) => (!!r.WHERE !== !!r.WHERE_AGAIN) && (r.WHERE ? k === 0 || (rows[k - 1].WHERE || rows[k - 1].WHERE_AGAIN) !== r.WHERE : r.WHERE_AGAIN === (rows[k - 1].WHERE || rows[k - 1].WHERE_AGAIN))); }));
}
{
  // CPB3-06: the key explains every status printed, and only those; a Requirement is a need, not a confirmed outcome.
  const printedStatuses = (f) => [...new Set(f.clientBrief.preferences.flatMap((g) => g.items.map((x) => x.status)))];
  const keyOf = (f) => buildClientBriefPayload(f).PREF_KEY.replace(/\u00A0/g, " ");
  const covers = (f) => printedStatuses(f).every((st) => keyOf(f).includes(`${st}: `)) && ["Preferred", "Proposed", "Client-approved", "Requirement", "For consultant review"].filter((st) => !printedStatuses(f).includes(st)).every((st) => !keyOf(f).includes(`${st}: `));
  ok("the status key explains every status printed, and only those (CPB3-06)", covers(fx) && covers(rfxScope) && covers(buildOnly) && keyOf(buildOnly) === "Preferred: the look you like.", keyOf(buildOnly));
  ok("…'Requirement' is explained as a need to be assessed, not a confirmed or promised outcome (review CPB4-W04)", /Requirement: a need you've told us about\. We'll assess whether and how it can be met; it isn't a confirmed outcome\./.test(keyOf(fx)));
  // Review CPB4-L01: an office-only technical note (R-015 tolerances) is never presented as the client's requirement.
  const tol = build("kestrel", {}, (p) => { p.register.items.push(makeItem({ id: "ri_kc_tol", itemKind: "requirement", promptKey: "R-015", category: "structure", roomId: "k_kitchen", section: "room", technicalStatus: "needs_verification", responsibility: "architect", description: "Floor level within 3 mm over 3 m before the island cabinetry is set out" })); }).fx;
  ok("…an office-only tolerance note is never shown as a client Requirement; it stays under 'Still to be checked'", !flat(tol.clientBrief.preferences).includes("Floor level within 3 mm")
    && tol.clientBrief.boundaries.find((b) => b.label === "Still to be checked").items.some((x) => /Floor level within 3 mm/.test(x.text)), flat(tol.clientBrief.preferences.at(-1)));
}
ok("a multi-word status name can't break across a line: non-breaking spaces inside it (verification CLOSE-02)", buildClientBriefPayload(fx).PREF_KEY.includes("For\u00A0consultant\u00A0review: ")
  && !/For consultant review/.test(buildClientBriefPayload(fx).PREF_KEY));
ok("the closing box sits under a fixed spacer row, not a white border that would paint over the steps table's last rule (verification REG-01)",
  /\{\/HAS_PTSA\}[\s\S]{0,2500}?<w:trHeight w:val="100" w:hRule="exact"\/>[\s\S]{0,2500}?\{ABOUT_LABEL\}/.test(docXml) && !/<w:top w:val="single" w:color="FFFFFF" w:sz="40"\/>/.test(docXml));
ok("headings are Word styles (PDF outline, editable DOCX)", /w:styleId="Heading1"/.test(zip.file("word/styles.xml").asText()) && (docXml.match(/<w:pStyle w:val="Heading1"\/>/g) || []).length >= 6);
ok("no forced page breaks", !/w:type="page"|pageBreakBefore/.test(docXml));
ok("Lato only in the template", !/w:ascii="(?!Lato)[^"]+"/.test(docXml + hdr + ftr));

section("Final inspection of the five specimens (review 4)");
{
  const pay = buildClientBriefPayload(fx), bo = buildClientBriefPayload(buildOnly);
  const { fx: rf } = build("ridgeline", { recipientName: "X" }), rpay = buildClientBriefPayload(rf);
  const plans = build("kestrel", { revision: 2, supersedes: { label: "R01", issuedDate: "2026-11-15" }, issuedDate: "2026-11-16" }, plansSuppliedRevision).fx;
  ok("the PTSA note adds one fact and no acronym; the table row isn't repeated (KESTREL-01)", !pay.PTSA_NOTE.includes("PTSA") && !pay.PTSA_NOTE.includes("design and pricing services")
    && [...pay.STEPS_KEEP, ...pay.STEPS, ...pay.STEPS_PEN, ...pay.STEPS_LAST].some((r) => /design and pricing services/.test(r.STEXT)), pay.PTSA_NOTE);
  ok("the closing note says 'We prepared this brief', never the issuer's name mid-sentence (KESTREL-03)", /^We prepared this brief from our discussions and the information recorded for your project\./.test(pay.ABOUT_BODY)
    && !buildClientBriefPayload(build("kestrel", { issuer: "Sam Morris, Blue Leaf Building" }).fx).ABOUT_BODY.includes("Sam Morris"), pay.ABOUT_BODY);
  ok("one decision reads 'This needs …', several 'These need …', and nobody is 'someone' (POWDER-03)", buildOnly.clientBrief.decisions.length === 1 && /^This needs to be settled/.test(bo.DECISIONS_INTRO)
    && /^These need to be settled/.test(pay.DECISIONS_INTRO) && !/someone/.test(bo.DECISIONS_INTRO + pay.DECISIONS_INTRO), bo.DECISIONS_INTRO);
  const boAssume = bo.NOTED.at(-1).N_ITEMS.map((x) => x.TEXT).join(" ");
  ok("the drawing basis is quoted, never set into a sentence's grammar (POWDER-01, CONSISTENCY-07)", /^This is the building work we currently propose, based on the drawing basis above\./.test(bo.SCOPE_INTRO)
    && /This brief is based on the drawing basis recorded on page 1 \(Measured sketch, 6 November 2026\)\./.test(boAssume) && !/based on Measured|The drawings \(/.test(bo.SCOPE_INTRO + boAssume), `${bo.SCOPE_INTRO} | ${boAssume}`);
  const label = (f) => buildClientBriefPayload(f).META_ROWS.flatMap((r) => Object.values(r)).join(" | ");
  ok("the cover names the brief's own pathway and the type in sentence case (CONSISTENCY-01, RIDGELINE-08)", plans.project.projectLabel === "Renovation · Plans supplied" && buildOnly.project.projectLabel === "Renovation · Build only"
    && rf.project.projectLabel === "New build · Design & build" && !/Design & build/.test(label(plans)), `${plans.project.projectLabel} | ${rf.project.projectLabel}`);
  const wheres = rf.clientBrief.preferences.flatMap((g) => g.items.map((x) => x.where));
  ok("a room named only by an adjective reads as a room in the table, as in the scope list (RIDGELINE-03)", wheres.includes("Family room") && !wheres.includes("Family"), [...new Set(wheres)].join());
  ok("the boundaries heading names only the lists that print (RIDGELINE-11)", cb.boundaryTitle === "What stays, what's not included and what still needs checking"
    && !/stays/i.test(rf.clientBrief.boundaryTitle) && rpay.BOUNDARY_TITLE === rf.clientBrief.boundaryTitle && /\{BOUNDARY_TITLE\}/.test(docXml) && !/What stays, what's not included, and/.test(docXml), rf.clientBrief.boundaryTitle);
  const plansPay = buildClientBriefPayload(plans);
  ok("a later revision says which issued revision it replaces, on page 1; R01 and a draft don't (R02-01)", /^This revision replaces R01, issued 15 November 2026\. This brief records/.test(plansPay.STATUS_BODY)
    && !/replaces/.test(pay.STATUS_BODY) && !/replaces/.test(buildClientBriefPayload(build("kestrel", { status: "Draft", revision: 2, supersedes: { label: "R01", issuedDate: "2026-11-15" } }).fx).STATUS_BODY), plansPay.STATUS_BODY);
  const pSteps = plans.clientBrief.nextSteps.steps;
  ok("plans supplied: where we are now is 'Plans review', as the label says (CONSISTENCY-04); design and build records the direction discussed, not 'agreed' (KESTREL-05)",
    pSteps[0].label === "Plans review" && pSteps[0].current && plans.project.stageLabel === "Plans review" && steps(fx).steps[0].text === "We record the direction discussed so far in this brief.", flat(pSteps[0]));
  ok("an issue is dated by the Adelaide calendar, not UTC (9 am in Adelaide on 16 Nov is 16 Nov)", adelaideDay(new Date("2026-11-15T22:30:00Z")) === "2026-11-16" && adelaideDay(new Date("2026-11-15T12:00:00Z")) === "2026-11-15");
  ok("an absent PTSA note removes its whole row, and the last preference group adds no extra gap (CONSISTENCY-09, KESTREL-07)",
    /\{-w:tr HAS_PTSA\}[\s\S]{0,1500}?\{PTSA_NOTE\}[\s\S]{0,1500}?\{\/HAS_PTSA\}/.test(docXml) && !/\{#HAS_PTSA\}/.test(docXml) && /\{\^G_LAST\}[\s\S]{0,2000}?\{\/G_LAST\}[\s\S]{0,1500}?\{\/PREF_GROUPS\}/.test(docXml));
}

section("Rendered through LibreOffice");
const tmp = fs.mkdtempSync(join(tmpdir(), "cpb-test-"));
const text = (pdf, page) => { try { return execFileSync("pdftotext", [...(page ? ["-f", String(page), "-l", String(page)] : []), pdf, "-"], { encoding: "utf8" }); } catch { return null; } };
const pdfPages = (pdf) => { try { return Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1]); } catch { return 0; } };
const kOut = await renderRegisterDocument("client_brief", fx, {});
const kPdf = join(tmp, "k.pdf"); fs.writeFileSync(kPdf, kOut.pdf);
ok("no unfilled tag or empty value", kOut.leaks.length === 0, kOut.leaks.join());
const kPages = pdfPages(kPdf);
if (text(kPdf) === null) ok("poppler tools available (pdftotext, pdfinfo, pdffonts)", false, "install poppler to run the render checks");
else {
  ok("Kestrel Court is 3 to 5 pages", kPages >= 3 && kPages <= 5, `pages ${kPages}`);
  ok("every page carries the header and 'Page n of N'", Array.from({ length: kPages }, (_, i) => i + 1).every((n) => /CLIENT PROJECT BRIEF/.test(text(kPdf, n)) && new RegExp(`Page ${n} of ${kPages}`).test(text(kPdf, n))));
  ok("the identity is on every page", Array.from({ length: kPages }, (_, i) => i + 1).every((n) => /BLB-CPB-0417-R01/.test(text(kPdf, n))));
  ok("the required preliminary wording is on page 1", /not a construction\s+specification, a fixed-price quotation or a contract/.test(text(kPdf, 1).replace(/\s+/g, " ")));
  let fonts = ""; try { fonts = execFileSync("pdffonts", [kPdf], { encoding: "utf8" }); } catch { /* checked above */ }
  ok("only Lato is embedded (no substitution)", /Lato-Regular/.test(fonts) && fonts.split("\n").slice(2).filter(Boolean).every((l) => /Lato-/.test(l)), fonts);
  const decisionRefs = (pdf, n) => (text(pdf, n).match(/^[A-Z]\d{3}[-‑][0-9A-Z]{3}$/gm) || []).length;
  const decPages = Array.from({ length: kPages }, (_, i) => i + 1).filter((n) => decisionRefs(kPdf, n) > 0);
  ok("the decisions table never leaves a single row on a page", decPages.every((n) => decisionRefs(kPdf, n) >= 2), `rows per page ${decPages.map((n) => decisionRefs(kPdf, n))}`);
  const lastLines = (pdf) => { const n = pdfPages(pdf); return text(pdf, n).split("\n").filter((l) => l.trim()).length; };
  ok("no near-empty last page (at least 25 lines on it)", lastLines(kPdf) >= 25, `last page ${lastLines(kPdf)} lines`);
  {
    // Final inspection KESTREL-07: the gap above "04 / ASSUMPTIONS" (after the preference tables and their key) is no
    // larger than the gap above "06 / NEXT STEPS" (after the decisions table). Measured from the PDF's word boxes.
    const gapAbove = (pdf, word) => { let html = ""; try { html = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" }); } catch { return null; }
      for (const pg of html.split("<page ").slice(1)) {
        const words = [...pg.matchAll(/yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([^<]*)</g)].map((m) => ({ y0: +m[1], y1: +m[2], w: m[3] }));
        const at = words.find((x, k) => x.w === word && words[k + 1]?.w === "/"); if (!at) continue;
        const above = words.filter((x) => x.y1 < at.y0 - 0.5).map((x) => x.y1); return above.length ? at.y0 - Math.max(...above) : null; }
      return null; };
    const g4 = gapAbove(kPdf, "04"), g6 = gapAbove(kPdf, "06");
    ok("the gap above '04 / Assumptions' is no larger than the gap after any other table (KESTREL-07)", g4 !== null && g6 !== null && g4 <= g6 + 4, `04: ${g4?.toFixed(1)} pt, 06: ${g6?.toFixed(1)} pt`);
  }
  ok("the closing note shares its page with the end of the steps table", /ABOUTTHISDOCUMENT/.test(text(kPdf, kPages).replace(/\s+/g, "")) && /Building contract/.test(text(kPdf, kPages)));
  ok("every font is Lato, read straight from the PDF (the issue fail-safe)", kOut.fonts.length > 0 && kOut.fonts.every((f) => /^Lato-/.test(f)), kOut.fonts.join());
  ok("a substituted font is caught", pdfFontNames(Buffer.from("<< /Type /Font /BaseFont /ABCDEF+LiberationSerif >> << /BaseFont /Lato-Bold >>")).join() === "LiberationSerif,Lato-Bold");
  const { fx: rfx } = build("ridgeline", { recipientName: "Alexander and Catherine Montgomery-Hargreaves" });
  const rPdf = join(tmp, "r.pdf"); fs.writeFileSync(rPdf, (await renderRegisterDocument("client_brief", rfx, {})).pdf);
  const rPages = pdfPages(rPdf);
  // Layout text, first body line of each page (lines 0-1 are the page header).
  const opener = (pdf, n) => { let lt = ""; try { lt = execFileSync("pdftotext", ["-layout", "-f", String(n), "-l", String(n), pdf, "-"], { encoding: "utf8" }); } catch { return ""; } return (lt.split("\n").filter((l) => l.trim())[2] || "").trim(); };
  // A group's header row, "WHERE <GROUP> STATUS", compared with its spaces removed (pdftotext letter-spaces capitals).
  const GROUPS_RE = "(EXTERIOR|WINDOWSANDDOORS|INTERIORFINISHES|JOINERYANDKITCHEN|BATHROOMSANDLAUNDRY|SERVICESANDFIXTURES|OUTDOORAREAS|REQUIREMENTSANDGOALS)";
  const HEAD_RE = new RegExp(`^WHERE${GROUPS_RE}STATUS$`);
  const BANDS = { test: (l) => HEAD_RE.test(String(l).replace(/\s+/g, "")) };
  // Continuation pages are chosen by content, not by what they open with (review CPB3-H08): any page after the one where
  // section 03 starts that shows preference rows before the next section's kicker.
  const STATUS_ROW = /(Preferred|Proposed|Client-approved|Requirement|For consultant review)\s*$/m;
  const prefStart = Array.from({ length: rPages }, (_, i) => i + 1).find((n) => /Your preferences so far/.test(text(rPdf, n)));
  const layoutPage = (pdf, n) => { try { return execFileSync("pdftotext", ["-layout", "-f", String(n), "-l", String(n), pdf, "-"], { encoding: "utf8" }); } catch { return ""; } };
  const continued = Array.from({ length: rPages }, (_, i) => i + 1).filter((n) => n > prefStart && STATUS_ROW.test(layoutPage(rPdf, n).split(/^\s*0\d\s+\/\s/m)[0]));
  ok("every page that continues the preferences opens with its group header (the column labels and the group), never a bare row (CPB2-06, CPB3-05)", continued.length >= 1 && continued.every((n) => BANDS.test(opener(rPdf, n))), `continued pages ${continued}; openers ${continued.map((n) => opener(rPdf, n))}`);
  {
    // A group longer than a page must split mid-group: the page it continues on opens with the same band (CPB2-06).
    const huge = build("ridgeline", { recipientName: "X" }, (p) => { const l = p.register.meta.rooms.find((r) => r.name === "Laundry");
      for (let k = 0; k < 30; k++) p.register.items.push(makeItem({ id: `ri_rd_h${k}`, itemKind: "selection", promptKey: "B-009", category: "tiles", roomId: l.id, room: l.name, section: "room", certainty: "preference", description: `Laundry selection ${k + 1}` })); }).fx;
    const hPdf = join(tmp, "huge.pdf"); fs.writeFileSync(hPdf, (await renderRegisterDocument("client_brief", huge, {})).pdf);
    const head = "WHEREBATHROOMSANDLAUNDRYSTATUS";
    const hasHead = (n) => layoutPage(hPdf, n).split("\n").some((l) => l.replace(/\s+/g, "") === head);
    const splits = Array.from({ length: pdfPages(hPdf) }, (_, i) => i + 1).filter((n) => n > 1 && opener(hPdf, n).replace(/\s+/g, "") === head && hasHead(n - 1));
    ok("…a group split mid-way repeats its own header on the next page (41-row bathrooms and laundry group)", splits.length >= 1, `pages opening with the repeated header: ${splits}`);
  }
  {
    // CPB3-04: the same everyday wording in three rooms, none of it naming its room. Wherever the page breaks, every row
    // names its place, and it is the right place: the rows read top to bottom, page after page, name exactly the
    // places of the records in order. At least one break falls inside a room's run.
    const SAME = ["Wall-hung toilet", "Brushed nickel tapware", "Matte porcelain floor tiles", "Floating timber-look vanity", "Frameless shower screen", "Heated towel rail",
      "Recessed shaving cabinet", "Large-format wall tiles", "Linear floor waste", "Undermount basin", "Wall niche in the shower", "Mirror with a soft backlight"];
    for (const extra of [0, 5]) {
      const same = build("ridgeline", { recipientName: "X" }, (p) => { for (const name of ["Ensuite", "Bathroom", "Laundry"]) { const r = p.register.meta.rooms.find((x) => x.name === name);
        SAME.slice(0, name === "Laundry" ? SAME.length - extra : SAME.length).forEach((d, k) => p.register.items.push(makeItem({ id: `ri_rd_${name}_${k}`, itemKind: "selection", promptKey: "B-009", category: "tiles", roomId: r.id, room: r.name, section: "room", certainty: "preference", description: d }))); } }).fx;
      const sPdf = join(tmp, `same-${extra}.pdf`); fs.writeFileSync(sPdf, (await renderRegisterDocument("client_brief", same, {})).pdf);
      const expected = same.clientBrief.preferences.flatMap((g) => g.items.map((x) => x.where));
      const places = [...new Set(expected)].sort((a, b) => b.length - a.length);
      const seen = [], openersOk = [], midRun = [];
      for (let n = 1; n <= pdfPages(sPdf); n++) {
        const rowsHere = layoutPage(sPdf, n).split("\n").filter((l) => STATUS_ROW.test(l) && !/:\s+(the look|a specific|you've|a need|checked)/.test(l));
        const named = rowsHere.map((l) => places.find((pl) => l.trim().startsWith(pl)) || "");
        if (n > prefStart && named.length && BANDS.test(opener(sPdf, n))) { openersOk.push(n); if (seen.length && named[0] === seen.at(-1)) midRun.push(`p${n} ${named[0]}`); }
        seen.push(...named);
      }
      ok(`…every row names the right place, wherever the page breaks (three rooms with the same wording${extra ? ", break moved" : ""}) (CPB3-04)`, seen.length === expected.length && seen.every((w, k) => w === expected[k]) && midRun.length >= 1,
        `rows ${seen.length}/${expected.length}; first mismatch ${seen.findIndex((w, k) => w !== expected[k])}; continued inside a run: ${midRun.join(", ") || "none"}; continued pages ${openersOk}`);
    }
  }
  const kScopePages = Array.from({ length: kPages }, (_, i) => i + 1).filter((n) => /What we propose to build/.test(text(kPdf, n)));
  ok("a scope list that runs onto the next page opens it with its title again (CPB2-01)", kScopePages.length === 2 && opener(kPdf, kScopePages[1]) === "What we propose to build", `pages ${kScopePages}; opener "${opener(kPdf, kScopePages[1])}"`);
  // Move the page break through every list in sections 02 and 04 (extra scope records push them down), with and
  // without a long exclusions list: no page may open with a bullet, and a list split across pages repeats its label
  // and note on the next page (review CPB3-L1).
  {
    const push = (n, exclusions) => build("kestrel", {}, (p) => { const room = p.register.meta.rooms[0];
      for (let k = 0; k < exclusions; k++) p.register.items.push(makeItem({ id: `ri_ex_${k}`, itemKind: "scope", category: "external", promptKey: "W-010", section: "site", disposition: "excluded", description: `Excluded external item ${k + 1}, outside the current scope` }));
      for (let k = 0; k < n; k++) p.register.items.push(makeItem({ id: `ri_sw_${k}`, itemKind: "scope", category: "scope", promptKey: "R-003", roomId: room.id, room: room.name, section: "room", disposition: "new", description: `Extra built-in joinery run ${k + 1} along the north wall` })); }).fx;
    const bareBullet = [], repeated = [];
    for (const [n, ex] of [[12, 0], [16, 0], [22, 0], [16, 9], [20, 9]]) {
      const f = join(tmp, `sweep-${n}-${ex}.pdf`); fs.writeFileSync(f, (await renderRegisterDocument("client_brief", push(n, ex), {})).pdf);
      for (let pg = 2; pg <= pdfPages(f); pg++) {
        const lines = layoutPage(f, pg).split("\n").filter((l) => l.trim());
        if (/^\s*•/.test(lines[2] || "")) bareBullet.push(`${n}/${ex} p${pg}: ${lines[2].trim().slice(0, 40)}`);
        if (/NOTINTHECURRENTSCOPE/.test((lines[2] || "").replace(/\s+/g, "")) && /Not part of the work proposed now/.test(lines[3] || "") && /Excluded external item [2-9]/.test(lines[4] || "")) repeated.push(`${n}/${ex} p${pg}`);
      }
    }
    ok("no page opens with a bullet whose title is on the page before, wherever the break falls (review CPB3-L1)", bareBullet.length === 0, bareBullet.join(" | "));
    ok("…a boundary list split across pages repeats its label and note above the continued items", repeated.length >= 1, `repeated at ${repeated.join(", ") || "none"}`);
  }
  const keyPage = Array.from({ length: rPages }, (_, i) => i + 1).find((n) => /Preferred: the look you like/.test(text(rPdf, n)));
  ok("the status key sits under the last preference rows, never alone at the top of a page (review CPB3-L4)", !!keyPage && !/^Preferred: the look you like/.test(opener(rPdf, keyPage)) && STATUS_ROW.test(layoutPage(rPdf, keyPage).split("Preferred: the look you like")[0]), `key on page ${keyPage}`);
  ok("the long project has no near-empty last page", lastLines(rPdf) >= 25, `last page ${lastLines(rPdf)} lines, ${rPages} pages`);
  const assumesPage = Array.from({ length: rPages }, (_, i) => i + 1).find((n) => /THISBRIEFASSUMES/.test(text(rPdf, n).replace(/\s+/g, "")));
  ok("a short list stays whole with its label (the three working assumptions on one page)", !!assumesPage && /will need to confirm/.test(text(rPdf, assumesPage)) && /not set by this document/.test(text(rPdf, assumesPage).replace(/\s+/g, " ")), `label on page ${assumesPage}`);
  // Layout text keeps visual order: after the last band on a page, at least two rows (status words) must follow it.
  const bandRowsAfter = (pdf, n) => { let lt = ""; try { lt = execFileSync("pdftotext", ["-layout", "-f", String(n), "-l", String(n), pdf, "-"], { encoding: "utf8" }); } catch { return null; }
    const lines = lt.split("\n"); const last = lines.map((l) => l.replace(/\s+/g, "")).findLastIndex((l) => HEAD_RE.test(l));
    return last < 0 ? null : lines.slice(last + 1).filter((l) => /(Preferred|Proposed|Client-approved|Requirement|For consultant review)\s*$/.test(l)).length; };
  const bandTails = Array.from({ length: rPages }, (_, i) => bandRowsAfter(rPdf, i + 1)).filter((x) => x !== null);
  ok("a preference group's header never ends a page with fewer than two of its rows", bandTails.length >= 2 && bandTails.every((x) => x >= 2), `rows after the last band on each page: ${bandTails}`);
  // The reviewer's case: a big bathrooms group (19 rows) pushes the table's last group across a page. The page the
  // table continues on must open with at least two rows, never one row then the next section.
  const big = build("ridgeline", { recipientName: "X" }, (p) => { const ldry = p.register.meta.rooms.find((r) => r.name === "Laundry");
    ["Laundry trough with a pull-out mixer", "Overhead cupboards to the ceiling", "Benchtop over the appliances", "Hanging rail above the trough", "Tiled splashback to match the ensuite", "Floor waste and tiled floor", "Drying cupboard with a heated rail", "Broom cupboard"]
      .forEach((d, k) => p.register.items.push(makeItem({ id: `ri_rd_x${k}`, itemKind: "selection", promptKey: "B-009", category: "tiles", roomId: ldry.id, room: ldry.name, section: "room", certainty: "preference", description: d }))); }).fx;
  const bPdf = join(tmp, "big.pdf"); fs.writeFileSync(bPdf, (await renderRegisterDocument("client_brief", big, {})).pdf);
  const bPages = pdfPages(bPdf);
  const statusRows = (t) => t.split("\n").filter((l) => /(Preferred|Proposed|Client-approved|Requirement|For consultant review)\s*$/.test(l)).length;
  // A continuation page: right under the page header comes the repeated group header. Count its rows up to the next
  // section kicker ("04 / ASSUMPTIONS").
  const openers = Array.from({ length: bPages }, (_, i) => i + 1).slice(1).map((n) => { let lt = ""; try { lt = execFileSync("pdftotext", ["-layout", "-f", String(n), "-l", String(n), bPdf, "-"], { encoding: "utf8" }); } catch { /* poppler checked */ }
    const lines = lt.split("\n").filter((l) => l.trim());
    if (!BANDS.test(lines[2] || "")) return null;
    const end = lines.findIndex((l, k) => k > 2 && /^\s*0\d\s+\//.test(l));
    return statusRows(lines.slice(3, end < 0 ? undefined : end).join("\n")); }).filter((x) => x !== null);
  ok("a continued preferences table opens its page with at least two rows (reviewer's 19-row case)", openers.length >= 1 && openers.every((x) => x >= 2), `rows at the top of each continuation page: ${openers}; pages ${bPages}`);
  const boPdf = join(tmp, "bo.pdf"); fs.writeFileSync(boPdf, (await renderRegisterDocument("client_brief", buildOnly, {})).pdf);
  const boText = text(boPdf).replace(/\s+/g, " ");
  ok("the rendered build-only brief never mentions concept design or a PTSA (CPB-01)", !/PTSA|Concept|pre-construction agreement/i.test(boText) && /Confirm the scope/.test(boText) && pdfPages(boPdf) <= 2, boText.slice(0, 200));
  const { fx: pfx } = build("powder", { recipientName: "Priya Raman" });
  pfx.clientBrief.decisions = [];
  const pPdf = join(tmp, "p.pdf"); fs.writeFileSync(pPdf, (await renderRegisterDocument("client_brief", pfx, {})).pdf);
  const pText = text(pPdf);
  ok("an empty section disappears, and the sections renumber", !/Decisions to make/.test(pText) && /05\/NEXTSTEPS/.test(pText.replace(/\s+/g, "")), pText.slice(0, 300));
  ok("a short job stays short", pdfPages(pPdf) <= 2, `pages ${pdfPages(pPdf)}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\ndocuments-cpb: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
