/**
 * UI Review fixtures — Takeoffs (review-only, SYNTHETIC data).
 *
 * A tiny in-memory takeoff "server" so the whole flow is clickable with no backend: it applies
 * commits with the REAL shared/takeoff maths (calibration from tapped points, run lengths,
 * schedule, splits) and bumps revisions like the real API. Plan bytes are a generated synthetic
 * 12-page set (2 known-dimension pages + 10 dense A1 sheets). Never shipped: this module is only
 * imported when VITE_UI_REVIEW_MODE=true.
 *
 * Review knobs (query string): ?takeoffConflict=1 makes the next commit return 409;
 * ?takeoffWorker=ordinary makes worker capability "view plans only";
 * ?takeoffSeed=mixed adds the TC-R04 J5 mixed-procurement job (timber pieces, random-length LM, Axon sheets,
 * battens, aluminium bars, continuous flashing runs) on top of the default flashing seed; add &takeoffFixings=1 for
 * an accessory material with a manual quantity in boxes and by-others / excluded accessory scopes;
 * ?takeoffElevation=1 scales page 3 (an empty page) like page 1, for Rectangle / Area on an elevation (HUB 023);
 * ?takeoffSeed=battens (wall-by-wall step 4) adds Axon 400 smooth set up from the Blue Leaf defaults on the check job —
 * walls of 6, 4, 6 and 4 m at 2,700 with three windows and a door, plus a 6 m gable that needs an H joint — so its
 * automatic battens, foam tape and H-flashing show on the walls, the schedule and the order with nothing set up;
 * window.__takeoffReviewOffline = true makes commits fail like a dropped connection.
 * HUB 025 (commits behave like the server's): a repeated idempotencyKey returns the original result with replayed:true
 * before the revision check; a save that would leave two live assignments on one (measurement, material) pair is refused
 * whole with 409 DUPLICATE_ASSIGNMENT (takeoff_contrib_unique_active, checked in the RPC's order: assignments are added
 * before archives); window.__takeoffReviewDropResponse = true applies the next commit, then loses its reply like a
 * dropped connection (once); window.__takeoffReviewCommitDelayMs = N answers each commit N ms late (a slow phone signal);
 * window.__takeoffReviewRefuse = 401 refuses every commit as an expired sign-in, or = { status, error, code } with that
 * refusal (e.g. the 409 DUPLICATE_ASSIGNMENT an older app could still cause). window.__takeoffReviewPresetRace = true
 * makes another office login save the aluminium company product a moment before the next "Add to company products"
 * save of it lands (once), so that save is refused 409 like the server's stale-revision check (HUB 024).
 * Exports freeze a snapshot (like buildExportSnapshot: generic items by unit + the site appendix);
 * GET …/exports/:id/appendix serves a small text-only stub PDF rendered from THAT frozen snapshot.
 */
import { route } from "../registry.js";
import { reviewRole } from "../config.js";
import {
  buildCalibration, verifyCalibration, segmentLengthMm, computeWorkspace, orderStatus, starterProfile, mirrorProfile,
  normaliseFlashingRules, ITEM_STALE_TEXT, PROBLEM_TEXT, FLASHING_SPEC_DEFAULTS, orderLineState, describeFamilySpec, methodFor,
  SECTION_VALUES, SECTION_LABEL, materialSection, lineSection, flashingNeeds, refreshDraftLines, gableInputProblem,
  TIMBER_GRID, WALLS_PURPOSE, methodReads, normaliseFamilySpec,
} from "../../../shared/takeoff/index.js";
import { aluminiumPreset, productGroups, specFromGroup } from "../../../shared/takeoff/products/index.js";
import { profileSizeText, sameAluminiumProfile } from "../../../shared/takeoff/companyProducts.js";
import { BLUE_LEAF_JH_DEFAULTS } from "../../../shared/takeoff/companyDefaults.js";
import planMeta from "./takeoff/synthetic-plan-set.json";

// Binary fixtures are fetched from the Vite DEV server path (ui-review always runs on `vite`),
// never imported with ?url — that would emit the PDFs into a production build.
const FIXTURE_DIR = ["", "src", "ui-review", "fixtures", "takeoff", ""].join("/");
const planUrl = `${FIXTURE_DIR}synthetic-plan-set.pdf`;
const exportUrl = `${FIXTURE_DIR}sample-export.pdf`;

const qs = () => new URLSearchParams(window.location.search);
const P0 = planMeta.pages[0];
const k = P0.pdfUnitsPerMm;
const now = () => new Date().toISOString();

// ── seed ────────────────────────────────────────────────────────────────────
// HUB 021: window.__takeoffReviewPlanSha (set before load) simulates the stored plan being replaced with new bytes
const DOC = { id: "doc-plan-c", title: "Example-St-architectural.pdf — Rev C", documentType: "architectural", status: "current", revisionLabel: "Rev C", contentSha256: "synthetic", byteSize: 2146710, uploadedAt: "2026-10-01T02:00:00Z", version: 3, supersedesDocumentId: "doc-plan-b", archivedAt: null };
if (typeof window !== "undefined" && window.__takeoffReviewPlanSha) DOC.contentSha256 = String(window.__takeoffReviewPlanSha);
const OLD = { ...DOC, id: "doc-plan-b", title: "Example-St-architectural.pdf — Rev B", status: "superseded", revisionLabel: "Rev B", version: 2 };
const bx = 120, by = 150;
const H = { p1: { x: bx, y: by - 40 }, p2: { x: bx + 12000 * k, y: by - 40 }, knownMm: 12000 };
const V = { p1: { x: bx - 40, y: by }, p2: { x: bx - 40, y: by + 8000 * k }, knownMm: 8000 };
const CHK = { p1: { x: bx, y: by + 8000 * k + 30 }, p2: { x: bx + 3000 * k, y: by + 8000 * k + 30 }, expectedMm: 3000 };
const cal0 = verifyCalibration(buildCalibration({ basisRotation: 0, horizontal: H, vertical: V }).calibration, CHK);
const run = (id, mm, x0, y0, vertical = false) => ({ id, kind: "run", documentId: DOC.id, pageIndex: 0, calibrationId: "cal-1", points: vertical ? [{ x: bx + x0 * k, y: by + y0 * k }, { x: bx + x0 * k, y: by + (y0 + mm) * k }] : [{ x: bx + x0 * k, y: by + y0 * k }, { x: bx + (x0 + mm) * k, y: by + y0 * k }], label: null, revision: 1 });

