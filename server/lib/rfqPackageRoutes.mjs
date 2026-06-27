/**
 * rfqPackageRoutes.mjs
 * Persistent RFQ Package — CRUD, additional sends, follow-ups, addenda.
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import { sendPlainMail } from "./notifyMail.mjs";
import { resendSendConfigured, sendBatchViaResend } from "./resendSend.mjs";
import { captureResendId } from "./rfqEngagement.mjs";
import { wrapPlainTextEmailHtml } from "./signatureEmailHtml.mjs";
import { buildRfqTradeIntelligence, reconcilePackageTradeCoverage } from "./rfqTradeIntelligence.mjs";
import { tradeLabel } from "./tradeMasterLibrary.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowsToCamel, rowToCamel, translateDbError } from "./apiResponse.mjs";
import { generateOutboundMessageId } from "./imapQuoteMatch.mjs";
import { buildexactConfigured } from "./buildexactClient.mjs";
import { assertJobReadyForRfqHandoff } from "./jobGuards.mjs";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";

// Suggested trades to pre-select when tendering a job, by build type. A hint the
// user refines in the engine; Buildxact estimate categories (if linked) refine further.
const CORE_TRADES = ["footings_concrete_formwork", "carpentry_joinery", "plumbing", "electrical", "internal_linings", "plastering", "painting", "tiling", "flooring", "waterproofing", "metal_roofing"];
const TYPE_EXTRA = {
  new_build: ["excavation", "termite_protection", "stormwater", "insulation", "cabinetry", "glazing_windows", "landscaping", "hvac"],
  knockdown_rebuild: ["demolition", "excavation", "termite_protection", "stormwater", "insulation", "cabinetry", "glazing_windows", "landscaping", "hvac"],
  extension: ["excavation", "insulation", "cabinetry", "glazing_windows", "hvac"],
  renovation: ["demolition", "insulation", "cabinetry", "glazing_windows"],
};
function suggestTradesForType(t) {
  return [...new Set([...CORE_TRADES, ...(TYPE_EXTRA[t] || [])])];
}

const STANDARD_TRADES = [
  "excavation", "demolition", "termite_protection", "footings_concrete_formwork",
  "plumbing", "electrical", "internal_linings", "stairs", "tiling", "flooring",
  "metal_roofing", "scaffolding", "waterproofing", "stormwater", "painting",
  "plastering", "carpentry_joinery", "glazing_windows", "landscaping", "hvac",
  "balustrade", "garage_doors", "cabinetry", "stone_benchtops", "shower_screens",
  "rendering", "insulation", "suspended_ceilings", "skylights", "blinds_curtains",
  "cleaning", "site_safety"
];

const TRADE_LABEL_MAP = {
  excavation: "Excavation",
  demolition: "Demolition",
  termite_protection: "Termite Protection",
  footings_concrete_formwork: "Footings / Concrete / Formwork",
  plumbing: "Plumbing",
  electrical: "Electrical",
  internal_linings: "Internal Linings",
  stairs: "Stairs",
  tiling: "Tiling",
  flooring: "Flooring",
  metal_roofing: "Metal Roofing",
  scaffolding: "Scaffolding",
  waterproofing: "Waterproofing",
  stormwater: "Stormwater / Drainage",
  painting: "Painting",
  plastering: "Plastering",
  carpentry_joinery: "Carpentry / Joinery",
  glazing_windows: "Glazing / Windows",
  landscaping: "Landscaping",
  hvac: "HVAC",
  balustrade: "Balustrade",
  garage_doors: "Garage Doors",
  cabinetry: "Cabinetry",
  stone_benchtops: "Stone / Benchtops",
  shower_screens: "Shower Screens",
  rendering: "Rendering",
  insulation: "Insulation",
  suspended_ceilings: "Suspended Ceilings",
  skylights: "Skylights",
  blinds_curtains: "Blinds / Curtains",
  cleaning: "Final Clean",
  site_safety: "Site Safety / Fencing"
};

/** Estimate category mapping — rough buckets for cost planning. */
const ESTIMATE_CATEGORY = {
  excavation: "site_works",
  demolition: "site_works",
  stormwater: "site_works",
  landscaping: "site_works",
  termite_protection: "site_works",
  footings_concrete_formwork: "substructure",
  scaffolding: "substructure",
  plumbing: "services",
  electrical: "services",
  hvac: "services",
  metal_roofing: "external_envelope",
  waterproofing: "external_envelope",
  glazing_windows: "external_envelope",
  rendering: "external_envelope",
  internal_linings: "internal_fitout",
  stairs: "internal_fitout",
  tiling: "internal_fitout",
  flooring: "internal_fitout",
  carpentry_joinery: "internal_fitout",
  painting: "internal_fitout",
  plastering: "internal_fitout",
  cabinetry: "internal_fitout",
  stone_benchtops: "internal_fitout",
  shower_screens: "internal_fitout",
  balustrade: "internal_fitout",
  insulation: "internal_fitout",
  suspended_ceilings: "internal_fitout",
  skylights: "internal_fitout",
  blinds_curtains: "internal_fitout",
  garage_doors: "external_works",
  cleaning: "completion",
  site_safety: "preliminaries",
};

