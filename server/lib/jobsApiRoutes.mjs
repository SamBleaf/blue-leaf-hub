import { getServiceSupabase } from "./supabaseService.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";
import {
  dropboxConfigured,
  mergeJobDataJsonFile,
  uploadFeeProposalPdfToPresaleDocs
} from "./dropboxClient.mjs";
import { buildFeeProposalPdfBuffer } from "./feeProposalPdfKit.mjs";
import { getJobById, buildexactConfigured, buildexactLogin } from "./buildexactClient.mjs";
import { requireAuth } from "./requireAuth.mjs";

/**
 * @param {import('express').Express} app
 */
export function registerJobsApiRoutes(app) {
  // Create a new job (minimal fields, used from Sales Manager lead → job)
  app.post("/api/jobs", requireAuth, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
      const { address, client_name, client_email, client_phone, project_type, arch_ref, lead_id } = req.body || {};
      if (!address?.trim()) return res.status(400).json({ ok: false, error: "address required" });

      // Dedup: prefer the canonical normalised key ("21 Folkestone Rd" == "21 Folkestone Road");
      // fall back to the legacy raw ilike for jobs not yet normalised.
      const addr = normaliseAddress(address);
      let existing = null;
      if (addr.normalised) {
        const { data } = await sb.from("jobs").select("*").eq("address_normalised", addr.normalised).limit(1);
        existing = data?.[0] || null;
      }
      if (!existing) {
        const { data } = await sb.from("jobs").select("*").ilike("address", address.trim()).limit(1);
        existing = data?.[0] || null;
      }
      if (existing) return res.json({ ok: true, job: existing, deduplicated: true });

      const { data, error } = await sb.from("jobs").insert({
        address: address.trim(),
        address_normalised: addr.normalised,
        address_suburb: addr.suburb,
        address_state: addr.state,
        address_postcode: addr.postcode,
        client_name: client_name?.trim() || null,
        client_email: client_email?.trim() || null,
        client_phone: client_phone?.trim() || null,
        project_type: project_type || null,
        arch_ref: arch_ref?.trim() || null,
        lead_id: lead_id || null,
        status: "tendering",
      }).select().single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, job: data });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/jobs/merge-job-data-json", requireAuth, async (req, res) => {
    try {
      if (!dropboxConfigured()) {
        return res.status(503).json({ ok: false, error: "Dropbox not configured." });
      }
      const jobAddress = String(req.body?.jobAddress || "").trim();
      const patch = req.body?.patch;
      if (!jobAddress || !patch || typeof patch !== "object") {
        return res.status(400).json({ ok: false, error: "jobAddress and patch object required." });
      }
      const out = await mergeJobDataJsonFile(jobAddress, patch);
      return res.json({ ok: true, path: out?.path_display || out?.path_lower || null });
    } catch (e) {
      console.error("[jobs/merge-job-data-json]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/tender/job-delete", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) {
      return res.status(503).json({ ok: false, error: "Server needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY." });
    }
    const jobId = String(req.body?.jobId || "").trim();
    if (!jobId) return res.status(400).json({ ok: false, error: "jobId required." });
    try {
      const { data: projIds } = await sb.from("projects").select("id").eq("job_id", jobId);
      const ids = (projIds || []).map((p) => p.id).filter(Boolean);
      for (const pid of ids) {
        await sb.from("purchase_orders").delete().eq("project_id", pid);
      }
      await sb.from("projects").delete().eq("job_id", jobId);
      await sb.from("fee_proposals").delete().eq("job_id", jobId);
      await sb.from("cost_intelligence").delete().eq("job_id", jobId);
      await sb.from("unmatched_quote_emails").delete().eq("matched_job_id", jobId);
      const { error } = await sb.from("jobs").delete().eq("id", jobId);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[tender/job-delete]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/unmatched-quotes/resolve", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) {
      return res.status(503).json({ ok: false, error: "Server needs Supabase service role." });
    }
    const unmatchedId = String(req.body?.unmatchedId || "").trim();
    const rfqId = String(req.body?.rfqId || "").trim();
    if (!unmatchedId || !rfqId) {
      return res.status(400).json({ ok: false, error: "unmatchedId and rfqId required." });
    }
    try {
      const { data: u, error: uErr } = await sb.from("unmatched_quote_emails").select("*").eq("id", unmatchedId).single();
      if (uErr || !u) throw new Error(uErr?.message || "Unmatched row not found.");
      const { data: rfq, error: rErr } = await sb
        .from("rfqs")
        .select("id, job_id, subcontractor_id, trade, jobs(address)")
        .eq("id", rfqId)
        .single();
      if (rErr || !rfq) throw new Error(rErr?.message || "RFQ not found.");

      const body = String(u.body_preview || u.subject || "(matched manually)").slice(0, 16000);
      const { error: cErr } = await sb.from("correspondence").insert({
        job_id: rfq.job_id,
        rfq_id: rfq.id,
        subcontractor_id: rfq.subcontractor_id,
        direction: "inbound",
        subject: String(u.subject || "(no subject)"),
        body,
        sent_at: new Date().toISOString(),
        logged_by: "manual-match"
      });
      if (cErr) throw new Error(cErr.message);

      const { error: upErr } = await sb
        .from("rfqs")
        .update({ status: "received", received_at: new Date().toISOString() })
        .eq("id", rfq.id);
      if (upErr) throw new Error(upErr.message);

      await sb.from("unmatched_quote_emails").delete().eq("id", unmatchedId);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[unmatched-quotes/resolve]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/fee-proposal/generate-pdf", requireAuth, async (req, res) => {
    try {
      const proposalData = req.body?.proposalData;
      const logoDataUrl = String(req.body?.logoDataUrl || "").trim();
      const jobAddress = String(req.body?.jobAddress || "").trim();
      const quoteLabel = String(req.body?.quoteNumber || "Quote").trim().replace(/\s+/g, "-");
      if (!proposalData || typeof proposalData !== "object") {
        return res.status(400).json({ ok: false, error: "proposalData required." });
      }
      const buf = await buildFeeProposalPdfBuffer({ proposal: proposalData, logoDataUrl });
      if (dropboxConfigured() && jobAddress) {
        const fn = `${safeQuoteFilePart(quoteLabel)}-Fee-Proposal.pdf`;
        const up = await uploadFeeProposalPdfToPresaleDocs(jobAddress, fn, buf);
        const path = up?.path_display || up?.path_lower || "";
        return res.json({
          ok: true,
          dropbox_pdf_path: path,
          pdfBase64: buf.toString("base64"),
          filename: fn
        });
      }
      return res.json({
        ok: true,
        dropbox_pdf_path: null,
        pdfBase64: buf.toString("base64"),
        filename: `${safeQuoteFilePart(quoteLabel)}-Fee-Proposal.pdf`
      });
    } catch (e) {
      console.error("[fee-proposal/generate-pdf]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/buildexact/job/:id", requireAuth, async (req, res) => {
    if (!buildexactConfigured()) {
      return res.status(503).json({ ok: false, error: "Buildxact not configured." });
    }
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id required." });
    try {
      await buildexactLogin();
      const j = await getJobById(id);
      return res.json({ ok: true, job: j });
    } catch (e) {
      console.error("[buildexact/job]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}

function safeQuoteFilePart(s) {
  return (
    String(s || "QUOTE")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "QUOTE"
  );
}
