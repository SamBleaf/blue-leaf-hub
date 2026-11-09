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
import { QUESTIONS, QUESTION_LIBRARY_VERSION, ANSWER_CONFIG } from "./registerQuestions.js";
import {
  normaliseAnswer, normaliseRoomConfirmations, answerAllowsClientSelection, exceptionAnswerFrom, activeAssumption, applyPricingAssumption, hasExplicitChoice, roomDefaultStatus,
  normaliseAssumption, answerMaterialChanged, stableStringify, answerSummary, ANSWER_SCHEMA_VERSION, BASELINE_TIERS,
} from "./registerAnswer.js";
import { BASELINE_CATEGORIES, BASELINE_VERSION, BASELINE_WORDING_STATUS, PERFORMANCE_SUGGESTIONS } from "./registerGuidance.js";

export { QUESTION_LIBRARY_VERSION };
export * from "./registerAnswer.js";
export * from "./registerChoice.js";
export * from "./registerGuidance.js";

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
  { key: "kitchen_joinery", label: "Kitchen & joinery standards" },
  { key: "wet_areas", label: "Wet-area standards" },
  { key: "laundry", label: "Laundry standards" },
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
/** Is this seed the same record? A blank row's id belongs to one room and one question, and must never write to another. */
export const seedMatchesItem = (item, seed) => (item?.roomId || null) === (seed?.roomId || null) && (item?.promptKey || null) === (seed?.promptKey || null);

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
    answer: normaliseAnswer(partial.answer),                   // typed answer (registerAnswer.js); null = legacy / free text
    createdAt: partial.createdAt || nowIso(),
    updatedAt: partial.updatedAt || nowIso(),
    // Server-owned, read-only: canonical row identity + version + portal state (project mode only).
    sync: partial.sync || null,
  };
}

/** A fresh register meta block. */
/** Site line that never repeats the suburb when the address already contains it (R04 P2). */
export function siteLine(address, suburb) {
  const a = String(address || "").trim();
  const s = String(suburb || "").trim();
  if (!s || a.toLowerCase().includes(s.toLowerCase())) return a;
  return a ? `${a}, ${s}` : s;
}

// ── R04 Slice 5: guided room prompts ────────────────────────────────────────────────────────────────
// The curated "primary" prompts shown first in a room so a meeting reads as a guided discussion, plus a
// de-dup rule: a room-specific prompt supersedes the matching generic shared-room (R-) prompt for SCOPE and
// LAYOUT (where they genuinely ask the same thing — finishes/fixtures/services stay distinct). Purely
// presentational + additive: NO prompt, saved answer, disposition, inheritance, source ref or id is removed;
// everything not primary moves to "Explore more", one click away. Office staff keep full technical editing.
const ROOM_FAMILY_PREFIXES = new Set(["K", "B", "V", "L", "H", "D", "O"]);
const DEDUP_TOPICS = new Set(["scope", "layout"]);
const famOf = (id) => String(id || "").split("-")[0];
export const ROOM_PRIMARY_PROMPT_IDS = new Set([
  "R-003", "R-004", "R-005", "R-006", "R-008", "R-010",            // generic shared-room (fallback for any room)
  "K-001", "K-002", "K-003", "K-005", "K-007", "K-009", "K-012",   // kitchen
  "B-001", "B-002", "B-006", "B-008", "B-009", "B-015",            // bathroom / ensuite
  "V-001", "V-002", "V-003", "V-004", "V-008",                     // bedroom / robe (V family)
  "L-001", "L-002", "L-003", "L-004", "L-007",                     // laundry / utility
  "H-001", "H-002", "H-004", "H-005", "H-006", "H-007",            // hall / entry / stairs / garage
  "D-001", "D-002", "D-003", "D-004", "D-007",                     // bedroom / robe (D family)
  "O-001", "O-002",                                               // outdoor (alfresco / balcony / external) — scope + use
]);
/** The Set of question ids that are PRIMARY for a room (the rest render under "Explore more"). */
export function partitionRoomPrompts(questions) {
  const list = questions || [];
  // SUPERSEDE must mean REPLACE, never remove-to-nothing: only let a room-specific scope/layout prompt
  // suppress the generic R- one when that room-specific prompt is ITSELF promoted to primary (i.e. it is a
  // curated primary id). Otherwise a family (e.g. outdoor "O-") whose prompt is not curated would suppress
  // the generic anchor and leave the topic with no lead prompt at all.
  const coveredByRoomSpecific = new Set(
    list.filter((q) => ROOM_FAMILY_PREFIXES.has(famOf(q.id)) && famOf(q.id) !== "R"
                  && DEDUP_TOPICS.has(q.topic) && ROOM_PRIMARY_PROMPT_IDS.has(q.id))
        .map((q) => `${q.topic}|${q.itemKind}`),
  );
  const primary = new Set();
  for (const q of list) {
    if (q.detail) continue;                                                                          // detail/technical → Explore more
    if (famOf(q.id) === "R" && DEDUP_TOPICS.has(q.topic) && coveredByRoomSpecific.has(`${q.topic}|${q.itemKind}`)) continue; // superseded by a room-specific prompt
    if (ROOM_PRIMARY_PROMPT_IDS.has(q.id)) primary.add(q.id);
  }
  if (!primary.size) {  // unknown roomType / no curated set → keep the scope anchor + first non-detail prompt per topic
    const seen = new Set();
    for (const q of list) { if (q.detail) continue; if (q.topic === "scope" || !seen.has(q.topic)) { primary.add(q.id); seen.add(q.topic); } }
  }
  return primary;
}

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
    baseline: normaliseBaseline(partial.baseline),             // staff-only pricing guide (below). Never reaches a client
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
    defaultConfirmations: normaliseRoomConfirmations(partial.defaultConfirmations), // staff confirmed these defaults apply here
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
  const items = Array.isArray(register?.items) ? register.items.map((i) => { const it = makeItem(i); delete it.sync; if (!it.answer) delete it.answer; return it; }) : [];
  const metaStarted = meta && (meta.rooms.length || meta.planRev || meta.deliveryModel ||
    meta.occupancy || meta.renovationOverlay || meta.scopeAreas.length || meta.lastRoomId || meta.lastStep ||
    meta.baseline.projectTier || Object.keys(meta.baseline.categories).length);
  return [...(metaStarted ? [meta] : []), ...items];
}

