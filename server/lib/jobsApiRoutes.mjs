import { getServiceSupabase } from "./supabaseService.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";
import { ok, err, translateDbError } from "./apiResponse.mjs";
// Job status constants (mirrors migration 001 CHECK constraint)
const JOB_STATUSES_VALID = ["tendering", "won", "lost", "archived"];
import {
  dropboxConfigured,
  ensureJobFolderStructure,
  mergeJobDataJsonFile,
  uploadFeeProposalPdfToPresaleDocs
} from "./dropboxClient.mjs";
import { buildFeeProposalPdfBuffer } from "./feeProposalPdfKit.mjs";
import { getJobById, buildexactConfigured, buildexactLogin } from "./buildexactClient.mjs";
import { requireAuth } from "./requireAuth.mjs";

// Draft sentinel written by the RFQ Engine when an extraction has no address yet.
const PLACEHOLDER_ADDRESS = "Address pending";

// Columns the RFQ Engine may write to a job after extraction. Allowlisted so the
// client can't patch arbitrary columns; `address` is re-normalised below when present.
const JOB_PATCHABLE_FIELDS = [
  "address",
  "project_type",
  "building_type",
  "client_name",
  "client_email",
  "client_phone",
  "architect_name",
  "arch_ref",
  "eng_ref",
  "spec_ref",
  "floor_area_m2",
  "slab_area_m2",
  "roof_area_m2",
  "storeys",
  "extracted_data",
];

/**
 * @param {import('express').Express} app
 */
export function registerJobsApiRoutes(app) {
  // Create a new job (minimal fields, used from Sales Manager lead → job)
  app.post("/api/jobs", requireAuth, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
      const { address, client_name, client_email, client_phone, project_type, arch_ref, lead_id, status: statusInput } = req.body || {};
      if (!address?.trim()) return res.status(400).json({ ok: false, error: "address required" });

      // Dedup: prefer the canonical normalised key ("21 Folkestone Rd" == "21 Folkestone Road");
      // fall back to the legacy raw ilike for jobs not yet normalised. The "Address pending"
      // placeholder is a draft sentinel (extraction with no address yet) — never dedup on it,
      // or unrelated drafts would collapse onto one shared job.
      const addr = normaliseAddress(address);
      const isPlaceholder = address.trim().toLowerCase() === PLACEHOLDER_ADDRESS.toLowerCase();
      let existing = null;
      if (!isPlaceholder) {
        if (addr.normalised) {
          const { data } = await sb.from("jobs").select("*").eq("address_normalised", addr.normalised).limit(1);
          existing = data?.[0] || null;
        }
        if (!existing) {
          const { data } = await sb.from("jobs").select("*").ilike("address", address.trim()).limit(1);
          existing = data?.[0] || null;
        }
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
        // Accept a caller-supplied status (e.g. "won" when converting a won lead) but validate it.
        status: JOB_STATUSES_VALID.includes(statusInput) ? statusInput : "tendering",
      }).select().single();
      if (error) return res.status(500).json({ ok: false, error: error.message });

      // Provision the Dropbox job folders (PLANS + INTERNAL trees) at tender entry so they
      // exist well before RFQ time, and stamp the public PLANS link onto the job. Idempotent
      // and non-fatal: a Dropbox hiccup never blocks job creation — the same structure is
      // re-ensured at RFQ compose as a fallback. Skipped for the "Address pending" draft.
      //
      // Dropbox folder OWNERSHIP across the lead→job lifecycle:
      //   • convert-to-job (salesRoutes.convertLeadToJob) — creates the job, NO Dropbox today.
      //   • RFQ compose (rfqPackageRoutes) — self-ensures the folder tree as a fallback.
      //   • PTSA-signed (salesRoutes /ptsa/mark-signed) — OWNS folder provisioning + lead
      //     data backfill for LEAD-SOURCED jobs (gated by jobs.dropbox_provisioned_at).
      // So for lead-sourced jobs we DEFER folder creation to PTSA-signed and skip the inline
      // create here (files/upload auto-creates parents, so deferring breaks no upload site).
      // Direct / no-lead jobs still get folders immediately below.
      let job = data;
      if (!isPlaceholder && !lead_id && dropboxConfigured()) {
        try {
          const fld = await ensureJobFolderStructure({ jobAddress: data.address });
          if (fld?.dropboxSharedLinkUrl) {
            const { data: updated } = await sb
              .from("jobs")
              .update({ dropbox_shared_link: fld.dropboxSharedLinkUrl, dropbox_link: fld.dropboxSharedLinkUrl })
              .eq("id", data.id)
              .select()
              .maybeSingle();
            if (updated) job = updated;
          }
        } catch (e) {
          console.warn("[jobs POST] Dropbox folder provisioning skipped:", e?.message || e);
        }
      }
      return res.json({ ok: true, job });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Patch an existing job (used by the RFQ Engine to apply extracted fields). Allowlisted
  // columns only; re-normalises `address` so address_normalised stays the canonical match key.
  app.patch("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return err(res, 503, "DB not configured");
      const id = String(req.params?.id || "").trim();
      if (!id) return err(res, 400, "id required");

      const body = req.body || {};
      const updates = {};
      for (const key of JOB_PATCHABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return err(res, 400, "No updatable fields provided");

      // Keep the canonical address attributes in sync whenever the address itself changes.
      if (typeof updates.address === "string" && updates.address.trim()) {
        const addr = normaliseAddress(updates.address);
        updates.address = updates.address.trim();
        updates.address_normalised = addr.normalised;
        updates.address_suburb = addr.suburb;
        updates.address_state = addr.state;
        updates.address_postcode = addr.postcode;
      }

      const { data, error } = await sb.from("jobs").update(updates).eq("id", id).select().maybeSingle();
      if (error) {
        console.error("[jobs PATCH]", error);
        return err(res, 400, translateDbError(error));
      }
      if (!data) return err(res, 404, "Job not found", "NOT_FOUND");
      return ok(res, { job: data });
    } catch (e) {
      console.error("[jobs PATCH]", e);
      return err(res, 500, "Failed to update job");
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
