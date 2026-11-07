/**
 * register.js — the Master Register model (Tab 18 / R02 / R03).
 *
 * The register is the staff-operated, room-by-room brief captured while sitting with a client over
 * their plans, refined in the office and carried through tender into the project. Storage is
 * STAGE-AWARE (server/lib/registerStore.mjs):
 *   • before a project exists — the lead scratchpad `leads.selections_schedule` (JSONB, mig 188):
 *       at most one { kind: "meta" } record + { kind: "item" } records (+ legacy {area,item,notes} rows,
 *       read non-destructively);
 *   • once a project exists — the canonical project records (mig 212/213): genuine product/finish CHOICES
 *     in `client_selections` (staged, client_visible=false, until the office issues them), and every
 *     other item — scope/works, requirements, actions, settled-out selections — in internal-only
 *     `room_scope_items`; the room list / drawing basis in `projects.register_meta`. The lead scratchpad
 *     is then read-only history.
 *
 * Four item kinds (Tab 23 Q1, D-041) — only "selection" can ever become a client-facing record:
 *   • scope        — WORK: new / included / alter / retain / remove / make good / by others / excluded / deferred
 *   • requirement  — an intended function, performance outcome or design constraint (e.g. thermal comfort)
 *   • selection    — a specific material / fixture / finish / product CHOICE
 *   • action       — a decision, consultant/trade verification or follow-up owned by someone
 * Status axes are INDEPENDENT (Tab 22 §C, D-006): scope disposition · decision certainty · technical
 * verification · pricing readiness. A client-approved product is not engineer-verified; a supplier quote
 * is not a fixed contract price.
 *
 * Pure module — no React, no network. Safe to import in the browser (Vite) and in Node tests/server.
 */
import { QUESTIONS, QUESTION_LIBRARY_VERSION } from "./registerQuestions.js";

export { QUESTION_LIBRARY_VERSION };

// ── Vocabulary ────────────────────────────────────────────────────────────────────────────────────

export const ITEM_KINDS = {
  scope: "Scope / works",
  requirement: "Requirement",
  selection: "Selection",
  action: "Action / verification",
};

// Scope / disposition — what WORK the project does to this element (Tab 18 §6, Tab 22 §C).
export const REGISTER_DISPOSITIONS = {
  new: "New",
  included: "Included",
  alter: "Alter",
  retain: "Existing to Remain",
  remove: "Remove / demolish",
  make_good: "Make Good",
  by_others: "By Others",
  excluded: "Excluded",
  deferred: "Deferred / future",
  na: "N/A",
  undecided: "Undecided",
};
export const DISPOSITION_ORDER = ["new", "included", "alter", "retain", "remove", "make_good", "by_others", "excluded", "deferred", "na", "undecided"];
// Settled outcomes — legitimate answers, not missing data (Tab 18 §7). "Not discussed" ≠ N/A ≠ excluded.
export const SETTLED_DISPOSITIONS = new Set(["retain", "remove", "by_others", "excluded", "deferred", "na", "make_good"]);
// Dispositions that put an element INSIDE Blue Leaf's scope.
export const INCLUDED_DISPOSITIONS = new Set(["new", "included", "alter", "make_good", "remove"]);

// Decision certainty — how settled a CHOICE (or a client requirement) is. Separate from disposition.
export const REGISTER_CERTAINTY = {
  not_considered: "Not discussed",
  preference: "Preference",
  proposed: "Proposed",
  client_approved: "Client-approved",
};
export const CERTAINTY_ORDER = ["not_considered", "preference", "proposed", "client_approved"];

// Technical verification — designer / engineer / trade confirmation (Tab 23 Q2). Independent axis.
export const TECHNICAL_STATUSES = {
  not_required: "Not required",
  needs_verification: "Needs verification",
  verified: "Verified",
};
export const TECHNICAL_ORDER = ["not_required", "needs_verification", "verified"];