// ── Defaults with explicit exceptions (Tab 18 §6 — "Apply to selected rooms", no silent edits) ────

/** Every project-wide default for a question ID. A question can hold several (main / bedroom / wet floor). */
export function defaultItemsFor(register, questionId) {
  return register.items.filter((i) => i.isDefault && !i.roomId && resolvePromptId(i.promptKey) === questionId);
}

/** The project-wide default for a question ID, if captured. With zoneKey: that zone's, else an unzoned one. */
export function defaultItemFor(register, questionId, { zoneKey } = {}) {
  const all = defaultItemsFor(register, questionId);
  if (zoneKey) return all.find((i) => i.answer?.zone?.key === zoneKey) || all.find((i) => !i.answer?.zone) || null;
  return all[0] || null;
}

/** The room questions also set once on Whole House, per zone: kitchen and joinery, wet areas, laundry (Tab 27 B03). */
export function standardPrompts() {
  return QUESTIONS.filter((q) => ANSWER_CONFIG[q.id]?.standard);
}

/**
 * The whole-house default a room reads for this question, or null. Zone-driven: a bedroom reads the bedroom floor, a
 * scullery reads the scullery standard and then the kitchen's. A room with nothing to read asks the question itself,
 * and a default nobody has chosen anything for ("Not decided", blank) isn't something a room can inherit.
 */
export function roomDefaultFor(register, question, roomType) {
  const sourceId = question?.inherits || (ANSWER_CONFIG[question?.id]?.standard ? question.id : null);
  if (!sourceId) return null;
  const defaults = defaultItemsFor(register, sourceId).filter(hasExplicitChoice);
  const cfg = ANSWER_CONFIG[sourceId];
  const table = cfg?.standard?.roomZones || cfg?.roomZones;
  if (!table) return defaults[0] || null;
  for (const zone of table[roomType] || table["*"] || []) {
    const hit = defaults.find((i) => i.answer?.zone?.key === zone);
    if (hit) return hit;
  }
  return defaults.find((i) => !i.answer?.zone) || null;
}

