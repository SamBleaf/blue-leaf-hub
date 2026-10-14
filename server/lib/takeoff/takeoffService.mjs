// =============================================================================
// takeoffService.mjs — the ONE takeoff service used by both the staff and worker adapters.
//
// Server authority: every calculation result (raw run lengths, calibration scales, schedule
// lines, order readiness, allocations) is recomputed here with shared/takeoff from data read
// at a known workspace revision, then committed through a CAS RPC. Client-sent totals,
// scales and profile outputs are never trusted.
//
// All functions take a Supabase service client `sb` and an access context `ctx`:
//   ctx = { owner, caps, actor, ws? }   (built by takeoffRoutes after authorisation)
// =============================================================================
import crypto from "crypto";
import {
  CALCULATION_VERSION, PROFILE_SCHEMA_VERSION, LIMITS, PROBLEM_TEXT, TakeoffValidationError,
  buildCalibration, verifyCalibration, normalisePageMeta, normaliseRect, validatePoints, pointsWithinCalibration,
  segmentLengthMm, getMethod, normaliseFlashingRules, normaliseProfile, computeWorkspace, orderStatus,
  bucketKey as makeBucketKey, profileDimensionList, materialProblems, isFiniteNumber, requirePositive, requireQuantity,
  normaliseSpec, orderLineState, describeSpec, SPEC_SCHEMA_VERSION, materialSpecKey, polylineLengthMm, ITEM_STALE_TEXT,
} from "../../../shared/takeoff/index.js";
import { verificationReusesReference } from "../../../shared/takeoff/calibration.js";
import { describeFamilySpec, normaliseFamilySpec } from "../../../shared/takeoff/engine/families.js";
import { TakeoffHttpError } from "./takeoffErrors.mjs";
import { docInOwner, isUuid, ownerColumns, ownerFromRow, scopeQuery } from "./takeoffAccess.mjs";

export const PLAN_DOC_TYPES = ["architectural", "engineering", "structural", "survey", "specification", "plan"];
export const EXPORTS_BUCKET = "takeoff-exports";
export const RENDER_LIMIT_BYTES = 40 * 1024 * 1024;

const str = (v, max = 120) => (v == null ? "" : String(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max));
const optStr = (v, max = 120) => { const s = str(v, max); return s || null; };
const ymd = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function bad(message, code = "INVALID") { return new TakeoffHttpError(400, message, code); }
function must(cond, message) { if (!cond) throw bad(message); }
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

// ── Row mappers (explicit — jsonb content is already camelCase) ────────────────
export const mapWorkspace = (r) => ({
  id: r.id, name: r.name, revision: r.revision, state: r.state, reviewReason: r.review_reason || null,
  primaryDocumentId: r.primary_document_id, primaryPageIndex: r.primary_page_index,
  owner: ownerFromRow(r), createdAt: r.created_at, updatedAt: r.updated_at,
});
const mapDoc = (r) => ({
  id: r.id, title: r.title, documentType: r.document_type, status: r.status, revisionLabel: r.revision_label ?? null,
  contentSha256: r.content_sha256 ?? null, byteSize: r.byte_size ?? null, uploadedAt: r.uploaded_at, version: r.version,
  supersedesDocumentId: r.supersedes_document_id || null, archivedAt: r.archived_at ?? null,
});
const mapCal = (r) => ({
  id: r.id, documentId: r.document_id, pageIndex: r.page_index, pageMeta: r.page_meta, region: r.region, regionLabel: r.region_label,
  calibrationRevision: r.calibration_revision, supersedesCalibrationId: r.supersedes_calibration_id, basisRotation: r.basis_rotation,
  mode: r.mode, sx: r.sx, sy: r.sy, measuredSx: r.measured_sx, measuredSy: r.measured_sy, discrepancy: r.discrepancy,
  tolerance: r.tolerance, horizontal: r.horizontal, vertical: r.vertical, verification: r.verification, status: r.status,
  contentSha256: r.content_sha256, createdAt: r.created_at,
});
const mapMeas = (r) => ({
  id: r.id, kind: r.kind, documentId: r.document_id, pageIndex: r.page_index, calibrationId: r.calibration_id,
  points: r.geometry?.points || null, inputs: r.geometry?.inputs || null, parentId: r.geometry?.parentId || null,
  label: r.label, rawLengthMm: r.raw_length_mm, finishedLengthMm: r.finished_length_mm,
  quantity: r.quantity, revision: r.revision, archived: !!r.archived_at,
});
const mapMat = (r) => ({
  id: r.id, name: r.name, methodKey: r.method_key, methodVersion: r.method_version, spec: r.spec || {}, rules: r.rules || {},
  profile: r.profile || null, fromPresetId: r.from_preset_id, fromPresetRevision: r.from_preset_revision, revision: r.revision, archived: !!r.archived_at,
});
const mapContrib = (r) => ({
  id: r.id, measurementId: r.measurement_id, jobMaterialId: r.job_material_id, role: r.role, split: r.split || null,
  splitVersion: r.split_version, archived: !!r.archived_at,
});

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ── Plans for a job (current + anything takeoff evidence references) ───────────
export async function listOwnerPlans(sb, owner, extraIds = []) {
  const rows = await q(scopeQuery(sb.from("job_documents").select("*"), owner)
    .eq("storage_provider", "supabase").in("document_type", PLAN_DOC_TYPES).order("uploaded_at", { ascending: false }));
  const out = rows.filter((r) => r.status === "current" || extraIds.includes(r.id));
  const have = new Set(out.map((r) => r.id));
  const missing = extraIds.filter((id) => id && !have.has(id));
  if (missing.length) {
    const more = await q(sb.from("job_documents").select("*").in("id", missing));
    for (const r of more) if (docInOwner(r, owner)) out.push(r);
  }
  return out.map(mapDoc);
}

// ── Workspaces ────────────────────────────────────────────────────────────────
export async function listWorkspaces(sb, owner) {
  const rows = await q(scopeQuery(sb.from("takeoff_workspaces").select("*"), owner).neq("state", "archived").order("updated_at", { ascending: false }));
  return rows.map(mapWorkspace);
}

export async function createWorkspace(sb, ctx, body) {
  const id = isUuid(body?.id) ? body.id : crypto.randomUUID();
  const name = str(body?.name) || "Flashings";
  const row = {
    id, name, ...ownerColumns(ctx.owner),
    created_by_type: ctx.actor.type, created_by_user_id: ctx.actor.userId, created_by_employee_id: ctx.actor.employeeId,
  };
  const { data, error } = await sb.from("takeoff_workspaces").insert(row).select("*").single();
  if (error) {
    if (error.code === "23505") { // retried create with the same client id → same result
      const existing = await q(sb.from("takeoff_workspaces").select("*").eq("id", id).maybeSingle());
      if (existing && docOwnerEqual(existing, ctx.owner)) return mapWorkspace(existing);
      throw new TakeoffHttpError(409, "That takeoff id is already in use.", "CONFLICT");
    }
    throw error;
  }
  return mapWorkspace(data);
}

function docOwnerEqual(row, owner) {
  const o = ownerColumns(owner);
  return (row.job_id || null) === o.job_id && (row.carpentry_job_id || null) === o.carpentry_job_id && (row.charge_up_job_id || null) === o.charge_up_job_id;
}

/** Load a workspace row by id (no auth — callers authorise against its owner). */
export async function getWorkspaceRow(sb, id) {
  if (!isUuid(id)) throw new TakeoffHttpError(400, "Invalid takeoff id.", "INVALID");
  const row = await q(sb.from("takeoff_workspaces").select("*").eq("id", id).maybeSingle());
  if (!row) throw new TakeoffHttpError(404, "Takeoff not found.", "NOT_FOUND");
  return row;
}

