// =============================================================================
// takeoffRoutes.mjs — HTTP surface for takeoffs. One route table, two auth adapters:
//
//   Staff  /api/takeoff/...          requireAuth + admin/supervisor   (registerTakeoffRoutes)
//   Worker /api/worker/takeoff/...   workerAuth + leading-hand capability (registerTakeoffWorkerRoutes,
//                                    called from inside registerWorkforceRoutes so the existing
//                                    worker auth/visibility helpers are reused unchanged)
//
// Everything is behind TAKEOFF_ENABLED (default off) except GET .../capabilities, which reports
// enabled:false so the UI can hide the entry. Recording a placed order is staff/admin only.
// =============================================================================
import { requireAuth, requireRole } from "../requireAuth.mjs";
import { getServiceSupabase } from "../supabaseService.mjs";
import { ok, err } from "../apiResponse.mjs";
import { DEFAULT_SUPPLIER_NAME_HINT } from "../../../shared/takeoff/index.js";
import { TakeoffHttpError, sendTakeoffError } from "./takeoffErrors.mjs";
import {
  takeoffEnabled, resolveJobRef, staffCapabilities, staffActor, workerCapabilities, workerActor, workerMayAccessOwner,
  ownerFromRow, isUuid,
} from "./takeoffAccess.mjs";
import {
  PLAN_DOC_TYPES, RENDER_LIMIT_BYTES, listWorkspaces, createWorkspace, getWorkspaceRow, loadSnapshotFresh, commitWorkspace,
  listOwnerPlans, listPresets, savePreset, listOrders, createOrder, saveOrder, getOrderRow, scheduleStatus, otherOrderCover, sha256,
} from "./takeoffService.mjs";
import { cancelPlacement, createExport, exportPdfBytes, finishArtifact, placeOrder, previewExport } from "./takeoffExport.mjs";
import { renderSiteAppendixPdf } from "./takeoffPdf.mjs";

const DISABLED = { status: 404, message: "Takeoffs aren't switched on yet.", code: "FEATURE_DISABLED" };

function gate(req, res, next) {
  if (!takeoffEnabled()) return err(res, DISABLED.status, DISABLED.message, DISABLED.code);
  return next();
}

/** Delivery address for a job (address only — never the client name). */
async function ownerAddress(sb, owner) {
  if (owner.carpentryJobId) return (await sb.from("carpentry_jobs").select("address").eq("id", owner.carpentryJobId).maybeSingle()).data?.address || null;
  if (owner.chargeUpJobId) return (await sb.from("charge_up_jobs").select("address").eq("id", owner.chargeUpJobId).maybeSingle()).data?.address || null;
  return (await sb.from("projects").select("address").eq("job_id", owner.jobId).limit(1).maybeSingle()).data?.address || null;
}

async function ownerLabel(sb, owner) {
  if (owner.carpentryJobId) {
    const { data } = await sb.from("carpentry_jobs").select("address, client_name").eq("id", owner.carpentryJobId).maybeSingle();
    return data ? (data.client_name ? `${data.address} (${data.client_name})` : data.address) : null;
  }
  if (owner.chargeUpJobId) {
    const { data } = await sb.from("charge_up_jobs").select("address").eq("id", owner.chargeUpJobId).maybeSingle();
    return data?.address || "Charge-up site";
  }
  const { data } = await sb.from("projects").select("address").eq("job_id", owner.jobId).limit(1).maybeSingle();
  return data?.address || null;
}

// ── Adapters ──────────────────────────────────────────────────────────────────
function staffAdapter() {
  return {
    kind: "staff",
    middleware: [requireAuth, requireRole("admin", "supervisor")],
    async context(req, sb, owner) {
      void sb; void owner;
      // actorKey scopes the device-local recovery store; it is an id, not a credential.
      return { caps: { ...staffCapabilities(req.caller), actorKey: `staff:${req.caller.id}` }, actor: staffActor(req.caller) };
    },
  };
}

