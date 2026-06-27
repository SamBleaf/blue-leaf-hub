/**
 * Client Portal v2.0 — ADMIN (staff) management API.
 *
 * Mounted at /api/portal/admin/v2/:projectId/*. The existing
 * `app.use("/api/portal/admin", requireAuth)` (registered in portalRoutes) already
 * authenticates these; we additionally require a STAFF role here so a logged-in
 * client can never reach admin management.
 *
 * Lets staff operate the portal: enable v2, set build phase + team, manage
 * milestones (confidence/preview), selections (+options), meetings, weekly updates
 * (with builder reasoning), and attach builder reasoning to variations.
 */
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireRole } from "./requireAuth.mjs";
import { notifyClient } from "./portalNotify.mjs";
import { fileJobRecord } from "./jobRecordsFiler.mjs";

export function registerPortalV2AdminRoutes(app) {
  const base = "/api/portal/admin/v2/:projectId";

  // Staff only (requireAuth already ran via the /api/portal/admin prefix).
  app.use("/api/portal/admin/v2", requireRole("admin", "supervisor", "employee"));

  // ── Project v2 settings ────────────────────────────────────────────────────
  app.patch(`${base}/settings`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const patch = {};
      if (typeof req.body?.portalV2Enabled === "boolean") patch.portal_v2_enabled = req.body.portalV2Enabled;
      if (req.body?.buildPhase) {
        if (!["pre_construction", "on_site", "practical_completion"].includes(req.body.buildPhase)) {
          return err(res, 400, "Invalid buildPhase");
        }
        patch.build_phase = req.body.buildPhase;
      }
      if (Array.isArray(req.body?.teamMembers)) patch.team_members = req.body.teamMembers;
      const payment = typeof req.body?.paymentInstructions === "string" ? req.body.paymentInstructions : undefined;
      if (!Object.keys(patch).length && payment === undefined) return err(res, 400, "Nothing to update");

      if (Object.keys(patch).length) {
        const { error } = await sb.from("projects").update(patch).eq("id", projectId);
        if (error) return err(res, 500, translateDbError(error));
      }
      // payment_instructions applied best-effort — the column lands in migration 105,
      // so a missing column must not fail the core settings save.
      if (payment !== undefined) {
        const { error: payErr } = await sb.from("projects").update({ payment_instructions: payment }).eq("id", projectId);
        if (payErr) console.warn("[portalV2Admin] payment_instructions update skipped (apply migration 105):", payErr.message);
      }

      // Post-handover: when a project reaches practical_completion, ensure a
      // past_client CRM contact exists (de-duped on linked_job_id) so the client
      // flows into the Raving Fans / referral program. Best-effort; never fails the save.
      if (req.body?.buildPhase === "practical_completion") {
        try {
          const { data: proj } = await sb.from("projects")
            .select("job_id, portal_client_name, portal_client_email").eq("id", projectId).maybeSingle();
          if (proj?.job_id) {
            const name = String(proj.portal_client_name || "Client").trim();
            const sp = name.split(/\s+/);
            const { data: existing } = await sb.from("crm_contacts").select("id").eq("linked_job_id", proj.job_id).maybeSingle();
            if (existing) {
              await sb.from("crm_contacts").update({ status: "past_client", contact_type: "past_client" }).eq("id", existing.id);
            } else {
              await sb.from("crm_contacts").insert({
                first_name: sp[0] || "Client",
                last_name: sp.slice(1).join(" ") || null,
                email: proj.portal_client_email || null,
                contact_type: "past_client",
                status: "past_client",
                linked_job_id: proj.job_id,
              });
            }
          }
        } catch (e) { console.warn("[portalV2Admin] past_client conversion:", e?.message || e); }
      }

      const { data } = await sb.from("projects").select("id, portal_v2_enabled, build_phase, team_members").eq("id", projectId).maybeSingle();
      return ok(res, { project: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Milestones ─────────────────────────────────────────────────────────────
  app.post(`${base}/milestones`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      if (!b.key || !b.label) return err(res, 400, "key and label required");
      const row = {
        project_id: projectId,
        key: b.key,
        label: b.label,
        sort_order: b.sortOrder ?? 0,
        eta: b.eta || null,
        stage_preview: b.stagePreview || null,
        confidence: b.confidence || null,
        confidence_note: b.confidenceNote || null,
        is_current: !!b.isCurrent,
      };
      const { data, error } = await sb.from("portal_milestones")
        .upsert(row, { onConflict: "project_id,key" })
        .select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      // If this one is current, clear the flag on the others.
      if (row.is_current) {
        await sb.from("portal_milestones").update({ is_current: false })
          .eq("project_id", projectId).neq("id", data.id);
      }
      return ok(res, { milestone: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  app.patch(`${base}/milestones/:id`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId, id } = req.params;
      const b = req.body || {};
      const patch = {};
      for (const [k, col] of [
        ["label", "label"], ["eta", "eta"], ["stagePreview", "stage_preview"],
        ["confidence", "confidence"], ["confidenceNote", "confidence_note"],
        ["achievedAt", "achieved_at"], ["sortOrder", "sort_order"],
      ]) if (b[k] !== undefined) patch[col] = b[k];
      if (typeof b.isCurrent === "boolean") patch.is_current = b.isCurrent;
      const { data, error } = await sb.from("portal_milestones").update(patch)
        .eq("id", id).eq("project_id", projectId).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      if (patch.is_current === true) {
        await sb.from("portal_milestones").update({ is_current: false })
          .eq("project_id", projectId).neq("id", id);
      }
      return ok(res, { milestone: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Selections (+ options) ─────────────────────────────────────────────────
  app.post(`${base}/selections`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      if (!b.category || !b.itemName) return err(res, 400, "category and itemName required");
      const { data: sel, error } = await sb.from("client_selections").insert({
        project_id: projectId,
        category: b.category,
        item_name: b.itemName,
        room_area: b.roomArea || null,
        due_date: b.dueDate || null,
        lead_time_weeks: b.leadTimeWeeks ?? null,
        order_by_date: b.orderByDate || null,
        allowance_amount: b.allowanceAmount ?? null,
        internal_notes: b.internalNotes || null,
        status: "awaiting_client",
        sort_order: b.sortOrder ?? 0,
      }).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));

      const options = Array.isArray(b.options) ? b.options : [];
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        await sb.from("selection_options").insert({
          selection_id: sel.id,
          label: o.label || `Option ${i + 1}`,
          product_name: o.productName || null,
          supplier: o.supplier || null,
          model_code: o.modelCode || null,
          price_inc_gst: o.priceIncGst ?? null,
          lead_time_weeks: o.leadTimeWeeks ?? null,
          description: o.description || null,
          image_url: o.imageUrl || null,
          internal_notes: o.internalNotes || null,
          is_recommended: !!o.isRecommended,
          sort_order: i,
        });
      }

      // Create the client action so it surfaces in My Actions.
      await sb.from("client_actions").insert({
        project_id: projectId,
        action_type: "selection_decision",
        title: `Select ${b.itemName}`,
        description: b.category,
        related_entity_type: "client_selection",
        related_entity_id: sel.id,
        due_date: b.dueDate || null,
        status: "pending",
      });
      await notifyClient(projectId, {
        type: "selection_due",
        title: "A new selection is ready for you",
        body: `Please choose your ${b.itemName}${b.dueDate ? ` by ${b.dueDate}` : ""}. Options are on your Selections board.`,
        entityType: "client_selection",
        entityId: sel.id,
      });
      return ok(res, { selection: rowToCamel(sel) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  app.patch(`${base}/selections/:id`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId, id } = req.params;
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      for (const [k, col] of [
        ["status", "status"], ["internalNotes", "internal_notes"],
        ["dueDate", "due_date"], ["orderByDate", "order_by_date"], ["allowanceAmount", "allowance_amount"],
      ]) if (b[k] !== undefined) patch[col] = b[k];
      if (b.status === "approved") { patch.approved_at = new Date().toISOString(); patch.approved_by_user_id = req.caller?.id || null; }
      const { data, error } = await sb.from("client_selections").update(patch)
        .eq("id", id).eq("project_id", projectId).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      // Close the client's "Select X" action once the decision is resolved, so it
      // doesn't linger in My Actions after admin marks it approved/ordered/installed.
      if (["approved", "ordered", "installed"].includes(b.status)) {
        await sb.from("client_actions")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("project_id", projectId)
          .eq("related_entity_type", "client_selection")
          .eq("related_entity_id", id);
      }
      return ok(res, { selection: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Meetings ───────────────────────────────────────────────────────────────
  app.post(`${base}/meetings`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      const { data: meeting, error } = await sb.from("portal_meetings").insert({
        project_id: projectId,
        title: b.title || "Site Meeting",
        meeting_type: b.meetingType || "site",
        status: "scheduled",
        client_visible: b.clientVisible !== false,
        scheduled_at: b.scheduledAt || null,
        location: b.location || null,
        agenda: b.agenda || null,
        attendees: Array.isArray(b.attendees) ? b.attendees : [],
        created_by: req.caller?.id || null,
      }).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));

      if (b.requestConfirmation && meeting.client_visible) {
        await sb.from("client_actions").insert({
          project_id: projectId,
          action_type: "meeting_confirmation",
          title: `Confirm ${meeting.title}`,
          description: b.agenda || null,
          related_entity_type: "portal_meeting",
          related_entity_id: meeting.id,
          due_date: b.scheduledAt ? String(b.scheduledAt).slice(0, 10) : null,
          status: "pending",
        });
      }
      if (meeting.client_visible) {
        await notifyClient(projectId, {
          type: "meeting_reminder",
          title: "A site meeting has been scheduled",
          body: `${meeting.title}${b.scheduledAt ? ` — ${new Date(b.scheduledAt).toLocaleString("en-AU")}` : ""}. Please confirm in your portal.`,
          entityType: "portal_meeting",
          entityId: meeting.id,
        });
      }
      return ok(res, { meeting: rowToCamel(meeting) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  app.patch(`${base}/meetings/:id`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId, id } = req.params;
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      for (const [k, col] of [
        ["minutes", "minutes"], ["decisionsMade", "decisions_made"], ["agenda", "agenda"],
        ["status", "status"], ["location", "location"], ["scheduledAt", "scheduled_at"],
      ]) if (b[k] !== undefined) patch[col] = b[k];
      if (b.actionItems !== undefined) patch.action_items = b.actionItems;
      const { data, error } = await sb.from("portal_meetings").update(patch)
        .eq("id", id).eq("project_id", projectId).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { meeting: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Weekly updates (with builder reasoning) ────────────────────────────────
  app.post(`${base}/updates`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      if (!b.headline) return err(res, 400, "headline required");
      const publish = b.publish !== false;
      const { data, error } = await sb.from("portal_updates").insert({
        project_id: projectId,
        week_of: b.weekOf || new Date().toISOString().slice(0, 10),
        headline: b.headline,
        body: b.body || "",
        builder_reasoning: b.builderReasoning || null,
        next_week_preview: b.nextWeekPreview || null,
        author_name: req.caller?.full_name || "Sam",
        published: publish,
        status: publish ? "published" : "draft",
        published_at: publish ? new Date().toISOString() : null,
        published_by: publish ? req.caller?.id || null : null,
        drafted_by: req.caller?.id || null,
      }).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      if (publish && data) {
        await notifyClient(projectId, {
          type: "weekly_update",
          title: "A new project update is available",
          body: b.headline,
          entityType: "portal_update",
          entityId: data.id,
        });
      }
      return ok(res, { update: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // List updates incl. DRAFTS (e.g. the site-diary-seeded draft) so staff can publish.
  app.get(`${base}/updates`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const { data } = await sb.from("portal_updates")
        .select("id, week_of, headline, body, builder_reasoning, published, status, created_at")
        .eq("project_id", projectId)
        .order("week_of", { ascending: false })
        .limit(50);
      return ok(res, { updates: rowsToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // Edit / publish an existing update (publishes the diary-seeded draft + notifies).
  app.patch(`${base}/updates/:id`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId, id } = req.params;
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (typeof b.headline === "string") patch.headline = b.headline;
      if (typeof b.body === "string") patch.body = b.body;
      if (typeof b.builderReasoning === "string") patch.builder_reasoning = b.builderReasoning;
      if (b.publish === true) {
        patch.published = true;
        patch.status = "published";
        patch.published_at = new Date().toISOString();
        patch.published_by = req.caller?.id || null;
      }
      const { data, error } = await sb.from("portal_updates").update(patch)
        .eq("id", id).eq("project_id", projectId).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      if (b.publish === true && data) {
        await notifyClient(projectId, {
          type: "weekly_update",
          title: "A new project update is available",
          body: data.headline,
          entityType: "portal_update",
          entityId: data.id,
        });
      }
      return ok(res, { update: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Attach builder reasoning to a variation's portal decision ──────────────
  app.patch(`${base}/decisions/:id`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId, id } = req.params;
      const b = req.body || {};
      const patch = {};
      if (b.builderReasoning !== undefined) patch.builder_reasoning = b.builderReasoning;
      if (b.requiresPhotoEvidence !== undefined) patch.requires_photo_evidence = !!b.requiresPhotoEvidence;
      if (!Object.keys(patch).length) return err(res, 400, "Nothing to update");
      const { data, error } = await sb.from("portal_decisions").update(patch)
        .eq("id", id).eq("project_id", projectId).select("id, builder_reasoning").maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { decision: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Documents (flag a doc client-visible into a folder) ────────────────────
  app.post(`${base}/documents`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      if (!b.folder || !b.title) return err(res, 400, "folder and title required");
      const { data, error } = await sb.from("portal_documents").insert({
        project_id: projectId,
        folder: b.folder,
        title: b.title,
        job_document_id: b.jobDocumentId || null,
        storage_path: b.storagePath || null,
        storage_provider: b.storageProvider || "dropbox",
        public_url: b.publicUrl || null,
        signature_required: !!b.signatureRequired,
        client_visible: b.clientVisible !== false,
        uploaded_by: req.caller?.id || null,
      }).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { document: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── List the job's existing (current) documents available to expose ─────────
  // Reuses canonical job_documents (already in Dropbox/Supabase) — no re-upload.
  // Only 'current' status, so superseded versions are never offered to the client.
  app.get(`${base}/available-documents`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const { data: project } = await sb.from("projects").select("job_id").eq("id", projectId).maybeSingle();
      if (!project?.job_id) return ok(res, { documents: [] });

      const { data: docs } = await sb
        .from("job_documents")
        .select("id, title, document_type, storage_provider, storage_path, version, created_at")
        .eq("job_id", project.job_id)
        .eq("status", "current")
        .order("created_at", { ascending: false });

      const { data: exposed } = await sb
        .from("portal_documents")
        .select("job_document_id")
        .eq("project_id", projectId)
        .not("job_document_id", "is", null);
      const exposedIds = new Set((exposed || []).map((e) => e.job_document_id));

      const available = (docs || []).filter((d) => !exposedIds.has(d.id)).map(rowToCamel);
      return ok(res, { documents: available });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Expose an existing job_document to the client portal ────────────────────
  app.post(`${base}/expose-document`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      if (!b.jobDocumentId || !b.folder) return err(res, 400, "jobDocumentId and folder required");

      // TENANT CHECK: the document must belong to THIS project's job, else a staff
      // user on project A could expose project B's contract/plans to A's client.
      const { data: project } = await sb.from("projects").select("job_id").eq("id", projectId).maybeSingle();
      const { data: jd } = await sb
        .from("job_documents")
        .select("id, title, storage_provider, storage_path, job_id, status")
        .eq("id", b.jobDocumentId)
        .maybeSingle();
      if (!jd || !project?.job_id || jd.job_id !== project.job_id) return err(res, 404, "Document not found");
      if (jd.status && jd.status !== "current") return err(res, 409, "Only current document versions can be shared.");
      // Don't expose a document the client can't actually open — a job_documents row
      // with no storage_path becomes an undownloadable card. Reject it up front.
      if (!jd.storage_path || !jd.storage_provider) {
        return err(res, 409, "This document has no file attached yet — it can't be shared until it's uploaded.");
      }

      // Contracts (and anything explicitly flagged) need the client to SIGN.
      const signatureRequired = b.signatureRequired === true || b.folder === "contract";
      const { data, error } = await sb.from("portal_documents").insert({
        project_id: projectId,
        job_document_id: jd.id,
        folder: b.folder,
        title: b.title || jd.title || "Document",
        storage_provider: jd.storage_provider || "dropbox",
        storage_path: jd.storage_path,
        client_visible: true,
        signature_required: signatureRequired,
        uploaded_by: req.caller?.id || null,
      }).select().maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      // A signature-required doc must PROMPT the client — create the My Actions item the
      // sign endpoint closes. Without this a contract needing signature is only a passive
      // card the client never acts on.
      if (signatureRequired && data?.id) {
        await sb.from("client_actions").insert({
          project_id: projectId,
          action_type: "document_signature",
          title: `Sign: ${data.title || "Document"}`,
          related_entity_type: "portal_document",
          related_entity_id: data.id,
          status: "pending",
        }).then(() => {}, () => {});
      }
      // Tell the client a new document is available (in-app + email).
      try {
        await notifyClient(projectId, {
          type: "document_ready",
          title: "New document available",
          body: `${data.title || "A document"} is now in your portal.`,
          entityType: "portal_document",
          entityId: data.id,
        });
      } catch (_) { /* non-fatal */ }
      return ok(res, { document: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Register an existing file as a job_document (e.g. the signed contract) ───
  // The building contract is produced externally and usually already sits in the job's
  // Dropbox folder. This registers it as a canonical job_document with a REAL
  // storage_path, so the existing expose-document flow can share it with the client —
  // closing the "no contract-source writer" gap without an upload pipeline.
  app.post(`${base}/register-document`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      if (!b.storagePath || !b.documentType) return err(res, 400, "storagePath and documentType required");
      const { data: project } = await sb.from("projects").select("job_id").eq("id", projectId).maybeSingle();
      if (!project?.job_id) return err(res, 409, "This project has no linked job to attach the document to.");
      const { data, error } = await sb.from("job_documents").insert({
        job_id: project.job_id,
        document_type: b.documentType,
        title: b.title || "Document",
        storage_provider: b.storageProvider || "dropbox",
        storage_path: b.storagePath,
        status: "current",
      }).select("id, title").maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { jobDocumentId: data?.id || null, title: data?.title || null });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Upload a document (base64) → file it + register + optionally expose ──────
  // The friendlier path vs register-document (no Dropbox path needed). Files into
  // INTERNAL/<category>, registers a job_document, and (by default) creates a
  // client-visible portal_document so it shows in the client's Documents tab.
  app.post(`${base}/upload-document`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      if (!b.fileBase64) return err(res, 400, "fileBase64 required");
      const { data: project } = await sb.from("projects").select("address, job_id").eq("id", projectId).maybeSingle();
      if (!project) return err(res, 404, "Project not found");
      const buffer = Buffer.from(String(b.fileBase64).replace(/^data:[^;]+;base64,/, ""), "base64");
      if (!buffer.length) return err(res, 400, "Invalid file data");
      const fileName = String(b.fileName || "document.pdf").replace(/[^\w.\- ]+/g, "").slice(0, 100) || "document.pdf";
      const filed = await fileJobRecord({
        jobAddress: project.address, jobId: project.job_id,
        category: b.category || "contract",
        fileName, buffer,
        register: true,
        exposeToPortal: b.exposeNow !== false,
        title: b.title || fileName,
      });
      if (!filed?.ok) {
        return err(res, 502, filed?.skipped === "dropbox-not-configured"
          ? "Document storage (Dropbox) isn't configured on the server."
          : (filed?.error || "Could not store the document."));
      }
      return ok(res, { jobDocumentId: filed.jobDocumentId, storagePath: filed.storagePath });
    } catch (e) {
      return err(res, 500, e.message || "Failed to upload document");
    }
  });

  // ── Builder queue: client-approved variations awaiting Finance sign ─────────
  // A portal approval is a timestamped acknowledgement; the builder still signs in
  // Finance (which updates contract value). This surfaces every variation the client
  // has approved but Finance hasn't signed, so the manual sign step can't be silently
  // dropped if the notification email is missed. (Finance UI can consume this queue.)
  app.get(`${base}/awaiting-sign`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const { data: decisions } = await sb
        .from("portal_decisions")
        .select("id, title, job_variation_id, responded_at")
        .eq("project_id", projectId)
        .eq("type", "variation")
        .eq("status", "approved")
        .not("job_variation_id", "is", null);
      const awaitingSign = [];
      for (const d of decisions || []) {
        const { data: jv } = await sb
          .from("job_variations")
          .select("id, variation_number, title, status, amount_inc_gst")
          .eq("id", d.job_variation_id)
          .maybeSingle();
        if (jv && jv.status !== "signed" && jv.status !== "void") {
          awaitingSign.push({
            decisionId: d.id,
            variationId: jv.id,
            variationNumber: jv.variation_number,
            title: jv.title,
            amountIncGst: jv.amount_inc_gst,
            clientApprovedAt: d.responded_at,
            financeStatus: jv.status
          });
        }
      }
      return ok(res, { awaitingSign });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Activate / deactivate a client's portal access ──────────────────────────
  // requirePortalAuth gates the JWT path on project_client_users.is_active, so this
  // revokes access server-side (a still-valid token stops working immediately) —
  // not just in the frontend.
  app.patch(`${base}/client-users/:userId/active`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId, userId } = req.params;
      const isActive = req.body?.isActive === true;
      const { data, error } = await sb.from("project_client_users")
        .update({ is_active: isActive })
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .select("user_id, is_active")
        .maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      if (!data) return err(res, 404, "Client link not found for this project");
      return ok(res, { userId: data.user_id, isActive: data.is_active });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Photos: list + tag project photos for the client Journey ────────────────
  // The Journey only shows photos that have a milestone_key AND client_visible=true
  // (migration 110). Staff tag existing project_photos here to surface them.
  app.get(`${base}/photos`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const { data } = await sb.from("project_photos")
        .select("id, caption, milestone_key, taken_at, is_hero")
        .eq("project_id", projectId)
        .order("taken_at", { ascending: false })
        .limit(200);
      return ok(res, { photos: rowsToCamel(data) });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // Upload a photo (base64 in body — no multer, mirrors the finance PDF pattern).
  // Stores it in the job's INTERNAL/SITE PHOTOS Dropbox folder and creates a
  // project_photos row; the Journey shows it once milestoneKey + clientVisible are set.
  app.post(`${base}/photos`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const b = req.body || {};
      if (!b.imageBase64) return err(res, 400, "imageBase64 required");
      const { data: project } = await sb.from("projects").select("address, job_id").eq("id", projectId).maybeSingle();
      if (!project) return err(res, 404, "Project not found");

      const buffer = Buffer.from(String(b.imageBase64).replace(/^data:[^;]+;base64,/, ""), "base64");
      if (!buffer.length) return err(res, 400, "Invalid image data");
      const fileName = String(b.fileName || `photo-${Date.now()}.jpg`).replace(/[^\w.\- ]+/g, "").slice(0, 80) || "photo.jpg";

      const filed = await fileJobRecord({ jobAddress: project.address, jobId: project.job_id, category: "site_photo", fileName, buffer });
      if (!filed?.ok || !filed.storagePath) {
        return err(res, 502, filed?.skipped === "dropbox-not-configured"
          ? "Photo storage (Dropbox) isn't configured on the server."
          : "Could not store the photo. Please try again.");
      }

      const { data, error } = await sb.from("project_photos").insert({
        project_id: projectId,
        milestone_key: b.milestoneKey || null,
        caption: b.caption || null,
        storage_path: filed.storagePath,
        public_url: filed.storagePath, // v2 serves via the JWT media route; public_url is unused but NOT NULL
        client_visible: b.clientVisible === true,
        taken_at: new Date().toISOString().slice(0, 10),
      }).select("id").maybeSingle();
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { photoId: data?.id || null });
    } catch (e) {
      return err(res, 500, e.message || "Failed to upload photo");
    }
  });

  app.patch(`${base}/photos/:photoId`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId, photoId } = req.params;
      const b = req.body || {};
      const patch = {};
      if (b.milestoneKey !== undefined) patch.milestone_key = b.milestoneKey || null;
      if (typeof b.caption === "string") patch.caption = b.caption;
      if (Object.keys(patch).length) {
        const { error } = await sb.from("project_photos").update(patch).eq("id", photoId).eq("project_id", projectId);
        if (error) return err(res, 500, translateDbError(error));
      }
      // client_visible lands in migration 110 — tolerant so its absence can't fail the tag.
      if (typeof b.clientVisible === "boolean") {
        await sb.from("project_photos").update({ client_visible: b.clientVisible })
          .eq("id", photoId).eq("project_id", projectId).then(() => {}, () => {});
      }
      return ok(res, { updated: true });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });

  // ── Admin read: full portal state for the management UI ─────────────────────
  app.get(`${base}/overview`, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const { projectId } = req.params;
      const [proj, milestones, selections, meetings, clients, actions] = [
        await sb.from("projects").select("id, address, portal_enabled, portal_v2_enabled, build_phase, team_members, portal_client_email, portal_client_name").eq("id", projectId).maybeSingle(),
        await sb.from("portal_milestones").select("id, key, label, sort_order, is_current, confidence, confidence_note, stage_preview, achieved_at, eta").eq("project_id", projectId).order("sort_order", { ascending: true }),
        await sb.from("client_selections").select("id, category, item_name, status, due_date, order_by_date, allowance_amount, selected_product").eq("project_id", projectId).order("sort_order", { ascending: true }),
        await sb.from("portal_meetings").select("id, title, status, scheduled_at, client_visible").eq("project_id", projectId).order("scheduled_at", { ascending: false }),
        await sb.from("project_client_users").select("id, user_id, role, is_active, invite_accepted_at").eq("project_id", projectId),
        await sb.from("client_actions").select("id, action_type, title, status, due_date").eq("project_id", projectId).in("status", ["pending", "viewed", "overdue"]),
      ];
      const projectRow = proj.data ? rowToCamel(proj.data) : null;
      if (projectRow) {
        // Tolerant: column lands in migration 105; a miss just leaves it undefined.
        const { data: pi } = await sb.from("projects").select("payment_instructions").eq("id", projectId).maybeSingle();
        if (pi) projectRow.paymentInstructions = pi.payment_instructions || null;
      }
      return ok(res, {
        project: projectRow,
        milestones: rowsToCamel(milestones.data),
        selections: rowsToCamel(selections.data),
        meetings: rowsToCamel(meetings.data),
        clients: rowsToCamel(clients.data),
        openActions: rowsToCamel(actions.data),
      });
    } catch (e) {
      return err(res, 500, e.message || "Failed");
    }
  });
}
