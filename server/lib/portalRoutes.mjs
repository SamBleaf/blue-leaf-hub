import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import {
  dropboxConfigured,
  dropboxDownloadBuffer,
  getDropboxAccessToken,
  uploadPortalPhoto
} from "./dropboxClient.mjs";

const PROJECT_SELECT =
  "id, address, portal_client_name, portal_client_email, contract_value, completion_date_est, portal_enabled, portal_token";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function rowToCamel(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[toCamel(k)] = v;
  }
  return out;
}

function rowsToCamel(rows) {
  return (rows || []).map(rowToCamel);
}

async function resolveProject(token) {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("portal_token", token)
    .eq("portal_enabled", true)
    .maybeSingle();
  return data || null;
}

function mediaPublicPath(photoId) {
  return `/api/portal/media/${photoId}`;
}

function guessContentType(path) {
  const p = String(path || "").toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
}

async function scheduleCompletionPercent(sb, projectId) {
  const { data: tasks } = await sb.from("schedule_tasks").select("status, percent_complete").eq("project_id", projectId);
  const list = tasks || [];
  if (!list.length) return 0;
  const complete = list.filter(
    (t) => t.status === "complete" || Number(t.percent_complete) >= 100
  ).length;
  return Math.round((complete / list.length) * 100) || 0;
}

function phasePlainLabel(phase) {
  if (!phase) return null;
  return String(phase).replace(/_/g, " ");
}

function daysBetweenYmd(a, b) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((db - da) / 86400000);
}

async function portalHomeContext(sb, project, completionPercent) {
  const today = todayYmd();
  const { data: tasks } = await sb
    .from("schedule_tasks")
    .select("name, phase, status, percent_complete, start_date, end_date")
    .eq("project_id", project.id)
    .order("start_date", { ascending: true });

  const list = tasks || [];
  let scheduleStatus = "on_track";
  if (list.length) {
    const overdue = list.some(
      (t) =>
        t.end_date &&
        t.end_date < today &&
        t.status !== "complete" &&
        Number(t.percent_complete) < 100
    );
    const soon = list.some((t) => {
      if (!t.end_date || t.status === "complete" || Number(t.percent_complete) >= 100) return false;
      const days = daysBetweenYmd(today, t.end_date);
      return days >= 0 && days <= 7;
    });
    if (overdue) scheduleStatus = "delayed";
    else if (soon) scheduleStatus = "attention";
  } else if (completionPercent < 70) {
    scheduleStatus = "delayed";
  } else if (completionPercent < 90) {
    scheduleStatus = "attention";
  }

  const active =
    list.find((t) => t.status === "in_progress") ||
    list.find((t) => Number(t.percent_complete) > 0 && Number(t.percent_complete) < 100) ||
    list.find((t) => t.status !== "complete" && Number(t.percent_complete) < 100);
  const currentPhase = phasePlainLabel(active?.phase);

  let daysToCompletion = null;
  if (project.completion_date_est) {
    daysToCompletion = daysBetweenYmd(today, project.completion_date_est);
  }

  const { data: nextMs } = await sb
    .from("portal_milestones")
    .select("label")
    .eq("project_id", project.id)
    .is("achieved_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    currentPhase,
    daysToCompletion,
    nextMilestone: nextMs?.label || null,
    scheduleStatus
  };
}

/**
 * @param {import("express").Express} app
 */