// Pricing readiness — a LINK to an existing estimate / RFQ / quote, never a price (Tab 23 Q2).
// "quoted_or_confirmed" = a builder-reviewed cost source, NOT a fixed contract amount (Tab 23 §5).
export const PRICING_STATUSES = {
  not_reviewed: "Not reviewed",
  allowance_or_estimate: "Allowance / estimate",
  quoted_or_confirmed: "Quoted & reviewed",
};
export const PRICING_ORDER = ["not_reviewed", "allowance_or_estimate", "quoted_or_confirmed"];

// Who owns the decision / next action (Tab 18 §6).
export const RESPONSIBILITIES = {
  client: "Client",
  architect: "Architect / designer",
  consultant: "Engineer / consultant",
  blue_leaf: "Blue Leaf",
  trade: "Trade / supplier",
};

// Who supplies (and normally installs) the item (Tab 21 P-11 / M-003).
export const SUPPLY_BY = {
  blue_leaf: "Blue Leaf",
  trade: "Trade (via Blue Leaf)",
  client: "Client supplied",
  by_others: "By others",
};

// Commercial delivery model — a first-class Sales fact, separate from physical project type (Tab 23 Q4).
export const DELIVERY_MODELS = {
  design_build: "Design & build",
  build_only: "Build only",
  construction_management: "Construction management",
  other: "Other",
};
/** Delivery models that activate the management / third-party responsibility overlay (Tab 21 §13). */
export const MANAGEMENT_DELIVERY = new Set(["build_only", "construction_management", "other"]);

// Room scope on the plan (Tab 18 §4 room header).
export const ROOM_SCOPES = {
  new: "New",
  renovated: "Renovated",
  existing_remain: "Existing — Remain",
  not_in_scope: "Not in scope",
};

// Controlled category keys (Tab 08 / Tab 21 coverage).
export const REGISTER_CATEGORIES = {
  scope: "Scope of works",
  site: "Site & access",
  existing: "Existing conditions & interfaces",
  demolition: "Demolition / strip-out",
  layout: "Layout & function",
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
  hvac: "Heating / cooling / ventilation",
  plumbing: "Plumbing / hot water / drainage",
  services: "Services strategy",
  insulation: "Insulation / envelope",
  external: "External works / landscape",
  stairs: "Stairs & balustrades",
  consultants: "Consultants & approvals",
  procurement: "Procurement & responsibilities",
  notes: "Notes / preferences",
};

// Schedule grouping used by the Selections & Finishes Schedule (documentPayloads GROUP_ORDER).
export const CATEGORY_DOC_GROUP = {
  roof: "External", cladding: "External", windows: "External", insulation: "External",
  flooring: "Internal Finishes", walls_ceiling: "Internal Finishes", paint: "Internal Finishes", trim: "Internal Finishes",
  doors: "Internal Finishes", stairs: "Internal Finishes",
  joinery: "Joinery", benchtop: "Joinery", appliances: "Joinery",
  sanitary: "Wet Areas", tiling: "Wet Areas",
  electrical: "Services & Fixtures", hvac: "Services & Fixtures", plumbing: "Services & Fixtures", services: "Services & Fixtures",
  external: "External Works", site: "External Works",
};
export const docGroupFor = (category) => CATEGORY_DOC_GROUP[category] || "General";

// Room types that drive which prompts appear (Tab 21 §4–§11). "generic" = any other room.
export const ROOM_TYPES = {
  kitchen: "Kitchen",
  scullery: "Scullery / butler's",
  pantry: "Pantry",
  bathroom: "Bathroom",
  ensuite: "Ensuite",
  wc: "WC / powder",
  laundry: "Laundry",
  mudroom: "Mudroom",
  living: "Living",
  dining: "Dining",
  family: "Family / rumpus",
  theatre: "Theatre / media",
  bedroom: "Bedroom",
  wir: "Walk-in robe",
  study: "Study",
  stairs: "Stairs",
  hall: "Hall / entry",
  garage: "Garage",
  alfresco: "Alfresco / pergola",
  balcony: "Balcony / deck",
  external: "External / site",
  generic: "Other room",
};