function workerAdapter(h) {
  return {
    kind: "worker",
    middleware: [h.workerAuth],
    async context(req, sb, owner) {
      const emp = req.workerEmployee || (req.caller ? await h.resolveWorkerEmployee(req.caller.id, sb) : null);
      if (!emp) throw new TakeoffHttpError(403, "No employee record found.", "FORBIDDEN");
      let linkedRole = null;
      if (emp.user_id) {
        const { data } = await sb.from("user_profiles").select("role").eq("id", emp.user_id).maybeSingle();
        linkedRole = data?.role || null;
      }
      const caps = { ...workerCapabilities(emp, !!req.workerPreview, linkedRole), actorKey: `${req.workerPreview ? "preview" : "employee"}:${emp.id}` };
      if (owner && !(await workerMayAccessOwner(sb, h, emp, owner))) throw new TakeoffHttpError(403, "You don't have access to this job.", "FORBIDDEN");
      return { caps, actor: workerActor(emp), emp };
    },
  };
}

// ── Route table ───────────────────────────────────────────────────────────────
function mount(app, P, adapter) {
  const mw = adapter.middleware;
  const sbOr503 = (res) => { const sb = getServiceSupabase(); if (!sb) { err(res, 503, "Database not configured"); return null; } return sb; };
  const requireView = (ctx) => { if (!ctx.caps.view) throw new TakeoffHttpError(403, "Takeoffs are for leading hands and office staff.", "FORBIDDEN"); };
  const requireEdit = (req, ctx) => {
    requireView(ctx);
    if (ctx.caps.isPreview || req.workerPreview) throw new TakeoffHttpError(403, "Read-only preview — you can't change takeoffs as a worker.", "PREVIEW");
    if (!ctx.caps.edit) throw new TakeoffHttpError(403, "You can view this takeoff but not change it.", "FORBIDDEN");
  };
  const wrap = (fn) => async (req, res) => {
    const sb = sbOr503(res); if (!sb) return;
    try { await fn(req, res, sb); } catch (e) { sendTakeoffError(res, e, `[takeoff ${adapter.kind} ${req.method} ${req.route?.path}]`); }
  };
  const wsCtx = async (req, sb, id) => {
    const row = await getWorkspaceRow(sb, id);
    const owner = ownerFromRow(row);
    const ctx = await adapter.context(req, sb, owner);
    requireView(ctx);
    return { ...ctx, owner, ws: row };
  };
  const orderCtx = async (req, sb, orderId) => {
    const orderRow = await getOrderRow(sb, orderId);
    const ctx = await wsCtx(req, sb, orderRow.workspace_id);
    return { ...ctx, orderRow };
  };

  // Capabilities — available even when the feature flag is off (UI hides the entry).
  app.get(`${P}/capabilities`, ...mw, wrap(async (req, res, sb) => {
    if (!takeoffEnabled()) return ok(res, { enabled: false, capabilities: null });
    let owner = null;
    if (req.query.jobType && req.query.jobId) owner = (await resolveJobRef(sb, String(req.query.jobType), String(req.query.jobId))).owner;
    const ctx = await adapter.context(req, sb, owner);
    return ok(res, { enabled: true, capabilities: ctx.caps });
  }));

  app.get(`${P}/jobs/:jobType/:jobId`, ...mw, gate, wrap(async (req, res, sb) => {
    const job = await resolveJobRef(sb, req.params.jobType, req.params.jobId);
    const ctx = await adapter.context(req, sb, job.owner);
    requireView(ctx);
    const [workspaces, plans] = await Promise.all([listWorkspaces(sb, job.owner), listOwnerPlans(sb, job.owner)]);
    return ok(res, { job: { jobType: job.jobType, jobId: job.routeId, label: job.label }, workspaces, plans, capabilities: ctx.caps });
  }));

  app.post(`${P}/jobs/:jobType/:jobId/workspaces`, ...mw, gate, wrap(async (req, res, sb) => {
    const job = await resolveJobRef(sb, req.params.jobType, req.params.jobId);
    const ctx = await adapter.context(req, sb, job.owner);
    requireEdit(req, ctx);
    const workspace = await createWorkspace(sb, { ...ctx, owner: job.owner }, req.body || {});
    return ok(res, { workspace });
  }));

  app.get(`${P}/workspaces/:id`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await wsCtx(req, sb, req.params.id);
    const { snapshot } = await loadSnapshotFresh(sb, ctx.ws.id);
    const { computed, status } = await scheduleStatus(sb, snapshot);
    return ok(res, { snapshot, computed, orderStatus: status, capabilities: ctx.caps, jobLabel: await ownerLabel(sb, ctx.owner), jobAddress: await ownerAddress(sb, ctx.owner) });
  }));

  app.post(`${P}/workspaces/:id/commit`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await wsCtx(req, sb, req.params.id);
    requireEdit(req, ctx);
    const result = await commitWorkspace(sb, ctx, req.body || {});
    const { status } = await scheduleStatus(sb, result.snapshot);
    return ok(res, { commit: { revision: result.revision, replayed: result.replayed }, snapshot: result.snapshot, computed: result.computed, orderStatus: status });
  }));

  // Plan bytes for the in-app viewer: fetched once per open, authorised every time, never a
  // persisted signed URL. Larger than the takeoff envelope → 413 so the UI offers the device viewer.
  app.get(`${P}/documents/:docId/content`, ...mw, gate, wrap(async (req, res, sb) => {
    if (!isUuid(req.params.docId)) throw new TakeoffHttpError(400, "Invalid plan.", "INVALID");
    const { data: doc, error } = await sb.from("job_documents").select("*").eq("id", req.params.docId).maybeSingle();
    if (error) throw error;
    if (!doc || doc.storage_provider !== "supabase" || !doc.storage_path || !PLAN_DOC_TYPES.includes(doc.document_type)) {
      throw new TakeoffHttpError(404, "Plan not available.", "NOT_FOUND");
    }
    const ctx = await adapter.context(req, sb, ownerFromRow(doc));
    requireView(ctx);
    if (doc.byte_size && doc.byte_size > RENDER_LIMIT_BYTES) throw new TakeoffHttpError(413, "This plan is too large to measure in the app. Open it in your device viewer instead.", "TOO_LARGE");
    const [bucket, ...rest] = doc.storage_path.split("/");
    if (!doc.byte_size) {
      // Legacy upload without a recorded size: check the object's size before pulling it into memory.
      const path = rest.join("/"), dir = path.split("/").slice(0, -1).join("/"), name = path.split("/").pop();
      const { data: listed } = await sb.storage.from(bucket).list(dir, { search: name, limit: 5 }).catch(() => ({ data: null }));
      const size = listed?.find?.((f) => f.name === name)?.metadata?.size;
      if (size && size > RENDER_LIMIT_BYTES) throw new TakeoffHttpError(413, "This plan is too large to measure in the app. Open it in your device viewer instead.", "TOO_LARGE");
    }
    const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(rest.join("/"));
    if (dlErr) throw new TakeoffHttpError(502, "Couldn't download the plan. Try again.", "DOWNLOAD_FAILED");
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.length > RENDER_LIMIT_BYTES) throw new TakeoffHttpError(413, "This plan is too large to measure in the app. Open it in your device viewer instead.", "TOO_LARGE");
    const servedSha = sha256(buf);
    if (doc.content_sha256 && servedSha !== doc.content_sha256) throw new TakeoffHttpError(500, "The stored plan doesn't match its record — re-upload it.", "INTEGRITY");
    if (!doc.content_sha256) {
      // Plans uploaded before migration 206 have no recorded hash. Anchor them on first open (one-time,
      // NULL → hash only — the identity trigger then keeps them fixed) so calibrations made on these
      // existing plans are tied to exactly these bytes.
      const { error: anchorErr } = await sb.from("job_documents").update({ content_sha256: servedSha, byte_size: buf.length }).eq("id", doc.id).is("content_sha256", null);
      if (anchorErr) console.warn("[takeoff] legacy plan anchor skipped", doc.id, anchorErr.message);
    }
    // Measurements are anchored to the bytes that were calibrated: never serve different bytes under them.
    const { data: calShas } = await sb.from("takeoff_calibrations").select("content_sha256").eq("document_id", doc.id);
    if ((calShas || []).some((c) => c.content_sha256 && c.content_sha256 !== servedSha)) {
      throw new TakeoffHttpError(500, "This plan's file no longer matches the one that was scaled — re-upload the plan as a new revision.", "INTEGRITY");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Document-Status", doc.status);
    return res.end(buf);
  }));

  app.get(`${P}/presets`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await adapter.context(req, sb, null);
    requireView(ctx);
    const presets = await listPresets(sb, { includeInactive: ctx.caps.editStandards && req.query.includeInactive === "1" });
    return ok(res, { presets });
  }));

  app.get(`${P}/suppliers`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await adapter.context(req, sb, null);
    requireView(ctx);
    const cols = ctx.caps.viewSupplierContacts ? "id, name, contact_name, email, phone, is_active, is_preferred" : "id, name, is_active";
    let { data, error } = await sb.from("suppliers").select(cols).eq("is_active", true).order("name", { ascending: true });
    if (error && /is_preferred/.test(error.message || "")) ({ data, error } = await sb.from("suppliers").select(cols.replace(", is_preferred", "")).eq("is_active", true).order("name", { ascending: true }));
    if (error) throw error;
    const suppliers = (data || []).map((s) => ({ id: s.id, name: s.name, contactName: s.contact_name ?? undefined, email: s.email ?? undefined, phone: s.phone ?? undefined }));
    const hint = suppliers.find((s) => s.name?.toLowerCase().startsWith(DEFAULT_SUPPLIER_NAME_HINT.toLowerCase()));
    return ok(res, { suppliers, defaultSupplierId: hint?.id || null });
  }));

  app.get(`${P}/workspaces/:id/orders`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await wsCtx(req, sb, req.params.id);
    const orders = await listOrders(sb, ctx.ws.id);
    const { snapshot } = await loadSnapshotFresh(sb, ctx.ws.id);
    const { computed, status } = await scheduleStatus(sb, snapshot);
    // pieces already on an exported (sent-able) order that isn't recorded placed yet — a new order must not repeat them
    const cover = await otherOrderCover(sb, ctx.ws.id, null);
    const withCover = status.map((x) => { const c = cover.get(x.bucketKey); return { ...x, onExportedOrders: c?.exported || 0, exportedRefs: c?.refs || [] }; });
    return ok(res, { orders, orderStatus: withCover, scheduleLines: computed.scheduleLines, unplaced: computed.unplaced, workspaceRevision: snapshot.workspace.revision });
  }));

  app.post(`${P}/workspaces/:id/orders`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await wsCtx(req, sb, req.params.id);
    requireEdit(req, ctx);
    if (!ctx.caps.export) throw new TakeoffHttpError(403, "You can't prepare orders.", "FORBIDDEN");
    return ok(res, { order: await createOrder(sb, ctx, req.body || {}) });
  }));

  app.patch(`${P}/orders/:orderId`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await orderCtx(req, sb, req.params.orderId);
    requireEdit(req, ctx);
    return ok(res, { result: await saveOrder(sb, ctx, ctx.orderRow, req.body || {}) });
  }));

  app.get(`${P}/orders/:orderId/preview`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await orderCtx(req, sb, req.params.orderId);
    const p = await previewExport(sb, ctx, ctx.orderRow, await ownerLabel(sb, ctx.owner));
    if (!ctx.caps.viewSupplierContacts && p.snapshot.supplier) p.snapshot.supplier = { id: p.snapshot.supplier.id, name: p.snapshot.supplier.name };
    return ok(res, { preview: p });
  }));

  app.post(`${P}/orders/:orderId/exports`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await orderCtx(req, sb, req.params.orderId);
    requireEdit(req, ctx);
    return ok(res, { export: await createExport(sb, ctx, ctx.orderRow, req.body || {}, await ownerLabel(sb, ctx.owner)) });
  }));

  const exportCtx = async (req, sb, exportId) => {
    if (!isUuid(exportId)) throw new TakeoffHttpError(400, "Invalid export.", "INVALID");
    const { data: ex, error } = await sb.from("takeoff_exports").select("*").eq("id", exportId).maybeSingle();
    if (error) throw error;
    if (!ex) throw new TakeoffHttpError(404, "Export not found.", "NOT_FOUND");
    const ctx = await orderCtx(req, sb, ex.order_id);
    return { ...ctx, ex };
  };

  app.post(`${P}/exports/:exportId/retry`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await exportCtx(req, sb, req.params.exportId);
    requireEdit(req, ctx);
    if (!ctx.caps.export) throw new TakeoffHttpError(403, "You can't export orders.", "FORBIDDEN");
    return ok(res, { export: await finishArtifact(sb, ctx, ctx.ex.id) });
  }));

  app.get(`${P}/exports/:exportId/pdf`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await exportCtx(req, sb, req.params.exportId);
    const buf = await exportPdfBytes(sb, ctx.ex);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="${ctx.orderRow.order_ref}-export-${ctx.ex.export_no}${ctx.ex.is_draft ? "-draft" : ""}.pdf"`);
    return res.end(buf);
  }));

  // site appendix (cutting/setout) — rendered from the SAME frozen snapshot, never part of the supplier PDF
  app.get(`${P}/exports/:exportId/appendix`, ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await exportCtx(req, sb, req.params.exportId);
    const buf = await renderSiteAppendixPdf(ctx.ex.snapshot, { exportNo: ctx.ex.export_no, snapshotSha256: ctx.ex.snapshot_sha256 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="${ctx.orderRow.order_ref}-export-${ctx.ex.export_no}-site-appendix.pdf"`);
    return res.end(buf);
  }));

  return { wrap, orderCtx, wsCtx };
}

