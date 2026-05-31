import { getServiceSupabase } from "./supabaseService.mjs";
import {
  getDropboxAccessToken,
  dropboxUploadBuffer,
  sharedJobRootPath,
  DROPBOX_PRIVATE_INTERNAL_BASE,
  sanitizeTradeOrBusinessSegment,
  ensureParentFoldersForFile
} from "./dropboxClient.mjs";
import { buildIncidentReportPdfBuffer } from "./module6PdfKit.mjs";
import { toYmd } from "./dateYmd.mjs";
import { requireAuth } from "./requireAuth.mjs";

// ── Pure helpers ──────────────────────────────────────────────────────────────

function complianceStatusFromExpiry(expiryDate) {
  if (!expiryDate) return "missing";
  const ymd = toYmd(expiryDate);
  if (!ymd) return "missing";
  const e = new Date(`${ymd}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  if (e < t) return "expired";
  const soon = new Date(t);
  soon.setDate(soon.getDate() + 30);
  if (e <= soon) return "expiring_soon";
  return "current";
}

function safeFileSegment(s, max = 80) {
  return String(s || "file")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, max);
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @param {import("express").Express} app
 */
export function registerWhsRoutes(app) {
  app.get("/api/whs/:projectId/compliance", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data: pos, error: poe } = await sb
        .from("purchase_orders")
        .select("subcontractor_id, subcontractors ( id, business_name, email, trade )")
        .eq("project_id", projectId)
        .not("subcontractor_id", "is", null);
      if (poe) throw poe;
      const subMap = new Map();
      for (const row of pos || []) {
        const sid = row.subcontractor_id;
        const sub = row.subcontractors;
        const s = Array.isArray(sub) ? sub[0] : sub;
        if (!sid || !s) continue;
        if (!subMap.has(sid)) {
          subMap.set(sid, {
            subcontractor_id: sid,
            name: s.business_name || s.email || "Subcontractor",
            email: s.email || "",
            trade: s.trade || "",
            documents: []
          });
        }
      }
      for (const sid of subMap.keys()) {
        const { data: docs } = await sb.from("contractor_compliance").select("*").eq("subcontractor_id", sid);
        const computed = (docs || []).map((d) => ({
          ...d,
          computed_status: d.expiry_date ? complianceStatusFromExpiry(d.expiry_date) : "missing"
        }));
        subMap.get(sid).documents = computed;
      }
      return res.json({ ok: true, subcontractors: [...subMap.values()] });
    } catch (e) {
      console.error("[whs/compliance list]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/whs/compliance", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const subcontractorId = String(req.body?.subcontractorId || "").trim();
      const documentType = String(req.body?.documentType || "").trim();
      const documentName = String(req.body?.documentName || "").trim();
      const expiryDate = req.body?.expiryDate ? String(req.body.expiryDate) : null;
      const issueDate = req.body?.issueDate ? String(req.body.issueDate) : null;
      const policyNumber = req.body?.policyNumber != null ? String(req.body.policyNumber) : null;
      const insurer = req.body?.insurer != null ? String(req.body.insurer) : null;
      const fileBase64 = String(req.body?.fileBase64 || "").trim();
      const fileName = String(req.body?.fileName || "document.pdf");
      if (!subcontractorId || !documentType || !fileBase64) {
        return res.status(400).json({ ok: false, error: "subcontractorId, documentType, fileBase64 required." });
      }

      const { data: sub, error: se } = await sb
        .from("subcontractors")
        .select("id, business_name")
        .eq("id", subcontractorId)
        .single();
      if (se || !sub) return res.status(404).json({ ok: false, error: "Subcontractor not found." });

      const subSeg = sanitizeTradeOrBusinessSegment(sub.business_name || "CONTRACTOR", 60);
      const day = new Date().toISOString().slice(0, 10);
      const ext = /\.(pdf|png|jpe?g|webp)$/i.test(fileName) ? fileName.match(/\.(pdf|png|jpe?g|webp)$/i)[0] : ".pdf";
      const dropRel = `${DROPBOX_PRIVATE_INTERNAL_BASE}/CONTRACTORS/${subSeg}/${documentType}-${day}${ext}`;
      let dropbox_path = null;
      try {
        const buf = Buffer.from(fileBase64.replace(/^data:.*,/, ""), "base64");
        const token = await getDropboxAccessToken();
        await ensureParentFoldersForFile(token, dropRel);
        await dropboxUploadBuffer(token, dropRel, buf, { autorename: true });
        dropbox_path = dropRel;
      } catch (err) {
        console.warn("[whs/compliance] Dropbox:", err?.message || err);
      }

      const status = expiryDate ? complianceStatusFromExpiry(expiryDate) : "missing";
      const insertRow = {
        subcontractor_id: subcontractorId,
        document_type: documentType,
        document_name: documentName || null,
        issue_date: issueDate,
        expiry_date: expiryDate,
        policy_number: policyNumber,
        insurer: insurer,
        dropbox_path,
        status,
        updated_at: new Date().toISOString()
      };
      const { data: doc, error: ie } = await sb.from("contractor_compliance").insert(insertRow).select("*").single();
      if (ie) throw ie;
      return res.json({ ok: true, document: { ...doc, computed_status: status } });
    } catch (e) {
      console.error("[whs/compliance post]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/whs/:projectId/inductions", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data, error } = await sb
        .from("site_inductions")
        .select("*")
        .eq("project_id", projectId)
        .order("inducted_at", { ascending: false });
      if (error) throw error;
      return res.json({ ok: true, inductions: data || [] });
    } catch (e) {
      console.error("[whs/inductions]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/whs/:projectId/reports", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const reportType = String(req.body?.reportType || "").trim();
      const severity = req.body?.severity ? String(req.body.severity) : null;
      const title = String(req.body?.title || "").trim();
      const description = req.body?.description != null ? String(req.body.description) : null;
      const correctiveAction = req.body?.correctiveAction != null ? String(req.body.correctiveAction) : null;
      const reportedBy = req.body?.reportedBy != null ? String(req.body.reportedBy) : null;
      const photosBase64 = Array.isArray(req.body?.photosBase64) ? req.body.photosBase64 : [];
      if (!projectId || !reportType || !title) return res.status(400).json({ ok: false, error: "reportType and title required." });

      const { data: proj, error: pe } = await sb.from("projects").select("address").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: "Project not found." });

      const photo_paths = [];
      const day = new Date().toISOString().slice(0, 10);
      const root = sharedJobRootPath(proj.address);
      let token = null;
      try {
        token = await getDropboxAccessToken();
      } catch (err) {
        console.warn("[whs/reports] Dropbox token:", err?.message || err);
      }

      if (token) {
        let i = 0;
        for (const ph of photosBase64) {
          const name = safeFileSegment(ph?.name || `photo-${i}.jpg`);
          const b64 = String(ph?.data || "").replace(/^data:.*,/, "");
          if (!b64) continue;
          try {
            const buf = Buffer.from(b64, "base64");
            const ppath = `${root}/WHS/INCIDENTS/${day}-${safeFileSegment(title, 40)}-photo-${i}-${name}`;
            await ensureParentFoldersForFile(token, ppath);
            await dropboxUploadBuffer(token, ppath, buf, { autorename: true });
            photo_paths.push(ppath);
            i += 1;
          } catch (err) {
            console.warn("[whs/reports] photo upload:", err?.message || err);
          }
        }
      }

      const reportedAt = new Date().toISOString();
      const { data: inserted, error: ie } = await sb
        .from("site_reports")
        .insert({
          project_id: projectId,
          report_type: reportType,
          severity,
          title,
          description,
          corrective_action: correctiveAction,
          reported_by: reportedBy,
          status: "open",
          photo_paths,
          reported_at: reportedAt
        })
        .select("*")
        .single();
      if (ie) throw ie;

      let dropbox_pdf_path = null;
      if (token) {
        try {
          const pdfBuf = await buildIncidentReportPdfBuffer({
            projectAddress: proj.address,
            reportType,
            severity,
            title,
            description,
            correctiveAction,
            reportedBy,
            reportedAt,
            generatedAt: new Date().toISOString()
          });
          const pdfPath = `${root}/WHS/INCIDENTS/${day}-${safeFileSegment(title, 60)}.pdf`;
          await ensureParentFoldersForFile(token, pdfPath);
          await dropboxUploadBuffer(token, pdfPath, pdfBuf, { autorename: true });
          dropbox_pdf_path = pdfPath;
          await sb.from("site_reports").update({ dropbox_pdf_path }).eq("id", inserted.id);
        } catch (err) {
          console.warn("[whs/reports] PDF Dropbox:", err?.message || err);
        }
      }

      const { data: report } = await sb.from("site_reports").select("*").eq("id", inserted.id).single();
      return res.json({ ok: true, report });
    } catch (e) {
      console.error("[whs/reports post]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/whs/:projectId/reports", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data, error } = await sb.from("site_reports").select("*").eq("project_id", projectId).order("reported_at", { ascending: false });
      if (error) throw error;
      return res.json({ ok: true, reports: data || [] });
    } catch (e) {
      console.error("[whs/reports get]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.patch("/api/whs/report/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      const status = String(req.body?.status || "").trim();
      if (!id || status !== "resolved") return res.status(400).json({ ok: false, error: "Invalid request." });
      const now = new Date().toISOString();
      const { data, error } = await sb
        .from("site_reports")
        .update({ status: "resolved", resolved_at: now })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return res.json({ ok: true, report: data });
    } catch (e) {
      console.error("[whs/report patch]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/whs/swms", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const trade = String(req.body?.trade || "").trim();
      const title = String(req.body?.title || "").trim();
      const contentHtml = req.body?.contentHtml != null ? String(req.body.contentHtml) : null;
      if (!trade || !title) return res.status(400).json({ ok: false, error: "trade and title required." });
      const { data: template, error } = await sb
        .from("swms_templates")
        .insert({ trade, title, content_html: contentHtml, is_active: true })
        .select("*")
        .single();
      if (error) throw error;
      return res.json({ ok: true, template });
    } catch (e) {
      console.error("[whs/swms post]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/whs/swms", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const trade = req.query.trade ? String(req.query.trade).trim().toLowerCase() : null;
      const { data, error } = await sb.from("swms_templates").select("*").eq("is_active", true).order("trade");
      if (error) throw error;
      let rows = data || [];
      if (trade) {
        rows = rows.filter((r) => String(r.trade || "").toLowerCase().includes(trade) || trade.includes(String(r.trade || "").toLowerCase()));
      }
      return res.json({ ok: true, templates: rows });
    } catch (e) {
      console.error("[whs/swms get]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