/** Every default this room reads for a question. One, except where the question covers several surfaces at once (walls and ceiling). */
export function roomDefaultsFor(register, question, roomType) {
  const sourceId = question?.inherits || (ANSWER_CONFIG[question?.id]?.standard ? question.id : null);
  const cfg = ANSWER_CONFIG[sourceId];
  if (!cfg?.roomReadsAll) { const one = roomDefaultFor(register, question, roomType); return one ? [one] : []; }
  const defaults = defaultItemsFor(register, sourceId).filter(hasExplicitChoice);
  const hits = (cfg.roomZones[roomType] || cfg.roomZones["*"] || []).map((z) => defaults.find((i) => i.answer?.zone?.key === z)).filter(Boolean);
  return hits.length ? hits : defaults.filter((i) => !i.answer?.zone).slice(0, 1);
}

/**
 * What this room takes from Whole House, one line per default (Tab 27 B10, DEC-MRUX-02). A question the room has answered for
 * itself isn't listed. Reading this writes nothing: there is no per-room copy of a default.
 * surface is set where one question reads several defaults, so each can be confirmed or changed by itself.
 */
export function roomInheritedLines(register, room, questions) {
  const roomItems = register.items.filter((i) => i.roomId === room.id);
  const lines = [];
  for (const q of questions || []) {
    const defs = roomDefaultsFor(register, q, room.roomType);
    if (!defs.length) continue;
    const own = roomItems.filter((i) => resolvePromptId(i.promptKey) === q.id);
    if (own.some((i) => !i.overridesDefaultId)) continue;
    const bySurface = !!ANSWER_CONFIG[q.inherits]?.roomReadsAll;
    for (const def of defs) {
      const exception = (bySurface ? own.find((i) => i.overridesDefaultId === def.id) : own.find((i) => i.overridesDefaultId)) || null;
      lines.push({ question: q, def, exception, surface: bySurface ? def.answer?.zone?.label || "" : "", status: roomDefaultStatus(room, def, exception), confirmedWords: normaliseRoomConfirmations(room.defaultConfirmations)[def.id]?.words || "" });
    }
  }
  return lines;
}

/** Only the defaults a person still has to look at: never confirmed for this room, or changed since. */
export const roomLinesToConfirm = (lines) => lines.filter((l) => l.status === "inherited" || l.status === "changed");

/** The fields a room exception starts from. An approval was given for the default, so it never carries across to a room that differs. */
export function exceptionFieldsFrom(def, { keepZone = false } = {}) {
  const answer = exceptionAnswerFrom(def);
  return {
    itemKind: def.itemKind, description: def.description, product: def.product, manufacturer: def.manufacturer, model: def.model, colour: def.colour, supplier: def.supplier,
    certainty: def.certainty === "client_approved" ? "proposed" : def.certainty, overridesDefaultId: def.id,
    answer: answer ? { ...answer, zone: keepZone ? answer.zone : null } : null,
  };
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
      answer: exceptionAnswerFrom(def),
    }));
  }
  return { ...register, items };
}

// ── Selectors ─────────────────────────────────────────────────────────────────────────────────────

/** What a record IS: its own answer's nature, else what its question records. Null for custom items. */
export function natureOf(item) {
  return item?.answer?.nature || ANSWER_CONFIG[resolvePromptId(item?.promptKey)]?.nature || null;
}

const NOT_A_DECISION = new Set(["fact", "requirement", "technical", "risk", "action"]);
const parkedAnswer = (a) => a && (a.state === "unresolved" || a.state === "client_unsure" || (a.selected || []).some((s) => s.stale));

/**
 * Why an item is outstanding (Tab 18 §7, Tab 27 B09): 'decision' (a choice / scope still open), 'verification'
 * (a designer / engineer / trade must confirm), 'action' (an open follow-up). [] = settled.
 *
 * Read from what the record says, not from the fact that a disposition is blank:
 *   • N/A closes the decision, but it isn't evidence: a verification flag and any follow-up stay open;
 *   • "Not decided", "Client unsure" or an answer flagged after an earlier choice changed is an open decision;
 *   • a recorded fact, requirement or risk is not an undecided piece of scope;
 *   • a choice stays open until the client approves it. Picking an option on the card is not an approval;
 *   • who supplies says nothing about whether the work is in the contract, so a scope item with its status still
 *     undecided stays open whatever supply answer it holds (Tab 27 Q4 is undecided, so this is the base behaviour).
 */