let state = null;
function seed() {
  const profile = starterProfile();
  state = {
    revision: 7,
    workspace: { id: "ws-1", name: "Flashings", state: "active", reviewReason: null, primaryDocumentId: DOC.id, primaryPageIndex: 0, owner: { carpentryJobId: "cjb-1" }, createdAt: "2026-10-02T00:00:00Z", updatedAt: now() },
    documents: [DOC, OLD],
    calibrations: [{ id: "cal-1", documentId: DOC.id, pageIndex: 0, pageMeta: { viewBox: P0.viewBox, rotate: 0, userUnit: 1 }, region: null, regionLabel: null, calibrationRevision: 1, ...cal0, createdAt: "2026-10-02T00:00:00Z" }],
    materials: [
      { id: "mat-apron", name: "Apron flashing", methodKey: "flashing_runs", methodVersion: 1, spec: { ...FLASHING_SPEC_DEFAULTS, colour: "Monument" }, rules: {}, profile, fromPresetId: "pre-apron", fromPresetRevision: 1, revision: 1 },
      { id: "mat-barge", name: "Barge flashing", methodKey: "flashing_runs", methodVersion: 1, spec: { ...FLASHING_SPEC_DEFAULTS, colour: "Surfmist" }, rules: {}, profile: mirrorProfile(profile), fromPresetId: null, fromPresetRevision: null, revision: 1 },
    ],
    measurements: [
      run("m-1", 4312, 0, 2000), run("m-2", 4312, 5000, 2000), run("m-3", 7000, 0, 6000), run("m-4", 5900, 0, 0, true),
      { id: "m-5", kind: "manual", documentId: null, pageIndex: null, calibrationId: null, points: null, finishedLengthMm: 4312, quantity: 3, label: null, revision: 1 },
      { id: "m-6", kind: "count", documentId: DOC.id, pageIndex: 0, calibrationId: null, points: [{ x: bx + 9000 * k, y: by + 1000 * k }, { x: bx + 10000 * k, y: by + 1000 * k }], finishedLengthMm: 2400, quantity: null, label: null, revision: 1 },
    ],
    contributions: [
      { id: "c-1", measurementId: "m-1", jobMaterialId: "mat-apron", role: "primary", split: null },
      { id: "c-2", measurementId: "m-2", jobMaterialId: "mat-apron", role: "primary", split: null },
      { id: "c-3", measurementId: "m-3", jobMaterialId: "mat-barge", role: "primary", split: null },
      { id: "c-4", measurementId: "m-4", jobMaterialId: "mat-barge", role: "primary", split: null },
      { id: "c-5", measurementId: "m-5", jobMaterialId: "mat-apron", role: "primary", split: null },
      { id: "c-6", measurementId: "m-6", jobMaterialId: "mat-barge", role: "primary", split: null },
    ],
    presets: [{ id: "pre-apron", name: "Apron flashing", revision: 2, isActive: true, methodKey: "flashing_runs", methodVersion: 1, spec: { ...FLASHING_SPEC_DEFAULTS, colour: "Monument" }, rules: {}, profile, sourceReview: { status: "user_entered" } }],
    orders: [],
    commitments: [],
    frozen: {},            // exportId → frozen snapshot (never changes after export)
    appendixRequests: [],  // exportIds whose site appendix was opened (review evidence)
  };
  if (qs().get("takeoffSeed") === "mixed") seedMixed();
  if (qs().get("takeoffSeed") === "battens") seedBattens();
  // ?takeoffElevation=1 (HUB 023) — page 3 of the plan is a scaled elevation with nothing measured on it yet (the same
  // scale as page 1, checked), for drawing walls with Rectangle and Area
  if (qs().get("takeoffElevation") === "1") {
    const P2 = planMeta.pages[2];
    state.calibrations.push({ id: "cal-elev", documentId: DOC.id, pageIndex: 2, pageMeta: { viewBox: P2.viewBox, rotate: 0, userUnit: 1 }, region: null, regionLabel: null, calibrationRevision: 1, ...cal0, createdAt: "2026-10-02T00:00:00Z" });
  }
  // ?takeoffDefaults=1 — the Axon 400 smooth company default exactly as migration 211 seeds it (HUB 014)
  if (qs().get("takeoffDefaults") === "1") {
    const g = productGroups({ family: "cladding" }).find((x) => x.name === "Axon 400 smooth"), D = BLUE_LEAF_JH_DEFAULTS;
    state.presets.push({ id: "pre-axon400-default", name: "Axon 400 smooth — company default", revision: 1, isActive: true, updatedAt: "2026-10-20T00:00:00Z", methodKey: "sheet_layout", methodVersion: 2,
      spec: { family: "cladding", layout: "sheet", orientation: "vertical", assemblyId: "axon-vertical", product: { id: g.id, manufacturer: g.manufacturer, name: g.name, widthMm: g.widthMm, thicknessMm: g.thicknessMm }, spareRate: D.spareRate, supplierName: null },
      rules: { companyDefault: true, route: D.route, installConditions: { ...D.installConditions }, jointRows: { atMm: [], ...D.jointRule } }, profile: null, sourceReview: { status: "user_entered" } });
  }
}

/** Wall-by-wall step 4 (SYNTHETIC): Axon 400 smooth from the Blue Leaf defaults on the check job + a gable with an H joint. */
function seedBattens() {
  const g = productGroups({ family: "cladding" }).find((x) => x.name === "Axon 400 smooth"), D = BLUE_LEAF_JH_DEFAULTS;
  const spec = { ...specFromGroup(g), assemblyId: "axon-vertical", spareRate: D.spareRate };
  const m = methodFor(spec);
  state.materials.push({ id: "mat-axon400", name: "Axon 400 smooth", spec, methodKey: m.key, methodVersion: m.version, revision: 1, profile: null,
    rules: { route: D.route, installConditions: { ...D.installConditions, "direct-or-cavity": D.route }, jointRows: { atMm: [], ...D.jointRule } } });
  const wall = (id, name, inputs) => ({ id, kind: "wall", documentId: null, pageIndex: null, calibrationId: null, points: null, parentId: null, label: null, revision: 1, inputs: { name, ...inputs } });
  const opening = (id, parentId, label, type, xMm, sillMm, widthMm, heightMm) => ({ id, kind: "opening", documentId: null, pageIndex: null, calibrationId: null, points: null, parentId, label: null, revision: 1,
    inputs: { xMm, sillMm, widthMm, heightMm, label, type } });
  state.measurements.push(
    wall("bw-1", "Wall 1", { kind: "rect", widthMm: 6000, heightMm: 2700 }), wall("bw-2", "Wall 2", { kind: "rect", widthMm: 4000, heightMm: 2700 }),
    wall("bw-3", "Wall 3", { kind: "rect", widthMm: 6000, heightMm: 2700 }), wall("bw-4", "Wall 4", { kind: "rect", widthMm: 4000, heightMm: 2700 }),
    wall("bw-5", "Gable", { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000, apexHeightMm: 3600 }),
    opening("bo-1", "bw-1", "W1", "window", 1000, 900, 1200, 1200), opening("bo-2", "bw-1", "W2", "window", 3800, 900, 1200, 1200),
    opening("bo-3", "bw-2", "D1", "door", 1500, 0, 900, 2100), opening("bo-4", "bw-3", "W1", "window", 2400, 900, 1200, 1200),
  );
  for (const id of ["bw-1", "bw-2", "bw-3", "bw-4", "bw-5"]) state.contributions.push({ id: `bc-${id}`, measurementId: id, jobMaterialId: "mat-axon400", role: "wall" });
}

