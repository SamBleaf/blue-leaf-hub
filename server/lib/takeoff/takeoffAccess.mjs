// =============================================================================
// takeoffAccess.mjs — two small auth adapters feeding ONE takeoff service.
//
// Staff  (Hub):        requireAuth + admin/supervisor. Admin/supervisor already see every job's
//                      plans (existing plan routes) — same job scope here.
// Worker (PWA):        existing workerAuth + workerVisibleJobs/workerMaySeeJob/charge-up parent
//                      checks (passed in from workforceRoutes so semantics are unchanged), plus a
//                      server-evaluated capability: leading hand (or a linked admin/supervisor
//                      login) may PREPARE; ordinary workers get no takeoff access; admin preview
//                      is read-only for EVERY takeoff write (no reorder-style exception).
//
// Capabilities are computed here and returned to the UI. Never trust a body/UI role.
// Actor identity keeps auth users and employees distinct (employee ids never go into an
// auth.users FK).
// =============================================================================
import { TakeoffHttpError } from "./takeoffErrors.mjs";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID_RX.test(v);

export function takeoffEnabled() {
  return String(process.env.TAKEOFF_ENABLED || "").trim().toLowerCase() === "true";
}

export const JOB_TYPES = Object.freeze(["carpentry", "project", "charge-up"]);

/** Owner columns for a resolved job. */
export function ownerColumns(owner) {
  return {
    job_id: owner.jobId || null,
    carpentry_job_id: owner.carpentryJobId || null,
    charge_up_job_id: owner.chargeUpJobId || null,
  };
}

export function ownerFromRow(row) {
  if (row.charge_up_job_id) return { chargeUpJobId: row.charge_up_job_id };
  if (row.carpentry_job_id) return { carpentryJobId: row.carpentry_job_id };
  return { jobId: row.job_id };
}

/** Apply the owner filter to a query on a table with owner columns. */
export function scopeQuery(q, owner) {
  if (owner.chargeUpJobId) return q.eq("charge_up_job_id", owner.chargeUpJobId);
  if (owner.carpentryJobId) return q.eq("carpentry_job_id", owner.carpentryJobId);
  return q.eq("job_id", owner.jobId);
}

/** job_documents scope: same spine only (a carpentry doc is not a charge-up doc). */
export function docInOwner(doc, owner) {
  if (!doc) return false;
  if (owner.chargeUpJobId) return doc.charge_up_job_id === owner.chargeUpJobId;
  if (owner.carpentryJobId) return doc.carpentry_job_id === owner.carpentryJobId && !doc.charge_up_job_id;
  return !!owner.jobId && doc.job_id === owner.jobId && !doc.carpentry_job_id && !doc.charge_up_job_id;
}

/**
 * Resolve a route job reference to its single owner FK. Project entry resolves to jobs; a
 * project without a linked job is an actionable 409 (never a shadow job).
 */
export async function resolveJobRef(sb, jobType, jobId) {
  if (!JOB_TYPES.includes(jobType)) throw new TakeoffHttpError(400, "Unknown job type.", "INVALID");
  if (!isUuid(jobId)) throw new TakeoffHttpError(400, "Invalid job id.", "INVALID");
  if (jobType === "carpentry") {
    const { data, error } = await sb.from("carpentry_jobs").select("id, address, client_name, status").eq("id", jobId).maybeSingle();
    if (error) throw error;
    if (!data) throw new TakeoffHttpError(404, "Job not found.", "NOT_FOUND");
    return { owner: { carpentryJobId: data.id }, jobType, routeId: jobId, label: data.client_name ? `${data.address} (${data.client_name})` : data.address };
  }
  if (jobType === "project") {
    const { data, error } = await sb.from("projects").select("id, job_id, address").eq("id", jobId).maybeSingle();
    if (error) throw error;
    if (!data) throw new TakeoffHttpError(404, "Project not found.", "NOT_FOUND");
    if (!data.job_id) throw new TakeoffHttpError(409, "This project has no linked job to hold takeoffs. Link the project to its job first.", "NO_LINKED_JOB");
    return { owner: { jobId: data.job_id }, jobType, routeId: jobId, label: data.address };
  }
  const { data, error } = await sb.from("charge_up_jobs").select("id, carpentry_job_id, status, address").eq("id", jobId).maybeSingle();
  if (error) throw error;
  if (!data) throw new TakeoffHttpError(404, "Site not found.", "NOT_FOUND");
  return { owner: { chargeUpJobId: data.id }, jobType, routeId: jobId, parentCarpentryJobId: data.carpentry_job_id, label: data.address || "Charge-up site" };
}

