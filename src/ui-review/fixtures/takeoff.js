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
 * window.__takeoffReviewOffline = true makes commits fail like a dropped connection.
 */
import { route } from "../registry.js";
import { reviewRole } from "../config.js";
import {
  buildCalibration, verifyCalibration, segmentLengthMm, computeWorkspace, orderStatus, starterProfile, mirrorProfile,
  normaliseFlashingRules, PROBLEM_TEXT, FLASHING_SPEC_DEFAULTS,
} from "../../../shared/takeoff/index.js";
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
const DOC = { id: "doc-plan-c", title: "Gibson-St-architectural.pdf — Rev C", documentType: "architectural", status: "current", revisionLabel: "Rev C", contentSha256: "synthetic", byteSize: 2146000, uploadedAt: "2026-10-01T02:00:00Z", version: 3, supersedesDocumentId: "doc-plan-b", archivedAt: null };
const OLD = { ...DOC, id: "doc-plan-b", title: "Gibson-St-architectural.pdf — Rev B", status: "superseded", revisionLabel: "Rev B", version: 2 };
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
  };
}
seed();

const snapshot = () => ({ workspace: { ...state.workspace, revision: state.revision }, documents: state.documents, calibrations: state.calibrations, measurements: state.measurements, materials: state.materials, contributions: state.contributions });
const status = () => [...orderStatus(computeWorkspace(snapshot()).scheduleLines, state.commitments).values()];
const caps = (worker) => {
  if (worker) {
    const ordinary = qs().get("takeoffWorker") === "ordinary";
    return { view: !ordinary, edit: !ordinary, export: !ordinary, editStandards: false, placeOrders: false, viewSupplierContacts: false, isPreview: false, actorKey: "employee:emp-4" };
  }
  const role = reviewRole();
  return { view: true, edit: true, export: true, editStandards: true, placeOrders: role === "admin", viewSupplierContacts: true, isPreview: false, actorKey: `staff:review-${role}` };
};
const fail = (status, error, code) => ({ __status: status, body: { ok: false, error, code } });

function applyCommit(body) {
  if (window.__takeoffReviewOffline) throw new TypeError("Failed to fetch"); // simulate a dropped connection
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
      return { ...m, rules: normaliseFlashingRules(m.rules) };
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

function previewOf(order) {
  const computed = computeWorkspace(snapshot());
  const problems = [];
  if (!order.supplierId) problems.push("Choose a supplier.");
  const d = order.delivery || {};
  if (d.method !== "delivery" && d.method !== "pickup") problems.push("Choose delivery or pickup.");
  if (d.method === "delivery" && !d.address) problems.push("Enter the delivery address.");
  if (!order.lines.length) problems.push("Add at least one length to the order.");
  for (const l of order.lines) { const s = computed.scheduleLines.find((x) => x.bucketKey === l.bucketKey); for (const p of s?.problems || []) problems.push(PROBLEM_TEXT[p]); }
  const pieces = order.lines.reduce((a, l) => a + l.quantity, 0);
  return { problems: [...new Set(problems)], snapshot: { supplier: order.supplierId ? { id: "sup-1", name: "Fielders (review branch)" } : null, totals: { pieces, totalLm: order.lines.reduce((a, l) => a + l.finishedLengthMm * l.quantity, 0) / 1000 } } };
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
    route("GET", `${base}/capabilities`, () => ({ ok: true, enabled: true, capabilities: caps(worker) }));
    route("GET", `${base}/jobs/:jobType/:jobId`, ({ params }) => {
      if (worker && !caps(true).view) return fail(403, "Takeoffs are for leading hands and office staff.", "FORBIDDEN");
      if (params.jobType === "project" && params.jobId === "proj-nolink") return fail(409, "This project has no linked job to hold takeoffs. Link the project to its job first.", "NO_LINKED_JOB");
      return { ok: true, job: { jobType: params.jobType, jobId: params.jobId, label: "5A Gibson Street, Marino SA (Synthetic)" }, workspaces: [{ ...state.workspace, revision: state.revision }], plans: [DOC], capabilities: caps(worker) };
    });
    route("POST", `${base}/jobs/:jobType/:jobId/workspaces`, () => ({ ok: true, workspace: { ...state.workspace, revision: state.revision } }));
    route("GET", `${base}/workspaces/:id`, () => {
      if (worker && !caps(true).view) return fail(403, "Takeoffs are for leading hands and office staff.", "FORBIDDEN");
      const snap = snapshot();
      return { ok: true, snapshot: snap, computed: computeWorkspace(snap), orderStatus: status(), capabilities: caps(worker), jobLabel: "5A Gibson Street, Marino SA (Synthetic)", jobAddress: "5A Gibson Street, Marino SA" };
    });
    route("POST", `${base}/workspaces/:id/commit`, ({ bodyJson }) => applyCommit(bodyJson || {}));
    route("GET", `${base}/documents/:docId/content`, () => fetch(planUrl));
    route("GET", `${base}/presets`, () => ({ ok: true, presets: state.presets }));
    route("GET", `${base}/suppliers`, () => ({ ok: true, suppliers: [{ id: "sup-1", name: "Fielders (review branch)" }, { id: "sup-2", name: "Other Steel Supplies" }], defaultSupplierId: "sup-1" }));
    route("GET", `${base}/workspaces/:id/orders`, () => ({ ok: true, orders: state.orders, orderStatus: status(), scheduleLines: computeWorkspace(snapshot()).scheduleLines, workspaceRevision: state.revision }));
    route("POST", `${base}/workspaces/:id/orders`, ({ bodyJson }) => {
      const o = { id: bodyJson.id, workspaceId: "ws-1", orderRef: `FO-00${1000 + state.orders.length + 1}`, supplierId: bodyJson.supplierId, delivery: bodyJson.delivery || {}, notes: null, status: "draft", revision: 1, lines: [], exports: [], placements: [], createdAt: now() };
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
      if (bodyJson.lines) { const sl = computeWorkspace(snapshot()).scheduleLines; o.lines = bodyJson.lines.map((l) => { const s = sl.find((x) => x.bucketKey === l.bucketKey); return { bucketKey: l.bucketKey, specKey: s.specKey, jobMaterialId: s.jobMaterialIds[0], finishedLengthMm: s.finishedLengthMm, quantity: l.quantity }; }); }
      o.revision += 1;
      return { ok: true, result: { orderId: o.id, revision: o.revision } };
    });
    route("GET", `${base}/orders/:orderId/preview`, ({ params }) => ({ ok: true, preview: previewOf(state.orders.find((x) => x.id === params.orderId)) }));
    route("POST", `${base}/orders/:orderId/exports`, ({ params, bodyJson }) => {
      const o = state.orders.find((x) => x.id === params.orderId);
      if (!bodyJson.isDraft && previewOf(o).problems.length) return fail(400, `Not ready to order: ${previewOf(o).problems.join(" ")}`, "NOT_READY");
      const e = { id: `exp-${o.id}-${o.exports.length + 1}`, orderId: o.id, exportNo: o.exports.length + 1, isDraft: !!bodyJson.isDraft, artifactStatus: "ready", createdAt: now() };
      o.exports.push(e);
      return { ok: true, export: { exportId: e.id, exportNo: e.exportNo, artifactStatus: "ready", isDraft: e.isDraft } };
    });
    route("GET", `${base}/exports/:exportId/pdf`, () => fetch(exportUrl));
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
if (typeof window !== "undefined") window.__takeoffReviewState = () => ({ revision: state.revision, commits: state.commitCount || 0, measurements: state.measurements.length });