/** TC-R04 J5 mixed procurement (SYNTHETIC): every unit on one job, plus continuous flashing runs. */
function seedMixed() {
  const pt = (x, y) => ({ x: bx + x * k, y: by + y * k });
  const fam = (spec) => { const m = methodFor(spec); return { spec, methodKey: m.key, methodVersion: m.version }; };
  const group = (re) => productGroups({}).find((g) => re.test(g.name));
  const timber = (purpose) => ({ family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { ...TIMBER_GRID } });
  state.materials.push(
    { id: "mat-raf", name: "Rafters 90 × 45", ...fam(timber("rafters")), rules: { centresMm: 600, lengthSource: "projected", pitchDeg: 30 }, revision: 1 },
    { id: "mat-axon", name: "Axon cladding", ...fam(specFromGroup(group(/Axon 133 smooth/))), rules: {}, revision: 1 },
    { id: "mat-bat", name: "Cavity battens", ...fam(specFromGroup(group(/Cavity Batten/))), rules: { maxSpacingMm: 600 }, revision: 1 },
    { id: "mat-al", name: "Window angle 50 × 50 × 3", ...fam({ ...aluminiumPreset(), kerfMm: 3, kerfConfirmed: true }), rules: {}, revision: 1 },
    { id: "mat-tc", name: "Shiplap (random lengths)", ...fam({ family: "timber-cladding", supply: "random", orderIncrementM: 1, product: { name: "Shiplap", widthMm: 140, thicknessMm: 19, effectiveCoverMm: 120, lengthMm: 5400 } }), rules: {}, revision: 1 },
    { id: "mat-trim", name: "Trimmers", ...fam(timber("other")), rules: {}, revision: 1 },
  );
  const traced = (id, kind, points, inputs = {}) => ({ id, kind, documentId: DOC.id, pageIndex: 0, calibrationId: "cal-1", points, inputs, label: null, revision: 1 });
  state.measurements.push(
    traced("m-dist", "distribution", [pt(0, 7000), pt(10000, 7000)]),
    traced("m-mem", "member", [pt(11000, 0), pt(11000, 4500)], { mode: "projected" }),
    { id: "m-wn", kind: "wall", inputs: { kind: "rect", widthMm: 4800, heightMm: 2700, name: "North wall" }, label: null, revision: 1 },
    { id: "m-w1", kind: "opening", parentId: "m-wn", inputs: { xMm: 1500, sillMm: 900, widthMm: 900, heightMm: 900, label: "W1", type: "window" }, label: null, revision: 1 },
    { id: "m-we", kind: "wall", inputs: { kind: "rect", widthMm: 3000, heightMm: 3000, name: "East wall" }, label: null, revision: 1 },
    { id: "m-w2", kind: "opening", parentId: "m-we", inputs: { xMm: 600, sillMm: 1000, widthMm: 1800, heightMm: 1200, label: "W2", type: "window" }, label: null, revision: 1 },
    // continuous flashing runs (13): 6,000 + 4,000 = 10,000 tight, split at 8,800 → 9,000 + 1,400; four 750 legs → one 3,200
    traced("m-pl1", "polyline", [pt(500, 7600), pt(6500, 7600), pt(6500, 3600)], { splitsMm: [8800] }),
    traced("m-pl2", "polyline", [pt(8000, 5000), pt(8750, 5000), pt(8750, 5750), pt(9500, 5750), pt(9500, 6500)], { splitsMm: [] }),
    { id: "m-man", kind: "manual", documentId: null, pageIndex: null, calibrationId: null, points: null, finishedLengthMm: 2350, quantity: 4, label: null, revision: 1 },
  );
  state.contributions.push(
    { id: "c-pl1", measurementId: "m-pl1", jobMaterialId: "mat-apron", role: "primary", split: null },
    { id: "c-pl2", measurementId: "m-pl2", jobMaterialId: "mat-apron", role: "primary", split: null },
    { id: "c-dist", measurementId: "m-dist", jobMaterialId: "mat-raf", role: "distribution" },
    { id: "c-mem", measurementId: "m-mem", jobMaterialId: "mat-raf", role: "member" },
    { id: "c-axon", measurementId: "m-wn", jobMaterialId: "mat-axon", role: "wall" },
    { id: "c-bat", measurementId: "m-wn", jobMaterialId: "mat-bat", role: "wall" },
    { id: "c-al1", measurementId: "m-w1", jobMaterialId: "mat-al", role: "opening" },
    { id: "c-al2", measurementId: "m-w2", jobMaterialId: "mat-al", role: "opening" },
    { id: "c-tc", measurementId: "m-we", jobMaterialId: "mat-tc", role: "wall" },
    { id: "c-man", measurementId: "m-man", jobMaterialId: "mat-trim", role: "primary" },
  );
  if (qs().get("takeoffFixings") === "1") seedFixings();
}

/**
 * ?takeoffSeed=mixed&takeoffFixings=1 — J5 "fixings boxes": an accessory material whose recipe (as the engine reads it,
 * rules.recipe) has a reviewed manual quantity in BOXES plus membrane by others / sealant excluded, and the per-group
 * scope the setup screen records (rules.scope). Separate knob so other areas' mixed-seed tests keep their material list.
 */
function seedFixings() {
  const spec = { family: "accessory", product: { name: "Cladding screws 8g × 40 (box of 500)" }, supplierName: "Fielders", productCode: "CS840" };
  const m = methodFor(spec);
  const recipe = { id: "fix", groups: [
    { id: "fixings", kind: "manual", label: "Cladding screws 8g × 40", identity: { product: "CS840" }, manualQuantity: { quantity: 3, unit: "box", authority: "Supplier quote Q-123" } },
    { id: "membrane", kind: "membrane", scope: { status: "by-others", reason: "Wrap by the framer" } },
    { id: "sealant", kind: "sealant", scope: { status: "exclude", reason: "Painter seals the joints" } },
  ] };
  state.materials.push({ id: "mat-fix", name: "Cladding fixings", spec, methodKey: m.key, methodVersion: m.version, revision: 1,
    rules: { recipe, scope: { fixings: "include", membrane: "by-others", sealant: "exclude", corners: "unresolved", tape: "by-others" } } });
  state.contributions.push({ id: "c-fix", measurementId: "m-wn", jobMaterialId: "mat-fix", role: "wall" });
}
seed();

const snapshot = () => ({ workspace: { ...state.workspace, revision: state.revision }, documents: state.documents, calibrations: state.calibrations, measurements: state.measurements, materials: state.materials, contributions: state.contributions });
const status = () => [...orderStatus(computeWorkspace(snapshot()).scheduleLines, state.commitments).values()];
/** the suppliers on file (seeded + added from the order), with any edits made from the order (HUB 008 / HUB 019) */
const mockSuppliers = () => [{ id: "sup-1", name: "Fielders (review branch)" }, { id: "sup-2", name: "Other Steel Supplies" }, ...(state.addedSuppliers || [])]
  .map((x) => ({ ...x, ...(state.supplierEdits?.[x.id] || {}) }));
/** an order as the API shows it — the server-kept refresh basis never leaves the server (HUB 013) */
const publicOrder = (o) => { if (!o) return null; const { basis: _basis, ...rest } = o; void _basis; return rest; };
const caps = (worker) => {
  if (worker) {
    const ordinary = qs().get("takeoffWorker") === "ordinary";
    // ?takeoffWorker=office — a Worker-app login linked to an Admin / Supervisor account (office staff on a phone)
    const office = qs().get("takeoffWorker") === "office";
    return { view: !ordinary, edit: !ordinary, export: !ordinary, editStandards: false, addSuppliers: office, saveCompanyDefaults: office, addCompanyProducts: office, placeOrders: false, viewSupplierContacts: false, isPreview: false, actorKey: "employee:emp-4" };
  }
  const role = reviewRole();
  const office = role === "admin" || role === "supervisor";
  return { view: true, edit: true, export: true, editStandards: true, addSuppliers: office, saveCompanyDefaults: office, addCompanyProducts: office, placeOrders: role === "admin", viewSupplierContacts: true, isPreview: false, actorKey: `staff:review-${role}` };
};
const fail = (status, error, code) => ({ __status: status, body: { ok: false, error, code } });
/**
 * Wall inputs exactly as the server keeps them (takeoffService.mjs cleanInputs): known keys only, so a field the
 * server would drop is dropped here too. HUB 022: runId + seq are kept only as a valid pair (a uuid and 1–1,000).
 */
const WALL_INPUT_KEYS = ["kind", "widthMm", "heightMm", "startHeightMm", "endHeightMm", "eavesHeightMm", "apexXMm", "apexHeightMm", "heightSource", "name", "floor", "polygon"];
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function serverWallInputs(i) {
  if (!i) return i;
  const out = {};
  for (const key of WALL_INPUT_KEYS) if (i[key] !== undefined) out[key] = i[key];
  if (typeof i.runId === "string" && UUID_RX.test(i.runId) && Number.isInteger(i.seq) && i.seq >= 1 && i.seq <= 1000) { out.runId = i.runId; out.seq = i.seq; }
  return out;
}

/**
 * Opening inputs as the server keeps them (cleanInputs "opening"): the entered numbers, label, type and framing detail
 * only — an opening drawn on the plan (HUB 022 step 2) carries nothing else, and a field the server drops goes here too.
 */
const OPENING_INPUT_KEYS = ["xMm", "sillMm", "widthMm", "heightMm", "label", "type", "detail"];
function serverOpeningInputs(i) {
  if (!i) return i;
  const out = {};
  for (const key of OPENING_INPUT_KEYS) if (i[key] !== undefined) out[key] = i[key];
  out.label = typeof out.label === "string" && out.label.trim() ? out.label.trim().slice(0, 40) : null;
  out.type = ["window", "door", "other"].includes(out.type) ? out.type : "window";
  if (out.detail == null) delete out.detail;
  return out;
}

/**
 * Like the server's commit check (every LIVE assignment after the change must be read by its generic material): a
 * Walls item (wall_framing@1) can't take a run, count or entered length — same message as takeoffService. Only Walls is
 * checked here, so older review seeds behave as before.
 */