export function outstandingReasons(item) {
  const reasons = [];
  const openAction = !!(item.nextAction && item.nextAction.trim()) && !item.resolved;
  const answer = item.answer && Number(item.answer.v) <= ANSWER_SCHEMA_VERSION ? item.answer : null;
  if (answer?.state === "not_applicable") {
    if (item.itemKind !== "action" && item.technicalStatus === "needs_verification") reasons.push("verification");
    if (openAction) reasons.push("action");
    return reasons;
  }
  if (item.itemKind === "action") return item.resolved ? [] : ["action"];
  if (item.technicalStatus === "needs_verification") reasons.push("verification");
  if (parkedAnswer(answer)) reasons.push("decision");
  else if (!SETTLED_DISPOSITIONS.has(item.disposition) && !NOT_A_DECISION.has(natureOf(item))) {
    if (item.itemKind === "selection" && item.certainty !== "client_approved") reasons.push("decision");
    else if (item.itemKind === "scope" && item.disposition === "undecided") reasons.push("decision");
  }
  if (openAction) reasons.push("action");
  return reasons;
}
export function isOutstanding(item) { return outstandingReasons(item).length > 0; }
export function outstandingItems(register) { return register.items.filter(isOutstanding); }

/** The outstanding list by where it can be dealt with, so staff can jump straight there (Tab 27 B09, Gate 5). */
export function outstandingByPlace(register) {
  const places = new Map();
  const put = (key, label, step, roomId, item, order) => {
    const p = places.get(key) || { key, label, step, roomId, order, count: 0, decision: 0, verification: 0, action: 0, titles: [] };
    p.count += 1;
    for (const r of outstandingReasons(item)) p[r] += 1;
    if (p.titles.length < 3) p.titles.push(itemTitle(item));
    places.set(key, p);
  };
  const rooms = register.meta.rooms || [];
  for (const item of outstandingItems(register)) {
    const q = questionById(resolvePromptId(item.promptKey));
    const roomIdx = item.roomId ? rooms.findIndex((r) => r.id === item.roomId) : -1;
    if (roomIdx >= 0) put(item.roomId, rooms[roomIdx].name, "rooms", item.roomId, item, 10 + roomIdx);
    else if (q?.section === "tech" || q?.section === "mgmt") put("register", "Office register", "register", null, item, 9000);
    else if (item.section === "site" || q?.section === "site") put("site", "Site & existing", "site", null, item, 2);
    else if (q?.topic === "brief") put("context", "Project", "context", null, item, 0);
    else put("whole_house", "Whole house", "whole_house", null, item, 1);
  }
  return [...places.values()].sort((a, b) => a.order - b.order);
}

// A selection settled OUT (by others / excluded / deferred / N-A) is a finished answer, not a client
// CHOICE: it surfaces in the Client Brief scope boundary, never in the Selections schedule or portal.
// Scope, requirement and action items NEVER qualify. This is the load-bearing scope-vs-selection guard.
const NON_SELECTION_DISPOSITIONS = new Set(["excluded", "by_others", "na", "deferred"]);
export function isClientSelection(item) {
  return item.itemKind === "selection" && !NON_SELECTION_DISPOSITIONS.has(item.disposition) && answerAllowsClientSelection(item.answer);
}

/**
 * Is this work inside Blue Leaf's contract? DERIVED from the disposition, never stored, so the two can't
 * disagree. A recorded fact, risk or requirement isn't scope at all. Who later delivers included work is
 * answer.delivery, which has no bearing on this.
 */
export function contractInclusionOf(item) {
  const nature = item.answer?.nature;
  if (nature && !["scope", "choice"].includes(nature)) return "not_scope";
  if (item.itemKind === "requirement" || item.itemKind === "action") return "not_scope";
  if (item.answer?.state === "not_applicable" || item.disposition === "na") return "not_applicable";
  if (INCLUDED_DISPOSITIONS.has(item.disposition)) return "included";
  return { excluded: "excluded", by_others: "by_others", deferred: "deferred", retain: "retained" }[item.disposition] || "undecided";
}

/** The six separate questions about an item, each read from its own field. None implies another. */
export function itemAxes(item) {
  return {
    clientPreference: item.certainty === "preference",
    clientApproval: item.certainty === "client_approved" && !!((item.evidence?.at && item.evidence?.by) || item.sync?.approvedOnBoard),
    constructionScope: contractInclusionOf(item),
    technicalVerification: item.technicalStatus,
    pricingStatus: item.pricingStatus,
    internalAssumption: activeAssumption(item),
  };
}