// ── Staff adapter ─────────────────────────────────────────────────────────────

export function staffCapabilities(caller) {
  const role = caller?.role;
  const staff = role === "admin" || role === "supervisor";
  return {
    view: staff,
    edit: staff,
    export: staff,
    editStandards: staff,
    addSuppliers: staff,       // HUB 008: office staff add a supplier from the order
    saveCompanyDefaults: staff, // HUB 014: office staff save a product's company cladding default
    placeOrders: role === "admin",
    viewSupplierContacts: staff,
    isPreview: false,
  };
}

export function staffActor(caller) {
  return { type: "staff", userId: caller.id, employeeId: null };
}

/** Staff may act on any existing job (same scope as the existing staff plan routes). */
export async function staffMayAccessOwner() {
  return true;
}

// ── Worker adapter ────────────────────────────────────────────────────────────

/**
 * @param {object} emp            req.workerEmployee (active employee row)
 * @param {boolean} isPreview     req.workerPreview
 * @param {string|null} linkedRole Hub role of the employee's linked login (admin/supervisor/employee/null)
 */
export function workerCapabilities(emp, isPreview, linkedRole) {
  const preparer = !!emp && emp.is_active !== false && (!!emp?.is_leading_hand || linkedRole === "admin" || linkedRole === "supervisor");
  return {
    view: preparer,
    edit: preparer && !isPreview,
    export: preparer && !isPreview,
    editStandards: false,      // company standards are a staff action
    // HUB 008: office staff using the Worker app (a login linked to an Admin / Supervisor account) add suppliers too
    addSuppliers: preparer && !isPreview && (linkedRole === "admin" || linkedRole === "supervisor"),
    // HUB 014: the same office logins save a product's company cladding default (never a flashing standard)
    saveCompanyDefaults: preparer && !isPreview && (linkedRole === "admin" || linkedRole === "supervisor"),
    placeOrders: false,        // recording a placed order is admin-only (staff route)
    // Leading hands send the supplier PDF themselves, so they see the supplier's order contact
    // (name/email/phone) — the same details printed on that PDF. Never account terms or notes.
    viewSupplierContacts: preparer,
    isPreview: !!isPreview,
  };
}

export function workerActor(emp) {
  return { type: "employee", userId: null, employeeId: emp.id };
}

/**
 * Worker visibility of an owner, reusing workforceRoutes' helpers.
 * @param {{workerVisibleJobs:Function, workerMaySeeJob:Function, workerChargeUpSiteParent:Function}} h
 */
export async function workerMayAccessOwner(sb, h, emp, owner) {
  const vis = await h.workerVisibleJobs(sb, emp.id);
  if (vis.error) throw vis.error;
  if (owner.chargeUpJobId) return !!(await h.workerChargeUpSiteParent(sb, vis, owner.chargeUpJobId));
  if (owner.carpentryJobId) return h.workerMaySeeJob(vis, owner.carpentryJobId, "carpentry");
  if (owner.jobId && vis.projectIds?.size) {
    const { data, error } = await sb.from("projects").select("id").eq("job_id", owner.jobId).in("id", [...vis.projectIds]);
    if (error) throw error;
    return (data || []).length > 0;
  }
  return false;
}