function wallsReadProblem(ch) {
  const merged = (list, ups, archive) => {
    const out = new Map(list.map((x) => [x.id, x]));
    for (const r of ups || []) if (r?.id) out.set(r.id, { ...(out.get(r.id) || {}), ...r });
    for (const id of archive || []) out.delete(id);
    return out;
  };
  const mats = merged(state.materials, ch.materials?.upsert, ch.materials?.archive);
  const meas = merged(state.measurements, ch.measurements?.upsert, ch.measurements?.archive);
  for (const c of merged(state.contributions, ch.contributions?.upsert, ch.contributions?.archive).values()) {
    const cm = mats.get(c.jobMaterialId), mm = meas.get(c.measurementId);
    if (!cm || !mm || cm.methodKey !== "wall_framing") continue;
    if (!methodReads(cm).includes(mm.kind)) return `${cm.name} can't use a ${mm.kind} measurement — assign it to the right material.`;
  }
  return null;
}

function applyCommit(body) {
  if (window.__takeoffReviewOffline) throw new TypeError("Failed to fetch"); // simulate a dropped connection
  if (window.__takeoffReviewRefuse) { // simulate a 4xx refusal: a status (expired sign-in), or { status, error, code } (HUB 025)
    const r = window.__takeoffReviewRefuse;
    state.commitCount = (state.commitCount || 0) + 1;
    return typeof r === "object" ? fail(r.status, r.error, r.code) : fail(r, "Your sign-in has expired.", "UNAUTHENTICATED");
  }
  state.commitCount = (state.commitCount || 0) + 1;
  // like the server: a retry of an already-committed key returns the original result, never re-applies (HUB 025)
  const idem = body.idempotencyKey ? String(body.idempotencyKey) : null;
  if (idem && state.idem?.[idem] != null) {
    const snap = snapshot();
    return { ok: true, commit: { revision: state.idem[idem], replayed: true }, snapshot: snap, computed: computeWorkspace(snap), orderStatus: status() };
  }
  if (qs().get("takeoffConflict") === "1" && !state.conflicted) { state.conflicted = true; state.revision += 1; return fail(409, "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare.", "CONFLICT"); }
  if (body.expectedRevision !== state.revision) return fail(409, "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare.", "CONFLICT");
  const ch = body.changes || {};
  // like takeoff_contrib_unique_active in the RPC's order (assignments are added BEFORE archives): one live assignment
  // per (measurement, material) at every step, or the whole save is refused before anything changes (HUB 025)
  const livePair = new Map(state.contributions.map((c) => [c.id, `${c.measurementId}|${c.jobMaterialId}`]));
  for (const c of ch.contributions?.upsert || []) {
    const rec = { ...(state.contributions.find((x) => x.id === c?.id) || {}), ...c };
    const pair = `${rec.measurementId}|${rec.jobMaterialId}`;
    livePair.set(rec.id, pair);
    for (const [id, p] of livePair) if (id !== rec.id && p === pair) return fail(409, PROBLEM_TEXT.duplicate_assignment, "DUPLICATE_ASSIGNMENT");
  }
  // HUB 028, like the server (cleanMaterialContent → normaliseFamilySpec): a Walls spec is kept CLEANED (its four parts,
  // junk dropped), and a Walls item reads traced walls only (methodReads), checked before anything changes
  const walls = new Map();
  for (const m of ch.materials?.upsert || []) {
    if (m?.spec?.family !== "timber" || m.spec.purpose !== WALLS_PURPOSE) continue;
    try { walls.set(m.id, normaliseFamilySpec(m.spec)); } catch (e) { return fail(400, e.message, "INVALID"); }
  }
  const wallsRead = wallsReadProblem(ch);
  if (wallsRead) return fail(400, wallsRead, "INVALID");
  try {
    if (ch.workspace) {
      const w = ch.workspace;
      if (w.primaryDocumentId) { state.workspace.primaryDocumentId = w.primaryDocumentId; state.workspace.primaryPageIndex = w.primaryPageIndex ?? 0; }
      if (w.acknowledgeReview) { state.workspace.state = "active"; state.workspace.reviewReason = null; }
      if (w.name) state.workspace.name = w.name;
    }
    for (const c of ch.calibrations?.insert || []) {
      const b = buildCalibration({ basisRotation: c.basisRotation, horizontal: c.horizontal, vertical: c.vertical, mode: c.mode, region: c.region });
      if (!b.ok) return fail(400, b.message, "AXIS_MISMATCH");
      const cal = c.verification ? verifyCalibration(b.calibration, c.verification) : b.calibration;
      const rev = state.calibrations.filter((x) => x.documentId === c.documentId && x.pageIndex === c.pageIndex && (x.regionLabel || null) === (c.regionLabel || null)).length + 1;
      state.calibrations.push({ id: c.id, documentId: c.documentId, pageIndex: c.pageIndex, pageMeta: c.pageMeta, region: cal.region, regionLabel: c.regionLabel || null, calibrationRevision: rev, ...cal, createdAt: now() });
    }
    const up = (list, recs, map = (r) => r) => { for (const r of recs || []) { const i = list.findIndex((x) => x.id === r.id); const v = map(r); if (i >= 0) list[i] = { ...list[i], ...v }; else list.push(v); } };
    up(state.materials, ch.materials?.upsert, (m) => {
      // like the server: the job gets its own COPY of the preset revision (HUB 024: a later job edit never reaches it)
      if (m.fromPreset) { const p = state.presets.find((x) => x.id === m.fromPreset.presetId); return { id: m.id, name: p.name, methodKey: p.methodKey, methodVersion: p.methodVersion, spec: structuredClone(p.spec), rules: structuredClone(p.rules), profile: p.profile ? structuredClone(p.profile) : p.profile, fromPresetId: p.id, fromPresetRevision: p.revision }; }
      // TC-R04 families keep their own rules (centres, pitch, heights …); flashing rules are normalised as before
      if (walls.has(m.id)) return { ...m, spec: walls.get(m.id), rules: { ...(m.rules || {}) } };
      return m.spec?.family && m.spec.family !== "flashing" ? { ...m, rules: { ...(m.rules || {}) } } : { ...m, rules: normaliseFlashingRules(m.rules) };
    });
    // like the server's cleanInputs (HUB 017): a gable's present values must be coherent — a missing apex position is a draft
    for (const m of ch.measurements?.upsert || []) {
      if (m.kind === "wall" && m.inputs?.kind === "gable") { const gp = gableInputProblem(m.inputs, m.inputs.widthMm); if (gp) return fail(400, gp.message, "INVALID"); }
      // like the server: a wall traced on a plan is one straight wall; only an elevation OUTLINE (Rectangle / Area, HUB 023)
      // has more corners — at most 200
      if (m.kind === "wall" && Array.isArray(m.points) && m.points.length && !(m.points.length === 2 || (m.inputs?.kind === "polygon" && m.points.length <= 200))) {
        return fail(400, "Trace one straight wall at a time — a corner starts the next wall.", "INVALID");
      }
      // like the server: an opening is entered by numbers (never plan points) and belongs to a wall of this takeoff
      if (m.kind === "opening" && Array.isArray(m.points) && m.points.length) return fail(400, "Openings and offcuts are entered by numbers.", "INVALID");
      if (m.kind === "opening" && m.parentId != null && ![...state.measurements, ...ch.measurements.upsert].some((x) => x.id === m.parentId && x.kind === "wall")) {
        return fail(400, "An opening must belong to a wall in this takeoff.", "INVALID");
      }
    }
    up(state.measurements, ch.measurements?.upsert, (m) => {
      if (m.kind === "wall") return { ...m, inputs: serverWallInputs(m.inputs) };
      if (m.kind === "opening") return { ...m, inputs: serverOpeningInputs(m.inputs) };
      if (m.kind !== "run") return { ...m };
      const c = state.calibrations.find((x) => x.id === m.calibrationId);
      return { ...m, rawLengthMm: c ? segmentLengthMm(c, m.points[0], m.points[1]) : null };
    });
    up(state.contributions, ch.contributions?.upsert);
    const drop = (list, ids) => list.filter((x) => !(ids || []).includes(x.id));
    state.measurements = drop(state.measurements, ch.measurements?.archive);
    state.materials = drop(state.materials, ch.materials?.archive);
    state.contributions = drop(state.contributions, ch.contributions?.archive).filter((c) => state.measurements.some((m) => m.id === c.measurementId) && state.materials.some((m) => m.id === c.jobMaterialId));
  } catch (e) { return fail(400, e.message, "INVALID"); }
  state.revision += 1;
  if (idem) state.idem = { ...(state.idem || {}), [idem]: state.revision };
  // HUB 025 review knob: the server applied this commit but its reply never arrives (once)
  if (window.__takeoffReviewDropResponse) { window.__takeoffReviewDropResponse = false; throw new TypeError("Failed to fetch"); }
  const snap = snapshot();
  return { ok: true, commit: { revision: state.revision, replayed: false }, snapshot: snap, computed: computeWorkspace(snap), orderStatus: status() };
}

