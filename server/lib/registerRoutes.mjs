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
 *   POST /api/register/leads/:leadId/site/recheck    public mapping again for the job (else the lead) → { context, skipped, reason?, message? }; any staff member
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
import { enrichSite, deriveComplexity } from "./siteEnrichmentService.mjs";
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
  if (reason === "retry_soon") return "Couldn't reach the mapping service a moment ago. Try again in a minute. Nothing changed.";
  if (reason === "write_error") return "Couldn't save what public mapping found. Try again in a minute. Nothing changed.";
  return "Couldn't reach the mapping service. Nothing changed.";
}

/** Why a "Re-check" did not run, in plain words (the answer still carries the current context). */
export function recheckSkipWords(reason) {
  if (reason === "running") return "Public mapping is already being checked for this project. Try again in a minute.";
  return "Checked less than 10 minutes ago, so it wasn't run again.";
}

/** After a failed lookup, another try for the same lead waits this long (failed lookups are rate-limited too). */
export const RECHECK_RETRY_MS = 60 * 1000;

// The stored columns each public-mapping layer owns, the one(s) whose loss counts, and its key in site_intel.
const SITE_LAYERS = {
  council:  { columns: ["site_council"], facts: ["site_council"], intel: "lga" },
  bushfire: { columns: ["site_bushfire_prone", "site_bushfire_detail"], facts: ["site_bushfire_prone"], intel: "bushfire" },
  zone:     { columns: ["site_zone"], facts: ["site_zone"], intel: "zone" },
  slope:    { columns: ["site_slope_deg", "site_slope_band"], facts: ["site_slope_deg", "site_slope_band"], intel: "slope" },
};

/**
 * What a "Re-check" writes, from the values stored now (prev, the job or lead row) and a look-only enrichSite result
 * ({ updates, layers }). Never wipes a good value because the mapping service was down:
 *   - no layer answered (every one errored, or was not configured) → { failed: true }, nothing is written;
 *   - a layer that errored while its stored value is set → { failed: true }, nothing is written (the old value stays);
 *   - otherwise → { updates }: each answered layer's new values; a layer that errored or was skipped keeps what is
 *     stored (its site_intel entry too); complexity is worked out again from the result; site_enriched_at = nowIso.
 */
export function recheckUpdates(prev, lookup, nowIso = new Date().toISOString()) {
  const layers = lookup?.layers || {};
  const names = Object.keys(SITE_LAYERS);
  const had = (c) => prev?.[c] != null;
  if (!lookup?.updates || !names.some((k) => layers[k] === "ok")) return { failed: true };
  if (names.some((k) => layers[k] === "error" && SITE_LAYERS[k].facts.some(had))) return { failed: true };
  const updates = { ...lookup.updates };
  const prevIntel = prev?.site_intel && typeof prev.site_intel === "object" ? prev.site_intel : {};
  const intel = { ...(updates.site_intel && typeof updates.site_intel === "object" ? updates.site_intel : {}) };
  for (const k of names) {
    if (layers[k] === "ok") continue;
    for (const c of SITE_LAYERS[k].columns) updates[c] = prev?.[c] ?? null;
    intel[SITE_LAYERS[k].intel] = prevIntel[SITE_LAYERS[k].intel] ?? null;
  }
  updates.site_intel = intel;
  updates.site_complexity = deriveComplexity({ bushfireProne: updates.site_bushfire_prone ?? null, slopeBand: updates.site_slope_band ?? null, zone: updates.site_zone ?? null });
  updates.site_enriched_at = nowIso;
  return { updates };
}

/**
 * What a Re-check looks up, for its failure memo: the row (job once there is one, else the lead), the lead's site address
 * and suburb as Sales holds them, the job's address, and the map point. Case and extra spaces don't count, so retyping
 * the same address doesn't skip the wait; a corrected address or suburb is a new lookup, run at once.
 */
export function recheckWhere(lead, table, row) {
  const t = (v) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").toLowerCase();
  const job = table === "jobs" ? row : null;
  return JSON.stringify([table, row?.id ?? null, t(lead?.site_address), t(lead?.suburb), t(job?.address), row?.geo_lat ?? null, row?.geo_lng ?? null]);
}

