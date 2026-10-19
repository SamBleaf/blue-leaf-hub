// =============================================================================
// takeoffExport.mjs — frozen supplier-order exports and externally-placed order records.
//
// Export:  (1) read workspace + order at known revisions, (2) build the frozen snapshot and
//          check readiness, (3) RPC freezes it atomically after re-checking the source
//          revisions and supplier under lock (pending artifact), (4) render + upload OUTSIDE
//          the transaction, (5) register the PDF as a private job_documents row, (6) mark ready.
//          Failure → artifact 'failed', retryable; a download link only exists once ready.
//          An export NEVER changes ordered quantities and never claims anything was sent.
// Placement (admin): record "Placed externally" against one ready, order-ready export, with
//          allocations to stable contributions; over-allocation is rejected in the RPC.
// =============================================================================
import crypto from "crypto";
import { computeWorkspace, contributionPiecesForBucket } from "../../../shared/takeoff/index.js";
import { TakeoffHttpError } from "./takeoffErrors.mjs";
import { ownerColumns, isUuid } from "./takeoffAccess.mjs";
import {
  EXPORTS_BUCKET, buildExportSnapshot, loadCommitments, loadSnapshotFresh, otherOrderCover, sha256, snapshotHash,
} from "./takeoffService.mjs";
import { RENDERER_VERSION, renderSupplierOrderPdf } from "./takeoffPdf.mjs";

async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
const todayYmd = () => new Date().toISOString().slice(0, 10);

async function loadOrderBundle(sb, orderRow) {
  const lines = await q(sb.from("takeoff_order_lines").select("*").eq("order_id", orderRow.id));
  const supplier = orderRow.supplier_id
    ? await q(sb.from("suppliers").select("id, name, email, phone, contact_name, abn, is_active, updated_at").eq("id", orderRow.supplier_id).maybeSingle())
    : null;
  // newest company row — the freeze compares against max(updated_at)
  const company = await q(sb.from("company_profile").select("name, abn, address, phone, email, updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle());
  return {
    order: { id: orderRow.id, orderRef: orderRow.order_ref, delivery: orderRow.delivery || {}, notes: orderRow.notes, revision: orderRow.revision, status: orderRow.status, category: orderRow.category || null },
    // unit + item travel with the line: generic (TC-R04) staleness and wording depend on them
    lines: lines.map((l) => ({ bucketKey: l.bucket_key, specKey: l.spec_key, jobMaterialId: l.job_material_id, finishedLengthMm: l.finished_length_mm, quantity: l.quantity,
      unit: l.unit || "piece", item: l.item || null })),
    supplier, company,
  };
}

/** Preview readiness without freezing anything. */
export async function previewExport(sb, ctx, orderRow, jobLabel) {
  const { snapshot: wsSnapshot } = await loadSnapshotFresh(sb, orderRow.workspace_id);
  const b = await loadOrderBundle(sb, orderRow);
  const cover = await otherOrderCover(sb, orderRow.workspace_id, orderRow.id);
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot, ...b, jobLabel, rendererVersion: RENDERER_VERSION, cover });
  return { snapshot, problems, workspaceRevision: wsSnapshot.workspace.revision, orderRevision: orderRow.revision };
}

/**
 * Create a frozen export (draft or order-ready) and render its PDF.
 * body: { isDraft, idempotencyKey, expectedOrderRevision, expectedWorkspaceRevision }
 */