export const PROJECT_TYPE_LABELS = {
  new_build: "New Build", extension: "Extension", renovation: "Renovation", knockdown_rebuild: "Knockdown Rebuild",
};
/** Renovation-type projects activate the existing-building (RENO) prompts (Tab 21 legend). */
export function isRenovationProject(projectType) {
  return projectType === "renovation" || projectType === "extension";
}

// Sales stages from which detailed (stage D) prompts are shown by default. Staff may always work ahead
// (D-038) — this is visibility guidance, never a lock.
const DETAIL_STAGES = new Set(["fee_proposal", "consultants", "tender", "won"]);
const TENDER_STAGES = new Set(["tender", "won"]);

// ── Question library (Tab 21) — relevance filtering, no rules engine ─────────────────────────────

const QUESTION_INDEX = new Map(QUESTIONS.map((q) => [q.id, q]));
export function questionById(id) { return QUESTION_INDEX.get(id) || null; }

// R02 Increment 1 prompt keys → Tab 21 question IDs (the stub prompts were replaced by the library).
const LEGACY_PROMPT_MAP = {
  scope_change: "R-003", floor: "R-005", walls_ceiling: "R-006", paint_trim: "R-006", windows_doors: "R-007",
  services: "R-008", notes: "R-010",
  k_layout: "K-002", k_bench: "K-005", k_appliances: "K-008", k_sink: "K-007",
  sc_joinery: "K-004", sc_bench: "K-005", sc_sink: "K-007",
  b_layout: "B-002", b_tiles: "B-009", b_screen: "B-006", b_tap: "B-008", b_wp: "B-012",
  e_layout: "B-002", e_tiles: "B-009", e_tap: "B-008", e_wp: "B-012",
  w_fixtures: "B-003", w_tiles: "B-009",
  l_joinery: "L-003", l_trough: "L-003", l_machine: "L-002",
  lv_feature: "V-003", lv_window: "V-004", lv_data: "V-006", d_feature: "V-003", d_light: "V-006",
  br_robe: "D-004", br_data: "D-006", st_joinery: "D-002", st_data: "D-006",
  s_structure: "H-001", s_handrail: "H-002", h_floor: "H-003", h_doors: "H-004",
  a_structure: "O-004", a_paving: "O-003", a_bbq: "O-005", g_door: "H-006", g_finish: "H-006",
  x_landscape: "O-006", x_drainage: "O-009",
  r_existing: "R-013", r_demo: "W-004", r_concealed: "R-013",
  wh_goals: "W-009", wh_envelope: "W-013", wh_insulation: "W-016", wh_flooring: "W-017", wh_paint: "W-019",
  wh_doors: "W-018", wh_trim: "W-018", wh_services: "W-020", wh_exclusions: "W-022",
};
/** Normalise a stored promptKey (Tab 21 ID or an R02 legacy key) to a Tab 21 question ID. */
export function resolvePromptId(promptKey) {
  if (!promptKey) return null;
  if (QUESTION_INDEX.has(promptKey)) return promptKey;
  return LEGACY_PROMPT_MAP[promptKey] || null;
}

// Fixed topic order inside a room card (Tab 22 §I worked card).
export const ROOM_TOPICS = [
  { key: "scope", label: "Scope — what's changing?" },
  { key: "layout", label: "Layout & function" },
  { key: "finishes", label: "Finishes" },
  { key: "fixtures", label: "Fixtures, appliances & supply" },
  { key: "services", label: "Services" },
  { key: "decisions", label: "Decisions & follow-up" },
  { key: "technical", label: "Technical & detail" },
];
export const PROJECT_TOPICS = [
  { key: "brief", label: "Brief" },
  { key: "envelope", label: "Envelope & external materials" },
  { key: "internal", label: "Internal standards (defaults)" },
  { key: "services", label: "Services & performance" },
  { key: "inclusions", label: "Inclusions & responsibilities" },
];
export const SITE_TOPICS = [
  { key: "access", label: "Access & occupation" },
  { key: "existing", label: "Existing building & interfaces" },
  { key: "external", label: "External works" },
  { key: "consultants", label: "Surveys, approvals & consultants" },
  { key: "quality", label: "Quality priorities" },
];
export const TECH_TOPICS = [
  { key: "site", label: "Site & demolition" },
  { key: "structure", label: "Structure & interfaces" },
  { key: "envelope", label: "Envelope" },
  { key: "internal", label: "Internal" },
  { key: "services", label: "Services & compliance" },
  { key: "commercial", label: "Procurement, cost & document control" },
];