/**
 * Mirror of the server's buildExportSnapshot (server/lib/takeoff/takeoffService.mjs), reduced to what the review UI
 * reads: readiness problems (incl. stale lines via orderLineState), flashing totals (pieces/LM), generic items with
 * totals BY UNIT (never added together) and the site appendix that travels in the same frozen snapshot.
 */
function exportSnapshot(order) {
  const snap = snapshot();
  const computed = computeWorkspace(snap);
  const mats = new Map(snap.materials.map((m) => [m.id, m]));
  const problems = [];
  if (!order.supplierId) problems.push("Choose a supplier.");
  const d = order.delivery || {};
  if (d.method !== "delivery" && d.method !== "pickup") problems.push("Choose delivery or pickup.");
  if (d.method === "delivery" && !d.address) problems.push("Enter the delivery address.");
  if (!order.lines.length) problems.push("Add at least one length to the order.");
  const items = new Map();
  let pieces = 0, totalMm = 0;
  for (const l of order.lines) {
    const st = orderLineState(l, computed, mats);
    if (st.stale) problems.push((l.item ? ITEM_STALE_TEXT : PROBLEM_TEXT)[st.problem]); // as the server
    const s = st.current;
    if (!s?.generic) {
      // flashing: exactly the previous review behaviour (length × pieces)
      for (const p of s?.problems || []) problems.push(PROBLEM_TEXT[p]);
      if (!l.item) { pieces += l.quantity; totalMm += (l.finishedLengthMm || 0) * l.quantity; }
      continue;
    }
    const mat = mats.get(l.jobMaterialId) || mats.get(s.jobMaterialIds[0]);
    if (!mat) { problems.push(PROBLEM_TEXT.line_stale_material); continue; }
    for (const p of s.problems) problems.push(`${mat.name}: ${PROBLEM_TEXT[p] || p}`);
    let g = items.get(mat.id);
    if (!g) {
      g = { materialId: mat.id, family: mat.spec?.family, materialName: mat.name, specText: describeFamilySpec(mat.spec), statuses: computed.materialResults?.[mat.id]?.status || null, lines: [] };
      items.set(mat.id, g);
    }
    g.lines.push({ bucketKey: s.bucketKey, unit: s.unit, quantity: l.quantity, required: s.quantity, description: s.item?.description || s.unit,
      finishedLengthMm: s.finishedLengthMm ?? null, stockLengthMm: s.item?.stockLengthMm ?? null, note: s.item?.note || null, stale: st.stale, problem: s.problems.length > 0 });
  }
  const itemList = [...items.values()].sort((a, b) => a.materialName.localeCompare(b.materialName)).map((g, i) => {
    const byUnit = {};
    for (const l of g.lines) byUnit[l.unit] = (byUnit[l.unit] || 0) + l.quantity;
    return { ...g, groupId: `M${i + 1}`, totals: { byUnit } };
  });
  const byUnit = {};
  for (const g of itemList) for (const [u, n] of Object.entries(g.totals.byUnit)) byUnit[u] = (byUnit[u] || 0) + n;
  const appendix = { aluminium: [], timber: [], layouts: [], flashingRuns: [] };
  for (const g of itemList) {
    const ap = computed.materialResults?.[g.materialId]?.appendix;
    for (const key of ["aluminium", "timber", "layouts"]) for (const x of ap?.[key] || []) appendix[key].push({ ...x, materialName: g.materialName });
  }
  const keys = new Set(order.lines.map((l) => l.bucketKey));
  for (const c of computed.contributions) {
    if (!c.path) continue;
    const sl = computed.scheduleLines.find((x) => x.contributionIds.includes(c.contributionId) && keys.has(x.bucketKey));
    if (!sl || sl.generic) continue;
    appendix.flashingRuns.push({ ref: `R-${String(c.measurementId).slice(0, 8)}`, materialName: mats.get(c.jobMaterialId)?.name || "Flashing", tightMm: c.path.tightTotalMm,
      cornersMm: c.path.cornersMm || [], splitsMm: c.path.splitsMm || [], pieces: (c.path.pieces || []).map((p) => ({ fromMm: p.fromMm, toMm: p.toMm, tightMm: p.tightMm, orderMm: p.orderMm })) });
  }
  return {
    problems: [...new Set(problems)],
    snapshot: { orderRef: order.orderRef, job: { label: "1 Example Street, Testville SA (Synthetic)" }, supplier: order.supplierId ? { id: "sup-1", name: "Fielders (review branch)" } : null,
      items: itemList, appendix, totals: { pieces, totalLm: totalMm / 1000, byUnit }, sources: { workspaceRevision: state.revision } },
  };
}
const previewOf = (order) => exportSnapshot(order);

