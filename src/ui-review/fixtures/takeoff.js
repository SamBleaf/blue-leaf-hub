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
 * window.__takeoffReviewOffline = true makes commits fail like a dropped connection.
 * Exports freeze a snapshot (like buildExportSnapshot: generic items by unit + the site appendix);
 * GET …/exports/:id/appendix serves a small text-only stub PDF rendered from THAT frozen snapshot.
 */
import { route } from "../registry.js";
import { reviewRole } from "../config.js";
import {
  buildCalibration, verifyCalibration, segmentLengthMm, computeWorkspace, orderStatus, starterProfile, mirrorProfile,
  normaliseFlashingRules, ITEM_STALE_TEXT, PROBLEM_TEXT, FLASHING_SPEC_DEFAULTS, orderLineState, describeFamilySpec, methodFor,
  SECTION_VALUES, SECTION_LABEL, materialSection,
} from "../../../shared/takeoff/index.js";
import { aluminiumPreset, productGroups, specFromGroup } from "../../../shared/takeoff/products/index.js";
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
const DOC = { id: "doc-plan-c", title: "Example-St-architectural.pdf — Rev C", documentType: "architectural", status: "current", revisionLabel: "Rev C", contentSha256: "synthetic", byteSize: 2146000, uploadedAt: "2026-10-01T02:00:00Z", version: 3, supersedesDocumentId: "doc-plan-b", archivedAt: null };
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
}

/** TC-R04 J5 mixed procurement (SYNTHETIC): every unit on one job, plus continuous flashing runs. */
function seedMixed() {
  const pt = (x, y) => ({ x: bx + x * k, y: by + y * k });
  const fam = (spec) => { const m = methodFor(spec); return { spec, methodKey: m.key, methodVersion: m.version }; };
  const group = (re) => productGroups({}).find((g) => re.test(g.name));
  const timber = (purpose) => ({ family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { kind: "grid", minMm: 1200, incrementMm: 600 } });
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
const caps = (worker) => {
  if (worker) {
    const ordinary = qs().get("takeoffWorker") === "ordinary";
    // ?takeoffWorker=office — a Worker-app login linked to an Admin / Supervisor account (office staff on a phone)
    const office = qs().get("takeoffWorker") === "office";
    return { view: !ordinary, edit: !ordinary, export: !ordinary, editStandards: false, addSuppliers: office, placeOrders: false, viewSupplierContacts: false, isPreview: false, actorKey: "employee:emp-4" };
  }
  const role = reviewRole();
  return { view: true, edit: true, export: true, editStandards: true, addSuppliers: role === "admin" || role === "supervisor", placeOrders: role === "admin", viewSupplierContacts: true, isPreview: false, actorKey: `staff:review-${role}` };
};
const fail = (status, error, code) => ({ __status: status, body: { ok: false, error, code } });

function applyCommit(body) {
  if (window.__takeoffReviewOffline) throw new TypeError("Failed to fetch"); // simulate a dropped connection
  if (window.__takeoffReviewRefuse) { state.commitCount = (state.commitCount || 0) + 1; return fail(window.__takeoffReviewRefuse, "Your sign-in has expired.", "UNAUTHENTICATED"); } // simulate a 4xx refusal
  state.commitCount = (state.commitCount || 0) + 1;
  if (qs().get("takeoffConflict") === "1" && !state.conflicted) { state.conflicted = true; state.revision += 1; return fail(409, "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare.", "CONFLICT"); }
  if (body.expectedRevision !== state.revision) return fail(409, "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare.", "CONFLICT");
  const ch = body.changes || {};
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
      if (m.fromPreset) { const p = state.presets.find((x) => x.id === m.fromPreset.presetId); return { id: m.id, name: p.name, methodKey: p.methodKey, methodVersion: p.methodVersion, spec: p.spec, rules: p.rules, profile: p.profile, fromPresetId: p.id, fromPresetRevision: p.revision }; }
      // TC-R04 families keep their own rules (centres, pitch, heights …); flashing rules are normalised as before
      return m.spec?.family && m.spec.family !== "flashing" ? { ...m, rules: { ...(m.rules || {}) } } : { ...m, rules: normaliseFlashingRules(m.rules) };
    });
    up(state.measurements, ch.measurements?.upsert, (m) => {
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
    out.push(`${tb.materialName} - timber cut list`);
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
    // HUB 008: office staff add a supplier from the order (as the server: refused for everyone else; same name = reuse)
    route("POST", `${base}/suppliers`, ({ bodyJson }) => {
      if (!caps(worker).addSuppliers) return fail(403, "Only office staff can add suppliers.", "FORBIDDEN");
      const name = String(bodyJson?.name || "").trim();
      if (!name) return fail(400, "Enter the supplier's name.", "INVALID");
      const known = [{ id: "sup-1", name: "Fielders (review branch)" }, { id: "sup-2", name: "Other Steel Supplies" }, ...(state.addedSuppliers || [])];
      const same = known.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (same) return { ok: true, supplier: { ...same, existed: true } };
      const sup = { id: `sup-new-${(state.addedSuppliers || []).length + 1}`, name, email: bodyJson?.email || null, phone: bodyJson?.phone || null };
      state.addedSuppliers = [...(state.addedSuppliers || []), sup];
      return { ok: true, supplier: { ...sup, existed: false } };
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
    route("POST", `${base}/workspaces/:id/commit`, ({ bodyJson }) => applyCommit(bodyJson || {}));
    route("GET", `${base}/documents/:docId/content`, () => fetch(planUrl));
    route("GET", `${base}/presets`, () => ({ ok: true, presets: state.presets }));
    route("GET", `${base}/suppliers`, () => ({ ok: true, suppliers: [{ id: "sup-1", name: "Fielders (review branch)" }, { id: "sup-2", name: "Other Steel Supplies" }, ...(state.addedSuppliers || [])], defaultSupplierId: "sup-1" }));
    route("GET", `${base}/workspaces/:id/orders`, () => {
      // like the server (otherOrderCover): what open (draft) orders with a supplier export already cover, per bucket
      const cover = new Map();
      for (const o of state.orders) {
        if (o.status !== "draft" || !o.exports.some((e) => !e.isDraft)) continue;
        for (const l of o.lines) { const c = cover.get(l.bucketKey) || { n: 0, refs: [] }; c.n += l.quantity; if (!c.refs.includes(o.orderRef)) c.refs.push(o.orderRef); cover.set(l.bucketKey, c); }
      }
      const orderStatusWithCover = status().map((x) => ({ ...x, onExportedOrders: cover.get(x.bucketKey)?.n || 0, exportedRefs: cover.get(x.bucketKey)?.refs || [] }));
      return { ok: true, orders: state.orders, orderStatus: orderStatusWithCover, scheduleLines: computeWorkspace(snapshot()).scheduleLines, workspaceRevision: state.revision };
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
if (typeof window !== "undefined") window.__takeoffReviewState = () => ({ revision: state.revision, commits: state.commitCount || 0, measurements: state.measurements.length, appendixRequests: [...state.appendixRequests] });