/**
 * The prompts relevant to ONE step/room — never the whole library (Tab 21 §14 / Tab 22 §B).
 * ctx: { roomType, roomScope, projectType, deliveryModel, renovationOverlay, stage, showDetail }.
 * Returns question entries in library order. FACT questions are excluded (they are Sales context).
 */
export function promptsFor(section, ctx = {}) {
  const { roomType, roomScope, projectType, deliveryModel, renovationOverlay = false, stage, showDetail = false } = ctx;
  const reno = isRenovationProject(projectType) || !!renovationOverlay;
  const detailVisible = showDetail || DETAIL_STAGES.has(stage);
  const tenderVisible = showDetail || TENDER_STAGES.has(stage);
  if (section === "mgmt" && !MANAGEMENT_DELIVERY.has(deliveryModel)) return [];
  const type = ROOM_TYPES[roomType] ? roomType : "generic";
  return QUESTIONS.filter((q) => {
    if (q.section !== section) return false;
    if (q.itemKind == null) return false;                              // FACT → read-only context
    if (q.render && q.render.startsWith("disposition_of:")) return false; // folded into its target row
    if (q.stage === "T" && !tenderVisible) return false;
    if (q.detail && !detailVisible) return false;
    if (q.projects === "reno") {
      if (section === "room") {
        // Room-level renovation prompts follow the ROOM's own scope: an existing/renovated room always gets
        // them; otherwise only on a renovation project (or overlay) — and a brand-new room never does.
        const existing = roomScope === "renovated" || roomScope === "existing_remain";
        if (!existing && !(reno && roomScope !== "new")) return false;
      } else if (!reno) return false;
    }
    if (section === "room" && Array.isArray(q.rooms) && !q.rooms.includes(type)) return false;
    return true;
  });
}

/** R02-compatible room prompt list (now driven by the Tab 21 library). */
export function roomPrompts(roomType, { renovationOverlay = false, roomScope, projectType, stage, showDetail } = {}) {
  return promptsFor("room", { roomType, roomScope, renovationOverlay, projectType, stage, showDetail })
    .map((q) => ({ key: q.id, category: q.category, label: q.short, itemKind: q.itemKind, question: q }));
}
/** R02-compatible whole-house prompt list (Tab 21 §3 — W-013..W-025). */
export const WHOLE_HOUSE_PROMPTS = QUESTIONS.filter((q) => q.section === "project" && q.itemKind && !q.render && q.id.startsWith("W-"))
  .map((q) => ({ key: q.id, category: q.category, label: q.short, itemKind: q.itemKind, question: q }));

// ── Identity + factories ─────────────────────────────────────────────────────────────────────────