function computeSuggestedTrades(coveredTradeIds) {
  const covered = new Set(coveredTradeIds);
  const HIGH_RISK = ["waterproofing", "scaffolding", "stormwater", "painting", "metal_roofing"];
  const MEDIUM_RISK = ["glazing_windows", "rendering", "insulation", "balustrade", "carpentry_joinery", "cabinetry"];
  const suggestions = [];
  for (const t of HIGH_RISK) {
    if (!covered.has(t)) suggestions.push({ tradeId: t, label: TRADE_LABEL_MAP[t] || t, risk: "high" });
  }
  for (const t of MEDIUM_RISK) {
    if (!covered.has(t)) suggestions.push({ tradeId: t, label: TRADE_LABEL_MAP[t] || t, risk: "medium" });
  }
  return suggestions;
}

function computeCoverageScore(coveredCount) {
  if (coveredCount === 0) return 0;
  // Based on total standard trades as denominator
  return Math.min(100, Math.round((coveredCount / STANDARD_TRADES.length) * 100));
}

function buildFollowUpText({ name, address, deadline, trade, sigName, footer }) {
  const lines = [
    `Hi ${name},`,
    "",
    `Following up on our RFQ for ${trade} at ${address}.`,
    deadline ? `We are hoping to receive your quote by ${deadline}.` : "",
    "Please let us know if you need anything from us or if you have any questions.",
    "",
    "Thanks,",
    sigName || "Blue Leaf Building",
  ].filter((l) => l !== undefined);
  return footer ? lines.join("\n") + `\n\n${footer}` : lines.join("\n");
}

