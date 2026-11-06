/**
 * register.js — the Master Register model (Tab 18 / R02 Increment 1).
 *
 * The register is the staff-operated, room-by-room brief captured while sitting with a client over
 * their plans. In this increment it lives ENTIRELY in the existing pre-job scratchpad
 * `leads.selections_schedule` (JSONB, migration 188) — NO new table, NO migration. Promotion into the
 * canonical project-keyed `client_selections` store is a later, additive increment.
 *
 * Storage convention: `selections_schedule` is an array holding
 *   • at most one  { kind: "meta",  ... }   record  — plan revision, room list, defaults, resume pointer
 *   • zero or more { kind: "item",  ... }   records  — the register entries
 *   • legacy rows  { area, item, notes }    (the old "finishes schedule v1") are read non-destructively
 *     as items, so no existing lead loses data.
 *
 * CRITICAL distinction (Tab 19 data guard): a register item is either
 *   • itemKind "scope"      — WORK/inclusion (demolish / retain / make good / by others / excluded …)
 *   • itemKind "selection"  — a product/finish CHOICE the client may need to make
 * Only "selection" items are ever candidates for the client-facing `client_selections` store.
 * Scope disposition (what work happens) is a DIFFERENT axis from selection certainty (how settled a choice is).
 *
 * Pure module — no React, no network. Safe to import in the browser (Vite) and in Node tests.
 */

// ── Vocabulary (self-contained; not DB status columns in this increment) ─────────────────────────

// Scope / disposition — what WORK the project does to this element (Tab 18 §6).
export const REGISTER_DISPOSITIONS = {
  new: "New / Included",
  alter: "Alter",
  retain: "Existing to Remain",
  remove: "Remove",
  make_good: "Make Good",
  by_others: "By Others",
  excluded: "Excluded",
  na: "N/A",
  undecided: "Undecided",
};
export const DISPOSITION_ORDER = ["new", "alter", "retain", "remove", "make_good", "by_others", "excluded", "na", "undecided"];
// Dispositions that are a settled outcome (NOT an outstanding decision). Tab 18 §7: these are
// legitimate answers, not missing mistakes.
export const SETTLED_DISPOSITIONS = new Set(["retain", "remove", "by_others", "excluded", "na", "make_good"]);

// Selection certainty — how settled a product/finish CHOICE is (Tab 18 §6). Separate from disposition.
export const REGISTER_CERTAINTY = {
  not_considered: "Not Considered",
  preference: "Preference",
  proposed: "Proposed",
  client_approved: "Client-approved",
};
export const CERTAINTY_ORDER = ["not_considered", "preference", "proposed", "client_approved"];

// Who owns the decision / supply (Tab 18 §6).
export const RESPONSIBILITIES = {
  client: "Client",
  architect: "Architect",
  blue_leaf: "Blue Leaf",
  trade: "Trade / supplier",
};

// Room scope on the plan (Tab 18 §4 room header).
export const ROOM_SCOPES = {
  new: "New",
  renovated: "Renovated",
  existing_remain: "Existing — Remain",
  not_in_scope: "Not in scope",
};

// Controlled category keys (coverage checklist from Tab 08 / Tab 18 §5 — a practical subset).
export const REGISTER_CATEGORIES = {
  scope: "Scope of works",
  structure: "Structure / framing",
  roof: "Roof & gutters",
  cladding: "Cladding / brick / render",
  windows: "Windows / glazing",
  doors: "Doors / hardware",
  trim: "Skirting / architraves",
  flooring: "Flooring",
  walls_ceiling: "Walls & ceilings",
  paint: "Paint",
  joinery: "Joinery / cabinetry",
  benchtop: "Benchtop / splashback",
  appliances: "Appliances",
  sanitary: "Sanitary / tapware",
  tiling: "Tiling / waterproofing",
  electrical: "Electrical / lighting",
  hvac: "Heating / cooling",
  plumbing: "Plumbing / hot water",
  services: "Services",
  external: "External / landscape",
  insulation: "Insulation / envelope",
  notes: "Notes / preferences",
};

// Room types that drive which prompts appear (Tab 18 §5). "generic" = any other room.
export const ROOM_TYPES = {
  kitchen: "Kitchen",
  scullery: "Scullery / butler's",
  bathroom: "Bathroom",
  ensuite: "Ensuite",
  wc: "WC / powder",
  laundry: "Laundry",
  living: "Living",
  dining: "Dining",
  bedroom: "Bedroom",
  study: "Study",
  stairs: "Stairs",
  hall: "Hall / entry",
  alfresco: "Alfresco",
  garage: "Garage",
  external: "External / site",
  generic: "Other room",
};