export function registerPortalRoutes(app) {
  // ── Media proxy (token in query) ───────────────────────────────────────────
  app.get("/api/portal/media/:photoId", async (req, res) => {
    try {
      const token = String(req.query.token || "").trim();
      const photoId = String(req.params.photoId || "").trim();
      if (!token || !photoId) return res.status(400).json({ ok: false, error: "token and photoId required" });

      const project = await resolveProject(token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });

      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const { data: photo } = await sb
        .from("project_photos")
        .select("storage_path, project_id")
        .eq("id", photoId)
        .maybeSingle();
      if (!photo || photo.project_id !== project.id) return res.status(404).json({ ok: false, error: "Photo not found" });

      if (!dropboxConfigured()) return res.status(503).json({ ok: false, error: "Dropbox not configured" });
      const accessToken = await getDropboxAccessToken();
      const buf = await dropboxDownloadBuffer(accessToken, photo.storage_path);
      res.setHeader("Content-Type", guessContentType(photo.storage_path));
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.send(buf);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to load photo" });
    }
  });

  // ── Admin routes (register before :token) ──────────────────────────────────
  // All /api/portal/admin/* routes require authentication
  app.use("/api/portal/admin", requireAuth);

  app.post("/api/portal/admin/generate-token", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const projectId = String(req.body?.projectId || "").trim();
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });

      const portalToken = crypto.randomBytes(24).toString("base64url");
      const { data, error } = await sb
        .from("projects")
        .update({ portal_token: portalToken, portal_enabled: true })
        .eq("id", projectId)
        .select("portal_token")
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, token: data?.portal_token || portalToken, portalUrl: `/portal/${portalToken}` });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to generate token" });
    }
  });

  app.post("/api/portal/admin/enable-test/:projectId", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const projectId = String(req.params.projectId || "").trim();
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });

      const { data: existing } = await sb
        .from("projects")
        .select("portal_token")
        .eq("id", projectId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ ok: false, error: "Project not found" });

      const portalToken = existing.portal_token || crypto.randomBytes(24).toString("base64url");
      const { data, error } = await sb
        .from("projects")
        .update({ portal_token: portalToken, portal_enabled: true })
        .eq("id", projectId)
        .select("portal_token, portal_enabled")
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({
        ok: true,
        portalToken: data?.portal_token || portalToken,
        portalEnabled: data?.portal_enabled ?? true
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to enable test portal" });
    }
  });

  app.post("/api/portal/admin/seed-test-data", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const projectId = String(req.body?.projectId || "").trim();
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });

      const { data: project } = await sb.from("projects").select("id").eq("id", projectId).maybeSingle();
      if (!project) return res.status(404).json({ ok: false, error: "Project not found" });

      let added = 0;
      const today = todayYmd();

      const { count: msCount } = await sb
        .from("portal_milestones")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      if ((msCount || 0) === 0) {
        await sb.from("portal_milestones").insert([
          {
            project_id: projectId,
            key: "frame",
            label: "Frame complete",
            description: "Structural frame erected and inspected.",
            sort_order: 1,
            eta: today
          },
          {
            project_id: projectId,
            key: "lockup",
            label: "Lock-up",
            description: "External doors and windows in place.",
            sort_order: 2
          }
        ]);
        added += 1;
      }

      const { count: upCount } = await sb
        .from("portal_updates")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      if ((upCount || 0) === 0) {
        await sb.from("portal_updates").insert({
          project_id: projectId,
          week_of: today,
          headline: "Welcome to your project portal",
          body: "This is sample content so you can preview the client experience. Sam will replace this with real weekly updates.",
          author_name: "Sam",
          published: true
        });
        added += 1;
      }

      const { count: decCount } = await sb
        .from("portal_decisions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      if ((decCount || 0) === 0) {
        await sb.from("portal_decisions").insert({
          project_id: projectId,
          type: "selection",
          title: "Kitchen benchtop — sample selection",
          description: "Please review the options when you visit the portal.",
          due_date: today,
          urgency: "normal",
          status: "pending",
          options: [
            { id: "a", label: "Option A — stone" },
            { id: "b", label: "Option B — laminate" }
          ]
        });
        added += 1;
      }

      const { count: claimCount } = await sb
        .from("portal_claims")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      if ((claimCount || 0) === 0) {
        await sb.from("portal_claims").insert({
          project_id: projectId,
          stage_name: "Deposit",
          amount: 50000,
          status: "paid",
          sort_order: 1
        });
        added += 1;
      }

      return res.json({ ok: true, added: added > 0, skipped: added === 0 });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to seed test data" });
    }
  });

  app.post("/api/portal/admin/updates", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, weekOf, headline, body, authorName, published, videoUrl } = req.body || {};
      if (!projectId || !weekOf || !headline || !body) {
        return res.status(400).json({ ok: false, error: "projectId, weekOf, headline, body required" });
      }
      const { data, error } = await sb
        .from("portal_updates")
        .insert({
          project_id: projectId,
          week_of: weekOf,
          headline,
          body,
          author_name: authorName || "Sam",
          published: Boolean(published),
          video_url: videoUrl?.trim() || null
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, update: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to save update" });
    }
  });

  app.patch("/api/portal/admin/updates/:updateId", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const patch = {};
      const b = req.body || {};
      if (b.headline != null) patch.headline = b.headline;
      if (b.body != null) patch.body = b.body;
      if (b.authorName != null) patch.author_name = b.authorName;
      if (b.published != null) patch.published = Boolean(b.published);
      if (b.weekOf != null) patch.week_of = b.weekOf;
      if (b.videoUrl !== undefined) patch.video_url = b.videoUrl?.trim() || null;
      const { data, error } = await sb
        .from("portal_updates")
        .update(patch)
        .eq("id", req.params.updateId)
        .select()
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, update: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to update" });
    }
  });

  app.post("/api/portal/admin/photos/upload", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      if (!dropboxConfigured()) return res.status(503).json({ ok: false, error: "Dropbox not configured" });

      const {
        projectId,
        fileName,
        contentBase64,
        caption,
        updateId,
        milestoneKey,
        isHero,
        takenAt,
        sortOrder
      } = req.body || {};
      if (!projectId || !fileName || !contentBase64) {
        return res.status(400).json({ ok: false, error: "projectId, fileName, contentBase64 required" });
      }

      const { data: project } = await sb.from("projects").select("id, address").eq("id", projectId).maybeSingle();
      if (!project?.address) return res.status(404).json({ ok: false, error: "Project not found" });

      const buffer = Buffer.from(String(contentBase64), "base64");
      const { storagePath } = await uploadPortalPhoto({
        jobAddress: project.address,
        buffer,
        fileName
      });

      const { data: inserted, error } = await sb
        .from("project_photos")
        .insert({
          project_id: projectId,
          storage_path: storagePath,
          public_url: "pending",
          caption: caption || null,
          update_id: updateId || null,
          milestone_key: milestoneKey || null,
          is_hero: Boolean(isHero),
          taken_at: takenAt || null,
          sort_order: sortOrder != null ? Number(sortOrder) : 0
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });

      const publicUrl = mediaPublicPath(inserted.id);
      const { data: updated, error: ue } = await sb
        .from("project_photos")
        .update({ public_url: publicUrl })
        .eq("id", inserted.id)
        .select()
        .single();
      if (ue) return res.status(500).json({ ok: false, error: ue.message });
      return res.json({ ok: true, photo: rowToCamel(updated) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to upload photo" });
    }
  });

  app.post("/api/portal/admin/photos", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, publicUrl, storagePath, caption, milestoneKey, updateId, isHero, takenAt, sortOrder } =
        req.body || {};
      if (!projectId || !publicUrl || !storagePath) {
        return res.status(400).json({ ok: false, error: "projectId, publicUrl, storagePath required" });
      }
      const { data, error } = await sb
        .from("project_photos")
        .insert({
          project_id: projectId,
          public_url: publicUrl,
          storage_path: storagePath,
          caption: caption || null,
          milestone_key: milestoneKey || null,
          update_id: updateId || null,
          is_hero: Boolean(isHero),
          taken_at: takenAt || null,
          sort_order: sortOrder != null ? Number(sortOrder) : 0
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, photo: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to save photo" });
    }
  });

  app.post("/api/portal/admin/milestones", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, key, label, description, whatComesNext, achievedAt, eta, sortOrder } = req.body || {};
      if (!projectId || !key || !label) return res.status(400).json({ ok: false, error: "projectId, key, label required" });
      const { data, error } = await sb
        .from("portal_milestones")
        .upsert(
          {
            project_id: projectId,
            key,
            label,
            description: description || null,
            what_comes_next: whatComesNext || null,
            achieved_at: achievedAt || null,
            eta: eta || null,
            sort_order: sortOrder != null ? Number(sortOrder) : 0
          },
          { onConflict: "project_id,key" }
        )
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, milestone: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to save milestone" });
    }
  });

  app.post("/api/portal/admin/decisions", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, type, title, description, dueDate, urgency, costDelta, scheduleDelta, options } =
        req.body || {};
      if (!projectId || !type || !title) return res.status(400).json({ ok: false, error: "projectId, type, title required" });
      const { data, error } = await sb
        .from("portal_decisions")
        .insert({
          project_id: projectId,
          type,
          title,
          description: description || null,
          due_date: dueDate || null,
          urgency: urgency || "normal",
          cost_delta: costDelta != null ? Number(costDelta) : null,
          schedule_delta: scheduleDelta != null ? Number(scheduleDelta) : null,
          options: options || []
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, decision: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to save decision" });
    }
  });

  app.post("/api/portal/admin/claims", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, stageName, amount, status, dueApprox, sortOrder } = req.body || {};
      if (!projectId || !stageName || amount == null) {
        return res.status(400).json({ ok: false, error: "projectId, stageName, amount required" });
      }
      const { data, error } = await sb
        .from("portal_claims")
        .insert({
          project_id: projectId,
          stage_name: stageName,
          amount: Number(amount),
          status: status || "upcoming",
          due_approx: dueApprox || null,
          sort_order: sortOrder != null ? Number(sortOrder) : 0
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, claim: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to save claim" });
    }
  });

  app.get("/api/portal/admin/:projectId/summary", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const projectId = req.params.projectId;

      const [
        projectRes,
        updatesRes,
        milestonesRes,
        decisionsRes,
        claimsRes,
        allowancesRes,
        siteWalksRes,
        warrantyRes,
        messagesRes,
        photosRes
      ] = await Promise.all([
        sb.from("projects").select(PROJECT_SELECT).eq("id", projectId).maybeSingle(),
        sb.from("portal_updates").select("*").eq("project_id", projectId).order("week_of", { ascending: false }),
        sb.from("portal_milestones").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
        sb.from("portal_decisions").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
        sb.from("portal_claims").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
        sb.from("portal_allowances").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
        sb.from("site_walks").select("*").eq("project_id", projectId).order("available_date", { ascending: true }),
        sb.from("warranty_items").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
        sb.from("portal_messages").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
        sb.from("project_photos").select("*").eq("project_id", projectId).order("sort_order", { ascending: true })
      ]);

      return res.json({
        ok: true,
        project: rowToCamel(projectRes.data),
        updates: rowsToCamel(updatesRes.data),
        milestones: rowsToCamel(milestonesRes.data),
        decisions: rowsToCamel(decisionsRes.data),
        claims: rowsToCamel(claimsRes.data),
        allowances: rowsToCamel(allowancesRes.data),
        siteWalks: rowsToCamel(siteWalksRes.data),
        warrantyItems: rowsToCamel(warrantyRes.data),
        messages: rowsToCamel(messagesRes.data),
        photos: rowsToCamel(photosRes.data)
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to load summary" });
    }
  });

  app.post("/api/portal/admin/site-walks", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, availableDate } = req.body || {};
      if (!projectId || !availableDate) return res.status(400).json({ ok: false, error: "projectId, availableDate required" });
      const { data, error } = await sb
        .from("site_walks")
        .insert({ project_id: projectId, available_date: availableDate })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, siteWalk: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to add site walk" });
    }
  });

  app.post("/api/portal/admin/finishes", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, room, item, value, supplier, productCode, sortOrder } = req.body || {};
      if (!projectId || !room || !item) return res.status(400).json({ ok: false, error: "projectId, room, item required" });
      const { data, error } = await sb
        .from("home_finishes")
        .insert({
          project_id: projectId,
          room,
          item,
          value: value || null,
          supplier: supplier || null,
          product_code: productCode || null,
          sort_order: sortOrder != null ? Number(sortOrder) : 0
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json(rowToCamel(data));
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to save finish" });
    }
  });

  app.post("/api/portal/admin/warranty-periods", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, label, years, startDate } = req.body || {};
      if (!projectId || !label || years == null) {
        return res.status(400).json({ ok: false, error: "projectId, label, years required" });
      }
      let expiresDate = null;
      if (startDate) {
        const d = new Date(startDate);
        d.setFullYear(d.getFullYear() + Number(years));
        expiresDate = d.toISOString().slice(0, 10);
      }
      const { data, error } = await sb
        .from("warranty_periods")
        .insert({
          project_id: projectId,
          label,
          years: Number(years),
          start_date: startDate || null,
          expires_date: expiresDate
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json(rowToCamel(data));
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to save warranty period" });
    }
  });

  app.patch("/api/portal/admin/warranty-items/:itemId", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const patch = {};
      const b = req.body || {};
      if (b.status != null) patch.status = b.status;
      if (b.tradeBooked != null) patch.trade_booked = b.tradeBooked;
      if (b.resolvedAt != null) patch.resolved_at = b.resolvedAt;
      if (b.clientNote != null) patch.client_note = b.clientNote;
      const { data, error } = await sb
        .from("warranty_items")
        .update(patch)
        .eq("id", req.params.itemId)
        .select()
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json(rowToCamel(data));
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to update warranty item" });
    }
  });

  app.post("/api/portal/admin/builder-messages", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });
      const { projectId, body, senderName } = req.body || {};
      if (!projectId || !body) return res.status(400).json({ ok: false, error: "projectId, body required" });
      const { data, error } = await sb
        .from("portal_messages")
        .insert({
          project_id: projectId,
          sender: "builder",
          sender_name: senderName || "Sam Morris",
          body: String(body).trim()
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, message: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Failed to send message" });
    }
  });

  // ── Public token routes ────────────────────────────────────────────────────
  app.get("/api/portal/:token", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      return res.json({
        projectId: project.id,
        clientName: project.portal_client_name,
        address: project.address,
        completionDateEst: project.completion_date_est,
        portalEnabled: project.portal_enabled
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/home", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const completionPercent = await scheduleCompletionPercent(sb, project.id);
      const homeCtx = await portalHomeContext(sb, project, completionPercent);

      const { data: weekUpdate } = await sb
        .from("portal_updates")
        .select("*")
        .eq("project_id", project.id)
        .eq("published", true)
        .order("week_of", { ascending: false })
        .limit(1)
        .maybeSingle();

      let weekPhotos = [];
      if (weekUpdate?.id) {
        const { data: photos } = await sb
          .from("project_photos")
          .select("id, public_url, caption, taken_at, is_hero, sort_order")
          .eq("update_id", weekUpdate.id)
          .order("sort_order", { ascending: true })
          .limit(6);
        weekPhotos = rowsToCamel(photos);
      }

      const [
        recentPhotosRes,
        pendingDecisionsRes,
        upcomingMilestonesRes,
        upcomingWalksRes
      ] = await Promise.all([
        sb
          .from("project_photos")
          .select("id, public_url, caption, taken_at")
          .eq("project_id", project.id)
          .order("taken_at", { ascending: false })
          .limit(4),
        sb
          .from("portal_decisions")
          .select("id, type, title, due_date, urgency, cost_delta, schedule_delta")
          .eq("project_id", project.id)
          .eq("status", "pending")
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(3),
        sb
          .from("portal_milestones")
          .select("id, key, label, eta, sort_order")
          .eq("project_id", project.id)
          .is("achieved_at", null)
          .order("sort_order", { ascending: true })
          .limit(3),
        sb
          .from("site_walks")
          .select("id, available_date, confirmed")
          .eq("project_id", project.id)
          .eq("booked", true)
          .gte("available_date", todayYmd())
          .order("available_date", { ascending: true })
          .limit(2)
      ]);

      return res.json({
        completionPercent,
        completionPct: completionPercent,
        currentPhase: homeCtx.currentPhase,
        daysToCompletion: homeCtx.daysToCompletion,
        nextMilestone: homeCtx.nextMilestone,
        scheduleStatus: homeCtx.scheduleStatus,
        weekUpdate: weekUpdate ? { ...rowToCamel(weekUpdate), photos: weekPhotos } : null,
        recentPhotos: rowsToCamel(recentPhotosRes.data),
        pendingDecisions: rowsToCamel(pendingDecisionsRes.data),
        upcomingMilestones: rowsToCamel(upcomingMilestonesRes.data),
        upcomingSiteWalks: rowsToCamel(upcomingWalksRes.data)
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/timeline", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const { data: milestones } = await sb
        .from("portal_milestones")
        .select("*, hero_photo:project_photos!portal_milestones_hero_photo_id_fkey(public_url, caption)")
        .eq("project_id", project.id)
        .order("sort_order", { ascending: true });

      const { data: varRows } = await sb
        .from("portal_decisions")
        .select("schedule_delta")
        .eq("project_id", project.id)
        .eq("type", "variation")
        .eq("status", "approved")
        .gt("schedule_delta", 0);

      const variationDays = (varRows || []).reduce((s, r) => s + (Number(r.schedule_delta) || 0), 0);

      let onTrack = true;
      for (const m of milestones || []) {
        if (m.achieved_at && m.eta) {
          const achieved = new Date(m.achieved_at);
          const eta = new Date(m.eta);
          const diffDays = (achieved - eta) / (1000 * 60 * 60 * 24);
          if (diffDays > 14) {
            onTrack = false;
            break;
          }
        }
      }

      return res.json({
        milestones: rowsToCamel(milestones),
        variationDays,
        delayDays: variationDays,
        onTrack
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/livesite", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const { data: update } = await sb
        .from("portal_updates")
        .select("*")
        .eq("project_id", project.id)
        .eq("published", true)
        .order("week_of", { ascending: false })
        .limit(1)
        .maybeSingle();

      let photos = [];
      if (update?.id) {
        const { data: p } = await sb
          .from("project_photos")
          .select("id, public_url, caption, taken_at, is_hero, sort_order")
          .eq("update_id", update.id)
          .order("sort_order", { ascending: true });
        photos = rowsToCamel(p);
      }

      const { data: activityLog } = await sb
        .from("portal_updates")
        .select("id, week_of, headline, body, video_url")
        .eq("project_id", project.id)
        .eq("published", true)
        .order("week_of", { ascending: false })
        .limit(10);

      return res.json({
        weekUpdate: update ? { ...rowToCamel(update), photos } : null,
        activityLog: rowsToCamel(activityLog)
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/decisions", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const [pendingRes, completedRes] = await Promise.all([
        sb
          .from("portal_decisions")
          .select("*")
          .eq("project_id", project.id)
          .eq("status", "pending")
          .order("due_date", { ascending: true, nullsFirst: false }),
        sb
          .from("portal_decisions")
          .select("id, type, title, status, cost_delta, responded_at")
          .eq("project_id", project.id)
          .in("status", ["approved", "declined"])
          .order("responded_at", { ascending: false })
          .limit(10)
      ]);

      return res.json({
        pending: rowsToCamel(pendingRes.data),
        completed: rowsToCamel(completedRes.data)
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/budget", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const contractValue = Number(project.contract_value) || 0;

      const [approvedRes, pendingRes, claimsRes, allowancesRes, variationsRes] = await Promise.all([
        sb
          .from("portal_decisions")
          .select("cost_delta")
          .eq("project_id", project.id)
          .eq("type", "variation")
          .eq("status", "approved"),
        sb
          .from("portal_decisions")
          .select("cost_delta")
          .eq("project_id", project.id)
          .eq("type", "variation")
          .eq("status", "pending"),
        sb.from("portal_claims").select("*").eq("project_id", project.id).order("sort_order", { ascending: true }),
        sb.from("portal_allowances").select("*").eq("project_id", project.id).order("sort_order", { ascending: true }),
        sb
          .from("portal_decisions")
          .select("id, title, cost_delta, status, created_at")
          .eq("project_id", project.id)
          .eq("type", "variation")
      ]);

      const approvedVariationsTotal = (approvedRes.data || []).reduce(
        (s, r) => s + (Number(r.cost_delta) || 0),
        0
      );
      const pendingVariationsTotal = (pendingRes.data || []).reduce(
        (s, r) => s + (Number(r.cost_delta) || 0),
        0
      );

      return res.json({
        contractValue,
        approvedVariationsTotal,
        pendingVariationsTotal,
        currentTotal: contractValue + approvedVariationsTotal,
        claims: rowsToCamel(claimsRes.data),
        allowances: rowsToCamel(allowancesRes.data),
        variationsLog: rowsToCamel(variationsRes.data)
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/journal", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const { data: milestones } = await sb
        .from("portal_milestones")
        .select("*, hero_photo:project_photos!portal_milestones_hero_photo_id_fkey(public_url, caption)")
        .eq("project_id", project.id)
        .not("achieved_at", "is", null)
        .order("achieved_at", { ascending: false });

      const enriched = [];
      for (const m of milestones || []) {
        const { data: photos } = await sb
          .from("project_photos")
          .select("id, public_url, caption, taken_at, sort_order")
          .eq("project_id", project.id)
          .eq("milestone_key", m.key)
          .order("sort_order", { ascending: true });
        enriched.push({ ...rowToCamel(m), photos: rowsToCamel(photos) });
      }

      return res.json({ milestones: enriched });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/documents", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      return res.json({
        documents: [],
        message: "Documents will appear here as they are added."
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/myhome", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const [finishesRes, warrantyRes] = await Promise.all([
        sb
          .from("home_finishes")
          .select("*")
          .eq("project_id", project.id)
          .order("room", { ascending: true })
          .order("sort_order", { ascending: true }),
        sb.from("warranty_periods").select("*").eq("project_id", project.id)
      ]);

      const finishes = rowsToCamel(finishesRes.data);
      const rooms = [...new Set(finishes.map((f) => f.room))].sort();
      const byRoom = {};
      for (const f of finishes) {
        if (!byRoom[f.room]) byRoom[f.room] = [];
        byRoom[f.room].push(f);
      }

      return res.json({
        rooms,
        finishes: byRoom,
        warrantyPeriods: rowsToCamel(warrantyRes.data),
        handoverDate: project.completion_date_est
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/conversations", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const [messagesRes, walksRes] = await Promise.all([
        sb
          .from("portal_messages")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: true }),
        sb
          .from("site_walks")
          .select("id, available_date")
          .eq("project_id", project.id)
          .eq("booked", false)
          .gte("available_date", todayYmd())
          .order("available_date", { ascending: true })
          .limit(5)
      ]);

      return res.json({
        messages: rowsToCamel(messagesRes.data),
        siteWalks: rowsToCamel(walksRes.data),
        builderContact: { name: "Sam Morris", email: "sam@blueleafbuilding.com.au" }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.post("/api/portal/:token/conversations", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const body = String(req.body?.body || "").trim();
      if (!body || body.length > 2000) {
        return res.status(400).json({ ok: false, error: "Message body required (max 2000 characters)." });
      }

      const { data, error } = await sb
        .from("portal_messages")
        .insert({
          project_id: project.id,
          sender: "client",
          sender_name: project.portal_client_name || "Client",
          body
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, message: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.post("/api/portal/:token/sitewalk", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const siteWalkId = String(req.body?.siteWalkId || "").trim();
      const { data: walk } = await sb.from("site_walks").select("id, project_id").eq("id", siteWalkId).maybeSingle();
      if (!walk || walk.project_id !== project.id) return res.status(403).json({ ok: false, error: "Invalid site walk" });

      const { error } = await sb
        .from("site_walks")
        .update({
          booked: true,
          client_name: project.portal_client_name || "Client"
        })
        .eq("id", siteWalkId);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.post("/api/portal/:token/decisions/:decisionId/respond", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const action = req.body?.action;
      const statusMap = { approve: "approved", decline: "declined", info: "info_requested" };
      const status = statusMap[action];
      if (!status) return res.status(400).json({ ok: false, error: "Invalid action" });

      const { data: decision } = await sb
        .from("portal_decisions")
        .select("id, project_id, status")
        .eq("id", req.params.decisionId)
        .maybeSingle();
      if (!decision || decision.project_id !== project.id || decision.status !== "pending") {
        return res.status(403).json({ ok: false, error: "Decision not found" });
      }

      const { error } = await sb
        .from("portal_decisions")
        .update({
          status,
          chosen_option_id: req.body?.chosenOptionId || null,
          client_note: req.body?.clientNote || null,
          responded_at: new Date().toISOString()
        })
        .eq("id", req.params.decisionId);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.post("/api/portal/:token/warranty", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const { area, description, urgency, photoUrls } = req.body || {};
      if (!area || !description) return res.status(400).json({ ok: false, error: "area and description required" });
      const allowed = ["can_wait", "this_week", "urgent"];
      if (!allowed.includes(urgency)) return res.status(400).json({ ok: false, error: "Invalid urgency" });

      const { data, error } = await sb
        .from("warranty_items")
        .insert({
          project_id: project.id,
          area,
          description,
          urgency: urgency || "can_wait",
          photo_urls: photoUrls || []
        })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, item: rowToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });

  app.get("/api/portal/:token/warranty", async (req, res) => {
    try {
      const project = await resolveProject(req.params.token);
      if (!project) return res.status(404).json({ ok: false, error: "Portal not found" });
      const sb = getServiceSupabase();
      if (!sb) return res.status(500).json({ ok: false, error: "DB not configured" });

      const { data } = await sb
        .from("warranty_items")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });
      return res.json({ items: rowsToCamel(data) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Request failed" });
    }
  });
}