export async function createExport(sb, ctx, orderRow, body, jobLabel) {
  if (!ctx.caps.export) throw new TakeoffHttpError(403, "You can't export orders.", "FORBIDDEN");
  const isDraft = body?.isDraft !== false;
  const idem = typeof body?.idempotencyKey === "string" && body.idempotencyKey.length >= 8 ? body.idempotencyKey.slice(0, 120) : null;
  if (!idem) throw new TakeoffHttpError(400, "Missing export key — refresh and try again.", "INVALID");
  // A retried request with the same key returns the original export (and retries its artifact).
  const prior = await q(sb.from("takeoff_idempotency").select("operation, result").eq("scope_id", orderRow.id).eq("key", idem).maybeSingle());
  if (prior) {
    if (prior.operation !== "export") throw new TakeoffHttpError(400, "That export key was used for something else.", "INVALID");
    return await finishArtifact(sb, ctx, prior.result.exportId);
  }
  const { snapshot: wsSnapshot } = await loadSnapshotFresh(sb, orderRow.workspace_id);
  const b = await loadOrderBundle(sb, orderRow);
  if (Number(body.expectedOrderRevision) !== orderRow.revision || Number(body.expectedWorkspaceRevision) !== wsSnapshot.workspace.revision) {
    throw new TakeoffHttpError(409, "The takeoff or order changed — review the latest version, then export again.", "CONFLICT");
  }
  const cover = await otherOrderCover(sb, orderRow.workspace_id, orderRow.id);
  // ordering MORE than is still needed (spares) must be chosen explicitly (R04b R7)
  const acknowledgeSurplus = body?.acknowledgeSurplus === true;
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot, ...b, jobLabel, rendererVersion: RENDERER_VERSION, cover, acknowledgeSurplus });
  if (acknowledgeSurplus) snapshot.surplusAcknowledged = true;
  if (!isDraft && problems.length) {
    throw new TakeoffHttpError(400, `Not ready to order: ${problems.join(" ")}`, "NOT_READY");
  }
  if (!isDraft && wsSnapshot.workspace.state === "needs_review") {
    throw new TakeoffHttpError(400, "Not ready to order: a plan used by this takeoff changed. Review the takeoff first.", "NOT_READY");
  }
  snapshot.isDraft = isDraft;
  snapshot.readinessProblems = problems;
  const hash = snapshotHash(snapshot);
  const { data, error } = await sb.rpc("takeoff_create_export", {
    p_order_id: orderRow.id, p_expected_order_revision: orderRow.revision, p_expected_workspace_revision: wsSnapshot.workspace.revision,
    p_supplier_updated_at: b.supplier?.updated_at || null, p_is_draft: isDraft, p_snapshot: snapshot, p_snapshot_sha256: hash,
    p_calculation_version: snapshot.calculationVersion, p_profile_schema_version: snapshot.profileSchemaVersion, p_actor: ctx.actor,
    p_idempotency_key: idem, p_company_updated_at: b.company?.updated_at || null,
  });
  if (error) throw error;
  return await finishArtifact(sb, ctx, data.exportId);
}

/**
 * Render + upload + register for a pending/failed export. Idempotent and race-safe: every attempt
 * writes its OWN object path (never upsert), the "ready" update only applies while the export is
 * not yet ready, and an attempt that loses a race removes only its own object + document row.
 */
