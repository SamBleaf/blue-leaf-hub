/**
 * registerRoutes.mjs — Master Register R03 API (staff only).
 *
 * Every route is keyed by the LEAD id; the job/project is resolved server-side from the lead
 * (leads.id → jobs.id → projects.id), so a browser can never point a write at another client's project.
 * All register writes go through registerStore (one atomic register_apply per save once a project exists).
 *
 *   GET  /api/register/leads/:leadId                 register + mode (+ automatic promotion if due)
 *   PUT  /api/register/leads/:leadId                 save { meta?, changes[], deletes[] }  (409 + conflicts ⇒ nothing written)
 *   GET  /api/register/leads/:leadId/context         read-only Sales/project context (prefill)
 *   PUT  /api/register/leads/:leadId/facts           { deliveryModel } → lead (pre-job) or job fact (post-job)
 *   POST /api/register/leads/:leadId/promote         explicit promotion / recovery (normally automatic)
 *   POST /api/register/leads/:leadId/portal/:action  issue | withdraw | return  { items:[{id,sync}], note }
 *   GET  /api/register/leads/:leadId/history         item history (?itemId=)
 */
import { requireAuth } from "./requireAuth.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { ok, err } from "./apiResponse.mjs";
import {
  loadRegister, saveRegister, promoteRegisterToProject, portalAction, itemHistory, RegisterError,
} from "./registerStore.mjs";
import { loadRegisterContext, setDeliveryModel } from "./registerContext.mjs";
import {
  previewDocument, issueDocument, listDocuments, documentUrl, supplierPack, addSourceDocument, updateSourceDocument,
} from "./registerDocuments.mjs";
import { tenderSummary, latestBaseline, recordBaseline } from "./registerHandover.mjs";

async function actorFor(sb, caller) {
  if (!caller) return null;
  let name = caller.email || "";
  try {
    const { data } = await sb.from("user_profiles").select("full_name").eq("id", caller.id).maybeSingle();
    if (data?.full_name) name = data.full_name;
  } catch { /* name is cosmetic */ }
  return { id: caller.id, name, email: caller.email || null };
}

/** RegisterError → { ok:false, error, code, conflicts? } (conflicts ⇒ nothing was written). */
export function sendRegisterError(res, e, fallback = "Register request failed") {
  if (e instanceof RegisterError || (e && e.status)) {
    const body = { ok: false, error: e.message || fallback };
    if (e.code) body.code = e.code;
    if (e.conflicts) body.conflicts = e.conflicts;
    return res.status(e.status || 400).json(body);
  }
  console.warn("[register]", e?.stack || e?.message || e);
  return err(res, 500, fallback);
}

