// master-register-r02.test.mjs — Master Register (R02 Increment 1) model acceptance tests.
// No DB, no network, no UI — exercises the pure model in src/lib/register.js against three fictional
// nonproduction projects (A reno+extension, B new build, C powder-room/laundry).
// Run: node scripts/tests/master-register-r02.test.mjs   (or: npm run test:register-r02)

import {
  readRegister, writeRegister, emptyMeta, makeItem, makeRoom, roomPrompts, WHOLE_HOUSE_PROMPTS,
  applyDefaultToRooms, outstandingItems, resumePointer, buildDocViews, isOutstanding,
  REGISTER_DISPOSITIONS, REGISTER_CERTAINTY, SETTLED_DISPOSITIONS,
} from "../../src/lib/register.js";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// ── Fixture builders ──────────────────────────────────────────────────────────────────────────
function reg(meta, items) { return { meta: emptyMeta(meta), items: items.map((i) => makeItem(i)) }; }

// A — renovation + extension, two levels, 10+ rooms, mixed existing/new.
function fixtureA() {
  const rooms = [
    makeRoom({ level: "Ground", name: "Entry", roomType: "hall", scope: "renovated", order: 0 }),
    makeRoom({ level: "Ground", name: "Living", roomType: "living", scope: "renovated", order: 1 }),
    makeRoom({ level: "Ground", name: "Kitchen", roomType: "kitchen", scope: "new", order: 2 }),
    makeRoom({ level: "Ground", name: "Scullery", roomType: "scullery", scope: "new", order: 3 }),
    makeRoom({ level: "Ground", name: "Laundry", roomType: "laundry", scope: "renovated", order: 4 }),
    makeRoom({ level: "Ground", name: "Powder", roomType: "wc", scope: "new", order: 5 }),
    makeRoom({ level: "Ground", name: "Alfresco", roomType: "alfresco", scope: "new", order: 6 }),
    makeRoom({ level: "First", name: "Master bed", roomType: "bedroom", scope: "new", order: 7 }),
    makeRoom({ level: "First", name: "Ensuite", roomType: "ensuite", scope: "new", order: 8 }),
    makeRoom({ level: "First", name: "Bed 2", roomType: "bedroom", scope: "new", order: 9 }),
    makeRoom({ level: "First", name: "Main bath", roomType: "bathroom", scope: "new", order: 10 }),
    makeRoom({ level: "First", name: "Stair", roomType: "stairs", scope: "new", order: 11 }),
  ];
  const kitchen = rooms.find((r) => r.name === "Kitchen");
  const items = [
    makeItem({ itemKind: "scope", category: "notes", promptKey: "wh_goals", isDefault: true, room: "Whole house", description: "Open-plan ground floor, storage-led, medium-high quality", disposition: "new" }),
    makeItem({ itemKind: "selection", category: "flooring", promptKey: "wh_flooring", isDefault: true, room: "Whole house", description: "Engineered oak-look timber", certainty: "preference" }),
    // Kitchen (ground): a scope record + a selection record on the same room
    makeItem({ itemKind: "scope", category: "scope", promptKey: "scope_change", roomId: kitchen.id, level: "Ground", room: "Kitchen", description: "New kitchen; demolish existing; retain adjoining service wall", disposition: "new" }),
    makeItem({ itemKind: "selection", category: "benchtop", promptKey: "k_bench", roomId: kitchen.id, level: "Ground", room: "Kitchen", description: "Stone-look benchtop", product: "", certainty: "preference" }),
    makeItem({ itemKind: "selection", category: "appliances", promptKey: "k_appliances", roomId: kitchen.id, level: "Ground", room: "Kitchen", description: "Appliance supply owner undecided", disposition: "undecided", responsibility: "client" }),
    // An excluded scope item — must never appear in the selections schedule
    makeItem({ itemKind: "scope", category: "external", promptKey: "notes", roomId: rooms.find((r) => r.name === "Alfresco").id, room: "Alfresco", description: "Landscaping to rear yard", disposition: "excluded" }),
  ];
  return reg({ planRev: "DA Rev C", projectType: "renovation_extension", deliveryModel: "design_build", renovationOverlay: true, rooms }, items);
}