const PRODUCT_FIELDS = ["product", "model", "manufacturer", "colour", "supplier"];

/**
 * Does this edit go beyond what the client approved? An approval covers a specific product on a selection,
 * and a specific answer on any item. The screen steps the item back to Proposed; the server refuses otherwise.
 */
export function editOutrunsApproval(item, partial) {
  if (!item || item.certainty !== "client_approved" || "certainty" in partial) return false;
  const productMoved = item.itemKind === "selection" && PRODUCT_FIELDS.some((f) => f in partial && stableStringify(partial[f]) !== stableStringify(item[f]));
  return productMoved || ("answer" in partial && answerMaterialChanged(item.answer, partial.answer));
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

/** What to call an item on screen: what was typed, else what was chosen, else its category. */
export function itemTitle(item) {
  return item.description || answerSummary(item) || categoryLabel(item.category);
}

/** The record this one sits under, in words, read live so it can't go stale ("Main roof" for that roof's gutters). "" for most items. */
export function linkedParentLabel(register, item) {
  const parentId = item?.answer?.linkedItemIds?.[0];
  if (!parentId) return "";
  const parent = (register?.items || []).find((i) => i.id === parentId);
  return parent ? parent.answer?.zone?.label || parent.answer?.element?.label || itemTitle(parent) : "";
}

/** Display name for an item's room — the LIVE room list is canonical (survives a room rename). */
export function roomLabel(register, item) {
  if (!item.roomId) {
    const named = (item.answer?.areaIds || []).map((id) => (register.meta.rooms || []).find((r) => r.id === id)?.name).filter(Boolean);
    if (named.length) return named.join(", ");
    return item.section === "site" ? "Site / existing" : "Whole house";
  }
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

// ── Blue Leaf baseline guide (Tab 27 B05, Gate 1.4, Gate 3.2) ──────────────────────────────────────
//
// What is stored: which tier guides each category, in register meta, with the wording copied at the time. Nothing here
// writes to an item, so a tier can't overwrite a choice or become a preference, an approval or a price. Whether an
// assumption applies is worked out each time from what the items say. It is never stored as a second answer.

/** The stored guide, in its one shape. A tier the guide doesn't know is dropped. Wording is kept as it was copied. */
export function normaliseBaseline(raw) {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const categories = {};
  const given = b.categories && typeof b.categories === "object" ? b.categories : {};
  for (const key of Object.keys(given).sort()) {
    if (!BASELINE_TIERS[given[key]?.tier]) continue;
    const a = normaliseAssumption({ ...given[key], categoryKey: key });
    if (a) categories[key] = a;
  }
  return { projectTier: BASELINE_TIERS[b.projectTier] ? b.projectTier : "", categories };
}

/** The broad guide for the project. It moves nothing by itself: categories are set separately (B05). A second tap clears it. */
export function setProjectTier(raw, tier) {
  const b = normaliseBaseline(raw);
  if (!BASELINE_TIERS[tier]) return b;
  return { ...b, projectTier: b.projectTier === tier ? "" : tier };
}

/** One category's tier. Independent of every other category and of the project guide. A second tap clears it. */
export function setCategoryTier(raw, key, tier, { at = "", by = "" } = {}) {
  const b = normaliseBaseline(raw);
  const cat = BASELINE_CATEGORIES.find((c) => c.key === key);
  if (!cat || !BASELINE_TIERS[tier]) return b;
  const categories = { ...b.categories };
  if (categories[key]?.tier === tier) delete categories[key];
  else {
    const pieces = Object.fromEntries([...(cat.parts || []).map((p) => [p.key, p.tiers?.[tier]]), ...Object.entries(cat.zoneTiers || {}).map(([z, t]) => [z, t[tier]])].filter(([, words]) => words));
    categories[key] = { origin: "blue_leaf_baseline", tier, baselineVersion: BASELINE_VERSION, wordingStatus: BASELINE_WORDING_STATUS, categoryKey: key, text: cat.tiers[tier], ...(Object.keys(pieces).length ? { pieces } : {}), at, by };
  }
  return normaliseBaseline({ ...b, categories });
}

const settledOut = (i) => i.answer?.state === "not_applicable" || SETTLED_DISPOSITIONS.has(i.disposition);
const zoneKeyOf = (i) => i.answer?.zone?.key || "";

/**
 * The assumption's words for just these parts or zones, so it never describes something the client has already chosen.
 * Wording copied before parts had their own keeps its full text, and the coverage label does the limiting.
 */
export function assumptionWords(held, keys) {
  const pieces = held?.pieces;
  if (!pieces || !keys?.length) return held?.text || "";
  const words = keys.map((k) => pieces[k]);
  return words.every(Boolean) ? words.join(" ") : held.text;
}

/** Was this wording still unconfirmed when it was copied? Anything copied before the status was stamped was. */
export const assumptionIsDraft = (a) => !!a && (a.wordingStatus || "draft") !== "confirmed";

/** Does this decided whole-house record answer this part of its category? Typed words say what they say, so they count. */
function partCovered(part, row, linkedKeys) {
  const elementKey = row.answer?.element?.key || "";
  if (part.linked) return elementKey === part.linked;
  if (linkedKeys.includes(elementKey)) return false;
  if (part.question && resolvePromptId(row.promptKey) !== part.question) return false;
  if (settledOut(row)) return true;
  const live = (row.answer?.selected || []).filter((s) => !s.stale);
  if (!live.length) return true;
  if (part.option) return live.some((s) => s.path[0] === part.option);
  if (part.pathHas) return live.some((s) => s.path.some((id) => part.pathHas.includes(id)));
  return true;
}

/** The named parts of a category nobody has answered. A part inside a record is only asked about once something is chosen on it. */
function partGapsOf(category, chosen, decided) {
  const parts = category.parts || [];
  const linkedKeys = parts.filter((p) => p.linked).map((p) => p.linked);
  return parts.filter((p) => (p.question ? decided.length > 0 : chosen.length > 0) && !decided.some((row) => partCovered(p, row, linkedKeys)));
}

/**
 * Each category as staff and estimators read it. status: open (nothing chosen, the assumption is all there is) · part
 * (some chosen, the assumption covers only the gaps) · chosen (explicit choices cover it, the assumption isn't used) ·
 * settled (by others, excluded or N/A). Whole-house records only: a room exception doesn't settle the standard.
 */
export function baselineView(register) {
  const b = normaliseBaseline(register?.meta?.baseline);
  const wholeHouse = (register?.items || []).filter((i) => !i.roomId);
  return BASELINE_CATEGORIES.map((c) => {
    const rows = wholeHouse.filter((i) => c.questions.includes(resolvePromptId(i.promptKey)));
    const settled = rows.filter(settledOut);
    const live = rows.filter((i) => !settledOut(i));
    const chosen = live.filter(hasExplicitChoice);
    const open = live.filter((i) => !hasExplicitChoice(i));
    const decided = [...chosen, ...settled];
    const zoneCfg = ANSWER_CONFIG[c.questions[0]]?.zones || [];
    const gaps = decided.some((i) => !zoneKeyOf(i)) ? [] : (c.pricedZones || []).filter((z) => !decided.some((i) => zoneKeyOf(i) === z));
    const missingParts = partGapsOf(c, chosen, decided);
    const partGaps = missingParts.map((p) => p.label);
    const gapKeys = [...gaps, ...missingParts.map((p) => p.key)];
    const hasGaps = open.length > 0 || gaps.length > 0 || partGaps.length > 0;
    const status = !decided.length ? "open" : hasGaps ? "part" : chosen.length ? "chosen" : "settled";
    const held = b.categories[c.key] || null;
    return {
      key: c.key, label: c.label, status, held, tiers: c.tiers, gapKeys, assumptionText: held ? (status === "part" ? assumptionWords(held, gapKeys) : held.text) : "",
      chosen: chosen.map((i) => ({ id: i.id, title: itemTitle(i) })), openItemIds: open.map((i) => i.id),
      zoneGaps: gaps.map((z) => zoneCfg.find((o) => o.id === z)?.label || z), partGaps,
    };
  });
}

/**
 * Two people editing the guide at once. Each category and the project tier are separate values, so an edit to one is kept
 * when someone else changed another. Where both changed the same one, the saved value stands and it is named in conflicts.
 */
export function mergeBaseline(baseRaw, mineRaw, theirsRaw) {
  const base = normaliseBaseline(baseRaw), mine = normaliseBaseline(mineRaw), theirs = normaliseBaseline(theirsRaw);
  const tierOf = (b, k) => b.categories[k]?.tier || "";
  const conflicts = [];
  const categories = { ...theirs.categories };
  for (const k of new Set([...Object.keys(base.categories), ...Object.keys(mine.categories)])) {
    if (tierOf(mine, k) === tierOf(base, k)) continue;
    if (tierOf(theirs, k) === tierOf(base, k) || tierOf(theirs, k) === tierOf(mine, k)) {
      if (mine.categories[k]) categories[k] = mine.categories[k]; else delete categories[k];
    } else conflicts.push(k);
  }
  let projectTier = theirs.projectTier;
  if (mine.projectTier !== base.projectTier) {
    if (theirs.projectTier === base.projectTier || theirs.projectTier === mine.projectTier) projectTier = mine.projectTier;
    else conflicts.push("projectTier");
  }
  return { baseline: normaliseBaseline({ projectTier, categories }), conflicts };
}

/** One tap: give the project guide to the categories with no tier yet and something still to price. Never touches one already set. */
export function applyProjectGuide(register, { at = "", by = "" } = {}) {
  let next = normaliseBaseline(register?.meta?.baseline);
  if (!next.projectTier) return next;
  for (const c of baselineView(register)) {
    if (!c.held && (c.status === "open" || c.status === "part")) next = setCategoryTier(next, c.key, next.projectTier, { at, by });
  }
  return next;
}

/** The assumption an estimator may use for this record, or null. An explicit choice, N/A or a settled status always wins. */
export function assumptionFor(register, item) {
  if (!item || settledOut(item)) return null;
  if (item.answer?.assumption) return activeAssumption(item);
  const id = resolvePromptId(item.promptKey);
  const cat = BASELINE_CATEGORIES.find((c) => c.questions.includes(id));
  const held = cat ? normaliseBaseline(register?.meta?.baseline).categories[cat.key] : null;
  const active = held ? activeAssumption(applyPricingAssumption(item, held)) : null;
  if (!active) return null;
  // A row that is one part or one zone of the category reads only that part's words.
  const zone = item.answer?.zone?.key;
  const piece = cat.parts?.find((p) => p.question === id)?.key || (active.pieces?.[zone] ? zone : null);
  return piece ? { ...active, text: assumptionWords(active, [piece]) } : active;
}

/**
 * A record with something chosen, in a category whose guide still prices parts of it (a door height with no hardware). The row
 * says which parts, the guide and Tender say the same, and the choice itself is never touched. Null where nothing is missing.
 */
export function partAssumptionFor(register, item) {
  if (!item || item.roomId || settledOut(item) || !hasExplicitChoice(item) || item.answer?.linkedItemIds?.length) return null;
  const id = resolvePromptId(item.promptKey);
  const cat = BASELINE_CATEGORIES.find((c) => c.questions.includes(id));
  if (!cat?.parts) return null;
  const view = baselineView(register).find((c) => c.key === cat.key);
  const onRow = cat.parts.filter((p) => !p.question && view.partGaps.includes(p.label));
  return view.held && onRow.length ? { ...view.held, coversOnly: onRow.map((p) => p.label), text: assumptionWords(view.held, onRow.map((p) => p.key)) } : null;
}

/** The assumptions in force, for the staff Tender view and internal Tender Notes. Staff-only by construction: no client code reads this. */
export function baselineAssumptions(register) {
  return baselineView(register).filter((c) => c.held && (c.status === "open" || c.status === "part")).map((c) => ({
    key: c.key, label: c.label, tier: c.held.tier, tierLabel: BASELINE_TIERS[c.held.tier], text: c.assumptionText, baselineVersion: c.held.baselineVersion,
    status: c.status, zoneGaps: c.zoneGaps, partGaps: c.partGaps, gaps: [...c.zoneGaps, ...c.partGaps], chosen: c.chosen, openItemIds: c.openItemIds, draft: assumptionIsDraft(c.held),
  }));
}

// ── Envelope performance review (DEC-MRUX-03) ─────────────────────────────────────────────────────

/** What the chosen goals may prompt someone to review. Derived from the answer every time and never stored. */
export function performanceSuggestions(answer) {
  return (answer?.selected || []).filter((s) => !s.stale && PERFORMANCE_SUGGESTIONS[s.optionId])
    .map((s) => ({ goal: s.optionId, goalLabel: s.label, suggestions: PERFORMANCE_SUGGESTIONS[s.optionId] }));
}

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
      goals: goalsItem?.description || (goalsItem && answerSummary(goalsItem)) || TBC,
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