// ── Prompt libraries — expose only the subset appropriate to the room/stage (Tab 18 §5, §7) ───────
// A prompt is a *suggestion* that seeds a register item; never a compulsory field.
// { key, category, label, itemKind } — itemKind is the natural default; staff can change it.

const BASE_PROMPTS = [
  { key: "scope_change", category: "scope", label: "What's changing here? (new / retain / alter / remove / make good / by others / excluded)", itemKind: "scope" },
  { key: "floor", category: "flooring", label: "Floor finish & transitions", itemKind: "selection" },
  { key: "walls_ceiling", category: "walls_ceiling", label: "Walls, ceiling & any feature materials", itemKind: "selection" },
  { key: "paint_trim", category: "paint", label: "Paint, skirting, architraves & trim", itemKind: "selection" },
  { key: "windows_doors", category: "doors", label: "Windows / doors / hardware & opening changes", itemKind: "selection" },
  { key: "services", category: "electrical", label: "Lighting, power, heating/cooling, plumbing — basic needs now", itemKind: "selection" },
  { key: "notes", category: "notes", label: "Other preferences, buildability notes, exclusions", itemKind: "scope" },
];

const TYPE_EXTRAS = {
  kitchen: [
    { key: "k_layout", category: "joinery", label: "Layout, storage & cabinet finish standard", itemKind: "selection" },
    { key: "k_bench", category: "benchtop", label: "Benchtop & splashback", itemKind: "selection" },
    { key: "k_appliances", category: "appliances", label: "Appliances — who supplies?", itemKind: "selection" },
    { key: "k_sink", category: "sanitary", label: "Sink & mixer (Routleys)", itemKind: "selection" },
  ],
  scullery: [
    { key: "sc_joinery", category: "joinery", label: "Cabinetry & storage", itemKind: "selection" },
    { key: "sc_bench", category: "benchtop", label: "Benchtop & splashback", itemKind: "selection" },
    { key: "sc_sink", category: "sanitary", label: "Sink & mixer", itemKind: "selection" },
  ],
  bathroom: [
    { key: "b_layout", category: "sanitary", label: "Shower / bath / toilet / vanity", itemKind: "selection" },
    { key: "b_tiles", category: "tiling", label: "Tiles & extent", itemKind: "selection" },
    { key: "b_screen", category: "joinery", label: "Screens & accessories", itemKind: "selection" },
    { key: "b_tap", category: "sanitary", label: "Tapware (Routleys)", itemKind: "selection" },
    { key: "b_wp", category: "tiling", label: "Waterproofing & ventilation", itemKind: "scope" },
  ],
  ensuite: [
    { key: "e_layout", category: "sanitary", label: "Shower / toilet / vanity", itemKind: "selection" },
    { key: "e_tiles", category: "tiling", label: "Tiles & extent", itemKind: "selection" },
    { key: "e_tap", category: "sanitary", label: "Tapware (Routleys)", itemKind: "selection" },
    { key: "e_wp", category: "tiling", label: "Waterproofing & ventilation", itemKind: "scope" },
  ],
  wc: [
    { key: "w_fixtures", category: "sanitary", label: "Toilet & basin", itemKind: "selection" },
    { key: "w_tiles", category: "tiling", label: "Tiling / splashback", itemKind: "selection" },
  ],
  laundry: [
    { key: "l_joinery", category: "joinery", label: "Cabinetry & benchtop", itemKind: "selection" },
    { key: "l_trough", category: "sanitary", label: "Trough & mixer", itemKind: "selection" },
    { key: "l_machine", category: "plumbing", label: "Machine space & drainage", itemKind: "scope" },
  ],
  living: [
    { key: "lv_feature", category: "walls_ceiling", label: "Feature walls / ceiling detail / fireplace", itemKind: "selection" },
    { key: "lv_window", category: "windows", label: "Window coverings & glazing / shading", itemKind: "selection" },
    { key: "lv_data", category: "electrical", label: "Power / data / TV", itemKind: "selection" },
  ],
  dining: [
    { key: "d_feature", category: "walls_ceiling", label: "Feature / ceiling detail", itemKind: "selection" },
    { key: "d_light", category: "electrical", label: "Pendant / lighting", itemKind: "selection" },
  ],
  bedroom: [
    { key: "br_robe", category: "joinery", label: "Robes / built-in joinery", itemKind: "selection" },
    { key: "br_data", category: "electrical", label: "Outlets / data / fans / AC", itemKind: "selection" },
  ],
  study: [
    { key: "st_joinery", category: "joinery", label: "Built-in desk / storage", itemKind: "selection" },
    { key: "st_data", category: "electrical", label: "Power / data", itemKind: "selection" },
  ],
  stairs: [
    { key: "s_structure", category: "structure", label: "Structure & balustrades", itemKind: "selection" },
    { key: "s_handrail", category: "joinery", label: "Handrails & transitions", itemKind: "selection" },
  ],
  hall: [
    { key: "h_floor", category: "flooring", label: "Flooring transitions", itemKind: "selection" },
    { key: "h_doors", category: "doors", label: "Door schedule & lighting", itemKind: "selection" },
  ],
  alfresco: [
    { key: "a_structure", category: "roof", label: "Roof / structure & posts", itemKind: "selection" },
    { key: "a_paving", category: "external", label: "Paving / decking", itemKind: "selection" },
    { key: "a_bbq", category: "joinery", label: "BBQ joinery & services", itemKind: "selection" },
  ],
  garage: [
    { key: "g_door", category: "doors", label: "Garage door & access", itemKind: "selection" },
    { key: "g_finish", category: "walls_ceiling", label: "Lining / floor finish", itemKind: "selection" },
  ],
  external: [
    { key: "x_envelope", category: "cladding", label: "Cladding / brick / render", itemKind: "selection" },
    { key: "x_roof", category: "roof", label: "Roof & gutters", itemKind: "selection" },
    { key: "x_landscape", category: "external", label: "Driveway / paving / landscape scope", itemKind: "scope" },
    { key: "x_drainage", category: "plumbing", label: "Drainage & external services", itemKind: "scope" },
  ],
  generic: [],
};