// B — new build with whole-house defaults + a single room exception.
function fixtureB() {
  const rooms = [
    makeRoom({ level: "Ground", name: "Living", roomType: "living", scope: "new", order: 0 }),
    makeRoom({ level: "Ground", name: "Kitchen", roomType: "kitchen", scope: "new", order: 1 }),
    makeRoom({ level: "Ground", name: "Bed 1", roomType: "bedroom", scope: "new", order: 2 }),
    makeRoom({ level: "Ground", name: "Bed 2", roomType: "bedroom", scope: "new", order: 3 }),
    makeRoom({ level: "Ground", name: "Media", roomType: "living", scope: "new", order: 4 }),
  ];
  const items = [
    makeItem({ itemKind: "selection", category: "flooring", promptKey: "wh_flooring", isDefault: true, room: "Whole house", description: "Hybrid flooring throughout", certainty: "proposed" }),
    makeItem({ itemKind: "selection", category: "paint", promptKey: "wh_paint", isDefault: true, room: "Whole house", description: "Dulux Natural White", certainty: "proposed" }),
  ];
  return reg({ planRev: "WD Rev A", projectType: "new_build", deliveryModel: "design_build", rooms }, items);
}

// C — short powder-room / laundry refresh.
function fixtureC() {
  const rooms = [
    makeRoom({ level: "Ground", name: "Powder", roomType: "wc", scope: "renovated", order: 0 }),
    makeRoom({ level: "Ground", name: "Laundry", roomType: "laundry", scope: "renovated", order: 1 }),
  ];
  const items = [
    makeItem({ itemKind: "selection", category: "sanitary", promptKey: "w_fixtures", roomId: rooms[0].id, room: "Powder", description: "Wall-hung basin + toilet", certainty: "preference" }),
    makeItem({ itemKind: "selection", category: "joinery", promptKey: "l_joinery", roomId: rooms[1].id, room: "Laundry", description: "Laminate cabinetry, stone top", certainty: "preference" }),
  ];
  return reg({ planRev: "Sketch v2", projectType: "renovation", deliveryModel: "design_build", rooms }, items);
}

const A = fixtureA(), B = fixtureB(), C = fixtureC();
const leadA = { id: "lead-A", name: "Jess & Rick", project_type: "renovation_extension", selections_schedule: writeRegister(A) };

// ── T01 — scope disposition and selection certainty are DISTINCT axes (data guard) ──────────────
ok("T01 scope vs selection: disposition and certainty are separate vocabularies, independently set",
  Object.keys(REGISTER_DISPOSITIONS).length >= 8 && Object.keys(REGISTER_CERTAINTY).length === 4 &&
  !Object.keys(REGISTER_CERTAINTY).some((k) => k in REGISTER_DISPOSITIONS) &&
  (() => { const it = makeItem({ disposition: "new", certainty: "client_approved" }); return it.disposition === "new" && it.certainty === "client_approved"; })());

// ── T02 — save → reopen exactly where left off, no data loss ─────────────────────────────────────
{
  const kitchen = A.meta.rooms.find((r) => r.name === "Kitchen");
  const withResume = { ...A, meta: emptyMeta({ ...A.meta, lastRoomId: kitchen.id, lastStep: "rooms" }) };
  const persisted = writeRegister(withResume);
  const round = readRegister({ selections_schedule: persisted });
  const benchBefore = A.items.find((i) => i.promptKey === "k_bench");
  const benchAfter = round.items.find((i) => i.id === benchBefore.id);
  const ptr = resumePointer(round);
  ok("T02 save/resume: write→read round-trips meta+items with stable ids; resumes at saved Kitchen",
    round.items.length === A.items.length && !!benchAfter && benchAfter.description === benchBefore.description &&
    round.meta.planRev === "DA Rev C" && round.meta.renovationOverlay === true &&
    ptr.step === "rooms" && ptr.roomId === kitchen.id);
}

// ── T03 — room prompts are type-specific; reno overlay adds demolition; irrelevant prompts absent ─
{
  // R03: prompts come from the Tab 21 library (K-005 benchtop, K-008 appliances, B-012 waterproofing,
  // R-013 existing-to-new / make good). Technical (stage D) prompts are hidden at Concept by default.
  const k = roomPrompts("kitchen").map((p) => p.key);
  const br = roomPrompts("bedroom").map((p) => p.key);
  const bathConcept = roomPrompts("bathroom").map((p) => p.key);
  const bathDetail = roomPrompts("bathroom", { stage: "consultants" }).map((p) => p.key);
  const brReno = roomPrompts("bedroom", { renovationOverlay: true }).map((p) => p.key);
  ok("T03 room-prompt specificity: kitchen has benchtop/appliances; bedroom does not; bathroom waterproofing appears at detail stage only; reno adds make-good without leaking kitchen prompts",
    k.includes("K-005") && k.includes("K-008") && !br.includes("K-005") &&
    !bathConcept.includes("B-012") && bathDetail.includes("B-012") &&
    brReno.includes("R-013") && !brReno.includes("K-005") && !br.includes("R-013"));
}

