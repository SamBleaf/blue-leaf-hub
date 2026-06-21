/**
 * Client Portal v2.0 — authenticated client API.
 *
 * Mounted at /api/portal/app/:projectId/*  (JWT) and select read routes also
 * reachable via the legacy token. Every route runs requirePortalAuth, which
 * sets req.portalSession = { projectId, userId, isAuthenticated, authType, role, project }.
 *
 * LAWS honoured here:
 *   • Field allowlists — never SELECT * on tables that contain builder cost /
 *     margin / internal notes. job_variations.cost_to_builder, amount_ex_gst,
 *     line_items and *.internal_notes are NEVER returned to a client.
 *   • Bridge portal(project_id) ⟷ finance(job_id) via projects.job_id.
 *   • Inc-GST amounts are read from the canonical GENERATED columns
 *     (job_variations.amount_inc_gst, progress_claims.amount_inc_gst) — no GST math.
 *   • Dropbox reads are sequential, one file per request (never Promise.all).
 *   • Responses use ok()/err()/rowsToCamel() and the { ok, ... } shape.
 *   • Contractual writes write an immutable portal_audit_logs row before responding.
 */
import {
  dropboxConfigured,
  dropboxDownloadBuffer,
  getDropboxAccessToken
} from "./dropboxClient.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { sendPlainMail } from "./notifyMail.mjs";
import {
  requirePortalAuth,
  requirePortalLogin,
  requirePortalWrite
} from "./requirePortalAuth.mjs";

// ── Field allowlists (real column names, verified against schema) ────────────
// portal_decisions money column is cost_delta (ex-GST). Inc-GST comes from the
// joined job_variations row. NEVER include cost_to_builder / amount_ex_gst.
const PORTAL_DECISION_FIELDS = [
  "id", "project_id", "type", "title", "description", "due_date", "urgency",
  "status", "schedule_delta", "options", "chosen_option_id",
  "client_note", "responded_at", "created_at", "job_variation_id",
  "requires_photo_evidence", "photo_evidence_urls", "signed_pdf_url",
  "rejection_reason", "builder_reasoning"
  // NEVER: cost_delta (carries ex-GST), cost_to_builder, amount_ex_gst.
  // requires_dual_approval/second_approval_at omitted — not yet enforced server-side,
  // so the UI must not imply a control that doesn't exist (see audit follow-up).
];

// From the canonical job_variations join — inc-GST only, never builder pricing.
const PORTAL_VARIATION_JOIN_FIELDS =
  "id, variation_number, title, description, amount_inc_gst, eot_days, status, sent_date, signed_date, document_url, signed_document_url";

// portal_claims real columns + the v2 link/feedback columns. NEVER amount_ex_gst.
const PORTAL_CLAIMS_FIELDS = [
  "id", "project_id", "stage_name", "amount", "status", "due_approx", "paid_at",
  "sort_order", "created_at", "progress_claim_id", "payment_instructions",
  "viewed_at", "client_payment_notified_at"
];

// From the canonical progress_claims join — inc-GST only.
const PROGRESS_CLAIM_JOIN_FIELDS =
  "id, claim_number, stage, amount_inc_gst, status, issued_date, due_date, document_url";

// selection_options for the client — NEVER internal_notes.
const PORTAL_SELECTION_OPTION_FIELDS =
  "id, label, product_name, supplier, model_code, price_inc_gst, lead_time_weeks, description, image_url, is_recommended, sort_order";

// client_selections for the client — NEVER internal_notes.
const CLIENT_SELECTION_FIELDS =
  "id, project_id, category, item_name, room_area, due_date, lead_time_weeks, order_by_date, allowance_amount, status, selected_product, selected_supplier, selected_model_code, cost_impact, time_impact_days, client_notes, attachments, inspiration_photos, approved_at, sort_order, created_at";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetweenYmd(a, b) {
  if (!a || !b) return null;
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((db - da) / 86400000);
}