// Renovation overlay — expand ONLY on applicable rooms (Tab 18 §5).
const RENOVATION_PROMPTS = [
  { key: "r_existing", category: "scope", label: "Existing-condition notes for this area", itemKind: "scope" },
  { key: "r_demo", category: "scope", label: "Demolish / retain / make good", itemKind: "scope" },
  { key: "r_concealed", category: "scope", label: "Concealed-condition investigation / interfaces", itemKind: "scope" },
];

// Whole-house / site default elements (Tab 18 §5, Step 1). These seed project-wide defaults.
export const WHOLE_HOUSE_PROMPTS = [
  { key: "wh_goals", category: "notes", label: "Project goals & overall quality tier", itemKind: "scope" },
  { key: "wh_envelope", category: "cladding", label: "Envelope: roof / cladding / windows", itemKind: "selection" },
  { key: "wh_insulation", category: "insulation", label: "Insulation / moisture / envelope performance", itemKind: "selection" },
  { key: "wh_flooring", category: "flooring", label: "Default flooring standard", itemKind: "selection" },
  { key: "wh_paint", category: "paint", label: "Default paint standard", itemKind: "selection" },
  { key: "wh_doors", category: "doors", label: "Default door / handle standard", itemKind: "selection" },
  { key: "wh_trim", category: "trim", label: "Default skirting / architrave standard", itemKind: "selection" },
  { key: "wh_services", category: "services", label: "Services strategy: heating/cooling, hot water, electrical/solar", itemKind: "selection" },
  { key: "wh_exclusions", category: "notes", label: "Exclusions / deferred works", itemKind: "scope" },
];

/**
 * Prompts for a room, trimmed to its type. Renovation prompts (existing-condition / demolish /
 * make-good) are driven by the ROOM's own scope — a brand-new room never gets demolition prompts —
 * with the project-wide overlay only as a fallback for rooms not marked brand-new (Tab 18 §5).
 */
export function roomPrompts(roomType, { renovationOverlay = false, roomScope } = {}) {
  const type = ROOM_TYPES[roomType] ? roomType : "generic";
  const extras = TYPE_EXTRAS[type] || [];
  const isExisting = roomScope === "renovated" || roomScope === "existing_remain";
  const showReno = isExisting || (renovationOverlay && roomScope !== "new");
  const reno = showReno ? RENOVATION_PROMPTS : [];
  // Reno prompts first (scope conversation leads), then the base a–g, then the room specifics.
  return [...reno, ...BASE_PROMPTS, ...extras];
}