// ── T04 — a whole-house default applies to chosen rooms as explicit records; one exception; others untouched; idempotent ─
{
  const floorDefault = B.items.find((i) => i.isDefault && i.promptKey === "wh_flooring");
  const [r1, r2, r3] = B.meta.rooms; // Living, Kitchen, Bed 1
  let next = applyDefaultToRooms(B, floorDefault.id, [r1.id, r2.id, r3.id]);
  const overrides = () => next.items.filter((i) => i.overridesDefaultId === floorDefault.id);
  const applied = overrides().length === 3;
  // Exception: change r2 (Kitchen) flooring only
  const r2Item = overrides().find((i) => i.roomId === r2.id);
  next = { ...next, items: next.items.map((i) => (i.id === r2Item.id ? makeItem({ ...i, description: "Tiles (wet-rated)", certainty: "preference" }) : i)) };
  const r1Item = overrides().find((i) => i.roomId === r1.id);
  const r3Item = overrides().find((i) => i.roomId === r3.id);
  const othersUntouched = r1Item.description === floorDefault.description && r3Item.description === floorDefault.description;
  const exceptionDiffers = next.items.find((i) => i.id === r2Item.id).description === "Tiles (wet-rated)";
  // Idempotent re-apply: no duplicate override rows
  const again = applyDefaultToRooms(next, floorDefault.id, [r1.id, r2.id, r3.id]);
  const noDupes = again.items.filter((i) => i.overridesDefaultId === floorDefault.id).length === 3;
  ok("T04 defaults+exception: default applied to 3 rooms as records; one room overridden; other two unchanged; re-apply is idempotent",
    applied && othersUntouched && exceptionDiffers && noDupes);
}

// ── T05 — advanced product detail is optional; a scope item needs no certainty ──────────────────
{
  const minimal = makeItem({ itemKind: "selection", description: "oak-look flooring preference" });
  const scopeOnly = makeItem({ itemKind: "scope", disposition: "retain", description: "retain service wall" });
  ok("T05 optional detail: a selection with only a direction is valid (no product/model required); a settled scope is not outstanding",
    minimal.product === "" && minimal.model === "" && minimal.description.length > 0 &&
    SETTLED_DISPOSITIONS.has("retain") && isOutstanding(scopeOnly) === false);
}

// ── T07(draft) — Client Brief / Architect Brief / Selections all build from the SAME register ────
{
  // Approve one kitchen selection with evidence, give it a product.
  const approved = { ...A, items: A.items.map((i) => (i.promptKey === "k_bench"
    ? makeItem({ ...i, certainty: "client_approved", product: "Caesarstone", colour: "Cloudburst", evidence: { at: "2026-11-06", by: "staff" } }) : i)) };
  const v = buildDocViews(leadA, approved);
  const benchInSelections = v.selections.find((r) => r.category.includes("Benchtop"));
  const benchInArchitect = v.architectBrief.confirmedOutcomes.some((o) => o.area === "Kitchen");
  const appliancesTBC = v.selections.find((r) => r.room === "Kitchen" && r.category.includes("Appliances"));
  const excludedShown = v.clientBrief.excludedDeferred.some((x) => x.area === "Alfresco");
  const excludedNotInSelections = !v.selections.some((r) => r.room === "Alfresco"); // scope-only, excluded → never a selection row
  ok("T07 draft: same register feeds all three docs; approved selection shows product+status; unknown→TBC; scope-only 'excluded' appears in Client Brief but NEVER in Selections",
    benchInSelections && benchInSelections.product === "Caesarstone" && benchInSelections.status === REGISTER_CERTAINTY.client_approved &&
    benchInArchitect && appliancesTBC && appliancesTBC.product === "TBC" &&
    excludedShown && excludedNotInSelections);
}

// ── Legacy promotion readiness — old {area,item,notes} rows read as items, nothing lost ─────────
{
  const legacy = { selections_schedule: [{ area: "Kitchen", item: "Stone benchtop", notes: "client likes Caesarstone" }, { area: "", item: "Oak floors", notes: "" }] };
  const r = readRegister(legacy);
  const hasIds = r.items.every((i) => typeof i.id === "string" && i.id.length > 3);
  const keptText = r.items[0].description.includes("Stone benchtop") && r.items[0].description.includes("Caesarstone");
  ok("legacy: old finishes rows adopt as items with stable ids and no lost text (promotion-ready)",
    r.items.length === 2 && hasIds && keptText && r.items.every((i) => i.itemKind === "selection"));
}

// ── Fixture coverage sanity (the three demo projects) ───────────────────────────────────────────
{
  const levelsA = new Set(A.meta.rooms.map((r) => r.level));
  ok("fixtures: A reno+extension has 2 levels and 10+ rooms; B new build has defaults; C powder+laundry",
    A.meta.rooms.length >= 10 && levelsA.size === 2 &&
    B.items.some((i) => i.isDefault) &&
    C.meta.rooms.map((r) => r.roomType).sort().join(",") === "laundry,wc");
  // Outstanding list surfaces the undecided appliance owner (A) but not settled scope.
  const out = outstandingItems(A).map((i) => i.promptKey);
  ok("outstanding: undecided appliance owner is outstanding; excluded landscaping scope is not",
    out.includes("k_appliances") && !outstandingItems(A).some((i) => i.disposition === "excluded"));
}