function guessContentType(path) {
  const p = String(path || "").toLowerCase();
  if (p.endsWith(".pdf")) return "application/pdf";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

/**
 * Write an immutable audit row. Best-effort but must complete BEFORE a
 * contractual write responds 200 (callers await this).
 */
async function writePortalAudit(sb, { project, session, eventType, entityType, entityId, snapshot, req }) {
  try {
    await sb.from("portal_audit_logs").insert({
      project_id: project.id,
      user_id: session.userId || null,
      user_role: session.role || (session.authType === "token" ? "anonymous_token" : null),
      user_name: project.portal_client_name || session.userEmail || null,
      event_type: eventType,
      entity_type: entityType || null,
      entity_id: entityId || null,
      entity_snapshot: snapshot || null,
      ip_address: req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || null,
      user_agent: req?.headers?.["user-agent"] || null
    });
    return true;
  } catch (e) {
    return false;
  }
}

/** Resolve the job_id bridge for a project (finance tables key on job_id). */
function jobIdOf(project) {
  return project?.job_id || null;
}

/**
 * @param {import("express").Express} app
 */
export function registerPortalV2Routes(app) {
  const base = "/api/portal/app/:projectId";

  // ── Resolve the logged-in client's project(s) — service-role, JWT-validated ──
  // This replaces a direct `projects` query from the browser (which RLS 104 now
  // denies clients). Not project-scoped, so it lives OUTSIDE the :projectId
  // namespace and validates the Bearer JWT inline.
  app.get("/api/portal/my-projects", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
      if (!token) return err(res, 401, "Authentication required");
      const { data: { user } = {}, error } = await sb.auth.getUser(token);
      if (error || !user) return err(res, 401, "Invalid or expired session");

      const { data: links } = await sb
        .from("project_client_users")
        .select("project_id, role, is_active, projects(id, address, build_phase, portal_v2_enabled, portal_enabled)")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const projects = (links || [])
        .filter((l) => l.projects && l.projects.portal_enabled)
        .map((l) => ({ projectId: l.project_id, role: l.role, ...rowToCamel(l.projects) }));
      return ok(res, { projects });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── v2 site-photo media (JWT-gated; token via ?t= so <img> can load it) ──────
  // Registered BEFORE the namespace middleware because an <img> tag cannot send an
  // Authorization header. Validates the Supabase token + project_client_users
  // membership + that the photo belongs to THIS project, then streams the bytes.
  app.get("/api/portal/app/:projectId/media/:photoId", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).end();
      const { projectId, photoId } = req.params;
      const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim() || String(req.query.t || "");
      if (!token) return res.status(401).end();
      const { data: { user } = {}, error } = await sb.auth.getUser(token);
      if (error || !user) return res.status(401).end();
      const { data: pcu } = await sb
        .from("project_client_users")
        .select("is_active")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .maybeSingle();
      if (!pcu || pcu.is_active !== true) return res.status(403).end();
      const { data: photo } = await sb
        .from("project_photos")
        .select("storage_path, project_id")
        .eq("id", photoId)
        .maybeSingle();
      if (!photo || photo.project_id !== projectId) return res.status(404).end();
      if (!dropboxConfigured()) return res.status(503).end();
      const accessToken = await getDropboxAccessToken();
      const buf = await dropboxDownloadBuffer(accessToken, photo.storage_path);
      res.setHeader("Content-Type", guessContentType(photo.storage_path));
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.send(buf);
    } catch (e) {
      return res.status(500).end();
    }
  });

  // Every /app/:projectId route is gated by requirePortalAuth (JWT or, where
  // explicitly allowed, token). Mount the middleware on the namespace.
  app.use(base, requirePortalAuth);

  // ── Session bootstrap ──────────────────────────────────────────────────────
  app.get(`${base}/session`, (req, res) => {
    const s = req.portalSession;
    return ok(res, {
      session: {
        projectId: s.projectId,
        role: s.role,
        isAuthenticated: s.isAuthenticated,
        authType: s.authType,
        buildPhase: s.project.build_phase || "pre_construction",
        address: s.project.address,
        clientName: s.project.portal_client_name,
        portalV2Enabled: !!s.project.portal_v2_enabled
      }
    });
  });

  // ── Home aggregate ─────────────────────────────────────────────────────────
  app.get(`${base}/home`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { project } = req.portalSession;
      const projectId = project.id;
      const jobId = jobIdOf(project);
      const today = todayYmd();

      // Current stage (is_current flag; fall back to first unachieved by order).
      let { data: current } = await sb
        .from("portal_milestones")
        .select("key, label, confidence, confidence_note, eta, sort_order, stage_preview")
        .eq("project_id", projectId)
        .eq("is_current", true)
        .maybeSingle();
      if (!current) {
        const { data: firstOpen } = await sb
          .from("portal_milestones")
          .select("key, label, confidence, confidence_note, eta, sort_order, stage_preview")
          .eq("project_id", projectId)
          .is("achieved_at", null)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        current = firstOpen || null;
      }

      // Milestone counts for progress.
      const { data: milestones } = await sb
        .from("portal_milestones")
        .select("achieved_at, sort_order, label")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      const msList = milestones || [];
      const achieved = msList.filter((m) => m.achieved_at).length;
      const progressPct = msList.length ? Math.round((achieved / msList.length) * 100) : 0;
      const nextMilestone = msList.find((m) => !m.achieved_at)?.label || null;

      // Pending action count.
      const { count: actionCount } = await sb
        .from("client_actions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .in("status", ["pending", "viewed", "overdue"]);

      // Next pending action (drives the greeting "your next decision").
      const { data: nextAction } = await sb
        .from("client_actions")
        .select("title, action_type, due_date")
        .eq("project_id", projectId)
        .in("status", ["pending", "viewed", "overdue"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      // Latest published update.
      const { data: latestUpdate } = await sb
        .from("portal_updates")
        .select("headline, body, builder_reasoning, week_of, created_at")
        .eq("project_id", projectId)
        .eq("published", true)
        .order("week_of", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Recent photos (cap 8).
      const { data: photos } = await sb
        .from("project_photos")
        .select("id, caption, taken_at, is_hero")
        .eq("project_id", projectId)
        .order("taken_at", { ascending: false })
        .limit(8);

      // Coming up — next 3 selections by due date (NOT internal_notes).
      const { data: comingUp } = await sb
        .from("client_selections")
        .select("id, item_name, category, due_date, status")
        .eq("project_id", projectId)
        .in("status", ["not_started", "awaiting_client"])
        .gte("due_date", today)
        .order("due_date", { ascending: true })
        .limit(3);

      // Unread message count (messages from builder not yet read).
      const { count: unreadMessages } = await sb
        .from("portal_messages")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("sender", "builder")
        .is("read_at", null);

      // Financial snapshot — all inc-GST from canonical generated columns. No builder cost.
      const financial = await buildFinancialSnapshot(sb, project, jobId);

      return ok(res, {
        home: {
          buildPhase: project.build_phase || "pre_construction",
          clientName: project.portal_client_name,
          address: project.address,
          currentStage: current
            ? {
                key: current.key,
                label: current.label,
                confidence: current.confidence || "on_track",
                confidenceNote: current.confidence_note || null,
                eta: current.eta || null,
                stagePreview: current.stage_preview || null
              }
            : null,
          progressPct,
          nextMilestone,
          actionCount: actionCount || 0,
          nextAction: nextAction ? rowToCamel(nextAction) : null,
          latestUpdate: latestUpdate ? rowToCamel(latestUpdate) : null,
          recentPhotos: rowsToCamel(photos),
          comingUp: rowsToCamel(comingUp),
          unreadMessages: unreadMessages || 0,
          team: Array.isArray(project.team_members) ? project.team_members : [],
          financial
        }
      });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load home");
    }
  });

  // ── My Actions feed ────────────────────────────────────────────────────────
  app.get(`${base}/actions`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;

      const { data: actions, error } = await sb
        .from("client_actions")
        .select(
          "id, action_type, title, description, related_entity_type, related_entity_id, due_date, priority, status, created_at, updated_at"
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) return err(res, 500, translateDbError(error));

      const open = (actions || []).filter((a) =>
        ["pending", "viewed", "overdue"].includes(a.status)
      );
      const completed = (actions || []).filter((a) =>
        ["responded", "approved", "rejected", "completed"].includes(a.status)
      );
      return ok(res, { open: rowsToCamel(open), completed: rowsToCamel(completed) });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load actions");
    }
  });

  app.post(`${base}/actions/:actionId/view`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;
      const { actionId } = req.params;
      await sb
        .from("client_actions")
        .update({ status: "viewed", updated_at: new Date().toISOString() })
        .eq("id", actionId)
        .eq("project_id", projectId)
        .eq("status", "pending");
      return ok(res);
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Variation detail ───────────────────────────────────────────────────────
  app.get(`${base}/variations/:decisionId`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;
      const { decisionId } = req.params;

      const { data: decision } = await sb
        .from("portal_decisions")
        .select(PORTAL_DECISION_FIELDS.join(", "))
        .eq("id", decisionId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (!decision) return err(res, 404, "Variation not found");

      let variation = null;
      if (decision.job_variation_id) {
        const { data: jv } = await sb
          .from("job_variations")
          .select(PORTAL_VARIATION_JOIN_FIELDS)
          .eq("id", decision.job_variation_id)
          .maybeSingle();
        variation = jv ? rowToCamel(jv) : null;
      }

      // Audit the view (best-effort, non-blocking for a read).
      await writePortalAudit(sb, {
        project: req.portalSession.project,
        session: req.portalSession,
        eventType: "variation.viewed",
        entityType: "portal_decision",
        entityId: decisionId,
        req
      });

      return ok(res, { decision: rowToCamel(decision), variation });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load variation");
    }
  });

  // ── Variation respond (approve / decline) — contractual write ─────────────
  app.post(
    `${base}/variations/:decisionId/respond`,
    requirePortalLogin,
    requirePortalWrite,
    async (req, res) => {
      try {
        const sb = getServiceSupabase();
        if (!sb) return err(res, 503, "DB not configured");
        const { project, session } = { project: req.portalSession.project, session: req.portalSession };
        const projectId = project.id;
        const { decisionId } = req.params;
        const action = String(req.body?.action || "").toLowerCase();
        const note = req.body?.note ? String(req.body.note) : null;
        if (!["approve", "decline"].includes(action)) {
          return err(res, 400, "action must be 'approve' or 'decline'");
        }

        const { data: decision } = await sb
          .from("portal_decisions")
          .select("id, project_id, type, status, job_variation_id, title")
          .eq("id", decisionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (!decision) return err(res, 404, "Variation not found");
        if (decision.status !== "pending") {
          return err(res, 409, "This variation has already been responded to.");
        }

        const newStatus = action === "approve" ? "approved" : "declined";
        const nowIso = new Date().toISOString();

        // 1. Update portal_decisions — ATOMIC conditional transition. The WHERE
        //    status='pending' makes the money write race-safe: a concurrent double-
        //    submit only changes the row once; the loser gets zero rows → 409. This
        //    prevents duplicate audit entries / duplicate builder emails / a
        //    non-deterministic approve-vs-decline last-writer-wins.
        const { data: changed, error: updErr } = await sb
          .from("portal_decisions")
          .update({
            status: newStatus,
            responded_at: nowIso,
            client_user_id: session.userId,
            client_note: note,
            rejection_reason: action === "decline" ? note : null
          })
          .eq("id", decisionId)
          .eq("project_id", projectId)
          .eq("status", "pending")
          .select("id");
        if (updErr) return err(res, 500, translateDbError(updErr));
        if (!changed || changed.length === 0) {
          return err(res, 409, "This variation has already been responded to.");
        }

        // 2. Immutable audit BEFORE finishing.
        const audited = await writePortalAudit(sb, {
          project,
          session,
          eventType: action === "approve" ? "variation.approved" : "variation.rejected",
          entityType: "portal_decision",
          entityId: decisionId,
          snapshot: { title: decision.title, newStatus, note },
          req
        });
        if (!audited) {
          // Roll the decision back rather than record an un-audited approval.
          await sb.from("portal_decisions").update({ status: "pending", responded_at: null }).eq("id", decisionId);
          return err(res, 500, "Could not record approval audit — no change made. Please retry.");
        }

        // 3. Notify the builder. IMPORTANT (contract integrity): the client clicking
        //    "Approve" is a timestamped ACKNOWLEDGEMENT, not a contract signature — the
        //    UI disclosure says "Blue Leaf will issue a signed variation document
        //    separately." So we do NOT flip the canonical job_variations record to
        //    'signed' here (that previously misrepresented the contractual state). The
        //    builder reviews and signs in Finance (POST .../variations/:id/sign), which
        //    sets 'signed' and archives the signed PDF via syncVariationSigned. The
        //    client's decision lives on portal_decisions + the immutable audit log.
        try {
          await sendPlainMail({
            to: "admin@blueleafbuilding.com.au",
            subject: `Client ${action === "approve" ? "approved" : "declined"} a variation — ${project.address || projectId}`,
            text: `${project.portal_client_name || "The client"} ${action === "approve" ? "approved" : "declined"} "${decision.title}" in the portal.${note ? `\n\nTheir note: ${note}` : ""}\n\nReview and ${action === "approve" ? "sign" : "action"} it in Finance to update the contract.`
          });
        } catch (_) { /* non-fatal */ }

        // 4. Clear the matching client_action (§0.7 — so the counter clears).
        await sb
          .from("client_actions")
          .update({ status: action === "approve" ? "approved" : "rejected", updated_at: nowIso })
          .eq("project_id", projectId)
          .eq("related_entity_type", "portal_decision")
          .eq("related_entity_id", decisionId);

        return ok(res, { status: newStatus });
      } catch (e) {
        return err(res, 500, e.message || "Failed to respond");
      }
    }
  );

  // ── Claims ─────────────────────────────────────────────────────────────────
  app.get(`${base}/claims`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;

      const { data: claims } = await sb
        .from("portal_claims")
        .select(PORTAL_CLAIMS_FIELDS.join(", "))
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });

      // Enrich with canonical progress_claims (inc-GST, claim number, dates).
      const enriched = [];
      for (const c of claims || []) {
        let canonical = null;
        if (c.progress_claim_id) {
          const { data: pc } = await sb
            .from("progress_claims")
            .select(PROGRESS_CLAIM_JOIN_FIELDS)
            .eq("id", c.progress_claim_id)
            .maybeSingle();
          canonical = pc ? rowToCamel(pc) : null;
        }
        enriched.push({ ...rowToCamel(c), canonical });
      }
      return ok(res, { claims: enriched });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load claims");
    }
  });

  app.post(
    `${base}/claims/:claimId/payment-notify`,
    requirePortalLogin,
    requirePortalWrite,
    async (req, res) => {
      try {
        const sb = getServiceSupabase();
        if (!sb) return err(res, 503, "DB not configured");
        const { project, session } = { project: req.portalSession.project, session: req.portalSession };
        const projectId = project.id;
        const { claimId } = req.params;

        const { data: claim } = await sb
          .from("portal_claims")
          .select("id, project_id, stage_name, amount, status, client_payment_notified_at")
          .eq("id", claimId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (!claim) return err(res, 404, "Claim not found");
        // Idempotent: only the FIRST notification emails the builder + writes the
        // audit. Re-taps (or a notify on an already-paid claim) are no-ops, so a
        // refreshing client can't spam admin@ or litter the audit trail.
        if (claim.client_payment_notified_at) {
          return ok(res, { alreadyNotified: true, notifiedAt: claim.client_payment_notified_at });
        }
        if (claim.status === "paid") {
          return ok(res, { alreadyNotified: true, message: "This claim is already marked paid." });
        }

        const nowIso = new Date().toISOString();
        await sb
          .from("portal_claims")
          .update({ client_payment_notified_at: nowIso })
          .eq("id", claimId);

        await writePortalAudit(sb, {
          project,
          session,
          eventType: "claim.payment_notified",
          entityType: "portal_claim",
          entityId: claimId,
          snapshot: { stage: claim.stage_name, amount: claim.amount },
          req
        });

        // Notify the builder (best-effort).
        try {
          await sendPlainMail({
            to: "admin@blueleafbuilding.com.au",
            subject: `Client marked payment sent — ${project.address || projectId}`,
            text: `${project.portal_client_name || "The client"} has indicated they transferred payment for "${claim.stage_name}" (${project.address || ""}). Please confirm receipt in Finance.`
          });
        } catch (_) { /* non-fatal */ }

        return ok(res, { notifiedAt: nowIso });
      } catch (e) {
        return err(res, 500, e.message || "Failed");
      }
    }
  );

  // ── Selections board ───────────────────────────────────────────────────────
  app.get(`${base}/selections`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;
      const category = req.query.category ? String(req.query.category) : null;

      let q = sb
        .from("client_selections")
        .select(CLIENT_SELECTION_FIELDS)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      if (category && category !== "all") q = q.eq("category", category);
      const { data: selections } = await q;

      const out = [];
      for (const s of selections || []) {
        const { data: options } = await sb
          .from("selection_options")
          .select(PORTAL_SELECTION_OPTION_FIELDS)
          .eq("selection_id", s.id)
          .order("sort_order", { ascending: true });
        out.push({ ...rowToCamel(s), options: rowsToCamel(options) });
      }
      return ok(res, { selections: out });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load selections");
    }
  });

  app.post(
    `${base}/selections/:selectionId/select`,
    requirePortalLogin,
    async (req, res) => {
      try {
        const sb = getServiceSupabase();
        if (!sb) return err(res, 503, "DB not configured");
        const { project, session } = { project: req.portalSession.project, session: req.portalSession };
        const projectId = project.id;
        const { selectionId } = req.params;
        const optionId = req.body?.optionId ? String(req.body.optionId) : null;
        const clientNotes = req.body?.notes ? String(req.body.notes) : null;
        if (!optionId) return err(res, 400, "optionId required");

        const { data: selection } = await sb
          .from("client_selections")
          .select("id, project_id, item_name, allowance_amount, status")
          .eq("id", selectionId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (!selection) return err(res, 404, "Selection not found");
        // Terminal-status guard: once a selection is approved/ordered/installed it is
        // locked — the client must contact Blue Leaf to change it (avoids a client
        // silently overriding an item that's already been ordered from the supplier).
        if (["approved", "ordered", "installed"].includes(selection.status)) {
          return err(res, 409, "This selection has been finalised. Please message us if you need to change it.");
        }

        const { data: option } = await sb
          .from("selection_options")
          .select("id, product_name, supplier, model_code, price_inc_gst")
          .eq("id", optionId)
          .eq("selection_id", selectionId)
          .maybeSingle();
        if (!option) return err(res, 404, "Option not found");

        const costImpact =
          option.price_inc_gst != null && selection.allowance_amount != null
            ? Number(option.price_inc_gst) - Number(selection.allowance_amount)
            : null;

        const nowIso = new Date().toISOString();
        const { error: updErr } = await sb
          .from("client_selections")
          .update({
            selected_product: option.product_name,
            selected_supplier: option.supplier,
            selected_model_code: option.model_code,
            cost_impact: costImpact,
            client_notes: clientNotes,
            status: "in_review",
            updated_at: nowIso
          })
          .eq("id", selectionId);
        if (updErr) return err(res, 500, translateDbError(updErr));

        await writePortalAudit(sb, {
          project,
          session,
          eventType: "selection.chosen",
          entityType: "client_selection",
          entityId: selectionId,
          snapshot: { item: selection.item_name, product: option.product_name, costImpact },
          req
        });

        await sb
          .from("client_actions")
          .update({ status: "responded", updated_at: nowIso })
          .eq("project_id", projectId)
          .eq("related_entity_type", "client_selection")
          .eq("related_entity_id", selectionId);

        return ok(res, { status: "in_review", costImpact });
      } catch (e) {
        return err(res, 500, e.message || "Failed to record selection");
      }
    }
  );

  // ── Documents (client_visible only) ────────────────────────────────────────
  app.get(`${base}/documents`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;

      const { data: docs } = await sb
        .from("portal_documents")
        .select("id, folder, title, version, signature_required, signed_at, related_entity_type, created_at, storage_provider")
        .eq("project_id", projectId)
        .eq("client_visible", true)
        .order("folder", { ascending: true })
        .order("created_at", { ascending: false });

      // Group by folder for the UI.
      const byFolder = {};
      for (const d of docs || []) {
        (byFolder[d.folder] ||= []).push(rowToCamel(d));
      }
      return ok(res, { folders: byFolder, documents: rowsToCamel(docs) });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load documents");
    }
  });

  // Document download — short-lived signed URL OR streamed bytes. Sequential
  // Dropbox read (ONE file per request, never batched). Re-checks visibility.
  app.get(`${base}/documents/:docId/download`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;
      const { docId } = req.params;

      const { data: doc } = await sb
        .from("portal_documents")
        .select("id, project_id, title, storage_path, storage_provider, public_url, client_visible")
        .eq("id", docId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (!doc || !doc.client_visible) return err(res, 404, "Document not found");

      // Supabase Storage → 60s signed URL.
      if (doc.storage_provider === "supabase" && doc.storage_path) {
        const [bucket, ...rest] = doc.storage_path.split("/");
        const { data: signed, error: sErr } = await sb.storage
          .from(bucket)
          .createSignedUrl(rest.join("/"), 60);
        if (sErr) return err(res, 500, "Could not generate download link");
        return ok(res, { signedUrl: signed.signedUrl, expiresIn: 60 });
      }

      // Dropbox → stream the single file (sequential, never Promise.all).
      if (doc.storage_path && dropboxConfigured()) {
        const accessToken = await getDropboxAccessToken();
        const buf = await dropboxDownloadBuffer(accessToken, doc.storage_path);
        res.setHeader("Content-Type", guessContentType(doc.storage_path));
        res.setHeader("Content-Disposition", `inline; filename="${(doc.title || "document").replace(/[^a-z0-9.\- ]/gi, "_")}"`);
        res.setHeader("Cache-Control", "private, max-age=60");
        return res.send(buf);
      }

      // Legacy public_url fallback.
      if (doc.public_url) return ok(res, { signedUrl: doc.public_url, expiresIn: 0 });
      return err(res, 404, "Document file unavailable");
    } catch (e) {
      return err(res, 500, e.message || "Failed to download");
    }
  });

  // ── Meetings (client_visible only) ─────────────────────────────────────────
  app.get(`${base}/meetings`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;
      const { data: meetings } = await sb
        .from("portal_meetings")
        .select("id, title, meeting_type, status, scheduled_at, location, attendees, agenda, minutes, action_items, created_at")
        .eq("project_id", projectId)
        .eq("client_visible", true)
        .order("scheduled_at", { ascending: false });
      return ok(res, { meetings: rowsToCamel(meetings) });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load meetings");
    }
  });

  app.post(`${base}/meetings/:meetingId/confirm`, requirePortalLogin, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { project, session } = { project: req.portalSession.project, session: req.portalSession };
      const { meetingId } = req.params;
      const nowIso = new Date().toISOString();
      const { data: m } = await sb
        .from("portal_meetings")
        .update({ status: "confirmed", confirmed_at: nowIso, client_acknowledged_at: nowIso })
        .eq("id", meetingId)
        .eq("project_id", project.id)
        .select("id, title")
        .maybeSingle();
      if (!m) return err(res, 404, "Meeting not found");
      await sb
        .from("client_actions")
        .update({ status: "completed", updated_at: nowIso })
        .eq("project_id", project.id)
        .eq("related_entity_type", "portal_meeting")
        .eq("related_entity_id", meetingId);
      await writePortalAudit(sb, {
        project, session, eventType: "meeting.confirmed",
        entityType: "portal_meeting", entityId: meetingId, req
      });
      try {
        await sendPlainMail({
          to: "admin@blueleafbuilding.com.au",
          subject: `Client confirmed a meeting — ${project.address || project.id}`,
          text: `${project.portal_client_name || "The client"} confirmed "${m.title}".`
        });
      } catch (_) { /* non-fatal */ }
      return ok(res, { status: "confirmed" });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  app.post(`${base}/meetings/:meetingId/decline`, requirePortalLogin, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { project, session } = { project: req.portalSession.project, session: req.portalSession };
      const { meetingId } = req.params;
      const nowIso = new Date().toISOString();
      const { data: m } = await sb
        .from("portal_meetings")
        .update({ status: "client_declined", client_declined_at: nowIso })
        .eq("id", meetingId)
        .eq("project_id", project.id)
        .select("id, title, scheduled_at")
        .maybeSingle();
      if (!m) return err(res, 404, "Meeting not found");
      await writePortalAudit(sb, {
        project, session, eventType: "meeting.declined",
        entityType: "portal_meeting", entityId: meetingId, req
      });
      try {
        await sendPlainMail({
          to: "admin@blueleafbuilding.com.au",
          subject: `Client can't make a meeting — ${project.address || project.id}`,
          text: `${project.portal_client_name || "The client"} declined "${m.title}". We'll need to reschedule.`
        });
      } catch (_) { /* non-fatal */ }
      return ok(res, { status: "client_declined", message: "Sam has been notified — we'll be in touch to reschedule." });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Project Journey (stages → updates + photos) ────────────────────────────
  app.get(`${base}/journey`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;

      const { data: stages } = await sb
        .from("portal_milestones")
        .select("id, key, label, description, what_comes_next, stage_preview, achieved_at, eta, is_current, confidence, sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });

      const { data: updates } = await sb
        .from("portal_updates")
        .select("id, headline, body, builder_reasoning, week_of, schedule_phase, created_at")
        .eq("project_id", projectId)
        .eq("published", true)
        .order("week_of", { ascending: false });

      const { data: photos } = await sb
        .from("project_photos")
        .select("id, caption, milestone_key, taken_at, is_hero")
        .eq("project_id", projectId)
        .order("taken_at", { ascending: false });

      const photoList = photos || [];
      const updateList = updates || [];
      const enrichedStages = (stages || []).map((st) => {
        const stageUpdates = updateList.filter(
          (u) => u.schedule_phase && st.key && u.schedule_phase === st.key
        );
        const stagePhotos = photoList.filter((p) => p.milestone_key === st.key);
        return {
          ...rowToCamel(st),
          updates: rowsToCamel(stageUpdates),
          photos: rowsToCamel(stagePhotos)
        };
      });

      return ok(res, { stages: enrichedStages });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load journey");
    }
  });

  // ── Messages ───────────────────────────────────────────────────────────────
  app.get(`${base}/messages`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;
      const { data: messages } = await sb
        .from("portal_messages")
        .select("id, sender, sender_name, body, read_at, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      // Mark builder→client messages as read for this client.
      await sb
        .from("portal_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("sender", "builder")
        .is("read_at", null);
      return ok(res, { messages: rowsToCamel(messages) });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load messages");
    }
  });

  app.post(`${base}/messages`, requirePortalLogin, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { project } = req.portalSession;
      const body = req.body?.body ? String(req.body.body).trim() : "";
      if (!body) return err(res, 400, "Message body required");
      const { data, error } = await sb
        .from("portal_messages")
        .insert({
          project_id: project.id,
          sender: "client",
          sender_name: project.portal_client_name || "Client",
          body
        })
        .select("id, sender, sender_name, body, created_at")
        .maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      try {
        await sendPlainMail({
          to: "admin@blueleafbuilding.com.au",
          subject: `New portal message — ${project.address || project.id}`,
          text: `${project.portal_client_name || "The client"} sent a message:\n\n${body}\n\nReply in the portal.`
        });
      } catch (_) { /* non-fatal */ }
      return ok(res, { message: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed to send message");
    }
  });

  // ── My Home (post-handover) ────────────────────────────────────────────────
  app.get(`${base}/my-home`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;
      const [{ data: finishes }, { data: warranties }] = [
        await sb.from("home_finishes").select("id, room, item, value, supplier, product_code, sort_order").eq("project_id", projectId).order("sort_order", { ascending: true }),
        await sb.from("warranty_periods").select("id, label, years, start_date, expires_date").eq("project_id", projectId)
      ];
      return ok(res, {
        finishes: rowsToCamel(finishes),
        warranties: rowsToCamel(warranties)
      });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load home info");
    }
  });

  // ── Notifications (in-app) ─────────────────────────────────────────────────
  app.get(`${base}/notifications`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const projectId = req.portalSession.projectId;
      const { data: notes } = await sb
        .from("portal_notifications")
        .select("id, notification_type, title, body, related_entity_type, related_entity_id, read_at, created_at")
        .eq("project_id", projectId)
        .eq("channel", "in_app")
        .order("created_at", { ascending: false })
        .limit(50);
      return ok(res, { notifications: rowsToCamel(notes) });
    } catch (e) {
      return err(res, 500, e.message || "Failed to load notifications");
    }
  });
}