/** Stable id (survives edits, promotion and stage changes). */
export function genId() {
  try { if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return "ri_" + globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return "ri_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function nowIso() { try { return new Date().toISOString(); } catch { return ""; } }

/**
 * Deterministic id for a legacy {area,item[,supplier],notes} row. Legacy rows carry no persisted id,
 * so a random id would differ on every read — breaking idempotent promotion. A content hash keeps it
 * stable across reads and across a later edit→save.
 */
function legacyId(row) {
  const basis = [row?.area, row?.item, row?.supplier, row?.notes].map((x) => (x == null ? "" : String(x))).join("\u0001");
  let h = 5381;
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) >>> 0; // djb2
  return "ri_legacy_" + h.toString(36);
}

const oneOf = (v, set, def) => (v && Object.prototype.hasOwnProperty.call(set, v) ? v : def);
const numOrNull = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** A register item. Only id/kind are required; everything else is optional and defaulted. */
export function makeItem(partial = {}) {
  const itemKind = oneOf(partial.itemKind, ITEM_KINDS, "selection");
  const roomId = partial.roomId || null;                        // null ⇒ project-wide (whole house / site)
  return {
    id: partial.id || genId(),
    kind: "item",
    itemKind,
    section: roomId ? "room" : (partial.section && partial.section !== "room" ? partial.section : "project"),
    roomId,
    level: partial.level || "",
    room: partial.room || "",                                  // label snapshot (the live room list wins)
    category: partial.category || "notes",
    promptKey: partial.promptKey || null,                      // Tab 21 question ID that seeded it
    disposition: oneOf(partial.disposition, REGISTER_DISPOSITIONS, "undecided"),
    description: partial.description || "",
    product: partial.product || "",
    manufacturer: partial.manufacturer || "",
    model: partial.model || "",
    colour: partial.colour || "",
    supplier: partial.supplier || "",
    quantity: numOrNull(partial.quantity),                      // null = not measured (never shown as 0)
    unit: partial.unit || "",
    certainty: oneOf(partial.certainty, REGISTER_CERTAINTY, "not_considered"),
    responsibility: oneOf(partial.responsibility, RESPONSIBILITIES, ""),
    supplyBy: oneOf(partial.supplyBy, SUPPLY_BY, ""),
    technicalStatus: oneOf(partial.technicalStatus, TECHNICAL_STATUSES, "not_required"),
    technicalEvidence: partial.technicalEvidence || null,      // {at, by, ref} — required for "verified"
    pricingStatus: oneOf(partial.pricingStatus, PRICING_STATUSES, "not_reviewed"),
    pricingRef: partial.pricingRef || "",                      // pointer to an existing estimate/RFQ line
    source: partial.source || "",                              // drawing sheet+rev / supplier doc no+rev / meeting note
    sourceDocId: partial.sourceDocId || null,                  // linked lead_documents row (received/issued)
    nextAction: partial.nextAction || "",
    resolved: !!partial.resolved,                              // an action / follow-up closed out
    isDefault: !!partial.isDefault,                            // a project-wide default
    overridesDefaultId: partial.overridesDefaultId || null,    // an explicit room exception to a default
    evidence: partial.evidence || null,                        // {at, by, ref, method} — required for client_approved
    createdAt: partial.createdAt || nowIso(),
    updatedAt: partial.updatedAt || nowIso(),
    // Server-owned, read-only: canonical row identity + version + portal state (project mode only).
    sync: partial.sync || null,
  };
}

/** A fresh register meta block. */
export function emptyMeta(partial = {}) {
  return {
    kind: "meta",
    version: 2,
    rev: Number.isFinite(partial.rev) ? partial.rev : 0,       // canonical meta revision (project mode)
    planRev: partial.planRev || "",
    deliveryModel: partial.deliveryModel || "",                // R02 legacy — now the leads/jobs.delivery_model fact
    occupancy: partial.occupancy || "",
    renovationOverlay: !!partial.renovationOverlay,
    scopeAreas: Array.isArray(partial.scopeAreas) ? partial.scopeAreas : [],
    rooms: Array.isArray(partial.rooms) ? partial.rooms.map((r) => makeRoom(r)) : [],
    lastRoomId: partial.lastRoomId || null,
    lastStep: partial.lastStep || null,
  };
}

/** A room in the room list. Its id is stable for life (rename / reorder never break item links). */
export function makeRoom(partial = {}) {
  return {
    id: partial.id || genId(),
    level: partial.level || "Ground",
    name: partial.name || "Room",
    roomType: ROOM_TYPES[partial.roomType] ? partial.roomType : "generic",
    scope: ROOM_SCOPES[partial.scope] ? partial.scope : "new",
    order: Number.isFinite(partial.order) ? partial.order : 0,
    sheet: partial.sheet || "",                                // drawing sheet/revision for this room
  };
}

// ── Read / write the lead scratchpad (backward-compatible with legacy {area,item,notes}) ─────────

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
    // {area,item,supplier,notes} — adopted non-destructively; every populated field kept.
    items.push(makeItem({
      id: legacyId(row),
      itemKind: "selection",
      category: "notes",
      room: typeof row.area === "string" ? row.area : "",
      description: [row.item, row.supplier && ("Supplier: " + row.supplier), row.notes].filter(Boolean).join(" — "),
      supplier: row.supplier || "",
      disposition: "undecided",
      certainty: "not_considered",
      updatedAt: "1970-01-01T00:00:00.000Z",
    }));
  }
  return { meta: meta || emptyMeta(), items };
}