/** Staff routes (Hub). Registered from dev-api.mjs. */
export function registerTakeoffRoutes(app) {
  const adapter = staffAdapter();
  const { wrap, orderCtx } = mount(app, "/api/takeoff", adapter);
  const mw = adapter.middleware;

  app.post("/api/takeoff/presets", ...mw, gate, wrap(async (req, res, sb) => {
    const ctx = await adapter.context(req, sb, null);
    return ok(res, { preset: await savePreset(sb, ctx, req.body || {}) });
  }));

  // Recording a placed order is admin-only (requireRole + capability), never via the worker app.
  app.post("/api/takeoff/orders/:orderId/placements", requireAuth, requireRole("admin"), gate, wrap(async (req, res, sb) => {
    const ctx = await orderCtx(req, sb, req.params.orderId);
    return ok(res, { placement: await placeOrder(sb, ctx, ctx.orderRow, req.body || {}) });
  }));

  app.post("/api/takeoff/placements/:placementId/cancel", requireAuth, requireRole("admin"), gate, wrap(async (req, res, sb) => {
    if (!isUuid(req.params.placementId)) throw new TakeoffHttpError(400, "Invalid placement.", "INVALID");
    const { data: p, error } = await sb.from("takeoff_placements").select("order_id").eq("id", req.params.placementId).maybeSingle();
    if (error) throw error;
    if (!p) throw new TakeoffHttpError(404, "Placement not found.", "NOT_FOUND");
    const ctx = await orderCtx(req, sb, p.order_id);
    return ok(res, { placement: await cancelPlacement(sb, ctx, req.params.placementId, req.body?.reason) });
  }));

  console.log("[takeoff] staff routes registered" + (takeoffEnabled() ? "" : " (TAKEOFF_ENABLED is off)"));
}

/**
 * Worker routes (PWA). Called from inside registerWorkforceRoutes with its existing helpers:
 * { workerAuth, resolveWorkerEmployee, workerVisibleJobs, workerMaySeeJob, workerChargeUpSiteParent }.
 */
export function registerTakeoffWorkerRoutes(app, helpers) {
  mount(app, "/api/worker/takeoff", workerAdapter(helpers));
}