/** Tiny text-only PDF (review stub for the site appendix — the real one is pdfkit on the server). ASCII only. */
function textPdf(lines) {
  const ascii = (t) => String(t).replace(/×/g, "x").replace(/[—–]/g, "-").replace(/²/g, "2").replace(/·/g, "|").replace(/[^\x20-\x7e]/g, "?");
  const esc = (t) => ascii(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const body = ["BT", "/F1 9 Tf", "11 TL", "40 800 Td", ...lines.slice(0, 70).map((t) => `(${esc(t)}) '`), "ET"].join("\n");
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${body.length} >>\nstream\n${body}\nendstream`];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

function appendixLines(snap, exportNo) {
  const a = snap.appendix || {};
  const f = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-AU") : "-");
  const out = ["SITE APPENDIX - CUTTING & SETOUT (review stub)", `${snap.orderRef} | export ${exportNo} | ${snap.job?.label || ""}`,
    "For site use. Not part of the supplier order. Installation details marked source-pending are not verified.", ""];
  for (const al of a.aluminium) {
    out.push(`${al.materialName} - cutting sheet (${f(al.stockLengthMm)} mm bars) | kerf ${al.kerfMm == null ? "NOT CONFIRMED" : `${al.kerfMm} mm`} | ${al.barCount} new bar(s) | ${al.proven ? "proven minimum" : "best found (not proven minimum)"}`);
    for (const b of al.bars) out.push(`  Bar ${b.n}${b.source === "offcut" ? " (existing offcut)" : ""}: ${b.cuts.map((c) => `${c.label} ${f(c.lengthMm)}`).join(" | ")} | remainder ${f(b.residualMm)}${b.residualUsable ? " keep" : " waste"}`);
  }
  for (const tb of a.timber) {
    out.push(`${tb.materialName} - ${tb.title || "timber cut list"}`);
    for (const r of tb.rows) out.push(`  ${r.qty} x cut ${f(r.cutMm)} mm from ${r.stockMm ? `${f(r.stockMm)} mm stock` : "NO AVAILABLE STOCK"}`);
  }
  for (const sh of a.layouts) {
    out.push(`${sh.materialName} - ${sh.wallLabel} setout | gross ${sh.grossM2?.toFixed(2)} m2 | openings ${sh.openingM2?.toFixed(2)} m2 | net ${sh.netM2?.toFixed(2)} m2 | Derived from plan + entered heights`);
    for (const r of sh.rows) out.push(`  ${r.qty} x ${r.description}`);
  }
  for (const r of a.flashingRuns) out.push(`${r.materialName} run ${r.ref}: tight ${f(r.tightMm)} mm | corners at ${r.cornersMm.map(f).join(", ") || "none"} | splits at ${r.splitsMm.map(f).join(", ") || "none"} | pieces ${r.pieces.map((p) => f(p.orderMm)).join(" + ")} mm`);
  if (out.length === 4) out.push("Nothing to cut or set out on this order.");
  return out;
}

// Local sandbox mode: the takeoff calls go to the REAL local server instead of this fake one.
const SANDBOX = import.meta.env.VITE_TAKEOFF_SANDBOX === "true";
if (SANDBOX && typeof window !== "undefined") {
  const job = import.meta.env.VITE_TAKEOFF_SANDBOX_JOB;
  window.__uiReviewPassthrough = (url) => {
    const path = new URL(url, window.location.origin).pathname;
    if (path.startsWith("/api/worker/takeoff/") || path.startsWith("/api/worker/plans/")) return { "x-worker-token": "sandbox-leading-hand" };
    if (path.startsWith("/api/takeoff/") || path.startsWith("/api/job-plans/") || path.startsWith("/api/sandbox-file/")
      || (job && path.startsWith(`/api/carpentry/jobs/${job}/plans`))) return { Authorization: "Bearer sandbox-admin" };
    return null;
  };
} else {
  registerFakeTakeoffServer();
}

function registerFakeTakeoffServer() {
for (const base of ["/api/takeoff", "/api/worker/takeoff"]) {
    const worker = base.includes("worker");
    // HUB 014: a product's company cladding default (as the server: office logins only; only a company default is revised)
    route("POST", `${base}/company-defaults`, ({ bodyJson }) => {
      if (!caps(worker).saveCompanyDefaults) return fail(403, "Only office staff can change company defaults.", "FORBIDDEN");
      const content = { ...(bodyJson?.content || {}), rules: { ...(bodyJson?.content?.rules || {}), companyDefault: true } };
      if (!content.spec?.product?.id || content.methodKey === "flashing_runs") return fail(400, "Choose a catalogue product first.", "INVALID");
      const ex = bodyJson.presetId ? state.presets.find((x) => x.id === bodyJson.presetId) : null;
      if (bodyJson.presetId && (!ex || !ex.rules?.companyDefault || ex.spec?.product?.id !== content.spec.product.id)) return fail(400, "That isn't this product's company default.", "INVALID");
      if (ex && Number(bodyJson.expectedRevision) !== ex.revision) return fail(409, "Changed by someone else.", "CONFLICT");
      state.companyDefaultSaves = [...(state.companyDefaultSaves || []), { presetId: ex?.id || null, content }];
      if (ex) { Object.assign(ex, content, { revision: ex.revision + 1, updatedAt: new Date().toISOString() }); return { ok: true, preset: { presetId: ex.id, revision: ex.revision } }; }
      const id = `pre-default-${state.presets.length + 1}`;
      state.presets.push({ id, revision: 1, isActive: true, updatedAt: new Date().toISOString(), ...content });
      return { ok: true, preset: { presetId: id, revision: 1 } };
    });
    // HUB 024: add an aluminium setup to the company products (as the server: office logins only; aluminium only; the
    // kerf confirmation never travels; only an aluminium company product of the same name is revised, on its revision)
    route("POST", `${base}/company-products`, ({ bodyJson }) => {
      if (!caps(worker).addCompanyProducts) return fail(403, "Only office staff can add company products.", "FORBIDDEN");
      const b = bodyJson || {};
      if (b.spec?.family !== "aluminium" || b.methodKey !== "linear_stock") return fail(400, "Only an aluminium setup can be added here.", "INVALID");
      if (!(b.spec.profile?.aMm && b.spec.profile?.bMm && b.spec.profile?.tMm)) return fail(400, "Enter the profile size (e.g. 50 × 50 × 3).", "INVALID");
      if (!String(b.name || "").trim()) return fail(400, "Give the material a name.", "INVALID");
      const rules = structuredClone(b.rules || {});
      delete rules.carried; delete rules.defaultsFrom; delete rules.companyDefault;
      const content = { name: String(b.name).trim(), methodKey: b.methodKey, methodVersion: Number(b.methodVersion || 1), spec: { ...structuredClone(b.spec), kerfConfirmed: false }, rules, profile: null, sourceReview: { status: "user_entered" } };
      const ex = b.presetId ? state.presets.find((x) => x.id === b.presetId) : null;
      if (b.presetId && (!ex || ex.isActive === false || ex.spec?.family !== "aluminium" || ex.rules?.companyDefault)) return fail(400, "That isn't an aluminium company product.", "INVALID");
      if (ex && !sameAluminiumProfile(ex.spec, content.spec)) return fail(400, `“${ex.name}” is a ${profileSizeText(ex.spec) || "different"} angle. Give this ${profileSizeText(content.spec)} setup its own name.`, "INVALID");
      // review knob: another office login saves this product a moment before this save lands (once)
      if (ex && window.__takeoffReviewPresetRace) { window.__takeoffReviewPresetRace = false; ex.revision += 1; ex.updatedAt = new Date().toISOString(); }
      if (ex && Number(b.expectedRevision) !== ex.revision) return fail(409, "This standard was changed by someone else — reload it", "CONFLICT");
      if (ex) { Object.assign(ex, content, { revision: ex.revision + 1, updatedAt: new Date().toISOString() }); return { ok: true, preset: { presetId: ex.id, revision: ex.revision } }; }
      const id = `pre-product-${state.presets.length + 1}`;
      state.presets.push({ id, revision: 1, isActive: true, updatedAt: new Date().toISOString(), ...content });
      return { ok: true, preset: { presetId: id, revision: 1 } };
    });
    // HUB 008: office staff add a supplier from the order (as the server: refused for everyone else; same name = reuse)
    route("POST", `${base}/suppliers`, ({ bodyJson }) => {
      if (!caps(worker).addSuppliers) return fail(403, "Only office staff can add suppliers.", "FORBIDDEN");
      const name = String(bodyJson?.name || "").trim();
      if (!name) return fail(400, "Enter the supplier's name.", "INVALID");
      const same = mockSuppliers().find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (same) return { ok: true, supplier: { ...same, existed: true } };
      const sup = { id: `sup-new-${(state.addedSuppliers || []).length + 1}`, name, contactName: bodyJson?.contactName || undefined, email: bodyJson?.email || undefined, phone: bodyJson?.phone || undefined, address: bodyJson?.address || undefined };
      state.addedSuppliers = [...(state.addedSuppliers || []), sup];
      return { ok: true, supplier: { ...sup, existed: false } };
    });
    // HUB 019: office staff correct a supplier from the order (as the server: same capability; a duplicate name is refused)
    route("PATCH", `${base}/suppliers/:id`, ({ params, bodyJson }) => {
      if (!caps(worker).addSuppliers) return fail(403, "Only office staff can change suppliers.", "FORBIDDEN");
      const cur = mockSuppliers().find((x) => x.id === params.id);
      if (!cur) return fail(400, "That supplier was not found or is inactive.", "INVALID");
      const name = bodyJson?.name !== undefined ? String(bodyJson.name || "").trim() : cur.name;
      if (!name) return fail(400, "Enter the supplier's name.", "INVALID");
      if (mockSuppliers().some((x) => x.id !== cur.id && x.name.toLowerCase() === name.toLowerCase())) return fail(400, `There is already a supplier called ${name} — choose it from the list instead.`, "INVALID");
      const upd = { name };
      for (const k of ["contactName", "email", "phone", "address"]) if (bodyJson?.[k] !== undefined) upd[k] = bodyJson[k] || undefined;
      state.supplierEdits = { ...(state.supplierEdits || {}), [cur.id]: { ...(state.supplierEdits?.[cur.id] || {}), ...upd } };
      return { ok: true, supplier: { ...cur, ...upd } };
    });
    route("GET", `${base}/capabilities`, () => ({ ok: true, enabled: true, capabilities: caps(worker) }));
    route("GET", `${base}/jobs/:jobType/:jobId`, ({ params }) => {
      if (worker && !caps(true).view) return fail(403, "Takeoffs are for leading hands and office staff.", "FORBIDDEN");
      if (params.jobType === "project" && params.jobId === "proj-nolink") return fail(409, "This project has no linked job to hold takeoffs. Link the project to its job first.", "NO_LINKED_JOB");
      return { ok: true, job: { jobType: params.jobType, jobId: params.jobId, label: "1 Example Street, Testville SA (Synthetic)" }, workspaces: [{ ...state.workspace, revision: state.revision }], plans: [DOC], capabilities: caps(worker) };
    });
    route("POST", `${base}/jobs/:jobType/:jobId/workspaces`, () => ({ ok: true, workspace: { ...state.workspace, revision: state.revision } }));
    route("GET", `${base}/workspaces/:id`, () => {
      if (worker && !caps(true).view) return fail(403, "Takeoffs are for leading hands and office staff.", "FORBIDDEN");
      const snap = snapshot();
      return { ok: true, snapshot: snap, computed: computeWorkspace(snap), orderStatus: status(), capabilities: caps(worker), jobLabel: "1 Example Street, Testville SA (Synthetic)", jobAddress: "1 Example Street, Testville SA" };
    });
    route("POST", `${base}/workspaces/:id/commit`, ({ bodyJson }) => {
      const late = Number(window.__takeoffReviewCommitDelayMs) || 0; // HUB 025: a slow signal keeps a save in flight
      if (!late) return applyCommit(bodyJson || {});
      return new Promise((res, rej) => { setTimeout(() => { try { res(applyCommit(bodyJson || {})); } catch (e) { rej(e); } }, late); });
    });
    // as the server: the stored hash in X-Content-Sha256 (the device copy is keyed by it), never HTTP-cached
    route("GET", `${base}/documents/:docId/content`, async () => {
      const r = await fetch(planUrl, { cache: "no-store" });
      state.planDownloads = (state.planDownloads || 0) + 1;
      return new Response(r.body, { status: r.status, headers: { "content-type": "application/pdf", "content-length": r.headers.get("content-length") || "", "cache-control": "private, no-store", "x-content-sha256": DOC.contentSha256 } });
    });
    route("GET", `${base}/presets`, () => ({ ok: true, presets: state.presets }));
    route("GET", `${base}/suppliers`, () => ({ ok: true, suppliers: mockSuppliers(), defaultSupplierId: "sup-1" }));
    route("GET", `${base}/workspaces/:id/orders`, () => {
      // like the server (otherOrderCover): what open (draft) orders with a supplier export already cover, per bucket
      const cover = new Map();
      for (const o of state.orders) {
        if (o.status !== "draft" || !o.exports.some((e) => !e.isDraft)) continue;
        for (const l of o.lines) { const c = cover.get(l.bucketKey) || { n: 0, refs: [] }; c.n += l.quantity; if (!c.refs.includes(o.orderRef)) c.refs.push(o.orderRef); cover.set(l.bucketKey, c); }
      }
      const orderStatusWithCover = status().map((x) => ({ ...x, onExportedOrders: cover.get(x.bucketKey)?.n || 0, exportedRefs: cover.get(x.bucketKey)?.refs || [] }));
      return { ok: true, orders: state.orders.map(publicOrder), orderStatus: orderStatusWithCover, scheduleLines: computeWorkspace(snapshot()).scheduleLines, workspaceRevision: state.revision };
    });
    // HUB 013 / HUB 020 (as the server's openWorkingOrder): the section's working draft — Flashings created or brought up
    // to date with the takeoff (shared refreshDraftLines rules); a draft whose supplier PDF went out is never changed
    route("POST", `${base}/workspaces/:id/orders/open`, ({ bodyJson }) => {
      const section = bodyJson?.section;
      if (!SECTION_VALUES.includes(section)) return fail(400, "Choose Flashings or Timber and cladding.", "INVALID");
      const mats = new Map(state.materials.map((m) => [m.id, m]));
      const mine = state.orders.filter((o) => (o.category || (o.lines.length ? lineSection(o.lines[0], mats) : "flashings")) === section);
      const sent = (o) => o.exports.some((e) => !e.isDraft);
      const newest = (list) => list[list.length - 1] || null;
      let order = null;
      if (bodyJson.orderId) {
        order = mine.find((o) => o.id === bodyJson.orderId) || null;
        if (!order) return fail(404, "Order not found.", "NOT_FOUND");
        if (order.status !== "draft") return fail(400, order.status === "placed" ? "Placed orders are locked — start a new order for more pieces." : "That draft was discarded — start a new order.", "INVALID");
      } else order = newest(mine.filter((o) => o.status === "draft" && !sent(o))) || newest(mine.filter((o) => o.status === "draft"));
      if (section !== "flashings") return { ok: true, order: publicOrder(order || newest(mine.filter((o) => o.status === "draft"))), created: false, changes: [] };
      const comp = computeWorkspace(snapshot());
      const st = new Map(status().map((x) => [x.bucketKey, x]));
      const needsFor = (exclude) => {
        const cover = new Map();
        for (const o of state.orders) {
          if (o.id === exclude || o.status !== "draft" || !sent(o)) continue;
          for (const l of o.lines) { const c = cover.get(l.bucketKey) || { exported: 0, placed: 0, refs: [] }; c.exported += l.quantity; if (!c.refs.includes(o.orderRef)) c.refs.push(o.orderRef); cover.set(l.bucketKey, c); }
        }
        return flashingNeeds({ scheduleLines: comp.scheduleLines, status: st, cover });
      };
      let created = false;
      if (!order) {
        if (!needsFor(null).some((n) => n.reason === null && n.need > 0)) return { ok: true, order: publicOrder(newest(mine.filter((o) => o.status === "draft"))), created: false, changes: [] };
        order = { id: bodyJson.newId || `ord-${state.orders.length + 1}`, workspaceId: "ws-1", orderRef: `FO-00${1000 + state.orders.length + 1}`, supplierId: "sup-1",
          delivery: { method: "delivery", address: "1 Example Street, Testville SA", addressSource: "job" }, notes: null, category: section, status: "draft", revision: 1, lines: [], exports: [], placements: [], createdAt: now() };
        state.orders.push(order);
        created = true;
      }
      if (sent(order)) return { ok: true, order: publicOrder(order), created, changes: [] };
      const r = refreshDraftLines({ lines: order.lines, basis: order.basis ?? null, needs: needsFor(order.id) });
      if (!r.changed) return { ok: true, order: publicOrder(order), created, changes: [] };
      const byKey = new Map(comp.scheduleLines.map((l) => [l.bucketKey, l]));
      order.lines = r.lines.map((l) => {
        const keep = order.lines.find((x) => x.bucketKey === l.bucketKey);
        if (keep) return { ...keep, quantity: l.quantity };
        const sl = byKey.get(l.bucketKey);
        return { bucketKey: sl.bucketKey, specKey: sl.specKey, jobMaterialId: l.jobMaterialId || sl.jobMaterialIds[0], finishedLengthMm: sl.finishedLengthMm ?? null, quantity: l.quantity, unit: sl.unit || "piece", item: sl.item || null };
      });
      order.basis = r.basis;
      order.revision += 1;
      const named = new Map();
      for (const c of r.changes) { const n = mats.get(c.materialId)?.name || "A flashing"; const e = named.get(n) || { materialName: n, from: 0, to: 0 }; e.from += c.from; e.to += c.to; named.set(n, e); }
      return { ok: true, order: publicOrder(order), created, changes: [...named.values()] };
    });
    route("POST", `${base}/orders/:orderId/discard`, ({ params, bodyJson }) => {
      const o = state.orders.find((x) => x.id === params.orderId);
      if (!o) return fail(404, "Order not found.", "NOT_FOUND");
      if (o.status !== "draft") return fail(400, "Only a draft can be discarded — placed orders are locked.", "INVALID");
      if (bodyJson?.expectedRevision !== o.revision) return fail(409, "This draft changed on another device — reload and try again.", "CONFLICT");
      o.status = "cancelled"; o.revision += 1;
      return { ok: true, result: { orderId: o.id, status: "cancelled" } };
    });
    route("POST", `${base}/workspaces/:id/orders`, ({ bodyJson }) => {
      const o = { id: bodyJson.id, workspaceId: "ws-1", orderRef: `FO-00${1000 + state.orders.length + 1}`, supplierId: bodyJson.supplierId, delivery: bodyJson.delivery || {}, notes: null, category: bodyJson.category || null, status: "draft", revision: 1, lines: [], exports: [], placements: [], createdAt: now() };
      if (!SECTION_VALUES.includes(bodyJson.category)) return fail(400, "Choose whether this is a Flashings or a Timber and cladding order (reload the app if you don't see that choice).", "INVALID");
      state.orders.push(o);
      return { ok: true, order: o };
    });
    route("PATCH", `${base}/orders/:orderId`, ({ params, bodyJson }) => {
      const o = state.orders.find((x) => x.id === params.orderId);
      if (!o || o.status !== "draft") return fail(400, "A placed or cancelled order cannot be edited — create an additional order", "INVALID");
      if (bodyJson.expectedRevision !== o.revision) return fail(409, "Order changed", "CONFLICT");
      if (bodyJson.supplierId !== undefined) o.supplierId = bodyJson.supplierId;
      if (bodyJson.delivery !== undefined) o.delivery = bodyJson.delivery;
      if (bodyJson.notes !== undefined) o.notes = bodyJson.notes;
      if (bodyJson.lines) {
        const sl = computeWorkspace(snapshot()).scheduleLines;
        const stored = new Map(o.lines.map((l) => [`${l.bucketKey}#${l.jobMaterialId || ""}`, l]));
        const next = [];
        for (const l of bodyJson.lines) {
          // an unchanged existing line is kept exactly as chosen, even if stale (server saveOrder does the same)
          const keep = stored.get(`${l.bucketKey}#${l.jobMaterialId || ""}`);
          if (keep && !l.refresh) { next.push({ ...keep, quantity: l.quantity }); continue; } // refresh = explicit update (as the server)
          const s = sl.find((x) => x.bucketKey === l.bucketKey);
          if (!s) return fail(400, "A selected length is no longer in the takeoff — refresh the schedule.", "INVALID");
          // HUB 007 (as the server): a line from the other section never lands on this order
          const mat = state.materials.find((m) => m.id === (l.jobMaterialId || s.jobMaterialIds[0]));
          if (o.category && mat && materialSection(mat) !== o.category) return fail(400, `${mat.name} goes on a ${SECTION_LABEL[materialSection(mat)]} order, not this ${SECTION_LABEL[o.category]} order.`, "INVALID");
          next.push({ bucketKey: s.bucketKey, specKey: s.specKey, jobMaterialId: l.jobMaterialId || s.jobMaterialIds[0], finishedLengthMm: s.finishedLengthMm ?? null, quantity: l.quantity,
            unit: s.unit || "piece", item: s.item || null });
        }
        o.lines = next;
      }
      o.revision += 1;
      return { ok: true, result: { orderId: o.id, revision: o.revision } };
    });
    route("GET", `${base}/orders/:orderId/preview`, ({ params }) => ({ ok: true, preview: previewOf(state.orders.find((x) => x.id === params.orderId)) }));
    route("POST", `${base}/orders/:orderId/exports`, ({ params, bodyJson }) => {
      const o = state.orders.find((x) => x.id === params.orderId);
      if (!bodyJson.isDraft && previewOf(o).problems.length) return fail(400, `Not ready to order: ${previewOf(o).problems.join(" ")}`, "NOT_READY");
      const e = { id: `exp-${o.id}-${o.exports.length + 1}`, orderId: o.id, exportNo: o.exports.length + 1, isDraft: !!bodyJson.isDraft, artifactStatus: "ready", createdAt: now() };
      o.exports.push(e);
      state.frozen[e.id] = JSON.parse(JSON.stringify(exportSnapshot(o).snapshot)); // frozen: later edits never change it
      return { ok: true, export: { exportId: e.id, exportNo: e.exportNo, artifactStatus: "ready", isDraft: e.isDraft } };
    });
    route("GET", `${base}/exports/:exportId/pdf`, () => fetch(exportUrl));
    route("GET", `${base}/exports/:exportId/appendix`, ({ params }) => {
      const snap = state.frozen[params.exportId];
      const e = state.orders.flatMap((o) => o.exports).find((x) => x.id === params.exportId);
      if (!snap || !e) return fail(404, "Export not found.", "NOT_FOUND");
      state.appendixRequests.push(params.exportId);
      const bytes = textPdf(appendixLines(snap, e.exportNo));
      return new Response(bytes, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(bytes.length) } });
    });
  }
  route("POST", "/api/takeoff/presets", ({ bodyJson }) => {
    const id = bodyJson.presetId || `pre-${Date.now()}`;
    const ex = state.presets.find((p) => p.id === id);
    if (ex) Object.assign(ex, bodyJson.content, { revision: ex.revision + 1 });
    else state.presets.push({ id, revision: 1, isActive: true, ...bodyJson.content });
    return { ok: true, preset: { presetId: id, revision: (ex?.revision) || 1 } };
  });
  route("POST", "/api/takeoff/orders/:orderId/placements", ({ params, bodyJson }) => {
    const o = state.orders.find((x) => x.id === params.orderId);
    const e = o.exports.find((x) => x.id === bodyJson.exportId);
    const p = { id: `pl-${o.id}`, orderId: o.id, exportId: e.id, supplierReference: bodyJson.supplierReference, placedOn: bodyJson.placedOn, status: "placed", surplusAcknowledged: !!bodyJson.acknowledgeSurplus, createdAt: now() };
    o.placements.push(p); o.status = "placed";
    for (const l of o.lines) state.commitments.push({ bucketKey: l.bucketKey, contributionId: null, quantity: l.quantity, placementId: p.id });
    return { ok: true, placement: { placementId: p.id, surplus: 0 } };
  });
  route("POST", "/api/takeoff/placements/:placementId/cancel", ({ params, bodyJson }) => {
    for (const o of state.orders) for (const p of o.placements) if (p.id === params.placementId) { p.status = "cancelled"; p.cancelReason = bodyJson.reason; o.status = "cancelled"; }
    state.commitments = state.commitments.filter((c) => c.placementId !== params.placementId);
    return { ok: true, placement: { placementId: params.placementId, status: "cancelled" } };
  });
  // Plans card entry points (Hub + Worker) show "Takeoffs" in review mode.
  route("GET", "/api/carpentry/jobs/:id/plans", () => ({ ok: true, plans: [{ docId: DOC.id, fileName: DOC.title, documentType: "architectural", uploadedAt: DOC.uploadedAt, version: 3, revisionLabel: "Rev C", status: "current" }] }));
  route("GET", "/api/worker/jobs/:id/plans", () => ({ ok: true, plans: [{ docId: DOC.id, fileName: DOC.title, documentType: "architectural", uploadedAt: DOC.uploadedAt }] }));
}