export function registerRfqPackageRoutes(app) {
  const db = () => getServiceSupabase();

  // ── Tender prefill — bundle a lead's knowledge for the RFQ engine ─────────
  // Used when "Proceed to RFQ Engine & Estimate" is clicked at the tender stage.
  app.get("/api/tender/prefill", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    const { leadId, jobId } = req.query;
    try {
      let lead = null, job = null;
      if (leadId) { const { data } = await s.from("leads").select("*").eq("id", leadId).maybeSingle(); lead = data; }
      const useJobId = jobId || lead?.job_id || null;
      if (useJobId) { const { data } = await s.from("jobs").select("*").eq("id", useJobId).maybeSingle(); job = data; }
      if (!lead && !job) return err(res, 404, "No lead or job found for tender prefill.");

      const projectType = job?.project_type || lead?.project_type || null;

      let documents = [];
      if (leadId) {
        const { data: docs } = await s.from("lead_documents").select("id, filename, document_type, mime_type, storage_path, created_at").eq("lead_id", leadId).order("created_at", { ascending: false });
        documents = rowsToCamel(docs || []);
      }

      // Buildxact estimate (the "& estimate" hook) — categories, if the job is linked.
      let buildexactLinked = false, estimateCategories = [];
      const bxJobId = job?.buildexact_job_id || null;
      if (bxJobId && buildexactConfigured()) {
        try {
          const est = await pullBuildexactEstimate(bxJobId);
          estimateCategories = (est?.estimate?.categories || []).map((c) => ({ name: c.categoryName, amount: c.amount }));
          buildexactLinked = estimateCategories.length > 0;
        } catch (e) { console.warn("[tender/prefill] estimate:", e?.message || e); }
      }

      // Resume support: the full extraction + any RFQs already on the job, so the RFQ Engine
      // can rehydrate a session straight from the DB (not the browser's localStorage) and jump
      // to dispatch. existingRfqs lets the engine lock already-sent trades so they're never re-sent.
      let existingRfqs = [];
      if (useJobId) {
        const { data: rfqRows } = await s
          .from("rfqs")
          .select("trade, subcontractor_id, status, sent_at, deadline")
          .eq("job_id", useJobId);
        existingRfqs = rowsToCamel(rfqRows || []);
      }

      return ok(res, {
        prefill: {
          leadId: leadId || null,
          jobId: useJobId,
          extractedData: job?.extracted_data || null,
          existingRfqs,
          projectAddress: job?.address || lead?.site_address || null,
          projectType,
          architectClient: job?.architect_name || null,
          // Prefer the full-name field (leads.name) so compound clients ("Jess Parken & Rick Lockwood")
          // survive — first_name+last_name can only represent one person.
          clientName: job?.client_name || lead?.name?.trim() || [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || null,
          clientEmail: job?.client_email || lead?.email || null,
          clientPhone: job?.client_phone || lead?.phone || null,
          estimatedValue: lead?.estimated_value ?? null,
          floorAreaM2: lead?.floor_area_estimate ?? null,
          designStage: lead?.design_stage || null,
          scopeNotes: lead?.discovery_notes || lead?.project_description || null,
          tenderDeadline: lead?.tender_deadline || null,
          dropboxUrl: job?.dropbox_shared_link || null,
          documents,
          buildexactLinked,
          estimateCategories,
          suggestedTrades: suggestTradesForType(projectType),
        },
      });
    } catch (e) {
      console.error("[tender/prefill]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Tender Board: resend the (corrected) plans link to a job's RFQ recipients, threaded as a reply ──
  // List recipients grouped by trade for the "Email all trade recipients" panel.
  app.get("/api/rfq/recipients/:jobId", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { jobId } = req.params;
      const { data: job } = await s
        .from("jobs").select("id, address, dropbox_shared_link, dropbox_link").eq("id", jobId).maybeSingle();
      if (!job) return err(res, 404, "Job not found.");
      const { data: rfqs, error } = await s
        .from("rfqs")
        .select("id, trade, subcontractor_id, status, sent_at, sent_message_id, email_body")
        .eq("job_id", jobId)
        .in("status", ["sent", "received", "reminded", "followed_up"]);
      if (error) return err(res, 500, translateDbError(error));
      const subIds = [...new Set((rfqs || []).map((r) => r.subcontractor_id).filter(Boolean))];
      let subMap = {};
      if (subIds.length) {
        const { data: subs } = await s.from("subcontractors").select("id, business_name, email").in("id", subIds);
        subMap = Object.fromEntries((subs || []).map((x) => [x.id, x]));
      }
      const subjectOf = (b) => { const m = /^Subject:\s*(.+)$/im.exec(String(b || "")); return m ? m[1].trim() : ""; };
      const recipients = (rfqs || [])
        .map((r) => {
          const sub = subMap[r.subcontractor_id] || {};
          return {
            rfqId: r.id, trade: r.trade, status: r.status,
            businessName: sub.business_name || "", email: sub.email || "",
            hasThread: Boolean(r.sent_message_id), subject: subjectOf(r.email_body)
          };
        })
        .filter((r) => r.email);
      return ok(res, {
        job: { id: job.id, address: job.address, dropboxLink: job.dropbox_shared_link || job.dropbox_link || "" },
        recipients
      });
    } catch (e) {
      console.error("[rfq/recipients]", e);
      return err(res, 500, "Failed to load recipients.");
    }
  });

  // Send an update (e.g. the corrected plans link) to selected recipients, threaded as a reply.
  app.post("/api/rfq/notify-recipients", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { jobId, rfqIds, message } = req.body || {};
      if (!jobId || !Array.isArray(rfqIds) || rfqIds.length === 0) return err(res, 400, "jobId and rfqIds[] required.");
      const body = String(message || "").trim();
      if (!body) return err(res, 400, "message required.");
      const { data: job } = await s.from("jobs").select("id, address").eq("id", jobId).maybeSingle();
      if (!job) return err(res, 404, "Job not found.");
      const { data: rfqs } = await s
        .from("rfqs").select("id, trade, subcontractor_id, sent_message_id, email_body")
        .eq("job_id", jobId).in("id", rfqIds);
      const subIds = [...new Set((rfqs || []).map((r) => r.subcontractor_id).filter(Boolean))];
      let subMap = {};
      if (subIds.length) {
        const { data: subs } = await s.from("subcontractors").select("id, business_name, email").in("id", subIds);
        subMap = Object.fromEntries((subs || []).map((x) => [x.id, x]));
      }
      const subjectOf = (b) => { const m = /^Subject:\s*(.+)$/im.exec(String(b || "")); return m ? m[1].trim() : ""; };

      const rows = rfqs || [];
      const htmlBody = wrapPlainTextEmailHtml(body);
      const nowIso = new Date().toISOString();

      // Build one send spec per recipient that has an email; the rest are recorded as failures.
      const results = [];
      const specs = [];
      for (const r of rows) {
        const sub = subMap[r.subcontractor_id] || {};
        const to = String(sub.email || "").trim();
        if (!to) { results.push({ rfqId: r.id, ok: false, error: "no email" }); continue; }
        const baseSubj = subjectOf(r.email_body) || `RFQ — ${tradeLabel(r.trade) || r.trade} — ${job.address}`;
        const subject = /^re:/i.test(baseSubj) ? baseSubj : `Re: ${baseSubj}`;
        const headers = {};
        if (r.sent_message_id) {
          const mid = `<${String(r.sent_message_id).replace(/^<|>$/g, "")}>`;
          headers["In-Reply-To"] = mid;
          headers["References"] = mid;
        }
        specs.push({ r, to, subject, headers });
      }

      // Log everyone who actually went out, in ONE batched insert (best-effort).
      const logCorrespondence = async (out) => {
        if (!out.length) return;
        try {
          await s.from("correspondence").insert(out.map(({ r, subject }) => ({
            job_id: job.id, rfq_id: r.id, subcontractor_id: r.subcontractor_id || null,
            direction: "outbound", subject, body, sent_at: nowIso, logged_by: "rfq-notify"
          })));
        } catch (cErr) { console.warn("[rfq/notify] correspondence", cErr?.message || cErr); }
      };

      // Preferred path: ONE Resend Batch API call for every recipient. Sending them as separate
      // concurrent requests trips Resend's per-second rate limit and the rejected ones fall back
      // to slow SMTP (~2 min each) — which is what made a 19-recipient send hang. One call ≈ 1–2s.
      let batched = false;
      if (specs.length && resendSendConfigured()) {
        try {
          const ids = await sendBatchViaResend(specs.map((sp) => ({
            to: sp.to, subject: sp.subject, text: body, html: htmlBody, headers: sp.headers
          })));
          for (let i = 0; i < specs.length; i++) {
            results.push({ rfqId: specs[i].r.id, ok: true, to: specs[i].to, transport: "resend-batch", messageId: ids[i]?.id || null });
            // Capture the per-recipient Resend id (ids[] maps 1:1 to specs[]) so the Resend webhook
            // can attribute delivery/open/click/bounce events to this RFQ. Best-effort, sequential.
            if (ids[i]?.id) await captureResendId(s, specs[i].r.id, ids[i].id);
          }
          await logCorrespondence(specs.map((sp) => ({ r: sp.r, subject: sp.subject })));
          batched = true;
        } catch (batchErr) {
          console.warn("[rfq/notify] Resend batch failed, falling back to per-send:", batchErr?.message || batchErr);
        }
      }

      // Fallback (Resend not configured, or the batch call failed): per-send with a hard timeout
      // so one slow/hung transport can't block the batch past the proxy's ~30s response limit.
      if (!batched && specs.length) {
        const SEND_TIMEOUT_MS = 20000;
        const CONCURRENCY = 3;
        const withTimeout = (promise, ms, label) => {
          let t;
          const timer = new Promise((_, reject) => {
            t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
          });
          return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(t)), timer]);
        };
        const outcome = new Array(specs.length);
        let cursor = 0;
        const worker = async () => {
          while (cursor < specs.length) {
            const i = cursor++;
            const sp = specs[i];
            try {
              const transport = await withTimeout(
                sendPlainMail({ to: sp.to, subject: sp.subject, text: body, html: htmlBody, headers: sp.headers }),
                SEND_TIMEOUT_MS, `Send to ${sp.to}`
              );
              outcome[i] = { ok: true, sp, transport };
            } catch (sendErr) {
              outcome[i] = { ok: false, sp, error: sendErr?.message || String(sendErr) };
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, specs.length) || 1 }, worker));
        const okOnes = [];
        for (const o of outcome) {
          if (o.ok) { results.push({ rfqId: o.sp.r.id, ok: true, to: o.sp.to, transport: o.transport }); okOnes.push({ r: o.sp.r, subject: o.sp.subject }); }
          else { results.push({ rfqId: o.sp.r.id, ok: false, to: o.sp.to, error: o.error }); }
        }
        await logCorrespondence(okOnes);
      }

      const sent = results.filter((x) => x && x.ok).length;
      return ok(res, { sent, total: results.length, results });
    } catch (e) {
      console.error("[rfq/notify-recipients]", e);
      return err(res, 500, "Failed to send notifications.");
    }
  });

  // ── List all packages ────────────────────────────────────────────────────
  app.get("/api/rfq-packages", requireAuth, async (_req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { data, error } = await s
        .from("rfq_packages")
        .select(`
          id, project_address, project_type, tender_deadline, architect_client,
          dropbox_url, coverage_score, suggested_trades, status, created_at, updated_at, job_id,
          rfq_trade_scopes (
            id, trade_id, trade_label, status,
            rfq_recipients ( id, status, quote_amount )
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ok(res, { packages: rowsToCamel(data || []) });
    } catch (e) {
      console.error("[rfq-packages] list", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Create package (called from RfqEngine after successful send) ─────────
  app.post("/api/rfq-packages", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const {
        job_id, project_address, project_type, tender_deadline, architect_client,
        dropbox_url, extraction_data, pdf_meta, trade_scopes
      } = req.body;

      if (!project_address) return err(res, 400, "project_address required");
      if (!job_id) return err(res, 400, "job_id required — every RFQ package must be linked to a job");

      const handoff = await assertJobReadyForRfqHandoff(s, job_id);
      if (!handoff.ok) return err(res, handoff.status, handoff.error, handoff.code);

      const intel = await buildRfqTradeIntelligence({
        db: s,
        extraction: extraction_data || {},
        jobId: job_id
      });

      const { data: pkg, error: pkgErr } = await s
        .from("rfq_packages")
        .insert({
          job_id,
          project_address,
          project_type: project_type || "",
          tender_deadline: tender_deadline || "",
          architect_client: architect_client || "",
          dropbox_url: dropbox_url || "",
          extraction_data: extraction_data || {},
          pdf_meta: pdf_meta || [],
          coverage_score: 0,
          suggested_trades: [],
          estimate_baseline: intel.estimate_baseline,
          missing_trade_analysis: intel.missing_trade_analysis,
          trade_coverage: intel.trade_coverage,
          status: "active"
        })
        .select("id")
        .single();
      if (pkgErr) throw pkgErr;

      // Insert trade scopes + recipients in batch
      for (const scope of trade_scopes || []) {
        const { data: ts, error: tsErr } = await s
          .from("rfq_trade_scopes")
          .insert({
            package_id: pkg.id,
            trade_id: scope.trade_id,
            trade_label: scope.trade_label || TRADE_LABEL_MAP[scope.trade_id] || tradeLabel(scope.trade_id),
            scope_bullets: scope.scope_bullets || [],
            exclusions: scope.exclusions || [],
            questions: scope.questions || [],
            contractor_notes: scope.contractor_notes || "",
            due_date: scope.due_date || tender_deadline || "",
            attachments: scope.attachments || [],
            status: scope.recipients?.length ? "sent" : "draft",
            estimate_category: ESTIMATE_CATEGORY[scope.trade_id] || "",
            source: scope.source || "manual",
            ai_enrichment: scope.ai_enrichment || [],
            estimate_line_refs: scope.estimate_line_refs || []
          })
          .select("id")
          .single();
        if (tsErr) throw tsErr;

        for (const r of scope.recipients || []) {
          const { error: recErr } = await s.from("rfq_recipients").insert({
            trade_scope_id: ts.id,
            package_id: pkg.id,
            subcontractor_id: r.subcontractor_id || null,
            business_name: r.business_name,
            email: r.email,
            status: r.status || "sent",
            sent_at: r.sent_at || new Date().toISOString(),
            email_subject: r.email_subject || "",
            email_body: r.email_body || "",
            rfq_id: r.rfq_id || null
          });
          if (recErr) throw recErr;
        }
      }

      await reconcilePackageTradeCoverage(s, pkg.id);

      return ok(res, { packageId: pkg.id });
    } catch (e) {
      console.error("[rfq-packages] create", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Get single package with all detail ──────────────────────────────────
  app.get("/api/rfq-packages/:id", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { data: pkg, error } = await s
        .from("rfq_packages")
        .select(`
          *,
          rfq_trade_scopes (
            *,
            rfq_recipients (*)
          ),
          rfq_addenda (*)
        `)
        .eq("id", req.params.id)
        .single();
      if (error) throw error;
      if (!pkg) return err(res, 404, "Package not found");
      try {
        await reconcilePackageTradeCoverage(s, req.params.id);
        const { data: refreshed } = await s
          .from("rfq_packages")
          .select(`
            *,
            rfq_trade_scopes (
              *,
              rfq_recipients (*)
            ),
            rfq_addenda (*)
          `)
          .eq("id", req.params.id)
          .single();
        return ok(res, { package: rowToCamel(refreshed || pkg) });
      } catch (reconcileErr) {
        console.warn("[rfq-packages] reconcile on GET", reconcileErr?.message || reconcileErr);
      }
      return ok(res, { package: rowToCamel(pkg) });
    } catch (e) {
      console.error("[rfq-packages] get", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Update package metadata ──────────────────────────────────────────────
  app.patch("/api/rfq-packages/:id", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const allowed = ["tender_deadline", "architect_client", "dropbox_url", "status", "project_type"];
      const patch = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      patch.updated_at = new Date().toISOString();
      const { error } = await s.from("rfq_packages").update(patch).eq("id", req.params.id);
      if (error) throw error;
      return ok(res);
    } catch (e) {
      console.error("[rfq-packages] patch", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Update trade scope ───────────────────────────────────────────────────
  app.patch("/api/rfq-packages/:packageId/scopes/:tradeId", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const allowed = [
        "scope_bullets", "exclusions", "questions", "internal_notes",
        "contractor_notes", "due_date", "attachments", "status", "estimate_category"
      ];
      const patch = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      patch.updated_at = new Date().toISOString();
      const { error } = await s
        .from("rfq_trade_scopes")
        .update(patch)
        .eq("package_id", req.params.packageId)
        .eq("trade_id", req.params.tradeId);
      if (error) throw error;
      return ok(res);
    } catch (e) {
      console.error("[rfq-packages] patch-scope", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Add a new trade scope (for suggested/missing trades) ─────────────────
  app.post("/api/rfq-packages/:packageId/scopes", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { trade_id, trade_label, scope_bullets, due_date } = req.body;
      if (!trade_id) return err(res, 400, "trade_id required");

      // Fetch package for deadline fallback
      const { data: pkg } = await s
        .from("rfq_packages")
        .select("id, tender_deadline, suggested_trades")
        .eq("id", req.params.packageId)
        .single();

      const { data: ts, error } = await s
        .from("rfq_trade_scopes")
        .insert({
          package_id: req.params.packageId,
          trade_id,
          trade_label: trade_label || TRADE_LABEL_MAP[trade_id] || trade_id,
          scope_bullets: scope_bullets || [],
          due_date: due_date || pkg?.tender_deadline || "",
          status: "draft",
          estimate_category: ESTIMATE_CATEGORY[trade_id] || ""
        })
        .select("*")
        .single();
      if (error) throw error;

      // Remove from suggested_trades
      if (pkg) {
        const newSuggested = (pkg.suggested_trades || []).filter((sg) => sg.tradeId !== trade_id);
        await s.from("rfq_packages")
          .update({ suggested_trades: newSuggested, updated_at: new Date().toISOString() })
          .eq("id", req.params.packageId);
      }

      return ok(res, { scope: rowToCamel(ts) });
    } catch (e) {
      console.error("[rfq-packages] add-scope", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Send RFQ to additional recipients for a trade ────────────────────────
  app.post("/api/rfq-packages/:packageId/scopes/:tradeId/send", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { recipients, email_subject, email_body, due_date } = req.body;
      if (!recipients?.length) return err(res, 400, "recipients required");

      // Fetch scope
      const { data: scope, error: scopeErr } = await s
        .from("rfq_trade_scopes")
        .select("*, rfq_packages(project_address, tender_deadline, job_id)")
        .eq("package_id", req.params.packageId)
        .eq("trade_id", req.params.tradeId)
        .single();
      if (scopeErr || !scope) return err(res, 404, "Trade scope not found");

      const pkgJobId = (Array.isArray(scope.rfq_packages) ? scope.rfq_packages[0] : scope.rfq_packages)?.job_id;
      if (pkgJobId) {
        const handoff = await assertJobReadyForRfqHandoff(s, pkgJobId);
        if (!handoff.ok) return err(res, handoff.status, handoff.error, handoff.code);
      }

      const pkg = Array.isArray(scope.rfq_packages) ? scope.rfq_packages[0] : scope.rfq_packages;
      const address = pkg?.project_address || "";
      const sentAt = new Date().toISOString();
      const results = [];

      for (const r of recipients) {
        const to = r.email?.trim();
        if (!to) { results.push({ email: to, ok: false, error: "No email" }); continue; }

        try {
          const messageId = generateOutboundMessageId();
          const { resendId } = await sendPlainMail({
            to,
            subject: email_subject,
            text: email_body,
            headers: { "Message-ID": messageId }
          });

          // Insert recipient row
          const { data: rec } = await s.from("rfq_recipients").insert({
            trade_scope_id: scope.id,
            package_id: req.params.packageId,
            subcontractor_id: r.subcontractor_id || null,
            business_name: r.business_name || to,
            email: to,
            status: "sent",
            sent_at: sentAt,
            email_subject: email_subject || "",
            email_body: email_body || ""
          }).select("id").single();

          // Also create an rfqs row so it appears in quote-tracker. rfqs.subcontractor_id is
          // NOT NULL, so this is only possible for known subcontractors — ad-hoc email-only
          // recipients are tracked via rfq_recipients alone (H1). Previously the insert was
          // attempted with a null id and failed silently, dropping the recipient from tracking.
          if (pkg?.job_id && r.subcontractor_id) {
            // INSERT uses ONLY pre-102 columns so the rfqs row (which the Tender Board + quote
            // tracker depend on) ALWAYS gets created — even before migration 102 is applied by hand.
            // resend_email_id is captured SEPARATELY below (best-effort) so an unknown column can
            // never PostgREST-400 the whole INSERT and silently drop the send from tracking.
            const { data: rfqRow, error: rfqErr } = await s.from("rfqs").insert({
              job_id: pkg.job_id,
              subcontractor_id: r.subcontractor_id,
              trade: scope.trade_label,
              status: "sent",
              sent_at: sentAt,
              sent_message_id: messageId,
              deadline: due_date || scope.due_date || pkg.tender_deadline || null,
              email_body: `Subject: ${email_subject || ""}\n\n${email_body || ""}`
            }).select("id").single();
            if (rfqErr) {
              console.warn("[rfq-package/send] rfqs insert failed:", rfqErr.message);
            } else if (rfqRow) {
              if (rec) await s.from("rfq_recipients").update({ rfq_id: rfqRow.id }).eq("id", rec.id);
              if (resendId) await captureResendId(s, rfqRow.id, resendId);
              await s.from("correspondence").insert({
                job_id: pkg.job_id,
                rfq_id: rfqRow.id,
                subcontractor_id: r.subcontractor_id,
                direction: "outbound",
                subject: email_subject || "",
                body: String(email_body || "").slice(0, 16000),
                sent_at: sentAt,
                logged_by: "rfq-package-send",
                message_id: messageId
              }).then(() => {}).catch((e) => console.warn("[rfq-package/send] correspondence:", e?.message));
            }
          }

          results.push({ email: to, ok: true });
        } catch (sendErr) {
          results.push({ email: to, ok: false, error: sendErr.message });
        }
      }

      // Update scope status — only when ALL sends succeeded
      // NOTE: partial success leaves scope in prior status even if some recipients got the email.
      // Staff should fix failing addresses and resend to resolve a partial failure.
      const allSent = results.every((r) => r.ok);
      if (allSent) {
        await s.from("rfq_trade_scopes")
          .update({ status: "sent", updated_at: sentAt })
          .eq("id", scope.id);
      }

      // Recalculate coverage — W06-DRIFT-007: unified on the trade-intelligence calculator
      // (same as package create/refresh) instead of the legacy count/32 estimate.
      await reconcilePackageTradeCoverage(s, req.params.packageId);

      const anyFailed = results.some((r) => !r.ok);
      return res.json({ ok: !anyFailed, partial: anyFailed, results });
    } catch (e) {
      console.error("[rfq-packages] send-scope", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Update recipient (quote amount, status, etc.) ────────────────────────
  app.patch("/api/rfq-packages/:packageId/recipients/:recipientId", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const allowed = [
        "status", "quote_amount", "quote_exclusions", "quote_pdf_path",
        "quote_received_at", "follow_up_due", "follow_up_sent_at"
      ];
      const patch = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      patch.updated_at = new Date().toISOString();

      // Auto-set quote_received_at when marking received
      if (patch.status === "received" && !patch.quote_received_at) {
        patch.quote_received_at = new Date().toISOString();
      }

      const { data: rec, error } = await s
        .from("rfq_recipients")
        .update(patch)
        .eq("id", req.params.recipientId)
        .eq("package_id", req.params.packageId)
        .select("rfq_id, quote_amount, status")
        .single();
      if (error) throw error;

      // Mirror status + quote_amount to rfqs table if linked
      if (rec?.rfq_id) {
        const rfqPatch = {};
        if (patch.status === "received")  rfqPatch.status = "received";
        if (patch.status === "declined")  rfqPatch.status = "declined";
        if (patch.status === "accepted")  rfqPatch.status = "accepted";   // FIX: CRIT-002 — was missing
        if (patch.quote_amount !== undefined) rfqPatch.quote_amount = patch.quote_amount;
        if (patch.quote_received_at) rfqPatch.received_at = patch.quote_received_at;
        // (rfqs has no accepted_at column — accept state lives on rfq_recipients.status)
        if (Object.keys(rfqPatch).length) {
          await s.from("rfqs").update(rfqPatch).eq("id", rec.rfq_id);
        }
      }

      // Propagate "received" status to parent trade scope
      if (patch.status === "received") {
        const { data: recRow } = await s
          .from("rfq_recipients")
          .select("trade_scope_id")
          .eq("id", req.params.recipientId)
          .single();
        if (recRow?.trade_scope_id) {
          await s.from("rfq_trade_scopes")
            .update({ status: "received", updated_at: new Date().toISOString() })
            .eq("id", recRow.trade_scope_id);
        }
      }

      return ok(res);
    } catch (e) {
      console.error("[rfq-packages] patch-recipient", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Send follow-up emails ────────────────────────────────────────────────
  app.post("/api/rfq-packages/:packageId/follow-up", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { recipient_ids } = req.body;
      if (!recipient_ids?.length) return err(res, 400, "recipient_ids required");

      const { data: recipients, error } = await s
        .from("rfq_recipients")
        .select("*, rfq_trade_scopes(trade_label, rfq_packages(project_address, tender_deadline))")
        .in("id", recipient_ids)
        .eq("package_id", req.params.packageId);
      if (error) throw error;

      const sigName = process.env.SAM_NAME?.trim() || "Blue Leaf Building";
      const results = [];

      for (const r of recipients || []) {
        const scope = Array.isArray(r.rfq_trade_scopes) ? r.rfq_trade_scopes[0] : r.rfq_trade_scopes;
        const pkg = scope ? (Array.isArray(scope.rfq_packages) ? scope.rfq_packages[0] : scope.rfq_packages) : null;
        const to = r.email?.trim();
        if (!to) { results.push({ id: r.id, ok: false, error: "No email" }); continue; }

        try {
          const text = buildFollowUpText({
            name: r.business_name?.split(" ")[0] || "there",
            address: pkg?.project_address || "the project",
            deadline: r.follow_up_due
              ? new Date(r.follow_up_due).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
              : pkg?.tender_deadline || "",
            trade: scope?.trade_label || "your trade",
            sigName
          });
          const subject = `Follow-up — ${scope?.trade_label || "quote"} at ${pkg?.project_address || "project"}`;
          await sendPlainMail({ to, subject, text, html: wrapPlainTextEmailHtml(text, {}) });
          await s.from("rfq_recipients")
            .update({ status: "followed_up", follow_up_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", r.id);
          results.push({ id: r.id, ok: true });
        } catch (sendErr) {
          results.push({ id: r.id, ok: false, error: sendErr.message });
        }
      }

      return res.json({ ok: results.every((r) => r.ok), results });
    } catch (e) {
      console.error("[rfq-packages] follow-up", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Addenda: create + send ───────────────────────────────────────────────
  // Eligible recipient statuses: sent, reminded, followed_up
  app.post("/api/rfq-packages/:packageId/addenda", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { name, affected_trades, send_emails } = req.body;
      if (!name) return err(res, 400, "name required");

      // Auto-number
      const { data: existing } = await s
        .from("rfq_addenda")
        .select("number")
        .eq("package_id", req.params.packageId)
        .order("number", { ascending: false })
        .limit(1);
      const nextNum = (existing?.[0]?.number || 0) + 1;

      const { data: addendum, error } = await s
        .from("rfq_addenda")
        .insert({
          package_id: req.params.packageId,
          number: nextNum,
          name,
          affected_trades: affected_trades || []
        })
        .select("*")
        .single();
      if (error) throw error;

      const results = [];
      if (send_emails && affected_trades?.length) {
        // Fetch recipients for affected trades in this package
        const { data: scopes } = await s
          .from("rfq_trade_scopes")
          .select("id, trade_label, rfq_recipients(id, email, business_name, status)")
          .eq("package_id", req.params.packageId)
          .in("trade_id", affected_trades);

        const { data: pkg } = await s
          .from("rfq_packages")
          .select("project_address")
          .eq("id", req.params.packageId)
          .single();

        const sigName = process.env.SAM_NAME?.trim() || "Blue Leaf Building";
        for (const scope of scopes || []) {
          for (const r of scope.rfq_recipients || []) {
            // Eligible: sent, reminded, or followed_up (not draft, received, accepted, declined)
            if (!["sent", "reminded", "followed_up"].includes(r.status)) continue;
            const to = r.email?.trim();
            if (!to) continue;
            try {
              const text = [
                `Hi ${r.business_name?.split(" ")[0] || "there"},`,
                "",
                `Please note Addendum ${nextNum} — ${name} has been issued for ${pkg?.project_address || "this project"}.`,
                "This addendum affects your trade scope. Please review and update your quote if necessary.",
                "",
                `If you have any questions, don't hesitate to contact us.`,
                "",
                "Thanks,",
                sigName
              ].join("\n");
              await sendPlainMail({
                to,
                subject: `Addendum ${nextNum} — ${pkg?.project_address || "project"}`,
                text
              });
              results.push({ email: to, ok: true });
            } catch (e) {
              results.push({ email: to, ok: false, error: e.message });
            }
          }
        }
        await s.from("rfq_addenda")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", addendum.id);
      }

      return ok(res, { addendum: rowToCamel(addendum), emailResults: results });
    } catch (e) {
      console.error("[rfq-packages] addenda", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Delete a recipient ───────────────────────────────────────────────────
  app.delete("/api/rfq-packages/:packageId/recipients/:recipientId", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { error } = await s
        .from("rfq_recipients")
        .delete()
        .eq("id", req.params.recipientId)
        .eq("package_id", req.params.packageId);
      if (error) throw error;
      return ok(res);
    } catch (e) {
      console.error("[rfq-packages] delete-recipient", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // ── Delete a package ─────────────────────────────────────────────────────
  app.delete("/api/rfq-packages/:id", requireAuth, async (req, res) => {
    const s = db();
    if (!s) return err(res, 503, "Database not configured.");
    try {
      const { error } = await s.from("rfq_packages").delete().eq("id", req.params.id);
      if (error) throw error;
      return ok(res);
    } catch (e) {
      console.error("[rfq-packages] delete", e);
      return err(res, 500, translateDbError(e));
    }
  });
}