/** Serialise { meta, items } back to the array stored in `selections_schedule` (strips server sync). */
export function writeRegister(register) {
  const meta = register?.meta ? { ...emptyMeta(register.meta) } : null;
  const items = Array.isArray(register?.items) ? register.items.map((i) => { const it = makeItem(i); delete it.sync; return it; }) : [];
  const metaStarted = meta && (meta.rooms.length || meta.planRev || meta.deliveryModel ||
    meta.occupancy || meta.renovationOverlay || meta.scopeAreas.length || meta.lastRoomId);
  return [...(metaStarted ? [meta] : []), ...items];
}

// ── Defaults with explicit exceptions (Tab 18 §6 — "Apply to selected rooms", no silent edits) ────

/** The project-wide default item for a question ID (e.g. W-017 floor palette), if captured. */
export function defaultItemFor(register, questionId) {
  return register.items.find((i) => i.isDefault && !i.roomId && resolvePromptId(i.promptKey) === questionId) || null;
}

/**
 * Apply a project-wide DEFAULT item to specific rooms as explicit, separate exception records.
 * Never mutates other rooms silently: each target gets its own item linked via overridesDefaultId.
 * Rooms that already carry an exception of this default are skipped (idempotent). Returns a NEW register.
 */
export function applyDefaultToRooms(register, defaultItemId, roomIds) {
  const items = register.items.slice();
  const def = items.find((i) => i.id === defaultItemId && i.isDefault);
  if (!def) return register;
  for (const roomId of roomIds) {
    const already = items.some((i) => i.overridesDefaultId === defaultItemId && i.roomId === roomId);
    if (already) continue;
    items.push(makeItem({
      itemKind: def.itemKind, roomId, category: def.category, promptKey: null,
      disposition: def.disposition, description: def.description, product: def.product, manufacturer: def.manufacturer,
      model: def.model, colour: def.colour, supplier: def.supplier, certainty: def.certainty,
      responsibility: def.responsibility, supplyBy: def.supplyBy, overridesDefaultId: defaultItemId,
    }));
  }
  return { ...register, items };
}

// ── Selectors ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Why an item is outstanding (Tab 18 §7): 'decision' (a choice / scope still open), 'verification'
 * (a designer / engineer / trade must confirm), 'action' (an open follow-up). [] = settled.
 */
export function outstandingReasons(item) {
  const reasons = [];
  const openAction = !!(item.nextAction && item.nextAction.trim()) && !item.resolved;
  if (item.itemKind === "action") return item.resolved ? [] : ["action"];
  if (item.technicalStatus === "needs_verification") reasons.push("verification");
  if (SETTLED_DISPOSITIONS.has(item.disposition)) { if (openAction) reasons.push("action"); return reasons; }
  if (item.itemKind === "selection" && item.certainty !== "client_approved") reasons.push("decision");
  else if (item.itemKind === "scope" && item.disposition === "undecided") reasons.push("decision");
  if (openAction) reasons.push("action");
  return reasons;
}
export function isOutstanding(item) { return outstandingReasons(item).length > 0; }
export function outstandingItems(register) { return register.items.filter(isOutstanding); }