/** Full editable snapshot at the workspace's current revision. */
export async function loadSnapshot(sb, wsRow) {
  const wsId = wsRow.id;
  const [cals, meas, mats, contribs] = await Promise.all([
    q(sb.from("takeoff_calibrations").select("*").eq("workspace_id", wsId).order("created_at", { ascending: true })),
    q(sb.from("takeoff_measurements").select("*").eq("workspace_id", wsId).is("archived_at", null).order("created_at", { ascending: true })),
    q(sb.from("takeoff_job_materials").select("*").eq("workspace_id", wsId).is("archived_at", null).order("created_at", { ascending: true })),
    q(sb.from("takeoff_contributions").select("*").eq("workspace_id", wsId).is("archived_at", null).order("created_at", { ascending: true })),
  ]);
  // Re-read the root: if the revision moved while children were read, the caller retries.
  const again = await q(sb.from("takeoff_workspaces").select("revision").eq("id", wsId).maybeSingle());
  if (!again || again.revision !== wsRow.revision) throw new TakeoffHttpError(409, "The takeoff changed while loading — reload.", "CONFLICT_RETRY");
  const owner = ownerFromRow(wsRow);
  const referenced = [...new Set([wsRow.primary_document_id, ...cals.map((c) => c.document_id), ...meas.map((m) => m.document_id)].filter(Boolean))];
  const documents = await listOwnerPlans(sb, owner, referenced);
  return {
    workspace: mapWorkspace(wsRow),
    documents,
    calibrations: cals.map(mapCal),
    measurements: meas.map(mapMeas),
    materials: mats.map(mapMat),
    contributions: contribs.map(mapContrib),
  };
}

/** Snapshot with one retry when a concurrent commit lands mid-read. */
export async function loadSnapshotFresh(sb, wsId) {
  for (let i = 0; i < 3; i++) {
    const row = await getWorkspaceRow(sb, wsId);
    try { return { row, snapshot: await loadSnapshot(sb, row) }; }
    catch (e) { if (e?.code !== "CONFLICT_RETRY" || i === 2) throw e; }
  }
  throw new TakeoffHttpError(409, "The takeoff is busy — try again.", "CONFLICT");
}