export async function finishArtifact(sb, ctx, exportId) {
  if (!isUuid(exportId)) throw new TakeoffHttpError(400, "Invalid export.", "INVALID");
  const ex = await q(sb.from("takeoff_exports").select("*").eq("id", exportId).maybeSingle());
  if (!ex) throw new TakeoffHttpError(404, "Export not found.", "NOT_FOUND");
  const done = (row) => ({ exportId: row.id, exportNo: row.export_no, artifactStatus: "ready", isDraft: row.is_draft });
  if (ex.artifact_status === "ready") return done(ex);
  const order = await q(sb.from("takeoff_orders").select("*").eq("id", ex.order_id).maybeSingle());
  const ws = await q(sb.from("takeoff_workspaces").select("*").eq("id", order.workspace_id).maybeSingle());
  let uploadedPath = null, docId = null;
  const cleanup = async () => {
    if (docId) await sb.from("job_documents").delete().eq("id", docId);
    if (uploadedPath) await sb.storage.from(EXPORTS_BUCKET).remove([uploadedPath]).catch(() => {});
  };
  try {
    const pdf = await renderSupplierOrderPdf(ex.snapshot, { exportNo: ex.export_no, isDraft: ex.is_draft, snapshotSha256: ex.snapshot_sha256 });
    const pdfSha = sha256(pdf);
    const owner = ws.charge_up_job_id ? `charge-up/${ws.charge_up_job_id}` : ws.carpentry_job_id ? `carpentry/${ws.carpentry_job_id}` : `job/${ws.job_id}`;
    const attempt = crypto.randomUUID().slice(0, 8);
    const fileName = `${todayYmd()}-${order.order_ref.toLowerCase()}-e${ex.export_no}${ex.is_draft ? "-draft" : ""}-${attempt}.pdf`;
    const path = `${owner}/${fileName}`;
    const { error: upErr } = await sb.storage.from(EXPORTS_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (upErr) throw upErr;
    uploadedPath = path;
    const docRow = {
      ...ownerColumns(ws.charge_up_job_id ? { chargeUpJobId: ws.charge_up_job_id } : ws.carpentry_job_id ? { carpentryJobId: ws.carpentry_job_id } : { jobId: ws.job_id }),
      document_type: "purchase_order", direction: "outbound", source: "generated",
      title: `${order.order_ref} ${(ex.snapshot?.items || []).length ? "material" : "flashing"} order${ex.is_draft ? " (draft)" : ""} — export ${ex.export_no}`,
      template_key: "takeoff_supplier_order", template_version: RENDERER_VERSION,
      storage_provider: "supabase", storage_path: `${EXPORTS_BUCKET}/${path}`, audience_layer: "management", status: "current",
      content_sha256: pdfSha, byte_size: pdf.length,
      uploaded_by: ctx.actor.userId || null,
    };
    const { data: doc, error: docErr } = await sb.from("job_documents").insert(docRow).select("id").single();
    if (docErr) throw docErr;
    docId = doc.id;
    // Only a not-yet-ready export can take this artifact (row lock + re-check under READ COMMITTED).
    const { data: claimed, error: updErr } = await sb.from("takeoff_exports").update({
      artifact_status: "ready", artifact_error: null, pdf_document_id: doc.id, pdf_sha256: pdfSha, renderer_version: RENDERER_VERSION,
    }).eq("id", ex.id).neq("artifact_status", "ready").select("id");
    if (updErr) throw updErr;
    if (!claimed?.length) {
      // Another attempt finished first: keep its artifact, discard ours.
      await cleanup();
      const now = await q(sb.from("takeoff_exports").select("*").eq("id", ex.id).maybeSingle());
      return done(now);
    }
    return done(ex);
  } catch (e) {
    console.error("[takeoff export render]", e?.message || e);
    await cleanup();
    await sb.from("takeoff_exports").update({ artifact_status: "failed", artifact_error: "The PDF could not be created. Try again." }).eq("id", ex.id).neq("artifact_status", "ready");
    const now = await q(sb.from("takeoff_exports").select("artifact_status, id, export_no, is_draft").eq("id", ex.id).maybeSingle());
    if (now?.artifact_status === "ready") return done(now);
    throw new TakeoffHttpError(502, "The order was frozen but its PDF could not be created. Use Retry PDF — nothing was sent or placed.", "ARTIFACT_FAILED");
  }
}

/** Stream a ready export's PDF bytes. */
export async function exportPdfBytes(sb, exportRow) {
  if (exportRow.artifact_status !== "ready" || !exportRow.pdf_document_id) throw new TakeoffHttpError(409, "This PDF isn't ready yet.", "NOT_READY");
  const doc = await q(sb.from("job_documents").select("storage_path").eq("id", exportRow.pdf_document_id).maybeSingle());
  const [bucket, ...rest] = String(doc?.storage_path || "").split("/");
  const { data, error } = await sb.storage.from(bucket).download(rest.join("/"));
  if (error) throw error;
  const buf = Buffer.from(await data.arrayBuffer());
  if (sha256(buf) !== exportRow.pdf_sha256) throw new TakeoffHttpError(500, "The stored PDF doesn't match its record.", "INTEGRITY");
  return buf;
}

/**
 * Record an order as placed externally (admin only — enforced by the route + capability).
 * body: { exportId, supplierReference, placedOn, acknowledgeSurplus, idempotencyKey }
 */
export async function placeOrder(sb, ctx, orderRow, body) {
  if (!ctx.caps.placeOrders) throw new TakeoffHttpError(403, "Only a director can record an order as placed.", "FORBIDDEN");
  const placedOn = typeof body?.placedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.placedOn) ? body.placedOn : null;
  if (!placedOn) throw new TakeoffHttpError(400, "Enter the date the order was placed.", "INVALID");
  const idem = typeof body?.idempotencyKey === "string" && body.idempotencyKey.length >= 8 ? body.idempotencyKey.slice(0, 120) : null;
  if (!idem) throw new TakeoffHttpError(400, "Missing request key — refresh and try again.", "INVALID");
  const prior = await q(sb.from("takeoff_idempotency").select("operation, result").eq("scope_id", orderRow.id).eq("key", idem).maybeSingle());
  if (prior) {
    if (prior.operation !== "place") throw new TakeoffHttpError(400, "That request key was used for something else.", "INVALID");
    return { ...prior.result, replayed: true };
  }
  if (!isUuid(body?.exportId)) throw new TakeoffHttpError(400, "Choose the exported PDF that was sent.", "INVALID");
  const ex = await q(sb.from("takeoff_exports").select("*").eq("id", body.exportId).eq("order_id", orderRow.id).maybeSingle());
  if (!ex) throw new TakeoffHttpError(404, "That export is not part of this order.", "NOT_FOUND");

  const { snapshot } = await loadSnapshotFresh(sb, orderRow.workspace_id);
  const computed = computeWorkspace(snapshot);
  const commitments = await loadCommitments(sb, orderRow.workspace_id);
  const requirements = [];
  for (const line of computed.scheduleLines) {
    for (const cp of contributionPiecesForBucket(computed, line)) requirements.push({ contributionId: cp.contributionId, bucketKey: line.bucketKey, quantity: cp.quantity });
  }
  // Allocate the EXPORTED quantities (what the supplier saw) to stable contributions.
  const allocations = [];
  let surplus = 0;
  const used = new Map();
  for (const c of commitments) if (c.contributionId) used.set(`${c.contributionId}|${c.bucketKey}`, (used.get(`${c.contributionId}|${c.bucketKey}`) || 0) + c.quantity);
  // flashing groups AND generic purchase items (timber, sheets, bars …) — every exported line is allocated
  const exportedLines = [...(ex.snapshot.groups || []).flatMap((g) => g.lines), ...(ex.snapshot.items || []).flatMap((g) => g.lines)];
  {
    for (const l of exportedLines) {
      let left = l.quantity;
      for (const r of requirements.filter((x) => x.bucketKey === l.bucketKey).sort((a, b) => (a.contributionId < b.contributionId ? -1 : 1))) {
        const k = `${r.contributionId}|${r.bucketKey}`;
        const free = r.quantity - (used.get(k) || 0);
        if (free <= 0) continue;
        const take = Math.min(free, left);
        allocations.push({ contributionId: r.contributionId, bucketKey: l.bucketKey, finishedLengthMm: l.finishedLengthMm, quantity: take });
        used.set(k, (used.get(k) || 0) + take);
        left -= take;
        if (!left) break;
      }
      if (left > 0) { allocations.push({ contributionId: null, bucketKey: l.bucketKey, finishedLengthMm: l.finishedLengthMm, quantity: left }); surplus += left; }
    }
  }
  if (surplus && !body.acknowledgeSurplus) {
    throw new TakeoffHttpError(409, `This order includes ${surplus} piece(s) more than the takeoff still needs. Confirm the surplus to record it.`, "SURPLUS");
  }
  const { data, error } = await sb.rpc("takeoff_place_order", {
    p_order_id: orderRow.id, p_export_id: ex.id, p_expected_workspace_revision: snapshot.workspace.revision, p_requirements: requirements,
    p_allocations: allocations, p_supplier_reference: typeof body.supplierReference === "string" ? body.supplierReference.slice(0, 80) : null,
    p_placed_on: placedOn, p_surplus_acknowledged: !!body.acknowledgeSurplus, p_user_id: ctx.actor.userId, p_idempotency_key: idem,
  });
  if (error) throw error;
  return { ...data, surplus };
}

export async function cancelPlacement(sb, ctx, placementId, reason) {
  if (!ctx.caps.placeOrders) throw new TakeoffHttpError(403, "Only a director can cancel a placed order.", "FORBIDDEN");
  if (!isUuid(placementId)) throw new TakeoffHttpError(400, "Invalid placement.", "INVALID");
  const { data, error } = await sb.rpc("takeoff_cancel_placement", { p_placement_id: placementId, p_reason: String(reason || "").slice(0, 300), p_user_id: ctx.actor.userId });
  if (error) throw error;
  return data;
}