/**
 * One "Re-check" for a lead: public mapping for its job once there is one (where the register reads the site from), else
 * for the lead. The values stored now are read first; the lookup runs look-only; recheckUpdates decides what is written.
 *   running   lead ids with a lookup in flight (one at a time per lead)
 *   failedAt  lead id → { at, reason, where } of its last failed lookup: another try for the same address (recheckWhere)
 *             waits RECHECK_RETRY_MS (the address not being on the map keeps its own words, anything else reads "try
 *             again in a minute"); once the address, suburb or map point has changed (corrected in Sales) it runs at once
 *   enrich    enrichSite (a stand-in in tests)
 * → { status: "updated" } | { status: "skipped", reason: "running" | "recent" } | { status: "failed", reason }
 *   | { status: "not_found" }. Never throws for a lookup that fails.
 */
export async function runSiteRecheck(sb, leadId, { running = new Set(), failedAt = new Map(), enrich = enrichSite, clock = Date.now } = {}) {
  if (running.has(leadId)) return { status: "skipped", reason: "running" };
  running.add(leadId);
  try {
    for (const [k, f] of failedAt) if (!(clock() - f?.at < RECHECK_RETRY_MS)) failedAt.delete(k);   // keep the map small
    const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
    if (!lead) return { status: "not_found" };
    let table = "leads", row = lead;
    if (lead.job_id) {
      const { data: job } = await sb.from("jobs").select("*").eq("id", lead.job_id).maybeSingle();
      if (job) { table = "jobs"; row = job; }
    }
    if (!recheckDue(row.site_enriched_at || null, clock())) return { status: "skipped", reason: "recent" };
    const where = recheckWhere(lead, table, row);
    const last = failedAt.get(leadId);
    if (last && last.where === where && clock() - last.at < RECHECK_RETRY_MS) {
      return { status: "failed", retrySoon: true, reason: ["no_coords", "row_not_found"].includes(last.reason) ? last.reason : "retry_soon" };
    }
    const fail = (reason) => { failedAt.set(leadId, { at: clock(), reason, where }); return { status: "failed", reason, table, id: row.id }; };
    let result;
    try { result = await enrich(table, row.id, { write: false, sb }); } catch { result = null; }
    if (!result?.ok) return fail(result?.reason || "lookup_failed");
    const plan = recheckUpdates(row, result, new Date(clock()).toISOString());
    if (plan.failed) return fail("layers_down");
    const { error } = await sb.from(table).update(plan.updates).eq("id", row.id);
    if (error) { console.warn(`[register] site recheck write ${table}/${row.id}:`, error.message); return fail("write_error"); }
    failedAt.delete(leadId);
    return { status: "updated", table, id: row.id };
  } finally {
    running.delete(leadId);
  }
}

export function registerRegisterRoutes(app) {
  const base = "/api/register/leads/:leadId";
  const recheckRunning = new Set();                      // lead ids with a lookup in flight (one at a time per lead)
  const recheckFailedAt = new Map();                     // lead id → { at, reason, where } of its last failed lookup (same address: retry after a minute)

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
  // runSiteRecheck: the job once there is one, else the lead; the stored values are read first and a mapping service that
  // is down never wipes them ("Couldn't reach the mapping service. Nothing changed."). Rate-limited per lead: a lookup
  // under 10 minutes old, or one still running, is not repeated (→ skipped: true, reason, message, and the current
  // context); a failed lookup waits a minute before another try for the same address (a corrected one runs at once).
  // select("*") so a database without the site columns (pre-mig-135) still answers instead of erroring on a missing column.
  app.post(`${base}/site/recheck`, requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const leadId = req.params.leadId;
    try {
      const out = await runSiteRecheck(sb, leadId, { running: recheckRunning, failedAt: recheckFailedAt });
      if (out.status === "not_found") return err(res, 404, "Lead not found", "NOT_FOUND");
      if (out.status === "failed") {
        console.warn(`[register] site recheck ${out.table || "?"}/${out.id || leadId}:`, out.reason);
        return err(res, out.retrySoon ? 429 : 502, recheckFailureWords(out.reason), "SITE_LOOKUP");
      }
      const context = await loadRegisterContext(sb, leadId);
      if (!context) return err(res, 404, "Lead not found", "NOT_FOUND");
      if (out.status === "skipped") return ok(res, { context, skipped: true, reason: out.reason, message: recheckSkipWords(out.reason) });
      ok(res, { context, skipped: false });
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