// A selection settled OUT (by others / excluded / deferred / N-A) is a finished answer, not a client
// CHOICE: it surfaces in the Client Brief scope boundary, never in the Selections schedule or portal.
// Scope, requirement and action items NEVER qualify. This is the load-bearing scope-vs-selection guard.
const NON_SELECTION_DISPOSITIONS = new Set(["excluded", "by_others", "na", "deferred"]);
export function isClientSelection(item) {
  return item.itemKind === "selection" && !NON_SELECTION_DISPOSITIONS.has(item.disposition);
}

/** Business-rule problems with one item (shown inline; the server enforces the same rules). */
export function itemIssues(item) {
  const issues = [];
  if (item.certainty === "client_approved" && !(item.evidence?.at && item.evidence?.by) && !item.sync?.approvedOnBoard) {
    issues.push("Client approval needs evidence (who, when, how).");
  }
  if (item.technicalStatus === "verified" && !(item.technicalEvidence?.at && item.technicalEvidence?.ref)) {
    issues.push("Verified needs a technical reference (drawing / consultant document).");
  }
  return issues;
}

/** Display name for an item's room — the LIVE room list is canonical (survives a room rename). */
export function roomLabel(register, item) {
  if (!item.roomId) return item.section === "site" ? "Site / existing" : "Whole house";
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

/** Short, stable, human reference for an item in documents ("K005-3F9") — derived from its id; fits a
 *  narrow schedule column on one line. */
export function refCode(item) {
  let h = 2166136261;
  const s = String(item.id || "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const tail = h.toString(36).toUpperCase().slice(-3).padStart(3, "0");
  const q = resolvePromptId(item.promptKey);
  return `${q ? q.replace("-", "") : "X"}-${tail}`;
}

/** Where to resume (Tab 18 §3 "Continue Brief"): last saved room/step, else first room, else context. */
export function resumePointer(register) {
  const rooms = register.meta.rooms || [];
  const step = register.meta.lastStep === "setup" ? "context" : register.meta.lastStep;
  if (register.meta.lastRoomId && rooms.some((r) => r.id === register.meta.lastRoomId)) {
    return { step: step || "rooms", roomId: register.meta.lastRoomId };
  }
  if (step && step !== "rooms") return { step, roomId: rooms[0]?.id || null };
  if (rooms.length) return { step: "rooms", roomId: rooms[0].id };
  return { step: "context", roomId: null };
}

/** Genuine blockers only (Tab 18 §10 M) — never nag about blank optional fields. */
export function registerBlockers(register, { forDoc, lead } = {}) {
  const blockers = [];
  if ((register.meta.rooms || []).length === 0 && register.items.length === 0) {
    blockers.push("No rooms or register items captured yet.");
  }
  if (forDoc === "client_brief" && lead && !lead.project_type) blockers.push("Project type not set (lead details).");
  if ((forDoc === "architect_brief" || forDoc === "selections_schedule") && !register.meta.planRev) {
    blockers.push("Current drawing set / revision not recorded (Project context).");
  }
  return blockers;
}

// ── Labels ──────────────────────────────────────────────────────────────────────────────────────
export const dispositionLabel = (k) => REGISTER_DISPOSITIONS[k] || k || "—";
export const certaintyLabel = (k) => REGISTER_CERTAINTY[k] || k || "—";
export const categoryLabel = (k) => REGISTER_CATEGORIES[k] || k || "—";
export const roomTypeLabel = (k) => ROOM_TYPES[k] || k || "—";
export const responsibilityLabel = (k) => RESPONSIBILITIES[k] || k || "—";
export const technicalLabel = (k) => TECHNICAL_STATUSES[k] || k || "—";
export const pricingLabel = (k) => PRICING_STATUSES[k] || k || "—";
export const supplyLabel = (k) => SUPPLY_BY[k] || k || "—";
export const itemKindLabel = (k) => ITEM_KINDS[k] || k || "—";
export const deliveryLabel = (k) => DELIVERY_MODELS[k] || k || "—";

const TBC = "TBC";

/**
 * Lightweight on-screen draft views (kept for R02 compatibility and quick previews). Issued documents
 * are built by src/lib/registerDocuments.js from the SAME register and rendered by the existing engine.
 */
export function buildDocViews(lead, register) {
  const clientName = (lead?.name || [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "").trim();
  const items = register.items;
  const roomName = (it) => roomLabel(register, it);
  const included = items.filter((i) => i.itemKind === "scope" && INCLUDED_DISPOSITIONS.has(i.disposition));
  const excluded = items.filter((i) => ["excluded", "by_others", "deferred"].includes(i.disposition));
  const retained = items.filter((i) => i.disposition === "retain");
  const preferences = items.filter((i) => isClientSelection(i) && CERTAINTY_ORDER.indexOf(i.certainty) >= 1);
  const outstanding = outstandingItems(register);
  const selectionRow = (it) => ({
    room: roomName(it), category: categoryLabel(it.category), item: it.description || TBC,
    product: it.product || it.model || TBC, finish: it.colour || TBC, source: it.source || TBC,
    status: certaintyLabel(it.certainty), disposition: dispositionLabel(it.disposition), technical: technicalLabel(it.technicalStatus),
  });
  const goalsItem = items.find((i) => ["W-009", "P-005"].includes(resolvePromptId(i.promptKey)));
  return {
    meta: { clientName: clientName || "[Client]", planRev: register.meta.planRev || TBC, projectType: lead?.project_type || TBC },
    clientBrief: {
      goals: goalsItem?.description || TBC,
      majorScope: included.map((i) => ({ area: roomName(i), work: i.description || dispositionLabel(i.disposition) })),
      requirements: items.filter((i) => i.itemKind === "requirement").map((i) => ({ area: roomName(i), requirement: i.description || TBC })),
      preferences: preferences.map((i) => ({ area: roomName(i), direction: i.description || i.product || TBC, status: certaintyLabel(i.certainty) })),
      excludedDeferred: excluded.map((i) => ({ area: roomName(i), note: i.description || dispositionLabel(i.disposition) })),
      retained: retained.map((i) => ({ area: roomName(i), note: i.description || "Existing to remain" })),
      nextDecisions: outstanding.map((i) => ({ area: roomName(i), item: i.description || categoryLabel(i.category), owner: responsibilityLabel(i.responsibility) })),
    },
    architectBrief: {
      // Client intent (approved requirements / scope) — kept distinct from proposed technical solutions.
      confirmedOutcomes: items.filter((i) => (i.itemKind === "requirement" && i.certainty === "client_approved") || (i.itemKind === "scope" && ["new", "alter"].includes(i.disposition)))
        .map((i) => ({ area: roomName(i), outcome: i.description || dispositionLabel(i.disposition), status: i.itemKind === "requirement" ? "Client-approved requirement" : dispositionLabel(i.disposition) })),
      proposedSolutions: items.filter((i) => i.certainty === "proposed").map((i) => ({ area: roomName(i), proposal: i.description || i.product || TBC })),
      toVerify: items.filter((i) => i.technicalStatus === "needs_verification").map((i) => ({ area: roomName(i), item: i.description || categoryLabel(i.category), owner: responsibilityLabel(i.responsibility) })),
      actions: items.filter((i) => (i.responsibility === "architect" || (i.nextAction && i.nextAction.trim())) && !i.resolved)
        .map((i) => ({ area: roomName(i), action: i.nextAction || i.description || "Coordinate", sheet: i.source || TBC, owner: responsibilityLabel(i.responsibility) })),
    },
    selections: items.filter(isClientSelection).map(selectionRow),
  };
}