/**
 * Financial snapshot for the client — ALL figures inc-GST, sourced from the
 * canonical generated columns. NEVER exposes cost_to_builder / margin / ex-GST.
 */
async function buildFinancialSnapshot(sb, project, jobId) {
  const snapshot = {
    contractValue: project.contract_value != null ? Number(project.contract_value) : null,
    approvedVariations: 0,
    pendingVariations: 0,
    claimsPaid: 0,
    claimsOutstanding: 0,
    currentContractTotal: null
  };

  if (jobId) {
    // Variations: a variation the client has APPROVED in the portal counts as
    // approved on Home even before Finance issues the signed document — otherwise
    // a client who just approved a $40k variation sees it still "pending" and their
    // contract total unchanged (a money-confusion dispute). Reconcile job status
    // against the portal_decisions the client actually actioned.
    const { data: variations } = await sb
      .from("job_variations")
      .select("id, amount_inc_gst, status")
      .eq("job_id", jobId);
    const { data: decisions } = await sb
      .from("portal_decisions")
      .select("job_variation_id, status")
      .eq("project_id", project.id)
      .eq("type", "variation")
      .not("job_variation_id", "is", null);
    const decByVar = {};
    for (const d of decisions || []) decByVar[d.job_variation_id] = d.status;
    for (const v of variations || []) {
      const amt = Number(v.amount_inc_gst) || 0;
      const clientApproved = decByVar[v.id] === "approved";
      if (v.status === "signed" || v.status === "invoiced" || clientApproved) snapshot.approvedVariations += amt;
      else if (v.status === "sent_to_client") snapshot.pendingVariations += amt;
    }

    // Claims: account for PARTIAL payments. Show what's actually been paid and only
    // the remaining balance as outstanding — never the full amount of a part-paid
    // claim (which would tell a client they owe money they've already paid).
    const { data: claims } = await sb
      .from("progress_claims")
      .select("id, amount_inc_gst, status")
      .eq("job_id", jobId);
    const claimIds = (claims || []).map((c) => c.id);
    const paidByClaim = {};
    if (claimIds.length) {
      const { data: payments } = await sb
        .from("progress_claim_payments")
        .select("progress_claim_id, payment_amount")
        .in("progress_claim_id", claimIds);
      for (const p of payments || []) {
        paidByClaim[p.progress_claim_id] = (paidByClaim[p.progress_claim_id] || 0) + (Number(p.payment_amount) || 0);
      }
    }
    for (const c of claims || []) {
      if (c.status === "draft" || c.status === "void") continue;
      const amt = Number(c.amount_inc_gst) || 0;
      const paid = Math.min(paidByClaim[c.id] || 0, amt);
      snapshot.claimsPaid += paid;
      if (c.status !== "paid") snapshot.claimsOutstanding += Math.max(0, amt - paid);
    }
  }

  if (snapshot.contractValue != null) {
    snapshot.currentContractTotal = snapshot.contractValue + snapshot.approvedVariations;
  }
  return snapshot;
}
