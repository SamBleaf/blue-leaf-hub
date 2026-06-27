import { getServiceSupabase } from "./supabaseService.mjs";
import { fileJobRecord } from "./jobRecordsFiler.mjs";
import { buildInductionPdfBuffer } from "./module6PdfKit.mjs";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tradeMatches(templateTrade, personTrade) {
  const a = norm(templateTrade);
  const b = norm(personTrade);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function safeFileSegment(s, max = 80) {
  return String(s || "induct")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, max);
}

/**
 * @param {import("express").Express} app
 */
export function registerInductionRoutes(app) {
  app.get("/api/induction/:projectId/info", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data: proj, error: pe } = await sb.from("projects").select("address").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: "Project not found." });

      const { data: links, error: le } = await sb
        .from("project_swms")
        .select("trade, swms_templates ( id, trade, title, pdf_path, is_active )")
        .eq("project_id", projectId);
      if (le) throw le;

      const swms = [];
      for (const row of links || []) {
        const t = row.swms_templates;
        const tpl = Array.isArray(t) ? t[0] : t;
        if (!tpl || !tpl.is_active) continue;
        swms.push({
          id: tpl.id,
          trade: row.trade || tpl.trade,
          title: tpl.title,
          pdf_path: tpl.pdf_path
        });
      }

      return res.json({ ok: true, address: proj.address, swms });
    } catch (e) {
      console.error("[induction/info]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/induction/:projectId/submit", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const personName = String(req.body?.personName || "").trim();
      const company = String(req.body?.company || "").trim();
      const trade = String(req.body?.trade || "").trim();
      const mobile = String(req.body?.mobile || "").trim();
      const emergencyContactName = String(req.body?.emergencyContactName || "").trim();
      const emergencyContactPhone = String(req.body?.emergencyContactPhone || "").trim();
      const siteRulesAcknowledged = Boolean(req.body?.siteRulesAcknowledged);
      const swmsAcknowledged = Boolean(req.body?.swmsAcknowledged);
      let signatureDataUrl = String(req.body?.signatureDataUrl || "").trim();
      const rawB64 = String(req.body?.signatureImageBase64 || "").trim();
      if (!signatureDataUrl && rawB64) {
        const clean = rawB64.replace(/^data:image\/(jpeg|jpg|png);base64,/i, "");
        signatureDataUrl = `data:image/jpeg;base64,${clean}`;
      }
      const ipAddress = req.body?.ipAddress != null ? String(req.body.ipAddress) : null;

      if (
        !personName ||
        !company ||
        !trade ||
        !mobile ||
        !emergencyContactName ||
        !emergencyContactPhone ||
        !siteRulesAcknowledged ||
        !swmsAcknowledged ||
        !signatureDataUrl
      ) {
        return res.status(400).json({ ok: false, error: "All required fields must be provided." });
      }

      const { data: proj, error: pe } = await sb.from("projects").select("address").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: "Project not found." });

      const { data: links } = await sb
        .from("project_swms")
        .select("trade, swms_templates ( id, trade, title, pdf_path, is_active )")
        .eq("project_id", projectId);
      const swmsLines = [];
      for (const row of links || []) {
        const tpl = Array.isArray(row.swms_templates) ? row.swms_templates[0] : row.swms_templates;
        if (!tpl || !tpl.is_active) continue;
        const rowTrade = row.trade || tpl.trade;
        if (tradeMatches(rowTrade, trade)) {
          swmsLines.push(`${tpl.title} (${rowTrade})`);
        }
      }

      const inductedAt = new Date().toISOString();
      const day = inductedAt.slice(0, 10);
      const pdfBuf = await buildInductionPdfBuffer({
        projectAddress: proj.address,
        personName,
        company,
        trade,
        mobile,
        emergencyContactName,
        emergencyContactPhone,
        rulesAckAt: inductedAt,
        swmsLines,
        signatureDataUrl,
        inductedAt
      });

      let induction_pdf_path = null;
      try {
        const filed = await fileJobRecord({ jobAddress: proj.address, category: "induction", fileName: `${safeFileSegment(personName)}-${day}.pdf`, buffer: pdfBuf });
        if (filed?.ok) induction_pdf_path = filed.storagePath;
      } catch (err) {
        console.warn("[induction/submit] records filing:", err?.message || err);
      }

      const { error: ie } = await sb.from("site_inductions").insert({
        project_id: projectId,
        person_name: personName,
        company,
        trade,
        mobile,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
        site_rules_acknowledged: siteRulesAcknowledged,
        swms_acknowledged: swmsAcknowledged,
        signature_data_url: signatureDataUrl,
        induction_pdf_path,
        inducted_at: inductedAt,
        ip_address: ipAddress
      });
      if (ie) throw ie;

      return res.json({ ok: true });
    } catch (e) {
      console.error("[induction/submit]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