// ── Commit ────────────────────────────────────────────────────────────────────
/** Generic method settings: bounded scalars only (centres, pitch, allowances, kerf …). */
// Generic method rules are DATA (centres, heights, joint rows, accessory recipes …), never code: scalars are
// bounded, strings short, keys plain identifiers, nesting ≤ 6 levels, arrays ≤ 50 items, objects ≤ 60 keys.
function cleanRuleValue(v, d) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return isFiniteNumber(v) && Math.abs(v) <= 1e6 ? Math.round(v * 1000) / 1000 : undefined;
  if (typeof v === "string") return optStr(v, 120) ?? undefined;
  if (d >= 6 || v == null) return undefined;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => cleanRuleValue(x, d + 1)).filter((x) => x !== undefined);
  if (typeof v === "object") return cleanGenericRules(v, d + 1);
  return undefined;
}
function cleanGenericRules(r, d = 0) {
  const out = {};
  for (const [k, v] of Object.entries(r).slice(0, 60)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(k)) continue;
    const c = cleanRuleValue(v, d);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

function cleanSpec(spec) {
  // Spec v2 (construction, finish id, BMT, colour applicability, perforation). Legacy v1 specs are upgraded:
  // missing construction = solid, finish text → finish id, "N/A" colour on unpainted = not applicable.
  try { return normaliseSpec(spec); } catch (e) { throw bad(e.message); }
}

function cleanSourceReview(r) {
  if (!r) return null;
  return {
    sourceUrl: optStr(r.sourceUrl, 300), title: optStr(r.title, 200), edition: optStr(r.edition, 60), page: optStr(r.page, 40),
    checkedAt: ymd(r.checkedAt), reviewedBy: optStr(r.reviewedBy, 80), status: r.status === "reviewed" ? "reviewed" : "user_entered",
  };
}

/**
 * Entered inputs for the TC-R04 measurement kinds — bounded numbers only, unknown keys dropped (never trusted
 * as calculated totals). Wall kinds: rect | rake | gable | polygon (06 C0).
 */
const MM = (v, label, { min = 0, max = 100000, allowNull = true } = {}) => {
  if (v === "" || v === null || v === undefined) { if (allowNull) return null; throw bad(`${label} is required.`); }
  const n = Number(v);
  must(isFiniteNumber(n) && n >= min && n <= max, `${label} must be between ${min} and ${max.toLocaleString("en-AU")} mm.`);
  return Math.round(n * 1000) / 1000;
};
function cleanInputs(kind, inp, tracedLengthMm) {
  const i = inp || {};
  if (kind === "wall") {
    const wk = ["rect", "rake", "gable", "polygon"].includes(i.kind) ? i.kind : "rect";
    const out = { kind: wk, widthMm: tracedLengthMm != null ? Math.round(tracedLengthMm * 1000) / 1000 : MM(i.widthMm, "Wall length", { min: 1, allowNull: false }),
      heightMm: MM(i.heightMm, "Wall height", { min: 1 }), startHeightMm: MM(i.startHeightMm, "Start height", { min: 1 }), endHeightMm: MM(i.endHeightMm, "End height", { min: 1 }),
      eavesHeightMm: MM(i.eavesHeightMm, "Eaves height", { min: 1 }), apexXMm: MM(i.apexXMm, "Apex position"), apexHeightMm: MM(i.apexHeightMm, "Apex height", { min: 1 }),
      heightSource: tracedLengthMm != null ? "plan+entered" : "entered", name: optStr(i.name, 60), floor: optStr(i.floor, 40) };
    // heights may be missing while the wall is a draft (traced first, heights next) — the engine reports it as
    // incomplete; values that ARE present must be coherent
    if (wk === "gable" && out.eavesHeightMm && out.apexHeightMm) must(out.apexXMm != null && out.apexXMm <= out.widthMm && out.apexHeightMm > out.eavesHeightMm, "The apex must sit within the wall and above the eaves.");
    if (wk === "polygon" && i.polygon != null) {
      must(Array.isArray(i.polygon) && i.polygon.length >= 3 && i.polygon.length <= 200, "A wall outline needs 3–200 points.");
      out.polygon = i.polygon.map((p) => ({ x: MM(p.x, "Outline x", { min: -100000, allowNull: false }), y: MM(p.y, "Outline y", { min: -100000, allowNull: false }) }));
    }
    return out;
  }
  if (kind === "opening") {
    return { xMm: MM(i.xMm, "Opening offset", { allowNull: false }), sillMm: MM(i.sillMm, "Sill height", { allowNull: false }),
      widthMm: MM(i.widthMm, "Opening width", { min: 1, allowNull: false }), heightMm: MM(i.heightMm, "Opening height", { min: 1, allowNull: false }),
      label: optStr(i.label, 40), type: ["window", "door", "other"].includes(i.type) ? i.type : "window" };
  }
  if (kind === "offcut") {
    return { lengthMm: MM(i.lengthMm, "Offcut length", { min: 1, allowNull: false }), materialId: isUuid(i.materialId) ? i.materialId : null,
      label: optStr(i.label, 60), location: optStr(i.location, 80), status: ["available", "consumed"].includes(i.status) ? i.status : "available" };
  }
  if (kind === "polyline") {
    const splits = Array.isArray(i.splitsMm) ? i.splitsMm.map((x) => MM(x, "Split position", { min: 0.001, allowNull: false })) : [];
    for (let k = 1; k < splits.length; k++) must(splits[k] > splits[k - 1], "Split positions must increase along the run.");
    if (tracedLengthMm != null) must(splits.every((x) => x < tracedLengthMm), "A split must be inside the run.");
    // approved plan location of each split (13): stations are rebuilt from it after geometry edits
    const anchors = Array.isArray(i.splitAnchors) ? i.splitAnchors.slice(0, 20).map((a) => ({ stationMm: MM(a?.stationMm, "Split station", { min: 0, allowNull: false }),
      x: a?.x == null ? null : MM(a.x, "Split x", { min: -1e6, allowNull: false }), y: a?.y == null ? null : MM(a.y, "Split y", { min: -1e6, allowNull: false }) })) : null;
    // anchors only count when they describe exactly these splits (a mismatched set is dropped, never guessed)
    const keep = anchors && anchors.length === splits.length && anchors.length > 0;
    return splits.length || i.role ? { splitsMm: splits, ...(keep ? { splitAnchors: anchors } : {}), role: optStr(i.role, 30) } : null;
  }
  if (kind === "distribution") {
    return { startOffsetMm: MM(i.startOffsetMm, "Start offset") ?? 0, endOffsetMm: MM(i.endOffsetMm, "End offset") ?? 0,
      includeStart: i.includeStart !== false, includeEnd: i.includeEnd !== false, spacing: i.spacing === "equal" ? "equal" : "fixed",
      overrides: Array.isArray(i.overrides) ? i.overrides.slice(0, 500).map((o) => {
        const dup = o.duplicate == null ? 0 : Number(o.duplicate);
        must(Number.isInteger(dup) && dup >= 0 && dup <= 20, "A member can be duplicated 0–20 times.");
        return { station: String(o.station).slice(0, 40), removed: o.removed === true, lengthMm: MM(o.lengthMm, "Override length", { min: 1 }), ...(dup ? { duplicate: dup } : {}) };
      }) : [] };
  }
  if (kind === "member") return { mode: ["projected", "true"].includes(i.mode) ? i.mode : "projected" };
  return null;
}

/** Contribution role → measurement kinds it may use (207). A wall feeds cladding/supports/accessories/studs;
 *  timber repeated members take a distribution + a member line; aluminium takes openings. */
const ROLE_KINDS = Object.freeze({
  primary: ["run", "count", "manual", "polyline", "wall", "opening", "member", "distribution", "area"],
  distribution: ["run", "polyline", "distribution"], member: ["run", "member"], wall: ["wall"], opening: ["opening"],
  path: ["polyline"], surface: ["area", "wall"], offcut: ["offcut"],
});

/** Validate + normalise a material's content (method, rules, profile, spec). */
export function cleanMaterialContent(m) {
  const methodKey = str(m.methodKey, 60) || "flashing_runs";
  const methodVersion = Number(m.methodVersion || 1);
  const method = getMethod(methodKey, methodVersion);
  if (method.status !== "production") throw bad("That material method isn't available yet.");
  if (method.generic) {
    // TC-R04 families: spec normalised per family; flashing rules/profile don't apply
    let spec;
    try { spec = normaliseFamilySpec(m.spec); } catch (e) { throw bad(e.message); }
    must(method.families.includes(spec.family), "That calculation method doesn't fit this material.");
    const gname = str(m.name);
    must(gname, "Give the material a name.");
    const rules = m.rules && typeof m.rules === "object" ? cleanGenericRules(m.rules) : {};
    return { name: gname, methodKey, methodVersion, rules, profile: null, spec };
  }
  const rules = normaliseFlashingRules(m.rules || {});
  const profile = m.profile ? normaliseProfile(m.profile) : null;
  if (profile && profile.segments.length > LIMITS.profileSegments) throw bad(`A profile can have at most ${LIMITS.profileSegments} legs.`);
  const name = str(m.name);
  must(name, "Give the material a name.");
  return { name, methodKey, methodVersion, rules, profile, spec: cleanSpec(m.spec) };
}

async function loadPresetRevision(sb, presetId, revision) {
  must(isUuid(presetId), "Invalid standard.");
  let q1 = sb.from("takeoff_material_preset_revisions").select("*").eq("preset_id", presetId);
  if (revision) q1 = q1.eq("revision", Number(revision));
  const rows = await q(q1.order("revision", { ascending: false }).limit(1));
  if (!rows.length) throw new TakeoffHttpError(404, "That company standard was not found.", "NOT_FOUND");
  return rows[0];
}

/**
 * Validate a client change-set against the snapshot, recompute everything server-side and
 * commit atomically with CAS. Returns { revision, snapshot, computed, replayed }.
 */
export async function commitWorkspace(sb, ctx, body) {
  const expected = Number(body?.expectedRevision);
  must(Number.isInteger(expected) && expected >= 1, "Missing takeoff revision.");
  const idem = body?.idempotencyKey ? str(body.idempotencyKey, 120) : null;
  if (idem) must(idem.length >= 8, "Invalid idempotency key.");
  if (idem) {
    // A retry of an already-committed change-set returns the original result, never re-applies.
    const prior = await q(sb.from("takeoff_idempotency").select("operation, result").eq("scope_id", ctx.ws.id).eq("key", idem).maybeSingle());
    if (prior) {
      if (prior.operation !== "commit") throw bad("That save key was already used for a different action.");
      const fresh = await loadSnapshotFresh(sb, ctx.ws.id);
      return { revision: prior.result.revision, replayed: true, snapshot: fresh.snapshot, computed: computeWorkspace(fresh.snapshot) };
    }
  }
  const { row, snapshot } = await loadSnapshotFresh(sb, ctx.ws.id);
  if (row.state === "archived") throw bad("This takeoff is archived.");
  const ch = body?.changes || {};
  const capOf = (arr, max, label) => { if (arr != null && (!Array.isArray(arr) || arr.length > max)) throw bad(`Too many ${label} in one save (max ${max}).`, "LIMIT"); return arr || []; };
  capOf(ch.calibrations?.insert, 20, "scales");
  capOf(ch.materials?.upsert, 100, "materials"); capOf(ch.materials?.archive, 100, "materials");
  capOf(ch.measurements?.upsert, LIMITS.measurementsPerWorkspace, "measurements"); capOf(ch.measurements?.archive, 1000, "measurements");
  capOf(ch.contributions?.upsert, 1000, "assignments"); capOf(ch.contributions?.archive, 1000, "assignments");
  const out = { calibrations: { insert: [] }, materials: { upsert: [], archive: [] }, measurements: { upsert: [], archive: [] }, contributions: { upsert: [], archive: [] } };

  // Replays of an already-committed key go straight to the RPC (which returns the original result).
  if (row.revision !== expected) {
    if (!idem) throw new TakeoffHttpError(409, "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare.", "CONFLICT");
  }

  const docs = new Map(snapshot.documents.map((d) => [d.id, d]));
  const docRow = async (id) => {
    if (docs.has(id)) return docs.get(id);
    must(isUuid(id), "Invalid plan.");
    const r = await q(sb.from("job_documents").select("*").eq("id", id).maybeSingle());
    if (!r || !docInOwner(r, ctx.owner)) throw new TakeoffHttpError(403, "That plan is not on this job.", "FORBIDDEN");
    const d = mapDoc(r); docs.set(id, d); return d;
  };

  // workspace fields
  if (ch.workspace && typeof ch.workspace === "object") {
    const w = {};
    if (ch.workspace.name !== undefined) { w.name = str(ch.workspace.name); must(w.name, "Give the takeoff a name."); }
    if (ch.workspace.primaryDocumentId !== undefined && ch.workspace.primaryDocumentId !== null) {
      const d = await docRow(ch.workspace.primaryDocumentId);
      must(d.status === "current", "Choose a current plan as the primary plan.");
      w.primaryDocumentId = d.id;
      const pi = Number(ch.workspace.primaryPageIndex ?? 0);
      must(Number.isInteger(pi) && pi >= 0 && pi < 10000, "Invalid page.");
      w.primaryPageIndex = pi;
    }
    if (ch.workspace.clearPrimary) w.clearPrimary = true;
    if (ch.workspace.acknowledgeReview) w.acknowledgeReview = true;
    out.workspace = w;
  }

  // calibrations — server rebuilds scales from the tapped points
  const cals = new Map(snapshot.calibrations.map((c) => [c.id, c]));
  for (const c of ch.calibrations?.insert || []) {
    must(isUuid(c.id) && !cals.has(c.id), "Invalid calibration id.");
    const d = await docRow(c.documentId);
    must(d.status === "current", "This plan has been replaced — scale the current revision instead.");
    const pageIndex = Number(c.pageIndex);
    must(Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < 10000, "Invalid page.");
    const pageMeta = normalisePageMeta(c.pageMeta);
    const region = c.region ? normaliseRect(c.region) : null;
    const regionLabel = region ? str(c.regionLabel, 60) : null;
    if (region) must(regionLabel, "Give the scaled region a name.");
    if (c.supersedesCalibrationId) must(cals.has(c.supersedesCalibrationId), "The calibration being replaced was not found.");
    const built = buildCalibration({ basisRotation: Number(c.basisRotation || 0), horizontal: c.horizontal, vertical: c.vertical, mode: c.mode, region });
    if (c.verification && built.ok && verificationReusesReference(built.calibration, c.verification)) {
      throw bad("Check against a DIFFERENT printed dimension — not the horizontal or vertical one you used to scale.", "CHECK_NOT_INDEPENDENT");
    }
    if (!built.ok) throw new TakeoffHttpError(400, built.message, "AXIS_MISMATCH");
    const cal = c.verification ? verifyCalibration(built.calibration, c.verification) : built.calibration;
    const rec = {
      id: c.id, documentId: d.id, contentSha256: d.contentSha256, pageIndex, pageMeta, region, regionLabel,
      supersedesCalibrationId: c.supersedesCalibrationId || null, basisRotation: cal.basisRotation, mode: cal.mode, sx: cal.sx, sy: cal.sy,
      measuredSx: cal.measuredSx, measuredSy: cal.measuredSy, discrepancy: cal.discrepancy, tolerance: cal.tolerance,
      horizontal: cal.horizontal, vertical: cal.vertical, verification: cal.verification, status: cal.status,
    };
    out.calibrations.insert.push(rec);
    cals.set(c.id, { ...rec });
  }

  // materials
  const mats = new Map(snapshot.materials.map((m) => [m.id, m]));
  for (const m of ch.materials?.upsert || []) {
    must(isUuid(m.id), "Invalid material id.");
    let content;
    let fromPresetId = mats.get(m.id)?.fromPresetId || null, fromPresetRevision = mats.get(m.id)?.fromPresetRevision || null;
    if (m.fromPreset) {
      const rev = await loadPresetRevision(sb, m.fromPreset.presetId, m.fromPreset.revision);
      content = cleanMaterialContent({ name: rev.name, methodKey: rev.method_key, methodVersion: rev.method_version, rules: rev.rules, profile: rev.profile, spec: rev.spec });
      fromPresetId = rev.preset_id; fromPresetRevision = rev.revision;
    } else {
      content = cleanMaterialContent(m);
    }
    const rec = { id: m.id, fromPresetId, fromPresetRevision, ...content };
    out.materials.upsert.push(rec);
    mats.set(m.id, { ...(mats.get(m.id) || {}), ...rec });
  }
  for (const id of ch.materials?.archive || []) { must(isUuid(id), "Invalid material id."); out.materials.archive.push(id); mats.delete(id); }

  // measurements
  const meas = new Map(snapshot.measurements.map((m) => [m.id, m]));
  for (const m of ch.measurements?.upsert || []) {
    must(isUuid(m.id), "Invalid measurement id.");
    const isNew = !meas.has(m.id);
    const label = optStr(m.label, 120);
    let rec;
    if (m.kind === "run") {
      const pts = validatePoints(m.points, { min: 2, max: 2 });
      const cal = cals.get(m.calibrationId);
      if (!cal) throw bad("Scale this plan page before measuring runs.");
      const d = await docRow(m.documentId);
      must(cal.documentId === d.id && cal.pageIndex === Number(m.pageIndex), "That scale belongs to a different plan page.");
      if (isNew) must(d.status === "current", "This plan has been replaced — measure on the current revision.");
      if (!pointsWithinCalibration(cal, pts)) throw bad("This run goes outside the scaled region. Measure inside the region, or scale the other region first.", "OUTSIDE_REGION");
      const rawLengthMm = segmentLengthMm(cal, pts[0], pts[1]);
      requirePositive(rawLengthMm, "Measured length");
      rec = { id: m.id, kind: "run", documentId: d.id, pageIndex: cal.pageIndex, calibrationId: cal.id, geometry: { points: pts }, label, rawLengthMm, finishedLengthMm: null, quantity: null };
    } else if (m.kind === "count") {
      const pts = validatePoints(m.points, { min: 1, max: LIMITS.pointsPerGeometry });
      const d = await docRow(m.documentId);
      if (isNew) must(d.status === "current", "This plan has been replaced — count on the current revision.");
      const pageIndex = Number(m.pageIndex);
      must(Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < 10000, "Invalid page.");
      rec = { id: m.id, kind: "count", documentId: d.id, pageIndex, calibrationId: null, geometry: { points: pts }, label,
        rawLengthMm: null, finishedLengthMm: requirePositive(m.finishedLengthMm, "Finished length"), quantity: null };
    } else if (m.kind === "manual") {
      rec = { id: m.id, kind: "manual", documentId: null, pageIndex: null, calibrationId: null, geometry: null, label, rawLengthMm: null,
        finishedLengthMm: requirePositive(m.finishedLengthMm, "Finished length"), quantity: requireQuantity(m.quantity) };
      must(rec.quantity <= 10000, "Quantity looks too large.");
    } else if (["polyline", "distribution", "member", "area"].includes(m.kind)) {
      // plan-traced geometry on ONE scaled page (TC-R04): continuous flashing/trim paths, timber distribution
      // runs and member lines, traced areas. Lengths are server-computed from the calibration, never trusted.
      const minPts = m.kind === "area" ? 3 : 2;
      const maxPts = m.kind === "polyline" || m.kind === "area" ? LIMITS.pointsPerGeometry : 2;
      const pts = validatePoints(m.points, { min: minPts, max: maxPts });
      const cal = cals.get(m.calibrationId);
      if (!cal) throw bad("Scale this plan page before measuring.");
      const d = await docRow(m.documentId);
      must(cal.documentId === d.id && cal.pageIndex === Number(m.pageIndex), "That scale belongs to a different plan page.");
      if (isNew) must(d.status === "current", "This plan has been replaced — measure on the current revision.");
      if (!pointsWithinCalibration(cal, pts)) throw bad("This measurement goes outside the scaled region.", "OUTSIDE_REGION");
      const rawLengthMm = m.kind === "area" ? null : polylineLengthMm(cal, pts);
      if (rawLengthMm != null) requirePositive(rawLengthMm, "Measured length");
      const inputs = cleanInputs(m.kind, m.inputs, rawLengthMm);
      rec = { id: m.id, kind: m.kind, documentId: d.id, pageIndex: cal.pageIndex, calibrationId: cal.id,
        geometry: { v: 2, points: pts, ...(inputs ? { inputs } : {}) }, label, rawLengthMm, finishedLengthMm: null, quantity: null };
    } else if (m.kind === "wall" || m.kind === "opening" || m.kind === "offcut") {
      // entered (or traced) wall surfaces, their openings, and recorded physical offcuts
      let pts = null, cal = null, d = null;
      if (Array.isArray(m.points) && m.points.length) {
        pts = validatePoints(m.points, { min: 2, max: 200 });
        cal = cals.get(m.calibrationId);
        if (!cal) throw bad("Scale this plan page before tracing a wall.");
        d = await docRow(m.documentId);
        must(cal.documentId === d.id && cal.pageIndex === Number(m.pageIndex), "That scale belongs to a different plan page.");
        if (isNew) must(d.status === "current", "This plan has been replaced — trace on the current revision.");
      }
      if (pts && cal && !pointsWithinCalibration(cal, pts)) throw bad("This wall goes outside the scaled region.", "OUTSIDE_REGION");
      // an opening may stand alone (aluminium window trims) or belong to a wall of THIS takeoff
      const parentId = m.kind === "opening" && m.parentId != null ? m.parentId : null;
      if (parentId) must(isUuid(parentId) && meas.has(parentId) && meas.get(parentId).kind === "wall", "An opening must belong to a wall in this takeoff.");
      const inputs = cleanInputs(m.kind, m.inputs, pts && cal ? polylineLengthMm(cal, pts) : null);
      rec = { id: m.id, kind: m.kind, documentId: d?.id || null, pageIndex: cal ? cal.pageIndex : null, calibrationId: cal?.id || null,
        geometry: { v: 2, ...(pts ? { points: pts } : {}), inputs, ...(parentId ? { parentId } : {}) }, label,
        rawLengthMm: pts && cal ? polylineLengthMm(cal, pts) : null, finishedLengthMm: null, quantity: null };
    } else {
      throw bad("Unknown measurement type.");
    }
    must(rec.finishedLengthMm == null || rec.finishedLengthMm <= 30000, "Finished length looks too large (over 30 m).");
    out.measurements.upsert.push(rec);
    meas.set(m.id, { ...rec, points: rec.geometry?.points || null, inputs: rec.geometry?.inputs || null, parentId: rec.geometry?.parentId || null });
  }
  for (const id of ch.measurements?.archive || []) { must(isUuid(id), "Invalid measurement id."); out.measurements.archive.push(id); meas.delete(id); }
  must(meas.size <= LIMITS.measurementsPerWorkspace, `A takeoff can hold at most ${LIMITS.measurementsPerWorkspace} measurements.`);

  // contributions
  const contribs = new Map(snapshot.contributions.map((c) => [c.id, c]));
  const changedSplits = [];
  for (const c of ch.contributions?.upsert || []) {
    must(isUuid(c.id), "Invalid assignment id.");
    must(meas.has(c.measurementId), "That measurement is not in this takeoff.");
    must(mats.has(c.jobMaterialId), "That material is not in this takeoff.");
    const role = c.role == null ? "primary" : c.role;
    must(Object.hasOwn(ROLE_KINDS, role), "Unknown assignment role.");
    must(ROLE_KINDS[role].includes(meas.get(c.measurementId).kind), "That measurement can't be used that way.");
    const cm = mats.get(c.jobMaterialId);
    if (!getMethod(cm.methodKey || cm.method_key, Number(cm.methodVersion || cm.method_version || 1)).generic) {
      // flashing takes runs, continuous paths and finished pieces only
      must(role === "primary" && ["run", "polyline", "count", "manual"].includes(meas.get(c.measurementId).kind), "A flashing takes runs, paths or finished pieces.");
    }
    let split = null;
    if (c.split) {
      must(!Array.isArray(c.split.pieces) || c.split.pieces.length <= 20, "A split can have at most 20 pieces.");
      must(!Array.isArray(c.split.laps) || c.split.laps.length <= 19, "A split can have at most 19 joints.");
      const pieces = Array.isArray(c.split.pieces) ? c.split.pieces.map(Number) : [];
      const laps = Array.isArray(c.split.laps) ? c.split.laps.map(Number) : [];
      const originals = c.split.originals == null ? 1 : Number(c.split.originals);
      must(Number.isInteger(originals) && originals >= 1 && originals <= 10000, "Choose how many pieces to split.");
      split = { pieces, laps, sourceFinishedMm: Number(c.split.sourceFinishedMm), originals, version: Number(c.split.version || 1) };
      const prev = contribs.get(c.id)?.split;
      const same = prev && prev.sourceSignature && JSON.stringify([prev.pieces, prev.laps, prev.originals || 1, prev.sourceFinishedMm]) === JSON.stringify([pieces, laps, originals, split.sourceFinishedMm]);
      // re-sent unchanged (same version): keep what it was made against. An explicit review/re-apply bumps the
      // version → it is re-validated and re-stamped against the CURRENT source, clearing staleness (R04b R9).
      if (same && Number(prev.version || 1) === split.version) split.sourceSignature = prev.sourceSignature;
      else changedSplits.push(c.id);
    }
    must(!split || role === "primary", "Only a plain run can be split this way.");
    const rec = { id: c.id, measurementId: c.measurementId, jobMaterialId: c.jobMaterialId, role, split };
    out.contributions.upsert.push(rec);
    contribs.set(c.id, rec);
  }
  for (const id of ch.contributions?.archive || []) { must(isUuid(id), "Invalid assignment id."); out.contributions.archive.push(id); contribs.delete(id); }

  // Recompute the merged state; newly applied splits must be valid now.
  const merged = {
    documents: [...docs.values()], calibrations: [...cals.values()], materials: [...mats.values()],
    measurements: [...meas.values()], contributions: [...contribs.values()].filter((c) => meas.has(c.measurementId) && mats.has(c.jobMaterialId)),
  };
  let computed = computeWorkspace(merged);
  // New/changed splits are stamped (server-side) with exactly what they were made against, so any later
  // change to the run, calibration, rules or quantity makes them stale — even if it rounds the same.
  for (const id of changedSplits) {
    const c = computed.contributions.find((x) => x.contributionId === id);
    const rec = contribs.get(id);
    if (!c || !rec?.split) continue;
    if (!c.result) continue;
    // the source moved while the split was being made (e.g. offline): keep the split but mark it stale for
    // review instead of refusing the whole batch (R04b R5)
    rec.split.sourceSignature = rec.split.sourceFinishedMm === c.result.finishedLengthMm ? c.sourceSignature : "source-changed-while-splitting";
  }
  if (changedSplits.length) computed = computeWorkspace(merged);
  for (const id of changedSplits) {
    const c = computed.contributions.find((x) => x.contributionId === id);
    if (c?.split && (!c.split.valid || (c.split.stale && contribs.get(id)?.split?.sourceSignature !== "source-changed-while-splitting"))) {
      throw bad(c.split.problems?.[0] || (c.split.stale ? PROBLEM_TEXT.split_stale : PROBLEM_TEXT.split_invalid), "SPLIT_INVALID");
    }
  }

  const { data, error } = await sb.rpc("takeoff_commit", {
    p_workspace_id: ctx.ws.id, p_expected_revision: expected, p_changes: out, p_actor: ctx.actor, p_idempotency_key: idem,
  });
  if (error) throw error;
  const fresh = await loadSnapshotFresh(sb, ctx.ws.id);
  return { revision: data.revision, replayed: !!data.replayed, snapshot: fresh.snapshot, computed: computeWorkspace(fresh.snapshot) };
}

// ── Company standards ─────────────────────────────────────────────────────────
export async function listPresets(sb, { includeInactive = false } = {}) {
  let q1 = sb.from("takeoff_material_presets").select("*").order("name", { ascending: true });
  if (!includeInactive) q1 = q1.eq("is_active", true);
  const presets = await q(q1);
  if (!presets.length) return [];
  const revs = await q(sb.from("takeoff_material_preset_revisions").select("*").in("preset_id", presets.map((p) => p.id)));
  const byKey = new Map(revs.map((r) => [`${r.preset_id}:${r.revision}`, r]));
  return presets.map((p) => {
    const r = byKey.get(`${p.id}:${p.current_revision}`);
    return {
      id: p.id, name: p.name, revision: p.current_revision, isActive: p.is_active, updatedAt: p.updated_at,
      methodKey: r?.method_key, methodVersion: r?.method_version, spec: r?.spec || {}, rules: r?.rules || {}, profile: r?.profile || null,
      sourceReview: r?.source_review || null,
    };
  });
}

export async function savePreset(sb, ctx, body) {
  if (!ctx.caps.editStandards) throw new TakeoffHttpError(403, "Only office staff can change company standards.", "FORBIDDEN");
  const presetId = body?.presetId || null;
  if (presetId) must(isUuid(presetId), "Invalid standard.");
  const content = body?.content ? { ...cleanMaterialContent(body.content), sourceReview: cleanSourceReview(body.content.sourceReview) } : null;
  if (!presetId) must(content, "Nothing to save.");
  const { data, error } = await sb.rpc("takeoff_save_preset", {
    p_preset_id: presetId, p_expected_revision: presetId ? Number(body.expectedRevision) : 0, p_content: content,
    p_user_id: ctx.actor.userId, p_active: body?.isActive === undefined ? null : !!body.isActive,
  });
  if (error) throw error;
  return data;
}

// ── Orders ────────────────────────────────────────────────────────────────────
const mapOrder = (r) => ({
  id: r.id, workspaceId: r.workspace_id, orderRef: r.order_ref, supplierId: r.supplier_id, delivery: r.delivery || {}, notes: r.notes,
  status: r.status, revision: r.revision, createdAt: r.created_at, updatedAt: r.updated_at,
});
const mapLine = (r) => ({ id: r.id, bucketKey: r.bucket_key, specKey: r.spec_key, jobMaterialId: r.job_material_id, finishedLengthMm: r.finished_length_mm, quantity: r.quantity,
  unit: r.unit || "piece", item: r.item || null });
const mapExport = (r) => ({
  id: r.id, orderId: r.order_id, exportNo: r.export_no, isDraft: r.is_draft, snapshotSha256: r.snapshot_sha256,
  calculationVersion: r.calculation_version, workspaceRevision: r.workspace_revision, orderRevision: r.order_revision,
  artifactStatus: r.artifact_status, artifactError: r.artifact_error, pdfSha256: r.pdf_sha256, rendererVersion: r.renderer_version, createdAt: r.created_at,
});
const mapPlacement = (r) => ({
  id: r.id, orderId: r.order_id, exportId: r.export_id, supplierReference: r.supplier_reference, placedOn: r.placed_on, status: r.status,
  surplusAcknowledged: r.surplus_acknowledged, cancelledAt: r.cancelled_at, cancelReason: r.cancel_reason, createdAt: r.created_at,
});

export async function getOrderRow(sb, orderId) {
  if (!isUuid(orderId)) throw new TakeoffHttpError(400, "Invalid order id.", "INVALID");
  const row = await q(sb.from("takeoff_orders").select("*").eq("id", orderId).maybeSingle());
  if (!row) throw new TakeoffHttpError(404, "Order not found.", "NOT_FOUND");
  return row;
}

/** Effective commitments (placed, not cancelled) for a workspace. */
export async function loadCommitments(sb, wsId) {
  const orders = await q(sb.from("takeoff_orders").select("id").eq("workspace_id", wsId));
  if (!orders.length) return [];
  const placements = await q(sb.from("takeoff_placements").select("id").in("order_id", orders.map((o) => o.id)).eq("status", "placed"));
  if (!placements.length) return [];
  const allocs = await q(sb.from("takeoff_placement_allocations").select("*").in("placement_id", placements.map((p) => p.id)));
  return allocs.map((a) => ({ bucketKey: a.bucket_key, contributionId: a.contribution_id, quantity: a.quantity }));
}

export async function listOrders(sb, wsId) {
  const orders = await q(sb.from("takeoff_orders").select("*").eq("workspace_id", wsId).order("created_at", { ascending: true }));
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const [lines, exports, placements] = await Promise.all([
    q(sb.from("takeoff_order_lines").select("*").in("order_id", ids)),
    q(sb.from("takeoff_exports").select("id, order_id, export_no, is_draft, snapshot_sha256, calculation_version, workspace_revision, order_revision, artifact_status, artifact_error, pdf_sha256, renderer_version, created_at").in("order_id", ids).order("export_no", { ascending: true })),
    q(sb.from("takeoff_placements").select("*").in("order_id", ids).order("created_at", { ascending: true })),
  ]);
  return orders.map((o) => ({
    ...mapOrder(o),
    lines: lines.filter((l) => l.order_id === o.id).map(mapLine),
    exports: exports.filter((e) => e.order_id === o.id).map(mapExport),
    placements: placements.filter((p) => p.order_id === o.id).map(mapPlacement),
  }));
}

/**
 * What OTHER orders already cover, per bucket (R04b R7/R8): placed allocations + lines of open orders that
 * already have an order-ready (sent-able) export but no placement recorded yet.
 * → Map bucketKey → { placed, exported, refs: [orderRef…] }
 */
export async function otherOrderCover(sb, wsId, excludeOrderId = null) {
  const out = new Map();
  const add = (k, field, n, ref) => { const e = out.get(k) || { placed: 0, exported: 0, refs: [] }; e[field] += n; if (ref && !e.refs.includes(ref)) e.refs.push(ref); out.set(k, e); };
  for (const c of await loadCommitments(sb, wsId)) add(c.bucketKey, "placed", c.quantity, null);
  const orders = (await q(sb.from("takeoff_orders").select("id, order_ref, status").eq("workspace_id", wsId))).filter((o) => o.id !== excludeOrderId && o.status === "draft");
  if (!orders.length) return out;
  const ids = orders.map((o) => o.id);
  const ready = new Set((await q(sb.from("takeoff_exports").select("order_id, is_draft, artifact_status").in("order_id", ids))).filter((e) => !e.is_draft).map((e) => e.order_id));
  if (!ready.size) return out;
  const lines = await q(sb.from("takeoff_order_lines").select("order_id, bucket_key, quantity").in("order_id", [...ready]));
  const refOf = new Map(orders.map((o) => [o.id, o.order_ref]));
  for (const l of lines) add(l.bucket_key, "exported", l.quantity, refOf.get(l.order_id));
  return out;
}

/** Schedule + required/ordered/remaining from trustworthy records only. */
export async function scheduleStatus(sb, snapshot) {
  const computed = computeWorkspace(snapshot);
  const commitments = await loadCommitments(sb, snapshot.workspace.id);
  const status = orderStatus(computed.scheduleLines, commitments);
  return { computed, status: [...status.values()] };
}

export async function createOrder(sb, ctx, body) {
  const id = isUuid(body?.id) ? body.id : crypto.randomUUID();
  const existing = await q(sb.from("takeoff_orders").select("*").eq("id", id).maybeSingle());
  if (existing) {
    if (existing.workspace_id !== ctx.ws.id) throw new TakeoffHttpError(409, "That order id is already in use.", "CONFLICT");
    return mapOrder(existing);
  }
  let supplierId = null;
  if (body?.supplierId) { await requireSupplier(sb, body.supplierId); supplierId = body.supplierId; }
  const { data: ref, error: refErr } = await sb.rpc("takeoff_next_order_ref");
  if (refErr) throw refErr;
  const row = {
    id, workspace_id: ctx.ws.id, order_ref: ref, supplier_id: supplierId, delivery: cleanDelivery(body?.delivery),
    created_by_type: ctx.actor.type, created_by_user_id: ctx.actor.userId, created_by_employee_id: ctx.actor.employeeId,
  };
  const { data, error } = await sb.from("takeoff_orders").insert(row).select("*").single();
  if (error) {
    if (error.code === "23505") { const again = await getOrderRow(sb, id); if (again.workspace_id === ctx.ws.id) return mapOrder(again); }
    throw error;
  }
  return mapOrder(data);
}

async function requireSupplier(sb, id) {
  must(isUuid(id), "Invalid supplier.");
  const s = await q(sb.from("suppliers").select("id, name, email, phone, contact_name, abn, is_active, updated_at").eq("id", id).maybeSingle());
  if (!s || s.is_active === false) throw bad("That supplier was not found or is inactive.");
  return s;
}

export function cleanDelivery(d) {
  const x = d || {};
  const method = x.method === "pickup" ? "pickup" : x.method === "delivery" ? "delivery" : null;
  return {
    method,
    address: optStr(x.address, 200),
    addressSource: x.addressSource === "job" ? "job" : x.address ? "entered" : null,
    requiredDate: ymd(x.requiredDate),
    asap: x.asap === true && !ymd(x.requiredDate),
    contactName: optStr(x.contactName, 80),
    contactPhone: optStr(x.contactPhone, 40),
    pickupBranch: optStr(x.pickupBranch, 120),
    notes: optStr(x.notes, 500),
  };
}

export async function saveOrder(sb, ctx, orderRow, body) {
  const expected = Number(body?.expectedRevision);
  must(Number.isInteger(expected), "Missing order revision.");
  const fields = {};
  if (body.supplierId !== undefined) {
    if (body.supplierId) await requireSupplier(sb, body.supplierId);
    fields.supplierId = body.supplierId || null;
  }
  if (body.delivery !== undefined) fields.delivery = cleanDelivery(body.delivery);
  if (body.notes !== undefined) fields.notes = optStr(body.notes, 1000);
  let lines = null;
  if (Array.isArray(body.lines)) {
    must(body.lines.length <= LIMITS.orderLines, `An order can have at most ${LIMITS.orderLines} lines.`);
    const { snapshot } = await loadSnapshotFresh(sb, orderRow.workspace_id);
    const computed = computeWorkspace(snapshot);
    const byKey = new Map(computed.scheduleLines.map((l) => [l.bucketKey, l]));
    const stored = await q(sb.from("takeoff_order_lines").select("*").eq("order_id", orderRow.id));
    const storedByKey = new Map(stored.map((r) => [`${r.bucket_key}#${r.job_material_id || ""}`, r]));
    const seen = new Set();
    lines = body.lines.map((l) => {
      must(!seen.has(l.bucketKey), "A length is listed twice.");
      seen.add(l.bucketKey);
      const quantity = requireQuantity(Number(l.quantity));
      must(quantity <= 10000, "Quantity looks too large.");
      // An unchanged existing line is kept exactly as chosen — even if it has gone stale — so editing
      // other lines never silently relinks it. Stale lines are shown and block order-ready exports.
      const keep = storedByKey.get(`${l.bucketKey}#${l.jobMaterialId || ""}`);
      // …unless the user explicitly UPDATES it (refresh): then it is re-taken from the current schedule line
      if (keep && !l.refresh) return { bucketKey: keep.bucket_key, specKey: keep.spec_key, jobMaterialId: keep.job_material_id, finishedLengthMm: keep.finished_length_mm, quantity,
        unit: keep.unit || "piece", item: keep.item || null };
      const sl = byKey.get(l.bucketKey);
      must(sl, "A selected length is no longer in the takeoff — refresh the schedule.");
      must(!l.jobMaterialId || sl.jobMaterialIds.includes(l.jobMaterialId), "That material doesn't supply this length — choose the line again.");
      // generic lines (TC-R04) carry their purchase unit and what is supplied; flashing stays length × piece
      return { bucketKey: sl.bucketKey, specKey: sl.specKey, jobMaterialId: l.jobMaterialId || sl.jobMaterialIds[0], finishedLengthMm: sl.finishedLengthMm ?? null, quantity,
        unit: sl.unit || "piece", item: sl.item || null };
    });
  }
  const { data, error } = await sb.rpc("takeoff_save_order", { p_order_id: orderRow.id, p_expected_revision: expected, p_fields: fields, p_lines: lines });
  if (error) throw error;
  return data;
}

// ── Export snapshot + readiness ───────────────────────────────────────────────
/**
 * Build the frozen supplier-order snapshot. Pure apart from the reads passed in.
 * Returns { snapshot, problems } — problems block an order-ready export (drafts allowed).
 */
export function buildExportSnapshot({ wsSnapshot, order, lines, supplier, company, jobLabel, rendererVersion, cover = null, acknowledgeSurplus = false }) {
  const computed = computeWorkspace(wsSnapshot);
  const byKey = new Map(computed.scheduleLines.map((l) => [l.bucketKey, l]));
  const mats = new Map(wsSnapshot.materials.map((m) => [m.id, m]));
  const problems = [];
  if (!supplier) problems.push("Choose a supplier.");
  const d = order.delivery || {};
  if (d.method !== "delivery" && d.method !== "pickup") problems.push("Choose delivery or pickup.");
  if (d.method === "delivery" && !d.address) problems.push("Enter the delivery address.");
  // what a supplier needs to act on the order (R04b R13) — never invented, always asked for
  if (d.method === "pickup" && !d.pickupBranch) problems.push("Enter the pickup branch.");
  if (!d.requiredDate && !d.asap) problems.push("Enter the date it's required by (or choose As soon as possible).");
  if (!d.contactPhone) problems.push("Enter a site contact phone number.");
  if (company && !company.phone && !company.email) problems.push("Add Blue Leaf's phone or email in Settings › Company so the supplier can reply.");
  if (!lines.length) problems.push("Add at least one length to the order.");
  if (wsSnapshot.workspace.state === "needs_review") problems.push("A plan used by this takeoff was replaced or removed — review the takeoff and mark it reviewed.");
  const groups = new Map();
  const items = new Map(); // generic purchase groups (TC-R04), by spec key
  for (const l of lines) {
    const st = orderLineState(l, computed, mats);
    const sl = st.current;
    if (st.stale) problems.push((l.item ? ITEM_STALE_TEXT : PROBLEM_TEXT)[st.problem]);
    if (!sl) continue;
    if (sl.generic) {
      const mat = mats.get(l.jobMaterialId) || mats.get(sl.jobMaterialIds[0]);
      if (!mat) { problems.push(PROBLEM_TEXT.line_stale_material); continue; }
      for (const p of sl.problems) problems.push(`${mat.name}: ${PROBLEM_TEXT[p] || p}`);
      if (l.quantity < 1) problems.push("Quantities must be 1 or more.");
      const cv = cover?.get(sl.bucketKey);
      if (cv && cv.placed + cv.exported + l.quantity > sl.quantity && !acknowledgeSurplus) {
        const left = Math.max(0, sl.quantity - cv.placed - cv.exported);
        problems.push(`${mat.name} — ${sl.item?.description || sl.unit}: ${cv.placed + cv.exported} of ${sl.quantity} are already on ${cv.refs.length ? cv.refs.join(", ") : "a placed order"}${cv.placed ? " (placed)" : " (exported)"} — only ${left} more needed. Reduce this line or remove it.`);
      }
      let g = items.get(mat.id);
      if (!g) {
        const mr = computed.materialResults?.[mat.id] || null;
        g = { materialId: mat.id, family: mat.spec?.family, materialName: mat.name, specText: describeFamilySpec(mat.spec), statuses: mr?.status || null, lines: [] };
        items.set(mat.id, g);
      }
      g.lines.push({ bucketKey: sl.bucketKey, unit: sl.unit, quantity: l.quantity, required: sl.quantity, description: sl.item?.description || sl.unit,
        finishedLengthMm: sl.finishedLengthMm ?? null, stockLengthMm: sl.item?.stockLengthMm ?? null, note: sl.item?.note || null, stale: st.stale, problem: sl.problems.length > 0 });
      continue;
    }
    // Print exactly what the bucket is: a material whose CURRENT spec key equals the bucket's.
    const mat = sl.jobMaterialIds.map((id) => mats.get(id)).find((m) => m && materialSpecKey(m) === sl.specKey);
    if (!mat) { problems.push(PROBLEM_TEXT.line_stale_material); continue; }
    for (const p of sl.problems) problems.push(PROBLEM_TEXT[p] || p);
    if (l.quantity < 1) problems.push("Quantities must be 1 or more.");
    const cv = cover?.get(sl.bucketKey);
    if (cv && cv.placed + cv.exported + l.quantity > sl.quantity && !acknowledgeSurplus) {
      const left = Math.max(0, sl.quantity - cv.placed - cv.exported);
      problems.push(`${mat.name} ${sl.finishedLengthMm.toLocaleString("en-AU")} mm: ${cv.placed + cv.exported} of ${sl.quantity} are already on ${cv.refs.length ? cv.refs.join(", ") : "a placed order"}${cv.placed ? " (placed)" : " (exported)"} — only ${left} more needed. Reduce this line or remove it.`);
    }
    let g = groups.get(sl.specKey);
    if (!g) {
      let dims = null;
      try { dims = mat.profile ? profileDimensionList(mat.profile) : null; } catch { problems.push(PROBLEM_TEXT.profile_invalid); }
      g = { specKey: sl.specKey, materialName: mat.name, spec: normaliseSpec(mat.spec), specText: describeSpec(mat.spec, mat.profile), profile: mat.profile, dimensions: dims, rules: normaliseFlashingRules(mat.rules),
        materialProblems: materialProblems(mat), lines: [] };
      groups.set(sl.specKey, g);
    }
    g.lines.push({ bucketKey: sl.bucketKey, stale: st.stale, finishedLengthMm: sl.finishedLengthMm, quantity: l.quantity, handlingFlag: sl.handlingFlag, ceilingExceeded: sl.ceilingExceeded });
  }
  // measurements of these materials that produced no pieces = unknown quantity → not ready (R04b R1)
  const specs = new Set([...groups.keys()]);
  for (const u of computed.unplaced || []) if (u.specKey && specs.has(u.specKey)) problems.push(`A measurement couldn't be turned into lengths (${(u.problems || []).map((p) => PROBLEM_TEXT[p] || p).join(" ")}) — fix or remove it.`);
  const groupList = [...groups.values()].sort((a, b) => a.materialName.localeCompare(b.materialName) || (a.specKey < b.specKey ? -1 : 1)).map((g, i) => {
    for (const p of g.materialProblems) problems.push(PROBLEM_TEXT[p] || p);
    g.lines.sort((a, b) => b.finishedLengthMm - a.finishedLengthMm);
    const totalMm = g.lines.reduce((a, l) => a + l.finishedLengthMm * l.quantity, 0);
    return { ...g, profileId: `P${i + 1}`, totalLm: Number((totalMm / 1000).toFixed(3)), pieces: g.lines.reduce((a, l) => a + l.quantity, 0) };
  });
  const itemList = [...items.values()].sort((a, b) => a.materialName.localeCompare(b.materialName) || (a.materialId < b.materialId ? -1 : 1)).map((g, i) => {
    const byUnit = {};
    for (const l of g.lines) byUnit[l.unit] = (byUnit[l.unit] || 0) + l.quantity;
    return { ...g, groupId: `M${i + 1}`, totals: { byUnit } };
  });
  const byUnitAll = {};
  for (const g of itemList) for (const [u, n] of Object.entries(g.totals.byUnit)) byUnitAll[u] = (byUnitAll[u] || 0) + n;
  // the site appendix travels in the same frozen snapshot (never part of the supplier order itself)
  const appendix = { aluminium: [], timber: [], layouts: [], flashingRuns: [] };
  for (const g of itemList) {
    const ap = computed.materialResults?.[g.materialId]?.appendix;
    if (!ap) continue;
    for (const k of ["aluminium", "timber", "layouts"]) for (const x of ap[k] || []) appendix[k].push({ ...x, materialName: g.materialName });
  }
  const usedDocIds = new Set();
  const usedCalIds = new Set();
  const lineKeys = new Set(lines.map((l) => l.bucketKey));
  for (const c of computed.contributions) {
    const sl = computed.scheduleLines.find((s) => s.contributionIds.includes(c.contributionId) && lineKeys.has(s.bucketKey));
    if (!sl) continue;
    const m = wsSnapshot.measurements.find((x) => x.id === c.measurementId);
    if (c.path && !sl.generic) {
      // continuous flashing run: site reference only (corners are site cuts/folds, never supplier bends)
      appendix.flashingRuns.push({ ref: `R-${String(c.measurementId).slice(0, 8)}`, materialName: mats.get(c.jobMaterialId)?.name || "Flashing",
        tightMm: c.path.tightTotalMm, cornersMm: c.path.cornersMm || [], splitsMm: c.path.splitsMm || [],
        pieces: (c.path.pieces || []).map((p) => ({ fromMm: p.fromMm, toMm: p.toMm, tightMm: p.tightMm, orderMm: p.orderMm })) });
    }
    if (m?.documentId) usedDocIds.add(m.documentId);
    if (m?.calibrationId) usedCalIds.add(m.calibrationId);
  }
  const snapshot = {
    schemaVersion: 2,
    specSchemaVersion: SPEC_SCHEMA_VERSION,
    calculationVersion: CALCULATION_VERSION,
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    rendererVersion,
    orderRef: order.orderRef,
    issuedOn: new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Adelaide" }), // YYYY-MM-DD, local (SA) date
    company: company ? { name: company.name, abn: company.abn || null, address: company.address || null, phone: company.phone || null, email: company.email || null } : { name: "Blue Leaf Building" },
    job: { label: jobLabel || null, owner: wsSnapshot.workspace.owner, takeoffName: wsSnapshot.workspace.name },
    supplier: supplier ? { id: supplier.id, name: supplier.name, contactName: supplier.contact_name || null, email: supplier.email || null, phone: supplier.phone || null, abn: supplier.abn || null } : null,
    delivery: d,
    notes: order.notes || null,
    groups: groupList,
    items: itemList,
    appendix,
    totals: {
      byUnit: byUnitAll,
      pieces: groupList.reduce((a, g) => a + g.pieces, 0),
      totalLm: Number((groupList.reduce((a, g) => a + g.totalLm * 1000, 0) / 1000).toFixed(3)),
      handlingFlags: groupList.reduce((a, g) => a + g.lines.filter((l) => l.handlingFlag).reduce((x, l) => x + l.quantity, 0), 0),
    },
    sources: {
      workspaceId: wsSnapshot.workspace.id,
      workspaceRevision: wsSnapshot.workspace.revision,
      orderId: order.id,
      orderRevision: order.revision,
      documents: wsSnapshot.documents.filter((x) => usedDocIds.has(x.id)).map((x) => ({ id: x.id, title: x.title, revisionLabel: x.revisionLabel, status: x.status, contentSha256: x.contentSha256 })),
      calibrations: wsSnapshot.calibrations.filter((x) => usedCalIds.has(x.id)).map((x) => ({ id: x.id, documentId: x.documentId, pageIndex: x.pageIndex, status: x.status, calibrationRevision: x.calibrationRevision, mode: x.mode })),
    },
  };
  return { snapshot, problems: [...new Set(problems)] };
}

export function snapshotHash(snapshot) {
  // Stable key order so the same frozen content always hashes the same.
  const stable = (v) => (v === null || typeof v !== "object" ? v : Array.isArray(v) ? v.map(stable) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])));
  return sha256(Buffer.from(JSON.stringify(stable(snapshot))));
}

export { sha256 };
export const _test = { mapDoc, mapCal, mapMeas, mapMat, mapContrib, makeBucketKey };

/** Guard used by commit/export: is a TakeoffValidationError? */
export const isValidation = (e) => e instanceof TakeoffValidationError;
