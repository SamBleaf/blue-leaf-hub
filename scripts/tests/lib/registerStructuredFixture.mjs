/**
 * registerStructuredFixture.mjs — one fictional mixed register used by the R05 P3 structured-answer tests.
 *
 * Covers: mixed multi-system walls, partial and linked roof answers, floor defaults by zone, room exception,
 * site facts, repeatable external elements, an existing-works item linked to a room, a risk, a Blue Leaf
 * pricing assumption, an unresolved selection, and selections that settle out of the client store.
 * INTERNAL_MARK sits in every staff-only field, so one string search proves none of them leaked.
 */
import { makeItem, makeRoom, emptyMeta, confirmRoomDefaults } from "../../../src/lib/register.js";

export const INTERNAL_MARK = "ZZINTERNALONLYZZ";

export function buildStructuredRegister() {
  const kitchen = makeRoom({ name: "Kitchen", roomType: "kitchen", level: "Ground", order: 0, sheet: "A101 Rev B" });
  const bed1 = makeRoom({ name: "Bed 1", roomType: "bedroom", level: "First", order: 1 });
  const bed2 = makeRoom({ name: "Bed 2", roomType: "bedroom", level: "First", order: 2 });
  const choice = (selected, more = {}) => ({ v: 1, state: "recorded", nature: "choice", selected, ...more });
  const internal = { note: `${INTERNAL_MARK} staff note` };

  const wallMain = makeItem({ itemKind: "selection", category: "cladding", promptKey: "W-013", section: "project", isDefault: true, certainty: "preference",
    answer: choice([{ path: ["render", "rendered_aac"], label: "Rendered AAC" }], { zone: { key: "main_walls", label: "Main walls" }, ...internal }) });
  const wallFeature = makeItem({ itemKind: "selection", category: "cladding", promptKey: "W-013", section: "project", isDefault: true, certainty: "preference", product: "Feature board 150",
    answer: choice([{ path: ["lightweight_cladding", "fibre_cement_sheet"], label: "Fibre cement sheet" }], { zone: { key: "feature", label: "Feature" }, ...internal }) });
  const roof = makeItem({ itemKind: "selection", category: "roof", promptKey: "W-014", section: "project", isDefault: true,
    answer: choice([{ path: ["metal_roofing", "pitched"], label: "Pitched" }]) });       // stops part-way down the tree (B02)
  const gutter = makeItem({ itemKind: "selection", category: "roof", promptKey: "W-014", section: "project",
    answer: choice([{ path: ["quad"], label: "Quad" }], { linkedItemIds: [roof.id] }) });
  const floorMain = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", isDefault: true, certainty: "preference",
    answer: choice([{ path: ["timber"], label: "Timber" }], { zone: { key: "main_floor", label: "Main floor" } }) });
  const floorWet = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", isDefault: true, certainty: "preference",
    answer: choice([{ path: ["tile"], label: "Tile" }], { zone: { key: "wet_area_floor", label: "Wet-area floor" } }) });
  const kitchenFloor = makeItem({ itemKind: "selection", category: "flooring", promptKey: "R-005", roomId: kitchen.id, room: "Kitchen", overridesDefaultId: floorMain.id, certainty: "preference",
    answer: choice([{ path: ["tile"], label: "Tile" }]) });

  const access = makeItem({ itemKind: "scope", category: "site", promptKey: "W-001", section: "site",
    answer: { v: 1, state: "recorded", nature: "fact", selected: [{ path: ["steep_access"], label: "Steep access" }, { path: ["limited_parking"], label: "Limited parking" }] } });
  const occupied = makeItem({ itemKind: "scope", category: "site", promptKey: "W-007", section: "site",
    answer: { v: 1, state: "recorded", nature: "fact", selected: [{ path: ["yes", "temporary_kitchen"], label: "Temporary kitchen" }] } });
  const driveway = makeItem({ itemKind: "scope", category: "external", promptKey: "W-010", section: "site", disposition: "new",
    answer: { v: 1, state: "recorded", nature: "scope", selected: [{ path: ["exposed_aggregate"], label: "Exposed aggregate" }],
      element: { id: "el_driveway_front", key: "driveway", label: "Front driveway" }, delivery: { method: "subcontract", trade: `${INTERNAL_MARK} concreter` } } });
  const fence = makeItem({ itemKind: "scope", category: "external", promptKey: "W-010", section: "site", disposition: "by_others",
    answer: { v: 1, state: "recorded", nature: "scope", element: { id: "el_fence_rear", key: "fencing", label: "Rear fence" } } });
  const demolish = makeItem({ itemKind: "scope", category: "demolition", promptKey: "W-004", section: "site", disposition: "remove", description: "Strip out existing cabinets",
    answer: { v: 1, state: "recorded", nature: "scope", element: { key: "joinery", label: "Cabinets" }, areaIds: [kitchen.id], sourceQuestionIds: ["W-004", "W-006"] } });
  const risk = makeItem({ itemKind: "action", category: "existing", promptKey: "W-011", section: "site", responsibility: "blue_leaf", nextAction: "Book a moisture test",
    answer: { v: 1, state: "recorded", nature: "risk", selected: [{ path: ["investigation"], label: "Investigation" }] } });

  const assumed = makeItem({ itemKind: "selection", category: "joinery", promptKey: "K-004", roomId: kitchen.id, room: "Kitchen",
    answer: { v: 1, state: "not_discussed", assumption: { origin: "blue_leaf_baseline", tier: "standard", baselineVersion: "baseline-test", categoryKey: "joinery", text: `${INTERNAL_MARK} laminate doors` } } });
  const parked = makeItem({ itemKind: "selection", category: "benchtop", promptKey: "K-005", roomId: kitchen.id, room: "Kitchen", responsibility: "architect",
    answer: { v: 1, state: "unresolved", nature: "choice", unresolved: { reason: "designer_to_confirm", note: `${INTERNAL_MARK} waiting on the designer` } } });
  const sink = makeItem({ itemKind: "selection", category: "sanitary", promptKey: "K-007", roomId: kitchen.id, room: "Kitchen", product: "Example undermount 500", certainty: "proposed",
    answer: choice([{ path: ["undermount", "single_bowl"], label: "Single bowl" }], internal) });

  const excluded = makeItem({ itemKind: "selection", category: "procurement", promptKey: "W-022", section: "project", disposition: "excluded",
    answer: choice([{ path: ["window_furnishings"], label: "Window furnishings" }]) });
  const notApplicable = makeItem({ itemKind: "selection", category: "joinery", promptKey: "D-004", roomId: bed2.id, room: "Bed 2",
    answer: { v: 1, state: "not_applicable", nature: "choice" } });
  const misfiledFact = makeItem({ itemKind: "selection", category: "site", section: "site", answer: { v: 1, state: "recorded", nature: "fact", selected: [{ path: ["other"], label: "Other" }] } });

  const named = { wallMain, wallFeature, roof, gutter, floorMain, floorWet, kitchenFloor, access, occupied, driveway, fence, demolish, risk, assumed, parked, sink, excluded, notApplicable, misfiledFact };
  const confirmedBed1 = confirmRoomDefaults(bed1, [floorMain, wallMain], { at: "2026-11-10T01:00:00.000Z", by: `Sandbox Staff ${INTERNAL_MARK}` });
  const meta = emptyMeta({ planRev: "Concept set B", rooms: [kitchen, confirmedBed1, bed2] });
  return {
    meta, rooms: { kitchen, bed1: confirmedBed1, bed2 }, named, items: Object.values(named),
    selectionKeys: ["wallMain", "wallFeature", "roof", "gutter", "floorMain", "floorWet", "kitchenFloor", "assumed", "parked", "sink"],
    scopeStoreKeys: ["access", "occupied", "driveway", "fence", "demolish", "risk", "excluded", "notApplicable", "misfiledFact"],
  };
}

/** Rows exactly as older records hold them: free text, no structured answer. */
export const LEGACY_ROWS = [
  { area: "Living", item: "Blackbutt boards", notes: "from the concept schedule" },
  { kind: "item", id: "ri_w017_plain_text", itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", isDefault: true,
    description: "Engineered oak, matt, living zones", certainty: "preference", disposition: "undecided", updatedAt: "2026-10-01T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" },
];
