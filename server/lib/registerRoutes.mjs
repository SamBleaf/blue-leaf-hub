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
 *   PUT  /api/register/leads/:leadId/facts           { deliveryModel?, projectType?, estimatedValue? } → lead (pre-job) or job fact (post-job)
 *   POST /api/register/leads/:leadId/site/recheck    public mapping again for the job (else the lead) → { context }; any staff member
 *   POST /api/register/leads/:leadId/promote         explicit promotion / recovery (normally automatic)
 *   POST /api/register/leads/:leadId/portal/:action  issue | withdraw | return  { items:[{id,sync}], note }
 *   GET  /api/register/leads/:leadId/history         item history (?itemId=)
 */
import { requireAuth } from "./requireAuth.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { ok, err } from "./apiResponse.mjs";
import {
  loadRegister, saveRegister, promoteRegisterToProject, portalAction, itemHistory, RegisterError, registerEnabledFor,
} from "./registerStore.mjs";
import { loadRegisterContext, setDeliveryModel, setProjectFacts, recheckDue } from "./registerContext.mjs";
import { enrichSite } from "./siteEnrichmentService.mjs";
import {
  previewDocument, issueDocument, listDocuments, documentUrl, supplierPack, addSourceDocument, updateSourceDocument,
} from "./registerDocuments.mjs";
import { tenderSummary, latestBaseline, recordBaseline, handoverStatus } from "./registerHandover.mjs";
import { proofreadDocument } from "./documentProofread.mjs";

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

/** "Re-check" in plain words for each way public mapping can fail (enrichSite's reasons never reach the browser). */
export function recheckFailureWords(reason) {
  if (reason === "no_coords") return "Couldn't find the site address on the map. Check the address in Sales. Nothing changed.";
  if (reason === "row_not_found") return "The project couldn't be found. Reload the page. Nothing changed.";
  return "Couldn't reach the mapping service. Nothing changed.";
}

export function registerRegisterRoutes(app) {
  const base = "/api/register/leads/:leadId";
  const recheckRunning = new Set();                      // lead ids with a lookup in flight (one at a time per lead)

  // Feature switch (REGISTER_ENABLED / REGISTER_PILOT_LEADS, default off) — see registerEnabledFor.
  app.use(base, (req, res, next) => (registerEnabledFor(req.params.leadId)
    ? next()
    : err(res, 404, "The project register isn't switched on for this lead.", "REGISTER_DISABLED")));

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
      const facts = Object.fromEntries(["projectType", "estimatedValue"].filter((k) => k in b).map((k) => [k, b[k]]));
      if (!("deliveryModel" in b) && !Object.keys(facts).length) return err(res, 400, "Nothing to update.");
      const actorId = req.caller?.id || null;
      let owner = null;
      // Each fact goes to its owner (the lead before a job exists, the job's facts service after), never both.
      if ("deliveryModel" in b) owner = (await setDeliveryModel(sb, req.params.leadId, b.deliveryModel || null, { actorId })).owner;
      if (Object.keys(facts).length) owner = (await setProjectFacts(sb, req.params.leadId, facts, { actorId })).owner || owner;
      const context = await loadRegisterContext(sb, req.params.leadId);
      ok(res, { context, owner });
    } catch (e) { sendRegisterError(res, e, "Could not save the project fact."); }
  });

  // "Re-check" on The project and in the Documents edit drawer, for every staff member (REGISTER_SCREENS_SPEC.md S1, S5).
  // The lookup runs for the job once there is one (that is where the register reads the site from), else for the lead.
  // Rate-limited per lead: a lookup under 10 minutes old, or one still running, is not repeated; the current context comes back.
  // select("*") so a database without the site columns (pre-mig-135) still answers instead of erroring on a missing column.
  app.post(`${base}/site/recheck`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const leadId = req.params.leadId;
    try {
      const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (!lead) return err(res, 404, "Lead not found", "NOT_FOUND");
      let table = "leads", id = lead.id, enrichedAt = lead.site_enriched_at || null;
      if (lead.job_id) {
        const { data: job } = await sb.from("jobs").select("*").eq("id", lead.job_id).maybeSingle();
        if (job) { table = "jobs"; id = job.id; enrichedAt = job.site_enriched_at || null; }
      }
      if (recheckDue(enrichedAt) && !recheckRunning.has(leadId)) {
        recheckRunning.add(leadId);
        let result;
        try { result = await enrichSite(table, id); } finally { recheckRunning.delete(leadId); }
        if (!result?.ok) {
          console.warn(`[register] site recheck ${table}/${id}:`, result?.reason);
          return err(res, 502, recheckFailureWords(result?.reason), "SITE_LOOKUP");
        }
      }
      const context = await loadRegisterContext(sb, leadId);
      if (!context) return err(res, 404, "Lead not found", "NOT_FOUND");
      ok(res, { context });
    } catch (e) {
      console.warn("[register] site recheck:", e?.message || e);
      err(res, 500, "Couldn't reach the mapping service. Nothing changed.");
    }
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
      ok(res, { register: out.register, mode: "project", held: out.held || [] });
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
      ok(res, { pdf: out.pdf.toString("base64"), checks: out.checks, revision: out.revision, itemVersions: out.itemVersions, lines: out.lines, notPrinted: out.notPrinted });
    } catch (e) { sendRegisterError(res, e, "Could not render the draft."); }
  });

  // Blueprint's spelling and wording check of the draft just previewed: findings listed and highlighted on a copy of the
  // draft. Changes nothing and never affects an issue (documentProofread.mjs).
  app.post(`${base}/documents/:docType/proofread`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const b = req.body || {};
      const out = await proofreadDocument(sb, req.params.leadId, req.params.docType, { layout: b.layout, recipientName: b.recipientName, actor, expectedVersions: b.expectedVersions });
      ok(res, { proofread: { issues: out.issues, pdf: out.pdf ? out.pdf.toString("base64") : null, model: out.model, truncated: out.truncated } });
    } catch (e) { sendRegisterError(res, e, "Could not check the wording."); }
  });

  app.post(`${base}/documents/:docType/issue`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const actor = await actorFor(sb, req.caller);
      const b = req.body || {};
      const out = await issueDocument(sb, req.params.leadId, req.params.docType, { recipientName: b.recipientName, recipientEmail: b.recipientEmail, layout: b.layout, actor, expectedVersions: b.expectedVersions });
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

  // One server-grounded handover/portal status (contract · baseline · project · Ops handover · portal) +
  // the single next action. The UI reads this instead of re-inferring the states from scattered fields.
  app.get(`${base}/handover-status`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try { ok(res, { status: await handoverStatus(sb, req.params.leadId) }); }
    catch (e) { sendRegisterError(res, e, "Could not load the handover status."); }
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