// ── Identity + factories ─────────────────────────────────────────────────────────────────────────

/** Stable id (survives edits + later promotion). */
export function genId() {
  try { if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return "ri_" + globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return "ri_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function nowIso() { try { return new Date().toISOString(); } catch { return ""; } }

/** A fresh register item. Only id/kind are required; everything else is optional. */
export function makeItem(partial = {}) {
  return {
    id: partial.id || genId(),
    kind: "item",
    itemKind: partial.itemKind === "scope" ? "scope" : "selection",
    roomId: partial.roomId || null,          // null ⇒ whole-house / project-wide
    level: partial.level || "",
    room: partial.room || "",
    category: partial.category || "notes",
    promptKey: partial.promptKey || null,    // which library prompt seeded it (for resume / dedup)
    disposition: partial.disposition || "undecided",
    description: partial.description || "",
    product: partial.product || "",
    model: partial.model || "",
    colour: partial.colour || "",
    certainty: partial.certainty || "not_considered",
    responsibility: partial.responsibility || "",
    source: partial.source || "",            // drawing sheet+rev OR supplier doc/version OR meeting note
    nextAction: partial.nextAction || "",
    isDefault: !!partial.isDefault,          // a whole-house default
    overridesDefaultId: partial.overridesDefaultId || null, // a room-specific exception to a default
    evidence: partial.evidence || null,      // { at, by } — required to call a selection client_approved (Tab 18 §6)
    createdAt: partial.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

/** A fresh register meta block. */
export function emptyMeta(partial = {}) {
  return {
    kind: "meta",
    version: 1,
    planRev: partial.planRev || "",
    deliveryModel: partial.deliveryModel || "",
    occupancy: partial.occupancy || "",
    renovationOverlay: !!partial.renovationOverlay,
    scopeAreas: Array.isArray(partial.scopeAreas) ? partial.scopeAreas : [],
    rooms: Array.isArray(partial.rooms) ? partial.rooms : [],
    lastRoomId: partial.lastRoomId || null,
    lastStep: partial.lastStep || null,
  };
}

/** A fresh room in the room list. */
export function makeRoom(partial = {}) {
  return {
    id: partial.id || genId(),
    level: partial.level || "Ground",
    name: partial.name || "Room",
    roomType: ROOM_TYPES[partial.roomType] ? partial.roomType : "generic",
    scope: ROOM_SCOPES[partial.scope] ? partial.scope : "new",
    order: Number.isFinite(partial.order) ? partial.order : 0,
    sheet: partial.sheet || "",              // drawing sheet/revision for this room (optional)
  };
}

// ── Read / write the scratchpad (backward-compatible with legacy {area,item,notes}) ───────────────

/** Parse `lead.selections_schedule` into { meta, items }. Never throws; tolerates legacy shapes. */
export function readRegister(lead) {
  const raw = Array.isArray(lead?.selections_schedule) ? lead.selections_schedule : [];
  let meta = null;
  const items = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    if (row.kind === "meta") { meta = emptyMeta(row); continue; }
    if (row.kind === "item") { items.push(makeItem(row)); continue; }
    // Legacy rows — Concept "finishes schedule v1" {area,item,notes} and Consultants provisional F&F
    // {area,item,supplier,notes} — adopt non-destructively. Fold every populated extra field into the
    // description so NOTHING is lost (supplier was the only extra the F&F editor captured).
    items.push(makeItem({
      itemKind: "selection",
      category: "notes",
      room: typeof row.area === "string" ? row.area : "",
      description: [row.item, row.supplier && ("Supplier: " + row.supplier), row.notes].filter(Boolean).join(" — "),
      disposition: "undecided",
      certainty: "not_considered",
    }));
  }
  return { meta: meta || emptyMeta(), items };
}

/** Serialise { meta, items } back to the array stored in `selections_schedule`. */
export function writeRegister(register) {
  const meta = register?.meta ? { ...emptyMeta(register.meta) } : null;
  const items = Array.isArray(register?.items) ? register.items.map((i) => makeItem(i)) : [];
  // Only persist a meta record once the staff has actually started a register (rooms or any field set),
  // so an untouched lead keeps an empty [] (unchanged behaviour).
  const metaStarted = meta && (meta.rooms.length || meta.planRev || meta.deliveryModel ||
    meta.occupancy || meta.renovationOverlay || meta.scopeAreas.length || meta.lastRoomId);
  return [...(metaStarted ? [meta] : []), ...items];
}

// ── Defaults with explicit exceptions (Tab 18 §6 — "Apply to selected rooms", no silent edits) ────

/**
 * Apply a whole-house DEFAULT item to specific rooms as explicit, separate override records.
 * Never mutates other rooms silently: each target gets its own item linked via overridesDefaultId.
 * Rooms that already carry an override of this default are skipped (idempotent).
 * Returns a NEW register ({ meta, items }).
 */
export function applyDefaultToRooms(register, defaultItemId, roomIds) {
  const items = register.items.slice();
  const def = items.find((i) => i.id === defaultItemId && i.isDefault);
  if (!def) return register;
  for (const roomId of roomIds) {
    const already = items.some((i) => i.overridesDefaultId === defaultItemId && i.roomId === roomId);
    if (already) continue;
    items.push(makeItem({
      itemKind: def.itemKind,
      roomId,
      category: def.category,
      promptKey: null,            // no 'wh_*' key → shows as an editable room record, not a hidden ghost
      disposition: def.disposition,
      description: def.description,
      product: def.product,
      model: def.model,
      colour: def.colour,
      certainty: def.certainty,
      responsibility: def.responsibility,
      overridesDefaultId: defaultItemId,
    }));
  }
  return { ...register, items };
}

// ── Selectors ─────────────────────────────────────────────────────────────────────────────────────

/** Is this item an outstanding decision (Tab 18 §7 "Outstanding Decisions")? */
export function isOutstanding(item) {
  // A settled disposition (retain/remove/make good/by others/excluded/N-A) is a finished answer — for
  // scope AND selection items (Tab 18 §7) — outstanding only if an open next action remains.
  if (SETTLED_DISPOSITIONS.has(item.disposition)) return !!(item.nextAction && item.nextAction.trim());
  // A selection is outstanding until it is client-approved (whatever the work disposition).
  if (item.itemKind === "selection") return item.certainty !== "client_approved";
  // A scope item is outstanding while undecided, or while it carries an open next action.
  if (item.disposition === "undecided") return true;
  return !!(item.nextAction && item.nextAction.trim());
}

export function outstandingItems(register) {
  return register.items.filter(isOutstanding);
}

// A selection is settled-OUT (by others / excluded / N-A) — a finished answer, not a client CHOICE.
// Such rows still appear in the Client Brief's excluded/by-others section, never in the Selections
// schedule or portal. Scope-only items NEVER qualify. This is the load-bearing scope-vs-selection guard.
const NON_SELECTION_DISPOSITIONS = new Set(["excluded", "by_others", "na"]);
export function isClientSelection(item) {
  return item.itemKind === "selection" && !NON_SELECTION_DISPOSITIONS.has(item.disposition);
}

/** Display name for an item's room — the LIVE room list is canonical (survives a room rename). */
export function roomLabel(register, item) {
  return (register.meta.rooms || []).find((r) => r.id === item.roomId)?.name || item.room || "Whole house";
}

/** Group items by roomId ("__whole_house__" bucket for project-wide/defaults). */
export function itemsByRoom(register) {
  const map = new Map();
  for (const r of register.meta.rooms || []) map.set(r.id, []);
  map.set("__whole_house__", []);
  for (const it of register.items) {
    const key = it.roomId && map.has(it.roomId) ? it.roomId : "__whole_house__";
    map.get(key).push(it);
  }
  return map;
}

/** Where to resume (Tab 18 §3 "Continue Brief"): last saved room, else first room, else setup. */
export function resumePointer(register) {
  const rooms = register.meta.rooms || [];
  if (register.meta.lastRoomId && rooms.some((r) => r.id === register.meta.lastRoomId)) {
    return { step: register.meta.lastStep || "rooms", roomId: register.meta.lastRoomId };
  }
  if (rooms.length) return { step: "rooms", roomId: rooms[0].id };
  return { step: "setup", roomId: null };
}

/** Genuine blockers only (Tab 18 §10 M / Tab 19) — never nag about blank optional fields. */
export function registerBlockers(register, { forDoc } = {}) {
  const blockers = [];
  if ((register.meta.rooms || []).length === 0 && register.items.length === 0) {
    blockers.push("No rooms or register items captured yet.");
  }
  if (forDoc === "client_brief" && !register.meta.projectType) {
    blockers.push("Project type not set (Plan Setup).");
  }
  return blockers;
}

// ── Labels ──────────────────────────────────────────────────────────────────────────────────────
export const dispositionLabel = (k) => REGISTER_DISPOSITIONS[k] || k || "—";
export const certaintyLabel = (k) => REGISTER_CERTAINTY[k] || k || "—";
export const categoryLabel = (k) => REGISTER_CATEGORIES[k] || k || "—";
export const roomTypeLabel = (k) => ROOM_TYPES[k] || k || "—";
export const responsibilityLabel = (k) => RESPONSIBILITIES[k] || k || "—";

const TBC = "TBC";

/**
 * Build the three stage documents from the SAME register (Tab 19 Phase 3 / T07).
 * Returns plain view-models (no rendering) so the SAME values provably feed every document and the
 * Node test can assert "identical underlying values". Unknowns are labelled TBC, never invented.
 */
export function buildDocViews(lead, register) {
  const clientName = (lead?.name || [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "").trim();
  const items = register.items;
  const roomName = (it) => roomLabel(register, it);

  // Scope grouped by disposition (for the Client Brief "major scope" + exclusions).
  const scopeItems = items.filter((i) => i.itemKind === "scope" || i.disposition !== "undecided");
  const included = scopeItems.filter((i) => ["new", "alter", "make_good"].includes(i.disposition));
  const excluded = scopeItems.filter((i) => ["excluded", "by_others"].includes(i.disposition));
  const retained = scopeItems.filter((i) => i.disposition === "retain");

  // Preferences = selection items with any direction yet.
  const preferences = items.filter((i) => i.itemKind === "selection" && CERTAINTY_ORDER.indexOf(i.certainty) >= 1);
  const outstanding = outstandingItems(register);

  const selectionRow = (it) => ({
    room: roomName(it),
    category: categoryLabel(it.category),
    item: it.description || TBC,
    product: it.product || it.model || TBC,
    finish: it.colour || TBC,
    source: it.source || TBC,
    status: certaintyLabel(it.certainty),
    disposition: dispositionLabel(it.disposition),
  });

  return {
    meta: { clientName: clientName || "[Client]", planRev: register.meta.planRev || TBC, projectType: lead?.project_type || TBC },
    // D1 — Preliminary Client Project Brief (issue-only, no signature)
    clientBrief: {
      goals: items.find((i) => i.promptKey === "wh_goals")?.description || TBC,
      majorScope: included.map((i) => ({ area: roomName(i), work: i.description || dispositionLabel(i.disposition) })),
      preferences: preferences.map((i) => ({ area: roomName(i), direction: i.description || i.product || TBC, status: certaintyLabel(i.certainty) })),
      excludedDeferred: excluded.map((i) => ({ area: roomName(i), note: i.description || dispositionLabel(i.disposition) })),
      retained: retained.map((i) => ({ area: roomName(i), note: i.description || "Existing to remain" })),
      nextDecisions: outstanding.map((i) => ({ area: roomName(i), item: i.description || categoryLabel(i.category), owner: responsibilityLabel(i.responsibility) })),
    },
    // D2 — Architect Design Brief (confirmed outcomes vs proposed; actions by room/sheet/rev)
    architectBrief: {
      confirmedOutcomes: items.filter((i) => i.certainty === "client_approved" || ["new", "alter"].includes(i.disposition))
        .map((i) => ({ area: roomName(i), outcome: i.description || dispositionLabel(i.disposition), status: certaintyLabel(i.certainty) })),
      proposedSolutions: items.filter((i) => i.certainty === "proposed")
        .map((i) => ({ area: roomName(i), proposal: i.description || i.product || TBC })),
      actions: items.filter((i) => i.responsibility === "architect" || (i.nextAction && i.nextAction.trim()))
        .map((i) => ({ area: roomName(i), action: i.nextAction || "Coordinate", sheet: i.source || TBC, owner: responsibilityLabel(i.responsibility) })),
    },
    // D3 — Selections & Finishes Schedule (client CHOICES only — never scope-only rows, and never a
    // selection settled as excluded/by-others/N-A; those surface in the Client Brief instead).
    selections: items.filter(isClientSelection).map(selectionRow),
  };
}