export function registerRegisterRoutes(app) {
  const base = "/api/register/leads/:leadId";

  app.get(base, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const out = await loadRegister(sb, req.params.leadId, { actor });
      ok(res, { register: out.register, mode: out.mode, projectId: out.projectId, jobId: out.jobId,
        isPreconstruction: out.isPreconstruction, promotion: out.promotion || null, promotedAt: out.promotedAt || null,
        pendingPromotion: !!out.pendingPromotion, schemaReady: out.schemaReady !== false });
    } catch (e) { sendRegisterError(res, e, "Could not load the register."); }
  });

  app.put(base, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const out = await saveRegister(sb, req.params.leadId, req.body || {}, { actor });
      ok(res, { register: out.register, mode: out.mode });
    } catch (e) { sendRegisterError(res, e, "Could not save the register."); }
  });

  app.get(`${base}/context`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const context = await loadRegisterContext(sb, req.params.leadId);
      if (!context) return err(res, 404, "Lead not found", "NOT_FOUND");
      ok(res, { context });
    } catch (e) { sendRegisterError(res, e, "Could not load the project context."); }
  });

  app.put(`${base}/facts`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const b = req.body || {};
      if (!("deliveryModel" in b)) return err(res, 400, "Nothing to update.");
      const out = await setDeliveryModel(sb, req.params.leadId, b.deliveryModel || null, { actorId: req.caller?.id || null });
      const context = await loadRegisterContext(sb, req.params.leadId);
      ok(res, { context, owner: out.owner });
    } catch (e) { sendRegisterError(res, e, "Could not save the project fact."); }
  });

  app.post(`${base}/promote`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const result = await promoteRegisterToProject(sb, { leadId: req.params.leadId, actor });
      if (!result.ok) return err(res, 409, result.reason || "Promotion did not run.", "PROMOTION");
      ok(res, { promotion: result });
    } catch (e) { sendRegisterError(res, e, "Promotion failed — nothing was written."); }
  });

  app.post(`${base}/portal/:action`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const { items, note } = req.body || {};
      const out = await portalAction(sb, req.params.leadId, req.params.action, Array.isArray(items) ? items : [], { actor, note });
      ok(res, { register: out.register, mode: "project" });
    } catch (e) { sendRegisterError(res, e, "Could not update the client portal."); }
  });

  // ── Documents (D1–D3): draft preview, immutable issue, history, retrieval ────────────────────────
  app.get(`${base}/documents`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try { ok(res, { documents: await listDocuments(sb, req.params.leadId) }); }
    catch (e) { sendRegisterError(res, e, "Could not list documents."); }
  });

  app.post(`${base}/documents/:docType/preview`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const out = await previewDocument(sb, req.params.leadId, req.params.docType, { layout: req.body?.layout, recipientName: req.body?.recipientName, actor });
      ok(res, { pdf: out.pdf.toString("base64"), checks: out.checks, revision: out.revision });
    } catch (e) { sendRegisterError(res, e, "Could not render the draft."); }
  });

  app.post(`${base}/documents/:docType/issue`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const b = req.body || {};
      const out = await issueDocument(sb, req.params.leadId, req.params.docType, { recipientName: b.recipientName, recipientEmail: b.recipientEmail, layout: b.layout, actor });
      ok(res, { document: out.document, supersededId: out.supersededId, checks: out.checks });
    } catch (e) {
      if (e?.code === "PREFLIGHT") return res.status(422).json({ ok: false, error: e.message, code: e.code, checks: e.checks });
      sendRegisterError(res, e, "Could not issue the document.");
    }
  });

  app.get(`${base}/documents/:docId/url`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try { ok(res, { url: await documentUrl(sb, req.params.leadId, req.params.docId, { export: req.query.export === "docx" }) }); }
    catch (e) { sendRegisterError(res, e, "Could not open the document."); }
  });

  app.get(`${base}/packs/:discipline`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const out = await supplierPack(sb, req.params.leadId, req.params.discipline, { actor });
      ok(res, { pdf: out.pdf.toString("base64"), count: out.count });
    } catch (e) { sendRegisterError(res, e, "Could not build the coordination pack."); }
  });

  // ── Received consultant / supplier documents (original kept intact; manual reconciliation) ──────
  app.post(`${base}/sources`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      ok(res, { document: await addSourceDocument(sb, req.params.leadId, req.body || {}, { actor }) });
    } catch (e) { sendRegisterError(res, e, "Could not add the document."); }
  });

  app.patch(`${base}/sources/:docId`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try { ok(res, { document: await updateSourceDocument(sb, req.params.leadId, req.params.docId, req.body || {}) }); }
    catch (e) { sendRegisterError(res, e, "Could not update the document."); }
  });

  // ── Tender linkage + contract baseline / handover ───────────────────────────────────────────────
  app.get(`${base}/tender`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try { ok(res, { tender: await tenderSummary(sb, req.params.leadId, { actor: await actorFor(sb, req.caller) }) }); }
    catch (e) { sendRegisterError(res, e, "Could not build the tender view."); }
  });

  app.get(`${base}/baseline`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try { ok(res, { baseline: await latestBaseline(sb, req.params.leadId) }); }
    catch (e) { sendRegisterError(res, e, "Could not read the baseline."); }
  });

  app.post(`${base}/baseline`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const out = await recordBaseline(sb, req.params.leadId, { actor, note: req.body?.note });
      ok(res, { baseline: out.baseline, counts: out.counts });
    } catch (e) { sendRegisterError(res, e, "Could not record the contract baseline."); }
  });

  app.get(`${base}/history`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const events = await itemHistory(sb, req.params.leadId, req.query.itemId ? String(req.query.itemId) : null);
      ok(res, { events });
    } catch (e) { sendRegisterError(res, e, "Could not load history."); }
  });
}