export function _resetTakeoffFixture() { seed(); }
// HUB 014 evidence: the company defaults, what was saved through "Save as company default", and the cladding materials
if (typeof window !== "undefined") window.__takeoffReviewDefaults = () => ({ defaults: state.presets.filter((p) => p.rules?.companyDefault).map((p) => ({ id: p.id, revision: p.revision, rules: p.rules, spareRate: p.spec?.spareRate })),
  saves: state.companyDefaultSaves || [], materials: state.materials.filter((m) => m.spec?.family === "cladding").map((m) => ({ id: m.id, name: m.name, spareRate: m.spec?.spareRate, rules: m.rules })) });
// HUB 024 evidence: the company products as the fake server holds them (review only)
if (typeof window !== "undefined") window.__takeoffReviewPresets = () => structuredClone(state.presets);
if (typeof window !== "undefined") window.__takeoffReviewState = () => ({ revision: state.revision, commits: state.commitCount || 0, measurements: state.measurements.length, appendixRequests: [...state.appendixRequests],
  // HUB 018 evidence: every material's profile as the fake server holds it (review only)
  materials: state.materials.map(({ id, name, methodKey, profile }) => ({ id, name, methodKey, profile: profile ?? null })),
  // HUB 025 evidence: live assignments and each material's spec as the fake server holds them
  contributions: state.contributions.map(({ id, measurementId, jobMaterialId, role }) => ({ id, measurementId, jobMaterialId, role })),
  specs: Object.fromEntries(state.materials.map((m) => [m.id, m.spec ?? null])),
  planDownloads: state.planDownloads || 0 });