// ── Regression locks from the R02 review (bugs the first pass masked) ───────────────────────────

// FIX #1/#3 — isOutstanding: approved and settled-disposition selections are NOT outstanding.
{
  const approvedSel = makeItem({ itemKind: "selection", certainty: "client_approved" });        // default disposition "undecided"
  const prefSel = makeItem({ itemKind: "selection", certainty: "preference" });
  const byOthersSel = makeItem({ itemKind: "selection", disposition: "by_others", certainty: "not_considered" });
  const undecidedScope = makeItem({ itemKind: "scope", disposition: "undecided" });
  ok("FIX isOutstanding: approved selection NOT outstanding; preference IS; by-others selection NOT (settled); undecided scope IS",
    isOutstanding(approvedSel) === false && isOutstanding(prefSel) === true &&
    isOutstanding(byOthersSel) === false && isOutstanding(undecidedScope) === true);
}

// FIX #1 — an approved selection shows in confirmed outcomes but is removed from next-decisions/outstanding.
{
  const approved = { ...A, items: A.items.map((i) => (i.promptKey === "k_bench"
    ? makeItem({ ...i, certainty: "client_approved", product: "Caesarstone", evidence: { at: "2026-11-06", by: "staff" } }) : i)) };
  const v = buildDocViews(leadA, approved);
  ok("FIX approved selection: in Architect confirmed-outcomes but NOT in Client Brief next-decisions, and not outstanding",
    v.architectBrief.confirmedOutcomes.some((o) => o.area === "Kitchen") &&
    !v.clientBrief.nextDecisions.some((x) => /bench|stone/i.test(x.item || "")) &&
    !outstandingItems(approved).some((i) => i.promptKey === "k_bench"));
}

// FIX #2 — a SELECTION settled as by-others/excluded never reaches the Selections schedule, only the Client Brief.
{
  const powder = C.meta.rooms[0];
  const regBO = { ...C, items: [...C.items, makeItem({ itemKind: "selection", category: "sanitary", roomId: powder.id, room: "Powder", description: "Heated towel rail", disposition: "by_others" })] };
  const vBO = buildDocViews({ id: "c", name: "Priya Nair", project_type: "renovation" }, regBO);
  ok("FIX selections guard: a by-others SELECTION is absent from the Selections schedule but present in the Client Brief excluded/by-others",
    !vBO.selections.some((r) => /towel/i.test(r.item)) && vBO.clientBrief.excludedDeferred.some((x) => /towel/i.test(x.note)));
}

// FIX #6 — legacy Consultants provisional-F&F {area,item,supplier,notes} keeps the supplier on read.
{
  const legacy = { selections_schedule: [{ area: "Kitchen", item: "Tapware", supplier: "Routleys", notes: "chrome" }] };
  const r = readRegister(legacy);
  ok("FIX legacy supplier: Consultants F&F supplier survives the read→register adoption",
    r.items.length === 1 && /Routleys/.test(r.items[0].description) && /chrome/.test(r.items[0].description));
}

// FIX #9 — renaming a room updates the display name in the docs (live room list is canonical, no stale copy).
{
  const kitchen = A.meta.rooms.find((r) => r.name === "Kitchen");
  const renamed = { ...A, meta: emptyMeta({ ...A.meta, rooms: A.meta.rooms.map((r) => (r.id === kitchen.id ? { ...r, name: "Kitchen / Meals" } : r)) }) };
  const v = buildDocViews(leadA, renamed);
  ok("FIX room rename: renamed room shows its new name in the docs and the old name is gone",
    v.selections.some((row) => row.room === "Kitchen / Meals") && !v.selections.some((row) => row.room === "Kitchen"));
}

// FIX #11 — a brand-new room gets NO demolition prompts even under the project renovation overlay.
{
  const newRoomPrompts = roomPrompts("bedroom", { renovationOverlay: true, roomScope: "new" }).map((p) => p.key);
  const renoRoomPrompts = roomPrompts("bedroom", { renovationOverlay: false, roomScope: "renovated" }).map((p) => p.key);
  ok("FIX reno scope: a scope:new room gets no existing-to-new/make-good prompt even with overlay on; a renovated room gets it without the overlay",
    !newRoomPrompts.includes("R-013") && renoRoomPrompts.includes("R-013"));
}

console.log(`\nMaster Register R02 Increment 1 — model tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
